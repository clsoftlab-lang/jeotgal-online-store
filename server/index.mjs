// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/index.mjs — 프리미엄 젓갈 스토어 AI 프록시 (선택 사항).
//
// 프런트엔드(ai/ai.js)는 { task, payload } 를 이 서버의 POST /api/ai 로 보냅니다.
// 이 서버만 Claude(@anthropic-ai/sdk)를 호출하며, ANTHROPIC_API_KEY 는 오직
// 서버 측 환경변수로만 존재합니다. 키는 브라우저나 저장소에 절대 노출되지 않습니다.
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
const MODEL = process.env.AI_MODEL || "claude-opus-5";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

/* ---------- task 별 시스템 프롬프트(그라운딩) ---------- */
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
    "표시광고 규정을 위반할 수 있는 허위·과장·의학적 표현은 쓰지 마세요."
};

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
  return `[요청]\n${json}`;
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
    res.end(JSON.stringify({ ok: true, model: MODEL, hasKey: !!client }));
    return;
  }
  if (req.method !== "POST" || !req.url.startsWith("/api/ai")) {
    res.writeHead(404, corsHeaders());
    res.end("Not found");
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
      res.writeHead(500, corsHeaders());
      res.end("서버에 ANTHROPIC_API_KEY 가 설정되지 않았습니다. server/.env 를 확인하세요.");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      ...corsHeaders()
    });

    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 2048,
        thinking: { type: "adaptive" },
        system: SYSTEMS[task],
        messages: [{ role: "user", content: userMessageFor(task, payload) }]
      });
      stream.on("text", (t) => res.write(t));
      await stream.finalMessage();
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
  console.log(`[jeotgal-ai] listening on http://localhost:${PORT}  (model=${MODEL}, key=${client ? "set" : "MISSING"})`);
});
