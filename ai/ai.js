// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// ai/ai.js — 앱과 분리된 "AI-KIT" 어댑터.
//
//   askAI(task, payload, { onToken } = {}) => Promise<string>
//
// - AI_ENDPOINT 가 비어 있으면(데모 기본값) → 결정론적 한국어 MockProvider 로 응답합니다.
//   MockProvider 는 앱의 실제 상품/명인 데이터(payload)와 배송 계산 엔진(shipping.js)을
//   그대로 재사용하므로, 서버·키·네트워크 없이도 UI 가 실제처럼 동작합니다.
// - AI_ENDPOINT 가 설정되면 → { task, payload } 를 그 프록시로 POST 하고
//   응답 본문을 스트리밍으로 읽어 onToken 으로 흘려보냅니다.
//   (실제 Claude 호출과 API 키는 오직 서버 측에서만 처리됩니다.)
//
// 지원 task: "chat"(추천·요리 도우미), "giftset"(선물세트 구성), "copy"(스토리 카피).

import { calcShipping, summarizeWeight } from "../shipping.js";
import { AI_ENDPOINT } from "./config.js";

/* ===================== 공개 API ===================== */

/**
 * @param {"chat"|"giftset"|"copy"} task
 * @param {Object} payload  task 별 입력 + 그라운딩 컨텍스트(상품/명인 등)
 * @param {{onToken?: (chunk:string)=>void}} [opts]
 * @returns {Promise<string>} 최종 전체 텍스트
 */
export async function askAI(task, payload = {}, { onToken } = {}) {
  if (AI_ENDPOINT_VALUE()) {
    return streamFromEndpoint(task, payload, onToken);
  }
  const text = buildMock(task, payload);
  await emit(text, onToken);
  return text;
}

function AI_ENDPOINT_VALUE() {
  return (typeof AI_ENDPOINT === "string" ? AI_ENDPOINT : "").trim();
}

/* ===================== 실서버(프록시) 스트리밍 ===================== */

async function streamFromEndpoint(task, payload, onToken) {
  const res = await fetch(AI_ENDPOINT_VALUE(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, payload })
  });
  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`AI 서버 오류 ${res.status}${detail ? " — " + detail : ""}`);
  }
  // 스트리밍 본문을 청크 단위로 읽어 흘려보낸다.
  if (!res.body || typeof res.body.getReader !== "function") {
    const whole = await res.text();
    if (typeof onToken === "function" && whole) onToken(whole);
    return whole;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      full += chunk;
      if (typeof onToken === "function") onToken(chunk);
    }
  }
  const tail = decoder.decode();
  if (tail) { full += tail; if (typeof onToken === "function") onToken(tail); }
  return full;
}

async function safeText(res) {
  try { return (await res.text()).slice(0, 200); } catch { return ""; }
}

/* ===================== 스트리밍 시뮬레이터 ===================== */

/** 텍스트를 짧은 청크로 쪼개 onToken 으로 흘려보낸다(내용은 결정론적, 타이밍만 연출). */
async function emit(text, onToken) {
  if (typeof onToken !== "function") return;
  const parts = String(text).match(/[^]{1,18}/g) || [];
  for (const part of parts) {
    onToken(part);
    // 타이핑 연출용 짧은 지연(내용/결과에는 영향 없음).
    await new Promise(r => setTimeout(r, 8));
  }
}

/* ===================== MockProvider (결정론적 한국어) ===================== */

const won = (n) => (Math.round(Number(n) || 0)).toLocaleString("ko-KR") + "원";

function buildMock(task, payload) {
  switch (task) {
    case "chat":    return mockChat(payload);
    case "giftset": return mockGiftset(payload);
    case "copy":    return mockCopy(payload);
    default:        return `지원하지 않는 요청 유형입니다: ${task}`;
  }
}

/** 상품 요약 리스트에서 최저가를 구한다(payload 형태를 유연하게 수용). */
function minPriceOf(p) {
  if (typeof p.minPrice === "number") return p.minPrice;
  if (Array.isArray(p.weights) && p.weights.length) {
    return Math.min(...p.weights.map(w => Number(w.price) || Infinity));
  }
  return 0;
}
function firstGrams(p) {
  if (typeof p.grams === "number") return p.grams;
  if (Array.isArray(p.weights) && p.weights.length) return Number(p.weights[0].g) || 250;
  return 250;
}

/* ---------- (1) 추천·요리 도우미 챗봇 ---------- */
function mockChat(payload) {
  const products = Array.isArray(payload.products) ? payload.products : [];
  const q = String(payload.message || "").toLowerCase().trim();

  const USE_HINTS = [
    { keys: ["밥반찬", "밥", "반찬", "rice"], use: "rice", label: "밥반찬" },
    { keys: ["요리", "찌개", "볶음", "cook", "국"], use: "cook", label: "요리용" },
    { keys: ["선물", "gift", "명절", "부모님"], use: "gift", label: "선물" }
  ];
  const SPICE_HINTS = [
    { keys: ["안 매", "안매", "순한", "순", "mild"], spice: 0 },
    { keys: ["매콤", "매운", "칼칼", "spicy"], spice: 2 }
  ];

  const wantUse = USE_HINTS.find(h => h.keys.some(k => q.includes(k)));
  const wantSpice = SPICE_HINTS.find(h => h.keys.some(k => q.includes(k)));

  // 결정론적 점수: 이름/카테고리/산지 매칭 + 용도/맵기 매칭 + 평점 보정.
  const scored = products.map((p, i) => {
    let s = 0;
    const hay = `${p.name} ${p.categoryLabel || ""} ${p.origin || ""} ${p.story || ""}`.toLowerCase();
    if (q) {
      for (const tok of q.split(/[\s,·]+/).filter(t => t.length >= 2)) {
        if (hay.includes(tok)) s += 3;
      }
    }
    if (wantUse && Array.isArray(p.uses) && p.uses.includes(wantUse.use)) s += 4;
    if (wantSpice && Number(p.spice) === wantSpice.spice) s += 4;
    s += (Number(p.rating) || 0);        // 평점(0~5) 미세 보정
    return { p, s, i };
  });
  // 점수 내림차순, 동점 시 원본 순서(i) — 완전 결정론적.
  scored.sort((a, b) => (b.s - a.s) || (a.i - b.i));
  const picks = scored.slice(0, 3).map(x => x.p);

  const head = q
    ? `요청하신 "${payload.message}" 에 맞춰 갯마을 명인 젓갈을 골라봤어요.`
    : `무엇을 찾으시는지 알려주시면 더 정확히 추천해 드릴게요. 우선 인기 젓갈부터 소개할게요.`;

  const lines = picks.map((p, n) => {
    const spice = p.spiceLabel || spiceLabelFor(p.spice);
    const eat = eatingTip(p);
    const story = (p.story || "").split(/(?<=[.!?。])\s/)[0] || (p.story || "");
    return [
      `${n + 1}. ${p.name}  ·  📍${p.origin || "산지 미상"}  ·  맵기: ${spice}  ·  ${won(minPriceOf(p))}~`,
      `   • 이렇게 드세요: ${eat}`,
      `   • 명인 한마디: ${story}`
    ].join("\n");
  });

  const tail = wantUse
    ? `\n\n"${wantUse.label}" 용도를 중심으로 추렸어요. 매운맛/산지 조건을 덧붙이면 더 좁혀드릴게요.`
    : `\n\n예) "밥반찬으로 안 매운 젓갈", "찌개용 새우젓", "부모님 선물" 처럼 물어보세요.`;

  return [head, "", ...(lines.length ? lines : ["   (조건에 맞는 상품을 찾지 못했어요. 다른 키워드로 물어봐 주세요.)"]), tail].join("\n");
}

function eatingTip(p) {
  const uses = Array.isArray(p.uses) ? p.uses : [];
  const bits = [];
  if (uses.includes("rice")) bits.push("갓 지은 밥에 참기름 한 방울과 곁들이면 최고예요");
  if (uses.includes("cook")) bits.push("김치·찌개·볶음의 간과 감칠맛을 낼 때 한 스푼 넣으세요");
  if (uses.includes("gift")) bits.push("냉장 포장해 선물하기에도 좋아요");
  if (!bits.length) bits.push("차게 두었다가 소량씩 곁들여 드세요");
  const storage = p.storage ? ` (보관: ${p.storage})` : "";
  return bits.join(", ") + storage;
}

/* ---------- (2) 선물세트 구성 추천 ---------- */
function mockGiftset(payload) {
  const all = (Array.isArray(payload.products) ? payload.products : [])
    .filter(p => p.giftEligible !== false);
  const budget = Number(payload.budget) || 0;
  const recipient = String(payload.recipient || "").trim();
  const preference = String(payload.preference || "").toLowerCase().trim();
  const boxPrice = Number(payload.boxPrice) || 5000;

  // 취향 키워드로 가중치, 그다음 평점 → 결정론적 정렬.
  const scored = all.map((p, i) => {
    let s = Number(p.rating) || 0;
    if (preference) {
      const hay = `${p.name} ${p.categoryLabel || ""} ${p.origin || ""} ${p.story || ""}`.toLowerCase();
      for (const tok of preference.split(/[\s,·]+/).filter(t => t.length >= 2)) {
        if (hay.includes(tok)) s += 5;
      }
    }
    return { p, s, i };
  });
  scored.sort((a, b) => (b.s - a.s) || (a.i - b.i));

  // 예산 안에서 담되, 예산이 없으면 3종. 최소 2종 보장.
  const chosen = [];
  let itemsPrice = 0;
  for (const { p } of scored) {
    const price = minPriceOf(p);
    if (budget && itemsPrice + price + boxPrice > budget && chosen.length >= 2) break;
    chosen.push(p);
    itemsPrice += price;
    if (!budget && chosen.length >= 3) break;
    if (chosen.length >= 5) break;
  }
  while (chosen.length < 2 && scored[chosen.length]) {
    const p = scored[chosen.length].p;
    chosen.push(p); itemsPrice += minPriceOf(p);
  }

  const total = chosen.length ? itemsPrice + boxPrice : 0;

  // 배송 엔진 재사용: 국내 배송비 추정(세트 총 무게 기준).
  const lines = chosen.map(p => ({ grams: firstGrams(p), qty: 1, coldChain: !!p.coldChain }));
  const { totalGrams, coldChain } = summarizeWeight(lines);
  const ship = calcShipping({ subtotal: total, totalGrams, destination: "domestic", coldChain });

  const title = recipient ? `${recipient}께 드릴 선물세트 제안` : "선물세트 구성 제안";
  const budgetLine = budget ? `예산 ${won(budget)} 안에서 ` : "";
  const prefLine = preference ? `"${payload.preference}" 취향을 반영해 ` : "";

  const body = chosen.map((p, n) =>
    `  ${n + 1}. ${p.name} — ${won(minPriceOf(p))}  (📍${p.origin || "산지 미상"}, 맵기 ${p.spiceLabel || spiceLabelFor(p.spice)})`
  ).join("\n");

  const shipNote = ship.free
    ? "국내 기본 배송비 무료"
    : `국내 배송비 약 ${won(ship.fee)}${coldChain ? " (콜드체인 할증 포함)" : ""}`;

  return [
    `${title}`,
    "",
    `${budgetLine}${prefLine}명인 젓갈 ${chosen.length}종으로 구성했어요.`,
    "",
    body,
    "",
    `  · 선물포장비 ${won(boxPrice)} 포함 — 예상 상품 합계 ${won(total)}`,
    `  · 총 중량 약 ${(totalGrams / 1000).toFixed(2)}kg · ${shipNote}`,
    "",
    budget
      ? `예산 대비 ${total <= budget ? "여유" : "약간 초과"} 구성입니다. 종수를 늘리거나 줄여 드릴 수도 있어요.`
      : `받는 분 취향(맵기·산지·용도)을 알려주시면 세트를 더 정교하게 맞춰 드릴게요.`
  ].join("\n");
}

/* ---------- (3) 상품/산지 스토리 카피 생성 ---------- */
function mockCopy(payload) {
  const p = payload.product || {};
  const a = payload.artisan || {};
  const tone = String(payload.tone || "정중한").trim();

  const name = p.name || "이 젓갈";
  const origin = p.origin || "갯마을";
  const spice = p.spiceLabel || spiceLabelFor(p.spice);
  const uses = Array.isArray(p.uses) ? p.uses : [];
  const useWords = uses.map(u => ({ rice: "밥반찬", cook: "요리", gift: "선물" }[u] || u));

  const headline = `${origin}의 시간을 담은 ${name}`;
  const sub = a.name
    ? `${a.village || origin} 명인 ${a.name}의 손맛`
    : `${origin} 명인의 손맛`;

  const storyLead = (p.story || "").split(/(?<=[.!?。])\s/).slice(0, 2).join(" ")
    || `${origin}에서 정성껏 담근 젓갈입니다.`;

  const quote = a.quote ? `“${a.quote}”` : `“소금과 시간, 그리고 갯바람이 젓갈을 만듭니다.”`;

  const bullets = [
    `• 산지: ${origin}${p.originCountry ? ` (${p.originCountry})` : ""}`,
    `• 맵기: ${spice}${useWords.length ? ` · 추천 용도: ${useWords.join(" · ")}` : ""}`,
    p.storage ? `• 보관: ${p.storage}` : `• 보관: 냉장 보관 권장`
  ];

  const tags = ["#젓갈", `#${origin.replace(/\s/g, "")}`, "#명인의손맛", "#프리미엄젓갈"]
    .concat(useWords.map(w => `#${w}`)).join(" ");

  return [
    `[${tone} 톤 · 상품 카피]`,
    "",
    `■ 헤드라인: ${headline}`,
    `■ 서브카피: ${sub}`,
    "",
    `■ 본문:`,
    `  ${storyLead}`,
    `  ${quote}`,
    `  ${name}은(는) ${useWords.length ? useWords.join("·") + "에 두루 어울리며, " : ""}갯마을의 정직한 숙성을 그대로 전합니다.`,
    "",
    `■ 상세 포인트:`,
    ...bullets.map(b => `  ${b}`),
    "",
    `■ 해시태그: ${tags}`,
    "",
    `※ 데모 카피입니다. 실제 판매 문구는 원산지·표시광고 규정을 확인해 사용하세요.`
  ].join("\n");
}

/* ---------- 공통 ---------- */
const SPICE_LABELS = ["순한맛", "약한 매움", "매콤", "아주 매콤"];
function spiceLabelFor(spice) {
  const i = Number(spice);
  return (i >= 0 && SPICE_LABELS[i]) ? SPICE_LABELS[i] : "-";
}
