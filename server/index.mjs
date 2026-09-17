// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/index.mjs — 프리미엄 젓갈 스토어 AI 프록시 (선택 사항, 저비용·무인 지향).
//
// 프런트엔드(ai/ai.js)는 { task, payload } 를 이 서버의 POST /api/ai 로 보냅니다.
// 이 서버만 Claude(@anthropic-ai/sdk)를 호출하며, ANTHROPIC_API_KEY 는 오직
// 서버 측 환경변수로만 존재합니다. 키는 브라우저나 저장소에 절대 노출되지 않습니다.
//
// 비용 최적화:
//   - 기본 모델은 비용 우선(claude-haiku-4-5). AI_MODEL 로 claude-sonnet-5 /
//     claude-opus-5 로 올려 품질을 높일 수 있습니다.
//   - 안정적인 task 별 시스템 프롬프트를 prompt caching(cache_control:ephemeral)으로
//     보내 반복 호출 비용을 낮춥니다.
//   - task 별로 알맞은 max_tokens 상한을 둡니다(기본 700).
//   - 간단한 per-IP 레이트리밋(기본 20/분)과 월간 토큰 예산 상한을 둡니다.
//     초과 시 HTTP 429 {fallback:true} 로 응답 → 프런트는 자동으로 목업으로 폴백합니다.
//
// 실행:
//   1) cd server && npm install
//   2) cp .env.example .env  후  ANTHROPIC_API_KEY 를 채웁니다 (.env 는 커밋 금지)
//   3) npm start
//   4) ai/config.js 의 AI_ENDPOINT 를 "http://localhost:8787/api/ai" 로 설정
//
// 응답은 text/plain 스트리밍(청크)으로 흘려보내며, ai/ai.js 가 토큰 단위로 읽습니다.

import http from "node:http";
import process from "node:process";
import Anthropic from "@anthropic-ai/sdk";

const PORT = Number(process.env.PORT) || 8787;
// CORS: 정적 사이트 오리진. 기본은 개발 편의를 위한 "*"; 운영 시 특정 오리진으로 좁히세요.
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
// 비용 우선 기본값. AI_MODEL 로 claude-sonnet-5 / claude-opus-5 로 올려 품질을 높일 수 있습니다.
const MODEL = process.env.AI_MODEL || "claude-haiku-4-5";
// Haiku 4.5 는 적응형 사고/effort 파라미터를 받지 않습니다 → 해당 모델엔 보내지 않음(400 방지).
const IS_HAIKU = MODEL.startsWith("claude-haiku");
const EFFORT = process.env.AI_EFFORT || "low";

// 비용 가드레일.
const RATE_PER_MIN = Number(process.env.AI_RATE_PER_MIN) || 20;
const MONTHLY_TOKEN_CAP = Number(process.env.AI_MONTHLY_TOKEN_CAP) || 2_000_000;

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

/* ---------- task 별 시스템 프롬프트(그라운딩, prompt caching 대상) ---------- */
const SYSTEMS = {
  chat:
    "당신은 한국 갯마을 명인의 프리미엄 젓갈 온라인 스토어의 AI 도우미입니다. " +
    "제공된 상품/명인 데이터(payload)에만 근거해 한국어로 추천하고, 각 젓갈을 " +
    "어떻게 먹고 요리하면 좋은지 구체적으로 안내하세요. 데이터에 없는 상품·가격·효능을 " +
    "지어내지 말고, 과장·의학적 주장을 피하세요. 간결한 목록 형태로 답하세요.",
  giftset:
    "당신은 프리미엄 젓갈 스토어의 선물세트 큐레이터입니다. 제공된 상품 데이터와 예산/받는 분/취향에 " +
    "근거해 한국어로 선물세트 구성을 제안하세요. 상품명·가격은 payload 값만 사용하고, 합계와 포장비, " +
    "가능하면 배송 관점을 간단히 언급하세요. 데이터에 없는 상품을 만들지 마세요.",
  copy:
    "당신은 식품 카피라이터입니다. 제공된 상품·명인 데이터에 근거해 한국어로 헤드라인/서브카피/본문/" +
    "해시태그로 구성된 상품·산지 스토리 카피를 작성하세요. 사실은 payload 범위 내에서만 쓰고, 원산지·" +
    "표시광고 규정을 위반할 수 있는 허위·과장·의학적 표현은 쓰지 마세요.",
  daily:
    "당신은 프리미엄 젓갈 스토어의 '오늘의 추천' 큐레이터입니다. 제공된 상품/명인 데이터(payload)에만 " +
    "근거해 한국어로 오늘 추천할 젓갈 1가지를 고르고, 간단한 오늘의 요리 팁과 명인 한마디를 곁들이세요. " +
    "데이터에 없는 상품·가격·효능을 지어내지 말고, 과장·의학적 주장 없이 3~5줄로 짧게 답하세요."
};

// task 별 출력 상한(비용). 기본 700, 필요한 task 만 상향.
const MAX_TOKENS = { chat: 700, giftset: 900, copy: 900, daily: 350 };

function userMessageFor(task, payload) {
  const json = JSON.stringify(payload ?? {}, null, 2);
  if (task === "chat") {
    return `사용자 질문: ${payload?.message ?? "(없음)"}\n\n[그라운딩 데이터]\n${json}\n\n` +
      "위 데이터에 있는 상품 중에서 최대 3가지를 추천하고, 각 상품의 먹는 법/요리법을 알려주세요.";
  }
  if (task === "giftset") {
    return `[선물세트 요청 + 상품 데이터]\n${json}\n\n` +
      "예산과 취향에 맞춰 2~4종으로 선물세트를 구성하고 합계·포장비·배송을 정리해 주세요.";
  }
  if (task === "copy") {
    return `[상품/명인 데이터]\n${json}\n\n` +
      "헤드라인, 서브카피, 본문, 상세 포인트, 해시태그 순서로 상품 카피를 작성해 주세요.";
  }
  if (task === "daily") {
    return `[오늘 날짜 + 상품/명인 데이터]\n${json}\n\n` +
      "오늘 추천할 젓갈 1가지를 골라 이름·산지·가격과 함께 오늘의 요리 팁과 명인 한마디를 3~5줄로 알려주세요.";
  }
  return `[요청]\n${json}`;
}

/* ---------- 비용 가드레일: 레이트리밋 + 월간 토큰 예산 ---------- */
const hits = new Map();               // ip -> [timestamp,...] (최근 60초)
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60_000);
  if (arr.length >= RATE_PER_MIN) { hits.set(ip, arr); return true; }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

let tokensUsed = 0;
let budgetMonth = monthKey();
function monthKey() { const d = new Date(); return `${d.getUTCFullYear()}-${d.getUTCMonth()}`; }
function budgetExceeded() {
  const m = monthKey();
  if (m !== budgetMonth) { budgetMonth = m; tokensUsed = 0; }  // 매월 리셋
  return tokensUsed >= MONTHLY_TOKEN_CAP;
}
function addUsage(u) {
  if (!u) return;
  tokensUsed += (u.input_tokens || 0) + (u.output_tokens || 0) +
    (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
}

/* ---------- HTTP 서버 ---------- */
const server = http.createServer(async (req, res) => {
  // CORS 프리플라이트
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders() });
    res.end(JSON.stringify({
      ok: true, model: MODEL, hasKey: !!client,
      tokensUsed, monthlyTokenCap: MONTHLY_TOKEN_CAP, ratePerMin: RATE_PER_MIN
    }));
    return;
  }
  if (req.method !== "POST" || !req.url.startsWith("/api/ai")) {
    res.writeHead(404, corsHeaders());
    res.end("Not found");
    return;
  }

  // 레이트리밋 — 초과 시 429 {fallback:true} → 프런트가 목업으로 폴백.
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress || "unknown";
  if (rateLimited(ip)) {
    res.writeHead(429, { "Content-Type": "application/json", ...corsHeaders() });
    res.end(JSON.stringify({ fallback: true, error: "rate_limited" }));
    return;
  }
  // 월간 토큰 예산 초과 시에도 429 {fallback:true}.
  if (budgetExceeded()) {
    res.writeHead(429, { "Content-Type": "application/json", ...corsHeaders() });
    res.end(JSON.stringify({ fallback: true, error: "monthly_budget_exceeded" }));
    return;
  }

  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 1_000_000) req.destroy(); });
  req.on("end", async () => {
    let task, payload;
    try {
      ({ task, payload } = JSON.parse(body || "{}"));
    } catch {
      res.writeHead(400, corsHeaders());
      res.end("잘못된 JSON 요청입니다.");
      return;
    }
    if (!SYSTEMS[task]) {
      res.writeHead(400, corsHeaders());
      res.end(`지원하지 않는 task: ${task}`);
      return;
    }
    if (!client) {
      // 키가 없으면 서버가 대신 목업을 흉내내지 않고, 프런트가 폴백하도록 429 를 돌려준다.
      res.writeHead(429, { "Content-Type": "application/json", ...corsHeaders() });
      res.end(JSON.stringify({ fallback: true, error: "missing_key" }));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      ...corsHeaders()
    });

    try {
      const params = {
        model: MODEL,
        max_tokens: MAX_TOKENS[task] || 700,
        // prompt caching: 안정적인 시스템 프롬프트를 캐시해 반복 호출 비용을 낮춘다.
        system: [{ type: "text", text: SYSTEMS[task], cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMessageFor(task, payload) }]
      };
      // Haiku 4.5 는 thinking/effort 미지원 → 보내지 않음(400 방지). 그 외 모델만 적용.
      if (!IS_HAIKU) {
        params.thinking = { type: "adaptive" };
        params.output_config = { effort: EFFORT };
      }

      const stream = client.messages.stream(params);
      stream.on("text", (t) => res.write(t));
      const finalMsg = await stream.finalMessage();
      addUsage(finalMsg?.usage);   // 월간 예산 누적
      res.end();
    } catch (err) {
      // 헤더는 이미 전송됨 → 스트림 본문에 오류 메시지를 이어 붙이고 종료.
      res.write(`\n\n[AI 오류] ${err?.message || String(err)}`);
      res.end();
    }
  });
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

server.listen(PORT, () => {
  console.log(`[jeotgal-ai] listening on http://localhost:${PORT}  (model=${MODEL}, key=${client ? "set" : "MISSING"}, cap=${MONTHLY_TOKEN_CAP}tok/월, rate=${RATE_PER_MIN}/분)`);
});
