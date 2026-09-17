// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// svg.js — 인라인 SVG 아트 (바이너리 이미지 없음). 상품 모티프별 도안 반환.

const WRAP = (inner, bg) =>
  `<svg viewBox="0 0 200 200" role="img" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/>
    </linearGradient></defs>
    <rect width="200" height="200" rx="16" fill="url(#g)"/>
    <path d="M0 150 Q50 130 100 150 T200 150 V200 H0 Z" fill="rgba(255,255,255,.18)"/>
    ${inner}
  </svg>`;

const MOTIFS = {
  shrimp: ["#ff9a6b", "#e85d2f"],
  roe:    ["#ff8fa3", "#d94f6a"],
  squid:  ["#ffd7a8", "#e8a05d"],
  octopus:["#c99bff", "#8a4fd9"],
  oyster: ["#b7d4c9", "#5f9a86"],
  clam:   ["#ffe08a", "#e0b64f"],
  hairtail:["#a8c7ff", "#5d7fe8"],
  anchovy:["#bcc6cc", "#7d8a91"],
  urchin: ["#ffcf5d", "#e88a2f"],
  crab:   ["#ff8a5d", "#d9482f"],
  giftbox:["#c9a24f", "#8a6a2f"]
};

const SHAPES = {
  shrimp:  `<path d="M60 90 q20-30 55-20 q30 8 25 35 q-4 22-30 25 q-30 4-45-12" fill="#fff" opacity=".92"/><path d="M62 92 q18-24 50-16" stroke="#e85d2f" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="70" cy="96" r="4" fill="#e85d2f"/>`,
  roe:     `<ellipse cx="100" cy="105" rx="46" ry="30" fill="#fff" opacity=".92"/><circle cx="85" cy="100" r="5" fill="#d94f6a"/><circle cx="102" cy="108" r="5" fill="#d94f6a"/><circle cx="118" cy="98" r="5" fill="#d94f6a"/><circle cx="95" cy="115" r="5" fill="#d94f6a"/>`,
  squid:   `<path d="M100 60 q22 0 22 30 l-4 30 q-2 14-18 14 t-18-14 l-4-30 q0-30 22-30" fill="#fff" opacity=".92"/><path d="M90 132 l-6 24 M100 134 l0 26 M110 132 l6 24" stroke="#e8a05d" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  octopus: `<circle cx="100" cy="92" r="30" fill="#fff" opacity=".92"/><path d="M78 108 q-6 26 -18 30 M92 118 q-4 24 -12 32 M108 118 q4 24 12 32 M122 108 q6 26 18 30" stroke="#8a4fd9" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  oyster:  `<path d="M60 120 q40-60 80 0 q-40 22-80 0" fill="#fff" opacity=".92"/><path d="M60 120 q40-14 80 0" stroke="#5f9a86" stroke-width="3" fill="none"/>`,
  clam:    `<path d="M100 70 q40 10 40 45 q-40 20-80 0 q0-35 40-45" fill="#fff" opacity=".92"/><path d="M100 72 v70 M78 84 l-6 50 M122 84 l6 50" stroke="#e0b64f" stroke-width="3" fill="none"/>`,
  hairtail:`<path d="M50 100 q40-24 90-6 q10 4 10 6 t-10 6 q-50 18-90-6" fill="#fff" opacity=".92"/><path d="M150 94 l18-10 v32 l-18-10" fill="#5d7fe8"/><circle cx="70" cy="98" r="3" fill="#5d7fe8"/>`,
  anchovy: `<path d="M55 100 q35-16 78-2 q8 3 8 4 t-8 4 q-43 14-78-2" fill="#fff" opacity=".9"/><path d="M141 100 l16-8 v18 l-16-8" fill="#7d8a91"/><path d="M55 100 q35 16 78 2" fill="none" stroke="#7d8a91" stroke-width="2" opacity=".5"/>`,
  urchin:  `<circle cx="100" cy="100" r="24" fill="#fff" opacity=".92"/><g stroke="#e88a2f" stroke-width="4" stroke-linecap="round"><path d="M100 76 v-18 M100 124 v18 M76 100 h-18 M124 100 h18 M83 83 l-12-12 M117 83 l12-12 M83 117 l-12 12 M117 117 l12 12"/></g>`,
  crab:    `<ellipse cx="100" cy="104" rx="34" ry="24" fill="#fff" opacity=".92"/><path d="M74 96 q-16-8-22-22 M126 96 q16-8 22-22" stroke="#d9482f" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M72 116 l-18 10 M128 116 l18 10 M80 124 l-12 14 M120 124 l12 14" stroke="#d9482f" stroke-width="4" stroke-linecap="round"/><circle cx="90" cy="98" r="3" fill="#d9482f"/><circle cx="110" cy="98" r="3" fill="#d9482f"/>`,
  giftbox: `<rect x="62" y="90" width="76" height="60" rx="4" fill="#fff" opacity=".95"/><rect x="56" y="78" width="88" height="18" rx="3" fill="#fff" opacity=".95"/><rect x="94" y="78" width="12" height="72" fill="#8a6a2f"/><path d="M100 78 q-22-20-30-6 q-4 12 30 6 q34 6 30-6 q-8-14-30 6" fill="#c9a24f"/>`
};

/** 상품/모티프 키로 인라인 SVG 문자열 반환. */
export function art(key) {
  const bg = MOTIFS[key] || MOTIFS.shrimp;
  const shape = SHAPES[key] || SHAPES.shrimp;
  return WRAP(shape, bg);
}

/** 명인/어촌 뱃지용 원형 SVG. */
export function artisanBadge(seed = 0) {
  const hues = ["#5f9a86", "#e88a2f", "#5d7fe8", "#d94f6a", "#8a6a2f"];
  const c = hues[seed % hues.length];
  return `<svg viewBox="0 0 80 80" role="img" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="38" fill="${c}"/>
    <path d="M20 58 q20-26 40 0" fill="rgba(255,255,255,.25)"/>
    <circle cx="40" cy="32" r="14" fill="rgba(255,255,255,.9)"/>
    <path d="M22 60 q18-18 36 0 v10 h-36 z" fill="rgba(255,255,255,.9)"/>
  </svg>`;
}
