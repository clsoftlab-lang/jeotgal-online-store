// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// shipping.js — 순수(pure) 배송비 계산 모듈.
// DOM/localStorage에 의존하지 않으며 입력이 같으면 출력이 항상 같습니다.
// check.mjs 에서 단위 테스트로 검증됩니다.

/**
 * 배송 정책 상수 (DEMO 값 — 실제 물류비 아님).
 */
export const SHIPPING_CONFIG = {
  // 국내: 무게 구간(kg) → 기본 배송비(KRW)
  domestic: {
    freeThreshold: 50000,      // 이 금액(원) 이상 주문 시 국내 기본 배송비 무료
    coldChainSurcharge: 3000,  // 냉장/냉동(콜드체인) 상품 포함 시 추가
    jejuSurcharge: 3000,       // 제주/도서산간 추가
    tiers: [
      { maxKg: 1, fee: 3000 },
      { maxKg: 5, fee: 4000 },
      { maxKg: 10, fee: 6000 },
      { maxKg: Infinity, fee: 8000 }
    ]
  },
  // 해외: 권역별 기본요금 + kg당 요금
  overseas: {
    coldChainSurcharge: 15000, // 해외 콜드체인(특수포장) 추가
    zones: {
      asia:    { label: "아시아",       base: 18000, perKg: 9000 },
      america: { label: "미주",         base: 28000, perKg: 14000 },
      europe:  { label: "유럽",         base: 30000, perKg: 15000 },
      oceania: { label: "오세아니아",   base: 26000, perKg: 13000 }
    }
  }
};

/** 총 무게(g)를 kg로 올림 없이 반환 (내부용). */
function toKg(grams) {
  return Math.max(0, Number(grams) || 0) / 1000;
}

/** 국내 무게 구간 요금 조회. */
function domesticTierFee(kg) {
  const tier = SHIPPING_CONFIG.domestic.tiers.find(t => kg <= t.maxKg);
  return tier ? tier.fee : SHIPPING_CONFIG.domestic.tiers[SHIPPING_CONFIG.domestic.tiers.length - 1].fee;
}

/**
 * 배송비를 계산합니다.
 * @param {Object} opts
 * @param {number} opts.subtotal    상품 합계 금액(원)
 * @param {number} opts.totalGrams  총 상품 무게(g)
 * @param {'domestic'|'overseas'} opts.destination  배송 구분
 * @param {boolean} [opts.coldChain=false]  콜드체인 상품 포함 여부
 * @param {boolean} [opts.jeju=false]       국내 제주/도서산간 여부
 * @param {string}  [opts.zone='asia']      해외 권역 키
 * @returns {{ fee:number, free:boolean, breakdown:Object }}
 */
export function calcShipping(opts) {
  const {
    subtotal = 0,
    totalGrams = 0,
    destination = "domestic",
    coldChain = false,
    jeju = false,
    zone = "asia"
  } = opts || {};

  const kg = toKg(totalGrams);
  const breakdown = {};

  if (destination === "overseas") {
    const z = SHIPPING_CONFIG.overseas.zones[zone] || SHIPPING_CONFIG.overseas.zones.asia;
    const base = z.base;
    const weightFee = Math.ceil(kg) * z.perKg; // 해외는 kg 단위 올림
    breakdown.base = base;
    breakdown.weight = weightFee;
    let fee = base + weightFee;
    if (coldChain) {
      breakdown.coldChain = SHIPPING_CONFIG.overseas.coldChainSurcharge;
      fee += SHIPPING_CONFIG.overseas.coldChainSurcharge;
    }
    return { fee, free: false, breakdown };
  }

  // 국내
  const cfg = SHIPPING_CONFIG.domestic;
  const baseFee = domesticTierFee(kg);
  breakdown.base = baseFee;

  let fee = baseFee;
  const freeBase = subtotal >= cfg.freeThreshold;
  if (freeBase) {
    // 무료배송은 기본 구간요금만 면제. 콜드체인/제주 할증은 유지.
    breakdown.base = 0;
    fee = 0;
  }
  if (coldChain) {
    breakdown.coldChain = cfg.coldChainSurcharge;
    fee += cfg.coldChainSurcharge;
  }
  if (jeju) {
    breakdown.jeju = cfg.jejuSurcharge;
    fee += cfg.jejuSurcharge;
  }
  return { fee, free: freeBase, breakdown };
}

/** 장바구니 라인들로부터 총 무게(g)와 콜드체인 포함 여부를 집계. */
export function summarizeWeight(lines) {
  let totalGrams = 0;
  let coldChain = false;
  for (const ln of (lines || [])) {
    totalGrams += (Number(ln.grams) || 0) * (Number(ln.qty) || 0);
    if (ln.coldChain) coldChain = true;
  }
  return { totalGrams, coldChain };
}
