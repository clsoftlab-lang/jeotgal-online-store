// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// check.mjs — CI 검증: JSON 파싱 + `node --check` + index.html 컨테이너 + 배송 계산기 단위 테스트.
// 실행:  node check.mjs

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { calcShipping, summarizeWeight, SHIPPING_CONFIG } from "./shipping.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log(`  ok  ${name}`); };
const no = (name, detail) => { fail++; console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`); };
function eq(name, got, want) {
  if (got === want) ok(name);
  else no(name, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
function assert(name, cond, detail) { cond ? ok(name) : no(name, detail); }

/* ---------- 1) JSON 파싱 ---------- */
console.log("\n[1] data/*.json 파싱");
const dataDir = join(ROOT, "data");
const jsonFiles = readdirSync(dataDir).filter(f => f.endsWith(".json"));
const parsed = {};
for (const f of jsonFiles) {
  try {
    parsed[f] = JSON.parse(readFileSync(join(dataDir, f), "utf8"));
    ok(`parse ${f}`);
  } catch (e) { no(`parse ${f}`, e.message); }
}

/* ---------- 2) 상품 데이터 무결성 ---------- */
console.log("\n[2] 상품 데이터 무결성");
const products = parsed["products.json"]?.products || [];
assert("상품 24종 이상", products.length >= 24, `현재 ${products.length}종`);
const ids = new Set();
let fieldsOk = true, weightsOk = true;
for (const p of products) {
  if (ids.has(p.id)) { fieldsOk = false; break; }
  ids.add(p.id);
  if (!p.name || !p.category || !p.origin || p.spice === undefined || !Array.isArray(p.uses)) fieldsOk = false;
  if (!Array.isArray(p.weights) || p.weights.length === 0 || p.weights.some(w => !(w.g > 0) || !(w.price > 0))) weightsOk = false;
}
assert("모든 상품 필수 필드/고유 id", fieldsOk);
assert("모든 상품 중량 옵션 유효", weightsOk);
const artisans = parsed["artisans.json"]?.artisans || [];
const artisanIds = new Set(artisans.map(a => a.id));
assert("모든 상품 명인 참조 유효", products.every(p => artisanIds.has(p.artisanId)));
const giftsets = parsed["giftsets.json"]?.presets || [];
assert("선물세트 프리셋 존재", giftsets.length >= 3);
assert("선물세트 상품 참조 유효", giftsets.every(g => g.items.every(id => ids.has(id))));

/* ---------- 3) node --check (모든 JS) ---------- */
console.log("\n[3] node --check (구문 검사)");
const jsFiles = readdirSync(ROOT).filter(f => (f.endsWith(".js") || f.endsWith(".mjs")));
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ["--check", join(ROOT, f)], { stdio: "pipe" });
    ok(`node --check ${f}`);
  } catch (e) { no(`node --check ${f}`, (e.stderr || e.message).toString().slice(0, 200)); }
}

/* ---------- 4) index.html 컨테이너 ---------- */
console.log("\n[4] index.html 컨테이너");
const html = readFileSync(join(ROOT, "index.html"), "utf8");
const requiredIds = [
  "filters", "product-grid", "result-count", "product-modal",
  "cart-count", "wish-count", "cart-lines", "shipping-calc",
  "cart-summary", "giftset-presets", "giftset-builder", "artisan-list",
  "wishlist-grid", "toast"
];
for (const id of requiredIds) {
  assert(`#${id} 존재`, html.includes(`id="${id}"`));
}
assert("app.js 모듈 로드", html.includes('type="module"') && html.includes("app.js"));
assert("lang=ko", html.includes('lang="ko"'));

/* ---------- 5) 배송 계산기 단위 테스트 ---------- */
console.log("\n[5] 배송비 계산기 단위 테스트");

// 국내: 0.5kg, 소액 → 1kg 이하 구간 3000, 무료 아님
eq("국내 0.5kg 소액 = 3000",
  calcShipping({ subtotal: 20000, totalGrams: 500, destination: "domestic" }).fee, 3000);

// 국내: 3kg → <=5kg 구간 4000
eq("국내 3kg = 4000",
  calcShipping({ subtotal: 20000, totalGrams: 3000, destination: "domestic" }).fee, 4000);

// 국내: 8kg → <=10kg 구간 6000
eq("국내 8kg = 6000",
  calcShipping({ subtotal: 20000, totalGrams: 8000, destination: "domestic" }).fee, 6000);

// 국내: 12kg → >10kg 구간 8000
eq("국내 12kg = 8000",
  calcShipping({ subtotal: 20000, totalGrams: 12000, destination: "domestic" }).fee, 8000);

// 국내 무료: 5만원 이상 → 기본배송 무료
const freeCase = calcShipping({ subtotal: 60000, totalGrams: 3000, destination: "domestic" });
eq("국내 5만원↑ 무료 fee=0", freeCase.fee, 0);
eq("국내 5만원↑ free=true", freeCase.free, true);

// 국내 무료지만 콜드체인 할증은 유지
eq("국내 무료+콜드체인 = 3000",
  calcShipping({ subtotal: 60000, totalGrams: 3000, destination: "domestic", coldChain: true }).fee,
  SHIPPING_CONFIG.domestic.coldChainSurcharge);

// 국내 무료 + 제주 할증
eq("국내 무료+제주 = 3000",
  calcShipping({ subtotal: 60000, totalGrams: 3000, destination: "domestic", jeju: true }).fee,
  SHIPPING_CONFIG.domestic.jejuSurcharge);

// 국내 콜드체인 + 제주 동시 (소액 1kg): 3000 + 3000 + 3000 = 9000
eq("국내 소액 1kg 콜드+제주 = 9000",
  calcShipping({ subtotal: 10000, totalGrams: 1000, destination: "domestic", coldChain: true, jeju: true }).fee, 9000);

// 해외 아시아 0.5kg → base 18000 + ceil(0.5)=1 * 9000 = 27000
eq("해외 아시아 0.5kg = 27000",
  calcShipping({ subtotal: 30000, totalGrams: 500, destination: "overseas", zone: "asia" }).fee, 27000);

// 해외 미주 2.2kg → base 28000 + ceil(2.2)=3 * 14000 = 70000
eq("해외 미주 2.2kg = 70000",
  calcShipping({ subtotal: 30000, totalGrams: 2200, destination: "overseas", zone: "america" }).fee, 70000);

// 해외 콜드체인 할증 반영
eq("해외 유럽 1kg 콜드체인 = 30000+15000+15000=60000",
  calcShipping({ subtotal: 30000, totalGrams: 1000, destination: "overseas", zone: "europe", coldChain: true }).fee,
  SHIPPING_CONFIG.overseas.zones.europe.base + SHIPPING_CONFIG.overseas.zones.europe.perKg + SHIPPING_CONFIG.overseas.coldChainSurcharge);

// 해외는 5만원 이상이어도 무료 아님
eq("해외 고액도 free=false",
  calcShipping({ subtotal: 200000, totalGrams: 1000, destination: "overseas", zone: "asia" }).free, false);

// summarizeWeight: 무게/콜드체인 집계
const sw = summarizeWeight([
  { grams: 250, qty: 2, coldChain: true },
  { grams: 500, qty: 1, coldChain: false }
]);
eq("summarizeWeight totalGrams = 1000", sw.totalGrams, 1000);
eq("summarizeWeight coldChain = true", sw.coldChain, true);

// 순수성: 같은 입력 → 같은 출력
const inp = { subtotal: 20000, totalGrams: 3000, destination: "domestic" };
eq("계산 순수성(재현성)", calcShipping(inp).fee, calcShipping(inp).fee);

// breakdown 합이 fee와 일치 (국내 콜드+제주)
const bdCase = calcShipping({ subtotal: 10000, totalGrams: 3000, destination: "domestic", coldChain: true, jeju: true });
eq("breakdown 합 == fee",
  Object.values(bdCase.breakdown).reduce((a, b) => a + b, 0), bdCase.fee);

/* ---------- 6) AI 레이어 (ai/ + server/) ---------- */
console.log("\n[6] AI 레이어");

// 6a) node --check 로 ai/ 와 server/ 의 모든 JS/MJS 구문 검사
for (const dir of ["ai", "server"]) {
  const abs = join(ROOT, dir);
  assert(`${dir}/ 디렉터리 존재`, existsSync(abs));
  if (!existsSync(abs)) continue;
  const files = readdirSync(abs).filter(f => f.endsWith(".js") || f.endsWith(".mjs"));
  assert(`${dir}/ 에 JS 파일 존재`, files.length > 0);
  for (const f of files) {
    try {
      execFileSync(process.execPath, ["--check", join(abs, f)], { stdio: "pipe" });
      ok(`node --check ${dir}/${f}`);
    } catch (e) { no(`node --check ${dir}/${f}`, (e.stderr || e.message).toString().slice(0, 200)); }
  }
}

// 6b) AI_ENDPOINT 는 데모(빈 문자열)이어야 한다 — 키/서버가 저장소에 하드코딩되지 않도록.
try {
  const { AI_ENDPOINT } = await import("./ai/config.js");
  eq("ai/config.js AI_ENDPOINT 빈 문자열(데모)", AI_ENDPOINT, "");
} catch (e) {
  no("ai/config.js import", e.message);
}

// 6c) 실제 API 키 형식이 저장소 어디에도 없어야 한다.
//     (패턴을 조각으로 조립해 이 검사 파일 자체가 오탐되지 않도록 함.)
const KEY_RE = new RegExp("sk-" + "ant-[A-Za-z0-9_-]{20,}");
const SKIP_DIRS = new Set(["node_modules", ".git", ".cache", "tmp", "dist"]);
const TEXT_EXT = new Set([".js", ".mjs", ".json", ".html", ".css", ".md", ".txt", ".yml", ".yaml", ".example", ""]);
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc);
    else if (TEXT_EXT.has(extname(entry).toLowerCase())) acc.push(p);
  }
  return acc;
}
let leaked = null;
for (const file of walk(ROOT)) {
  let content; try { content = readFileSync(file, "utf8"); } catch { continue; }
  if (KEY_RE.test(content)) { leaked = file; break; }
}
assert("저장소에 실제 API 키 형식 없음", leaked === null, leaked ? `발견: ${leaked}` : "");

/* ---------- 결과 ---------- */
console.log(`\n===== 결과: ${pass} 통과, ${fail} 실패 =====`);
process.exit(fail ? 1 : 0);
