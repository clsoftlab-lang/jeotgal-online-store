// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// server/worker.js — Cloudflare Workers 변형(무인·무료 티어 지향).
//
// Node 프록시(index.mjs)와 동일한 task 라우팅 + 모델/캐싱 규칙을 쓰되, Anthropic REST API 를
// 직접 호출합니다. 서버를 상시 운영할 필요가 없어(무인) 무료 티어로 배포할 수 있습니다.
//
// 키는 Worker 시크릿으로만 보관합니다(코드/저장소에 절대 넣지 않음):
//   wrangler secret put ANTHROPIC_API_KEY
//
// 배포:  cd server && wrangler deploy
// 프런트: ai/config.js 의 AI_ENDPOINT 를 배포된 Worker 주소(예:
//   "https://jeotgal-ai.<계정>.workers.dev/api/ai") 로 설정하세요.
//
// 응답은 어시스턴트 텍스트를 text/plain 으로 반환합니다(ai/ai.js 가 그대로 스트리밍 읽기).
// 오류/429 시 {fallback:true} 를 돌려주면 프런트가 자동으로 목업으로 폴백합니다(앱 무중단).

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

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

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": (env && env.ALLOW_ORIGIN) || "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
function jsonResponse(obj, status, env) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json", ...corsHeaders(env) }
  });
}

// 무료 티어용 베스트에포트 레이트리밋(아이솔레이트 단위). 엄격한 운영 한도는 KV/Durable Object 권장.
const hits = new Map();
function rateLimited(ip, limit) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60_000);
  if (arr.length >= limit) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr); return false;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    const MODEL = (env && env.AI_MODEL) || "claude-haiku-4-5";
    const IS_HAIKU = MODEL.startsWith("claude-haiku");
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ ok: true, model: MODEL, hasKey: !!(env && env.ANTHROPIC_API_KEY) }, 200, env);
    }
    if (request.method !== "POST" || !url.pathname.startsWith("/api/ai")) {
      return new Response("Not found", { status: 404, headers: corsHeaders(env) });
    }

    const ip = (request.headers.get("cf-connecting-ip") ||
      (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown");
    const RATE_PER_MIN = Number(env && env.AI_RATE_PER_MIN) || 20;
    if (rateLimited(ip, RATE_PER_MIN)) {
      return jsonResponse({ fallback: true, error: "rate_limited" }, 429, env);
    }

    let body;
    try { body = await request.json(); }
    catch { return new Response("잘못된 JSON 요청입니다.", { status: 400, headers: corsHeaders(env) }); }
    const { task, payload } = body || {};
    if (!SYSTEMS[task]) {
      return new Response(`지원하지 않는 task: ${task}`, { status: 400, headers: corsHeaders(env) });
    }
    const key = env && env.ANTHROPIC_API_KEY;
    if (!key) return jsonResponse({ fallback: true, error: "missing_key" }, 429, env);

    const reqBody = {
      model: MODEL,
      max_tokens: MAX_TOKENS[task] || 700,
      // prompt caching: 안정적 시스템 프롬프트를 캐시(반복 호출 비용 절감).
      system: [{ type: "text", text: SYSTEMS[task], cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessageFor(task, payload) }]
    };
    // Haiku 4.5 는 thinking/effort 미지원 → 보내지 않음(400 방지).
    if (!IS_HAIKU) {
      reqBody.thinking = { type: "adaptive" };
      reqBody.output_config = { effort: (env && env.AI_EFFORT) || "low" };
    }

    let apiRes;
    try {
      apiRes = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify(reqBody)
      });
    } catch (e) {
      return jsonResponse({ fallback: true, error: "upstream_network: " + String(e) }, 429, env);
    }
    if (!apiRes.ok) {
      // 상류 오류/429 → 프런트가 목업으로 폴백하도록 fallback 신호.
      return jsonResponse({ fallback: true, error: `upstream_${apiRes.status}` }, apiRes.status === 429 ? 429 : 502, env);
    }

    const data = await apiRes.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("") || "";
    return new Response(text, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(env) }
    });
  }
};
