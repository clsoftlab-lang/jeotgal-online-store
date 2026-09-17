// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// app.js — 프리미엄 젓갈 온라인 스토어 (DEMO). 정적 사이트, 빌드 불필요.

import { art, artisanBadge } from "./svg.js";
import { calcShipping, summarizeWeight, SHIPPING_CONFIG } from "./shipping.js";
import { load, save, resetAll } from "./storage.js";
import { askAI } from "./ai/ai.js";

/* ---------------- 상태 ---------------- */
const DB = { products: [], artisans: [], giftsets: [], meta: {} };
let cart = load("cart", []);            // [{productId, grams, price, qty}]
let wishlist = load("wishlist", []);    // [productId]
let giftDraft = load("giftDraft", []);  // [productId]
let ship = load("ship", { destination: "domestic", zone: "asia", jeju: false });

/* ---------------- 유틸 ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const won = (n) => (Math.round(Number(n) || 0)).toLocaleString("ko-KR") + "원";
const byId = (id) => DB.products.find(p => p.id === id);
const artisanById = (id) => DB.artisans.find(a => a.id === id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function persist() {
  save("cart", cart);
  save("wishlist", wishlist);
  save("giftDraft", giftDraft);
  save("ship", ship);
}

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 1800);
}

/* ---------------- 데이터 로드 ---------------- */
async function loadData() {
  const [p, a, g] = await Promise.all([
    fetch("./data/products.json").then(r => r.json()),
    fetch("./data/artisans.json").then(r => r.json()),
    fetch("./data/giftsets.json").then(r => r.json())
  ]);
  DB.products = p.products;
  DB.meta = p.meta;
  DB.artisans = a.artisans;
  DB.giftsets = g.presets;
}

/* ---------------- 카탈로그 필터 ---------------- */
const filterState = { q: "", category: "", origin: "", spice: "", use: "", sort: "featured" };

function categories() {
  const map = new Map();
  DB.products.forEach(p => map.set(p.category, p.categoryLabel));
  return [...map.entries()];
}
function origins() {
  return [...new Set(DB.products.map(p => p.origin))].sort();
}

function applyFilters() {
  let list = DB.products.slice();
  const q = filterState.q.trim().toLowerCase();
  if (q) list = list.filter(p =>
    (p.name + " " + p.categoryLabel + " " + p.origin + " " + p.story).toLowerCase().includes(q));
  if (filterState.category) list = list.filter(p => p.category === filterState.category);
  if (filterState.origin) list = list.filter(p => p.origin === filterState.origin);
  if (filterState.spice !== "") list = list.filter(p => p.spice === Number(filterState.spice));
  if (filterState.use) list = list.filter(p => p.uses.includes(filterState.use));

  const minPrice = p => Math.min(...p.weights.map(w => w.price));
  switch (filterState.sort) {
    case "price-asc": list.sort((a, b) => minPrice(a) - minPrice(b)); break;
    case "price-desc": list.sort((a, b) => minPrice(b) - minPrice(a)); break;
    case "rating": list.sort((a, b) => b.rating - a.rating); break;
    case "name": list.sort((a, b) => a.name.localeCompare(b.name, "ko")); break;
    default: break; // featured = 원본 순서
  }
  return list;
}

function renderFilters() {
  const el = $("#filters");
  const catOpts = categories().map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
  const originOpts = origins().map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join("");
  const spiceOpts = (DB.meta.spiceLabels || []).map((l, i) => `<option value="${i}">${esc(l)}</option>`).join("");
  el.innerHTML = `
    <div class="filter-row">
      <input id="f-q" type="search" placeholder="검색: 명란, 광천, 밥반찬…" value="${esc(filterState.q)}" aria-label="상품 검색">
    </div>
    <div class="filter-row">
      <select id="f-category" aria-label="종류"><option value="">종류 전체</option>${catOpts}</select>
      <select id="f-origin" aria-label="산지"><option value="">산지 전체</option>${originOpts}</select>
      <select id="f-spice" aria-label="맵기"><option value="">맵기 전체</option>${spiceOpts}</select>
      <select id="f-use" aria-label="용도">
        <option value="">용도 전체</option>
        <option value="rice">밥반찬</option>
        <option value="gift">선물</option>
        <option value="cook">요리용</option>
      </select>
      <select id="f-sort" aria-label="정렬">
        <option value="featured">추천순</option>
        <option value="price-asc">가격 낮은순</option>
        <option value="price-desc">가격 높은순</option>
        <option value="rating">평점순</option>
        <option value="name">이름순</option>
      </select>
    </div>`;
  // 값 복원
  $("#f-category").value = filterState.category;
  $("#f-origin").value = filterState.origin;
  $("#f-spice").value = filterState.spice;
  $("#f-use").value = filterState.use;
  $("#f-sort").value = filterState.sort;

  $("#f-q").addEventListener("input", e => { filterState.q = e.target.value; renderGrid(); });
  ["category", "origin", "spice", "use", "sort"].forEach(k => {
    $("#f-" + k).addEventListener("change", e => { filterState[k] = e.target.value; renderGrid(); });
  });
}

function cardHTML(p) {
  const minP = Math.min(...p.weights.map(w => w.price));
  const spice = (DB.meta.spiceLabels || [])[p.spice] || "";
  const faved = wishlist.includes(p.id);
  return `<article class="card" data-detail="${p.id}" tabindex="0" role="button" aria-label="${esc(p.name)} 상세보기">
    <div class="card-art">${art(p.svg)}
      <button class="fav ${faved ? "on" : ""}" data-fav="${p.id}" aria-label="찜">${faved ? "♥" : "♡"}</button>
    </div>
    <div class="card-body">
      <div class="tags">
        <span class="tag">${esc(p.categoryLabel)}</span>
        ${p.giftEligible ? '<span class="tag gift">선물가능</span>' : ""}
        ${spice ? `<span class="tag spice s${p.spice}">${esc(spice)}</span>` : ""}
      </div>
      <h3>${esc(p.name)}</h3>
      <p class="origin">📍 ${esc(p.origin)}</p>
      <div class="card-foot">
        <span class="price">${won(minP)}~</span>
        <span class="rating">★ ${p.rating.toFixed(1)}</span>
      </div>
    </div>
  </article>`;
}

function renderGrid() {
  const list = applyFilters();
  const grid = $("#product-grid");
  $("#result-count").textContent = `${list.length}개 상품`;
  grid.innerHTML = list.length
    ? list.map(cardHTML).join("")
    : `<p class="empty">조건에 맞는 상품이 없습니다.</p>`;
}

/* ---------------- 상품 상세 모달 ---------------- */
function openDetail(id) {
  const p = byId(id);
  if (!p) return;
  const a = artisanById(p.artisanId);
  const spice = (DB.meta.spiceLabels || [])[p.spice] || "-";
  const weightOpts = p.weights.map((w, i) =>
    `<option value="${i}">${w.g}g — ${won(w.price)}</option>`).join("");
  const reviews = (p.reviews || []).map(r =>
    `<li><strong>${esc(r.author)}</strong> <span class="rating">${"★".repeat(r.rating)}</span><p>${esc(r.text)}</p></li>`).join("");
  const faved = wishlist.includes(p.id);
  const modal = $("#product-modal");
  modal.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true" aria-label="${esc(p.name)}">
      <button class="modal-close" data-close aria-label="닫기">✕</button>
      <div class="detail">
        <div class="detail-art">${art(p.svg)}</div>
        <div class="detail-info">
          <div class="tags">
            <span class="tag">${esc(p.categoryLabel)}</span>
            ${p.giftEligible ? '<span class="tag gift">선물가능</span>' : ""}
            <span class="tag spice s${p.spice}">맵기: ${esc(spice)}</span>
          </div>
          <h2>${esc(p.name)}</h2>
          <p class="origin">📍 ${esc(p.origin)} · 원산지: ${esc(p.originCountry)}</p>
          <p class="story">${esc(p.story)}</p>
          <p class="storage">🧊 보관: ${esc(p.storage)}</p>
          <div class="buy-row">
            <select id="detail-weight" aria-label="중량 선택">${weightOpts}</select>
            <input id="detail-qty" type="number" min="1" max="20" value="1" aria-label="수량">
            <button class="btn primary" data-add="${p.id}">장바구니 담기</button>
            <button class="btn ghost fav-btn ${faved ? "on" : ""}" data-fav="${p.id}">${faved ? "♥ 찜됨" : "♡ 찜"}</button>
          </div>
        </div>
      </div>
      ${a ? `<div class="artisan-mini">
        <div class="badge">${artisanBadge(DB.artisans.indexOf(a))}</div>
        <div><strong>${esc(a.name)}</strong><br><span class="muted">${esc(a.village)} · ${esc(a.specialty)}</span>
        <p class="quote">“${esc(a.quote)}”</p></div>
      </div>` : ""}
      <div class="reviews">
        <h3>리뷰 (${(p.reviews || []).length})</h3>
        <ul>${reviews || "<li class='muted'>아직 리뷰가 없습니다.</li>"}</ul>
      </div>
    </div>`;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}
function closeModal() {
  const m = $("#product-modal");
  m.classList.remove("open");
  m.setAttribute("aria-hidden", "true");
  m.innerHTML = "";
}

/* ---------------- 장바구니 ---------------- */
function addToCart(productId, weightIdx = 0, qty = 1) {
  const p = byId(productId);
  if (!p) return;
  const w = p.weights[weightIdx] || p.weights[0];
  const existing = cart.find(l => l.productId === productId && l.grams === w.g);
  if (existing) existing.qty += qty;
  else cart.push({ productId, grams: w.g, price: w.price, qty });
  persist();
  renderCartBadge();
  toast(`${p.name} 담김`);
}

function cartLines() {
  return cart.map(l => {
    const p = byId(l.productId);
    return { ...l, name: p ? p.name : l.productId, svg: p ? p.svg : "shrimp", coldChain: p ? p.coldChain : false };
  });
}

function cartSubtotal() {
  return cart.reduce((s, l) => s + l.price * l.qty, 0);
}

function renderCartBadge() {
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const b = $("#cart-count");
  b.textContent = count;
  b.style.display = count ? "inline-flex" : "none";
}

function currentShipping() {
  const lines = cartLines();
  const { totalGrams, coldChain } = summarizeWeight(lines);
  return calcShipping({
    subtotal: cartSubtotal(),
    totalGrams,
    destination: ship.destination,
    coldChain,
    jeju: ship.destination === "domestic" ? ship.jeju : false,
    zone: ship.zone
  });
}

function renderCart() {
  const lines = cartLines();
  const box = $("#cart-lines");
  if (!lines.length) {
    box.innerHTML = `<p class="empty">장바구니가 비어 있습니다.</p>`;
    $("#shipping-calc").innerHTML = "";
    $("#cart-summary").innerHTML = "";
    return;
  }
  box.innerHTML = lines.map((l, i) => `
    <div class="cart-line">
      <div class="cl-art">${art(l.svg)}</div>
      <div class="cl-info">
        <strong>${esc(l.name)}</strong>
        <span class="muted">${l.grams}g · ${won(l.price)}</span>
      </div>
      <div class="cl-qty">
        <button data-qty="${i}" data-d="-1" aria-label="수량 감소">−</button>
        <span>${l.qty}</span>
        <button data-qty="${i}" data-d="1" aria-label="수량 증가">+</button>
      </div>
      <div class="cl-sum">${won(l.price * l.qty)}</div>
      <button class="cl-del" data-del="${i}" aria-label="삭제">🗑</button>
    </div>`).join("");

  renderShippingCalc();
}

function renderShippingCalc() {
  const { totalGrams, coldChain } = summarizeWeight(cartLines());
  const zoneOpts = Object.entries(SHIPPING_CONFIG.overseas.zones)
    .map(([k, z]) => `<option value="${k}">${esc(z.label)} (기본 ${won(z.base)} + ${won(z.perKg)}/kg)</option>`).join("");
  const calc = $("#shipping-calc");
  calc.innerHTML = `
    <h3>배송비 계산기</h3>
    <div class="ship-row">
      <label><input type="radio" name="dest" value="domestic" ${ship.destination === "domestic" ? "checked" : ""}> 국내배송</label>
      <label><input type="radio" name="dest" value="overseas" ${ship.destination === "overseas" ? "checked" : ""}> 해외배송</label>
    </div>
    <div id="ship-domestic" class="ship-sub" ${ship.destination === "domestic" ? "" : "hidden"}>
      <label class="chk"><input type="checkbox" id="ship-jeju" ${ship.jeju ? "checked" : ""}> 제주·도서산간 (+${won(SHIPPING_CONFIG.domestic.jejuSurcharge)})</label>
      <p class="muted">${won(SHIPPING_CONFIG.domestic.freeThreshold)} 이상 구매 시 기본 배송비 무료</p>
    </div>
    <div id="ship-overseas" class="ship-sub" ${ship.destination === "overseas" ? "" : "hidden"}>
      <select id="ship-zone" aria-label="해외 권역">${zoneOpts}</select>
    </div>
    <p class="muted">총 중량 ${(totalGrams / 1000).toFixed(2)}kg${coldChain ? " · 콜드체인 포함(냉장 할증)" : ""}</p>`;
  if ($("#ship-zone")) $("#ship-zone").value = ship.zone;
  renderSummary();
}

function renderSummary() {
  const sub = cartSubtotal();
  const s = currentShipping();
  const total = sub + s.fee;
  const bd = s.breakdown;
  const bdText = Object.entries(bd).map(([k, v]) => {
    const label = { base: "기본", weight: "무게", coldChain: "콜드체인", jeju: "도서산간" }[k] || k;
    return `${label} ${won(v)}`;
  }).join(" + ");
  $("#cart-summary").innerHTML = `
    <div class="sum-row"><span>상품 합계</span><span>${won(sub)}</span></div>
    <div class="sum-row"><span>배송비 ${s.free ? '<span class="free">무료</span>' : ""}</span><span>${won(s.fee)}</span></div>
    <p class="muted small">${bdText || ""}</p>
    <div class="sum-row total"><span>총 결제금액</span><span>${won(total)}</span></div>
    <button class="btn primary block" id="checkout-btn">모의 결제하기</button>`;
  $("#checkout-btn").addEventListener("click", mockCheckout);
}

function mockCheckout() {
  if (!cart.length) { toast("장바구니가 비어 있습니다."); return; }
  const sub = cartSubtotal();
  const s = currentShipping();
  const total = sub + s.fee;
  const orderNo = "JG" + Date.now().toString().slice(-8);
  const modal = $("#product-modal");
  modal.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true" aria-label="주문 완료">
      <button class="modal-close" data-close aria-label="닫기">✕</button>
      <div class="checkout-done">
        <div class="check-ico">✓</div>
        <h2>모의 결제 완료</h2>
        <p class="muted">주문번호 <strong>${orderNo}</strong></p>
        <div class="receipt">
          <div class="sum-row"><span>상품 합계</span><span>${won(sub)}</span></div>
          <div class="sum-row"><span>배송비</span><span>${won(s.fee)}</span></div>
          <div class="sum-row total"><span>총액</span><span>${won(total)}</span></div>
        </div>
        <p class="demo-note">※ 이것은 <strong>DEMO 모의 결제</strong>입니다. 실제 결제·배송은 일어나지 않습니다.</p>
        <button class="btn primary" data-close>확인</button>
      </div>
    </div>`;
  modal.classList.add("open");
  cart = [];
  persist();
  renderCart();
  renderCartBadge();
}

/* ---------------- 선물세트 ---------------- */
function renderGiftsets() {
  const presets = DB.giftsets.map(g => {
    const items = g.items.map(byId).filter(Boolean);
    const price = items.reduce((s, p) => s + Math.min(...p.weights.map(w => w.price)), 0) + g.boxPrice;
    return `<article class="gift-card">
      <div class="card-art">${art(g.svg)}</div>
      <div class="card-body">
        <h3>${esc(g.name)}</h3>
        <p class="muted">${esc(g.desc)}</p>
        <ul class="gift-items">${items.map(p => `<li>${esc(p.name)}</li>`).join("")}</ul>
        <div class="card-foot">
          <span class="price">${won(price)}</span>
          <button class="btn primary" data-add-set="${g.id}">세트 담기</button>
        </div>
      </div>
    </article>`;
  }).join("");
  $("#giftset-presets").innerHTML = presets;
  renderGiftBuilder();
}

function renderGiftBuilder() {
  const giftable = DB.products.filter(p => p.giftEligible);
  const chosen = giftDraft.map(byId).filter(Boolean);
  const boxPrice = 4000;
  const itemsPrice = chosen.reduce((s, p) => s + Math.min(...p.weights.map(w => w.price)), 0);
  const total = chosen.length ? itemsPrice + boxPrice : 0;
  const options = giftable.map(p => {
    const on = giftDraft.includes(p.id);
    return `<button class="pick ${on ? "on" : ""}" data-pick="${p.id}">
      ${on ? "✓ " : "+ "}${esc(p.name)} <span class="muted">${won(Math.min(...p.weights.map(w => w.price)))}</span>
    </button>`;
  }).join("");
  $("#giftset-builder").innerHTML = `
    <h3>나만의 선물세트 만들기</h3>
    <p class="muted">선물 가능 젓갈을 골라 조합하세요. 세트 포장비 ${won(boxPrice)}가 추가됩니다. (2종 이상 권장)</p>
    <div class="pick-grid">${options}</div>
    <div class="gift-cart">
      <strong>선택: ${chosen.length}종</strong>
      <span>${chosen.map(p => esc(p.name)).join(", ") || "아직 없음"}</span>
      <div class="sum-row total"><span>예상 금액</span><span>${won(total)}</span></div>
      <button class="btn primary" id="add-custom-set" ${chosen.length < 2 ? "disabled" : ""}>이 선물세트 장바구니 담기</button>
      <button class="btn ghost" id="clear-custom-set" ${chosen.length ? "" : "disabled"}>초기화</button>
    </div>`;
  const addBtn = $("#add-custom-set");
  if (addBtn) addBtn.addEventListener("click", () => {
    chosen.forEach(p => addToCart(p.id, 0, 1));
    giftDraft = [];
    persist();
    renderGiftBuilder();
    toast("선물세트를 장바구니에 담았습니다");
  });
  const clrBtn = $("#clear-custom-set");
  if (clrBtn) clrBtn.addEventListener("click", () => { giftDraft = []; persist(); renderGiftBuilder(); });
}

/* ---------------- 명인 소개 ---------------- */
function renderArtisans() {
  $("#artisan-list").innerHTML = DB.artisans.map((a, i) => `
    <article class="artisan-card">
      <div class="badge lg">${artisanBadge(i)}</div>
      <div>
        <h3>${esc(a.name)}</h3>
        <p class="muted">${esc(a.village)} · ${esc(a.specialty)} · ${a.since}년~</p>
        <p>${esc(a.story)}</p>
        <p class="quote">“${esc(a.quote)}”</p>
      </div>
    </article>`).join("");
}

/* ---------------- AI 도우미 ---------------- */
// 상품을 payload용 경량 요약으로 변환(SVG/리뷰 등 무거운 필드는 제외).
function productSummary(p) {
  return {
    id: p.id,
    name: p.name,
    artisanId: p.artisanId,
    categoryLabel: p.categoryLabel,
    origin: p.origin,
    originCountry: p.originCountry,
    spice: p.spice,
    spiceLabel: (DB.meta.spiceLabels || [])[p.spice] || "",
    uses: p.uses,
    giftEligible: p.giftEligible,
    storage: p.storage,
    story: p.story,
    coldChain: p.coldChain,
    rating: p.rating,
    minPrice: Math.min(...p.weights.map(w => w.price)),
    grams: p.weights[0]?.g || 250
  };
}
function artisanSummary(a) {
  return { id: a.id, name: a.name, village: a.village, specialty: a.specialty, quote: a.quote, story: a.story };
}

/* ---------- 무인 자동 다이제스트: 오늘의 추천 젓갈 + 요리 팁 ---------- */
// 앱 로드 시 카탈로그 상단 배너에 자동 생성. askAI("daily")로 동작하므로
// 목업(오프라인)에서도 그대로 작동하고, 실서버 연동 시 자동으로 실 AI 로 승격된다.
let dailyDone = false;
async function renderDailyPick() {
  const el = $("#daily-pick");
  if (!el || dailyDone) return;
  if (!DB.products.length) return;
  dailyDone = true;
  const out = $("#daily-pick-body");
  if (out) out.textContent = "오늘의 추천을 준비하고 있어요…";
  const payload = {
    seed: new Date().toISOString().slice(0, 10),   // 하루 단위 결정론적 추천
    products: DB.products.map(productSummary),
    artisans: DB.artisans.map(artisanSummary)
  };
  try {
    if (out) out.textContent = "";
    await askAI("daily", payload, { onToken: (chunk) => { if (out) out.textContent += chunk; } });
  } catch (err) {
    // 무인 원칙: 실패해도 배너만 조용히 숨기고 앱은 정상 동작.
    console.warn("daily pick failed:", err);
    el.hidden = true;
  }
}

let aiTab = "chat";
function renderAI() {
  // 카피 생성용 상품 셀렉트 채우기(한 번만/데이터 로드 후).
  const sel = $("#ai-copy-product");
  if (sel && !sel.options.length) {
    sel.innerHTML = DB.products.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  }
}

// 공통 실행기: 스트리밍 토큰을 <pre> 출력에 흘려보낸다.
async function runAI(task, payload, outputEl, btn) {
  if (!outputEl) return;
  outputEl.textContent = "";
  outputEl.classList.add("streaming");
  if (btn) btn.disabled = true;
  try {
    await askAI(task, payload, { onToken: (chunk) => { outputEl.textContent += chunk; } });
  } catch (err) {
    outputEl.textContent = `AI 응답 중 오류가 발생했습니다.\n${err?.message || err}`;
    console.error(err);
  } finally {
    outputEl.classList.remove("streaming");
    if (btn) btn.disabled = false;
  }
}

function aiChat() {
  const input = $("#ai-chat-input");
  const msg = (input?.value || "").trim();
  runAI("chat",
    { message: msg, products: DB.products.map(productSummary), artisans: DB.artisans.map(artisanSummary) },
    $("#ai-chat-output"), $("#ai-chat-send"));
}

function aiGiftset() {
  const budget = Number($("#ai-gift-budget")?.value) || 0;
  const recipient = ($("#ai-gift-recipient")?.value || "").trim();
  const preference = ($("#ai-gift-pref")?.value || "").trim();
  runAI("giftset",
    {
      budget, recipient, preference, boxPrice: 5000,
      products: DB.products.filter(p => p.giftEligible).map(productSummary)
    },
    $("#ai-gift-output"), $("#ai-gift-send"));
}

function aiCopy() {
  const id = $("#ai-copy-product")?.value;
  const p = byId(id);
  if (!p) { toast("상품을 선택하세요"); return; }
  const tone = $("#ai-copy-tone")?.value || "정중한";
  runAI("copy",
    { product: productSummary(p), artisan: artisanSummary(artisanById(p.artisanId) || {}), tone },
    $("#ai-copy-output"), $("#ai-copy-send"));
}

function switchAITab(tab) {
  aiTab = tab;
  document.querySelectorAll("[data-ai-tab]").forEach(b => {
    const on = b.dataset.aiTab === tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll("[data-ai-panel]").forEach(pnl => {
    pnl.classList.toggle("active", pnl.dataset.aiPanel === tab);
  });
}

/* ---------------- 찜 ---------------- */
function toggleFav(id) {
  const i = wishlist.indexOf(id);
  if (i >= 0) wishlist.splice(i, 1);
  else wishlist.push(id);
  persist();
  updateWishBadge();
  renderGrid();
  renderWishlist();
}
function updateWishBadge() {
  const b = $("#wish-count");
  b.textContent = wishlist.length;
  b.style.display = wishlist.length ? "inline-flex" : "none";
}
function renderWishlist() {
  const items = wishlist.map(byId).filter(Boolean);
  $("#wishlist-grid").innerHTML = items.length
    ? items.map(cardHTML).join("")
    : `<p class="empty">찜한 상품이 없습니다. 카탈로그에서 ♡를 눌러보세요.</p>`;
}

/* ---------------- 라우팅(뷰 전환) ---------------- */
function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
  document.querySelectorAll("[data-nav]").forEach(n => n.classList.toggle("active", n.dataset.nav === name));
  if (name === "cart") renderCart();
  if (name === "wishlist") renderWishlist();
  if (name === "ai") renderAI();
  window.scrollTo(0, 0);
}

/* ---------------- 이벤트 위임 ---------------- */
function wireEvents() {
  document.addEventListener("click", (e) => {
    const t = e.target;
    const nav = t.closest("[data-nav]");
    if (nav) { e.preventDefault(); location.hash = nav.dataset.nav; return; }

    if (t.closest("[data-fav]")) { e.stopPropagation(); toggleFav(t.closest("[data-fav]").dataset.fav); return; }
    if (t.closest("[data-detail]")) { openDetail(t.closest("[data-detail]").dataset.detail); return; }
    if (t.closest("[data-close]") || t.classList.contains("modal-backdrop") || t.id === "product-modal") { closeModal(); return; }

    const add = t.closest("[data-add]");
    if (add) {
      const wIdx = Number($("#detail-weight")?.value || 0);
      const qty = Math.max(1, Number($("#detail-qty")?.value || 1));
      addToCart(add.dataset.add, wIdx, qty);
      return;
    }
    const addSet = t.closest("[data-add-set]");
    if (addSet) {
      const g = DB.giftsets.find(x => x.id === addSet.dataset.addSet);
      if (g) { g.items.forEach(id => addToCart(id, 0, 1)); toast(`${g.name} 담김`); }
      return;
    }
    const pick = t.closest("[data-pick]");
    if (pick) {
      const id = pick.dataset.pick;
      const i = giftDraft.indexOf(id);
      if (i >= 0) giftDraft.splice(i, 1); else giftDraft.push(id);
      persist(); renderGiftBuilder();
      return;
    }
    const del = t.closest("[data-del]");
    if (del) { cart.splice(Number(del.dataset.del), 1); persist(); renderCart(); renderCartBadge(); return; }
    const qbtn = t.closest("[data-qty]");
    if (qbtn) {
      const line = cart[Number(qbtn.dataset.qty)];
      if (line) { line.qty = Math.max(1, line.qty + Number(qbtn.dataset.d)); persist(); renderCart(); renderCartBadge(); }
      return;
    }
    // AI 도우미 이벤트
    const aiTabBtn = t.closest("[data-ai-tab]");
    if (aiTabBtn) { switchAITab(aiTabBtn.dataset.aiTab); return; }
    const aiQuick = t.closest("[data-ai-quick]");
    if (aiQuick) {
      const inp = $("#ai-chat-input");
      if (inp) inp.value = aiQuick.dataset.aiQuick;
      aiChat();
      return;
    }
    if (t.id === "ai-chat-send") { aiChat(); return; }
    if (t.id === "ai-gift-send") { aiGiftset(); return; }
    if (t.id === "ai-copy-send") { aiCopy(); return; }

    if (t.id === "reset-data") {
      if (confirm("모든 로컬 데이터(장바구니·찜·선물세트)를 초기화할까요?")) {
        resetAll(); cart = []; wishlist = []; giftDraft = [];
        renderCartBadge(); updateWishBadge(); renderGrid(); renderCart(); renderWishlist(); renderGiftBuilder();
        toast("초기화되었습니다");
      }
    }
  });

  // 모달 esc + AI 챗봇 Enter 전송
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
    if (e.key === "Enter" && e.target && e.target.id === "ai-chat-input") { e.preventDefault(); aiChat(); }
  });

  // 배송 옵션 변경(위임: change)
  document.addEventListener("change", e => {
    if (e.target.name === "dest") { ship.destination = e.target.value; persist(); renderShippingCalc(); }
    if (e.target.id === "ship-zone") { ship.zone = e.target.value; persist(); renderSummary(); }
    if (e.target.id === "ship-jeju") { ship.jeju = e.target.checked; persist(); renderSummary(); }
  });

  window.addEventListener("hashchange", route);
}

function route() {
  const name = (location.hash.replace("#", "") || "catalog");
  const valid = ["catalog", "giftsets", "ai", "artisans", "wishlist", "cart"];
  showView(valid.includes(name) ? name : "catalog");
}

/* ---------------- 초기화 ---------------- */
async function init() {
  try {
    await loadData();
  } catch (err) {
    $("#product-grid").innerHTML = `<p class="empty">데이터를 불러오지 못했습니다. 로컬 서버(http)로 실행했는지 확인하세요.</p>`;
    console.error(err);
    return;
  }
  renderFilters();
  renderGrid();
  renderDailyPick();
  renderGiftsets();
  renderArtisans();
  renderCartBadge();
  updateWishBadge();
  wireEvents();
  route();
}

document.addEventListener("DOMContentLoaded", init);
