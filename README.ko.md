# 갯마을 젓갈 — 프리미엄 젓갈 온라인 스토어 (DEMO)

온라인 판로가 없던 어촌 명인의 **젓갈**을 프리미엄 포장으로 국내외에 판매하는 이커머스
데모입니다. **빌드가 필요 없는 정적 사이트**(순수 HTML + CSS + ES 모듈 JS)로, 브라우저에서
바로 실행되고 별도 도구 없이 GitHub Pages에 배포됩니다.

**라이브 데모: https://clsoftlab-lang.github.io/jeotgal-online-store/**

English documentation: see [README.md](./README.md).

---

## 무엇인가요

작은 갯마을 생산자에게 판로를 열어 주는 명인 중심 스토어입니다. 26종 카탈로그를 종류·산지·
맵기·용도로 탐색하고, 각 상품의 산지 스토리·원산지/보관법·리뷰를 확인하며, 나만의 선물세트를
구성하고, 장바구니에 담아 **국내/해외 배송비 계산기**로 배송비를 확인한 뒤 모의 결제까지
진행할 수 있습니다.

## 기능

- **카탈로그** — 가상 상품 26종, 필터(종류 / 산지 / 맵기 / 용도), 검색, 정렬(추천·가격·평점·이름).
- **제품 상세** — 명인 산지 스토리, 원산지 + 보관법, 중량 옵션별 가격, 별점·리뷰.
- **선물세트** — 큐레이션 프리셋 4종 + **나만의 선물세트 빌더**: 선물 가능 젓갈을 골라
  실시간 금액(상품 + 포장비)을 확인하고 세트를 장바구니에 담습니다.
- **장바구니 + 모의 결제** — 수량 조절, 라인 삭제, 주문 요약, 주문번호가 생성되는 모의 결제.
- **배송비 계산기**(`shipping.js`, 순수 모듈) — 국내 무게 구간(≤1/≤5/≤10/>10 kg), 무료배송
  기준 금액, 콜드체인·제주/도서산간 할증 / 해외 권역별(아시아·미주·유럽·오세아니아) 기본요금 +
  kg당 요금.
- **명인 소개** — 가상의 어촌 명인 5인 프로필.
- **찜** — 관심 상품 저장(로컬 보관).
- **반응형** 모바일 우선, `prefers-color-scheme` 기반 **라이트 + 다크**, 인라인 SVG 아트만 사용
  (바이너리 이미지 없음), 상태는 `localStorage`(try/catch + 초기화 버튼).

### 선물세트 빌더 동작 방식

프리셋은 `data/giftsets.json`에 상품 id 목록과 포장비로 정의됩니다. 커스텀 빌더는 `giftEligible`
상품을 토글하면 각 상품의 최저가 합에 고정 포장비를 더해 총액을 실시간 갱신합니다. 세트를 담으면
개별 장바구니 라인으로 펼쳐져 배송 무게가 정확히 계산됩니다.

### 배송비 계산기 동작 방식

`shipping.js`는 DOM·저장소에 의존하지 않는 **순수** 함수 모듈입니다. `calcShipping({subtotal,
totalGrams, destination, coldChain, jeju, zone})`는 `{ fee, free, breakdown }`을 반환합니다.
국내 요금은 무게 구간에서 산출되며, 무료배송 기준 금액 이상이면 기본요금은 면제되지만 콜드체인·
제주 할증은 유지됩니다. 해외 요금은 `zone.base + ceil(kg) * zone.perKg`(+ 콜드체인 할증)이며
무료가 없습니다. `summarizeWeight(lines)`는 장바구니 무게와 콜드체인 포함 여부를 집계합니다.
이 모든 로직은 `check.mjs`에서 단위 테스트됩니다.

## 🤖 AI 기능 (API 연동)

**안전하고 교체 가능한 AI 레이어**("AI-KIT")를 기본 탑재했으며, 새 **AI 도우미** 탭에서 세 기능을
사용할 수 있습니다:

1. **AI 젓갈 추천·요리 도우미 챗봇** — 상품 추천 + 먹는 법/요리법 안내.
2. **선물세트 구성 추천** — 예산·받는 분·취향으로 세트 구성 제안.
3. **상품/산지 스토리 카피 생성** — 상품 + 명인 데이터로 카피 작성.

**데모 = 목업(mock), 서버·키 불필요.** 기본값으로 `ai/config.js`의 `AI_ENDPOINT = ""`이며,
`ai/ai.js`의 `askAI(task, payload, {onToken})`가 **결정론적 한국어 MockProvider**로 응답합니다.
이 목업은 앱의 실제 상품/명인 데이터와 `shipping.js` 배송 엔진을 그대로 재사용하므로, 서버·키·
네트워크 없이 브라우저에서 (스트리밍 연출과 함께) 완전히 동작합니다.

**실제 Claude 연동**은 선택 사항인 [`server/`](./server/README.md) 프록시로 켭니다:

1. `cd server && npm install`
2. `cp .env.example .env` 후 `ANTHROPIC_API_KEY` 설정 (기본 모델 `claude-haiku-4-5`, prompt caching, 스트리밍)
3. `npm start` (기본 `http://localhost:8787/api/ai`)
4. `ai/config.js`의 `AI_ENDPOINT`를 그 주소로 설정

이후 `askAI`는 `{task, payload}`를 `AI_ENDPOINT`로 POST 하고 응답을 스트리밍으로 받습니다.

> **🔐 키는 서버 측에만.** `ANTHROPIC_API_KEY`는 오직 **서버 측 환경변수**로만 존재합니다.
> API 키를 브라우저, `ai/config.js`, 저장소(git)에 **절대** 넣지 마세요. `.env`는 git에서 제외되며,
> `check.mjs`는 저장소에서 실제 키 형식이 발견되면 빌드를 실패시킵니다.

## ⚙️ 고도화 — 무인·저비용 실 AI 연동

AI 레이어를 **무인 · 저비용 · 실 AI** 원칙으로 고도화했습니다:

- **비용 우선 기본 모델** — `claude-haiku-4-5` (**$1 / $5 per MTok**). `AI_MODEL`로 교체 가능하며,
  품질을 높이려면 `claude-sonnet-5` / `claude-opus-5`로 상향합니다.
- **Prompt caching** — 안정적인 task 별 시스템 프롬프트를 `cache_control:{type:"ephemeral"}` 블록으로
  보내 반복 호출 시 캐시 히트로 비용을 낮춥니다.
- **출력 상한 + 가드레일** — task 별 `max_tokens`(기본 약 700), IP당 **레이트리밋**(`AI_RATE_PER_MIN`,
  기본 20/분), **월간 토큰 예산**(`AI_MONTHLY_TOKEN_CAP`, 기본 2,000,000). 초과 시 프록시가
  HTTP 429 `{fallback:true}`를 반환합니다.
- **대략적 비용** — Haiku 4.5 + 캐싱 기준, 그라운딩 요청 1건은 대략 입력 ~1.5k / 출력 ~0.5k 토큰 수준이라
  **1,000요청당 대략 ~$4–5**(예시값, 캐시 히트 시 더 낮아짐)입니다.
- **무인 무료 호스팅** — **Cloudflare Workers** 변형(`server/worker.js` + `server/wrangler.toml`)이
  Anthropic REST API를 직접 호출합니다. `wrangler deploy` 한 번으로 배포하고 키는
  `wrangler secret put ANTHROPIC_API_KEY`로 넣으면 됩니다(상시 서버 불필요). [`server/README.md`](./server/README.md) 참고.
- **절대 끊기지 않음(무인)** — 엔드포인트 실패 / 429 `{fallback:true}` / 네트워크 오류 시
  `ai/ai.js`가 **자동으로 오프라인 목업으로 폴백**하므로 앱은 무중단으로 동작합니다.
- **자동 기능** — 카탈로그 로드 시 실제 상품/명인 데이터로 `askAI("daily", …)`를 호출해
  **"오늘의 추천 젓갈 + 요리 팁"** 다이제스트를 자동 생성합니다. 목업(오프라인)에서도 동작하고,
  `AI_ENDPOINT` 설정 시 자동으로 실 Claude로 승격됩니다.

> **🔐 API keys are server-side only — never in the browser or repo.**

## 로컬 실행

빌드가 필요 없습니다. ES 모듈과 `fetch`는 `file://`이 아니라 `http://`가 필요하므로 HTTP로
서빙하세요:

```bash
python -m http.server 9008
# 이후 http://localhost:9008/ 접속
```

검증 실행(JSON 파싱, 모든 JS의 `node --check`, index.html 컨테이너, 배송 단위 테스트):

```bash
node check.mjs
```

## 파일 구성

```
index.html          UI 골격 + 모든 뷰 컨테이너 (AI 도우미 탭 포함)
styles.css          반응형 라이트/다크 스타일
app.js              앱 로직·렌더링·라우팅 (ES 모듈)
shipping.js         순수 배송비 계산기 + 무게 집계
storage.js          안전한 localStorage 래퍼 (try/catch + 초기화)
svg.js              인라인 SVG 상품/명인 아트
ai/config.js        AI_ENDPOINT 스위치 ("" = 데모/목업)
ai/ai.js            askAI() 어댑터: 결정론적 한국어 목업 또는 AI_ENDPOINT 스트리밍
server/index.mjs    선택 사항 Claude 프록시(@anthropic-ai/sdk); 비용우선 Haiku 기본·캐싱·상한
server/worker.js    Cloudflare Workers 변형(무료·무인) — REST + wrangler.toml
server/package.json + .env.example + README.md
data/products.json  가상 상품 26종
data/artisans.json  가상 명인 5인
data/giftsets.json  선물세트 프리셋 4종
check.mjs           CI 검증 + 배송 단위 테스트 + AI 레이어 검사
.github/workflows/ci.yml   node check.mjs 실행
```

## DEMO 모드 경계

**이 프로젝트는 데모입니다. 실제라고 가정하기 전에 아래 경계를 반드시 확인하세요:**

- **모든 상품·명인·가격·리뷰·마을은 가상입니다** — 실제 브랜드·인물·상표를 나타내지 않습니다.
- **결제는 모의(시뮬레이션)입니다.** 실제 거래·카드·금전 이동이 없으며, "결제"는 가짜 주문번호만
  생성합니다.
- **배송비는 예시용 데모 값**이며, 실제 택배 요율이나 콜드체인 물류비가 아닙니다.
- **상태는 데이터베이스가 아니라 브라우저 `localStorage`에 저장됩니다.** 사이트 데이터를 지우거나
  다른 기기/브라우저를 쓰면 초기화됩니다. 푸터에 초기화 버튼이 있습니다.
- **계정·로그인이 없고, 개인정보(PII)를 수집·저장하지 않습니다.**
- **AI 응답은 기본적으로 결정론적 로컬 목업**입니다(서버·API 키·네트워크 없음). 실제 Claude는
  `server/` + 서버 측 `ANTHROPIC_API_KEY`로 선택 연동하며, 키는 브라우저·저장소에 절대 노출되지 않습니다.
- 실제 프로덕션 빌드에는 백엔드 + 실제 데이터베이스, 검증된 카탈로그·재고, 실제 결제 게이트웨이,
  인증 계정, 실제 콜드체인 배송 연동이 추가됩니다.

## 아이디어 출처 / Idea origin

이 아이디어의 씨앗은 용인대학교에서 이일국 박사가 가르친 창업 수업에서 나왔습니다. 학생들의
창업 아이디어는 매우 창의적이었으며, 그중에서도 특히 돋보였던 아이디어 하나를 실제로 동작하는
서비스로 구현한 것입니다. 그 학생들에게 존경과 감사를 전합니다. 학생 개인정보는 포함되어
있지 않습니다.

## 기여자

- 이일국 (Dr. Lee Il-guk)
- LWJ
- LMJ
- Claude

## 라이선스

- 코드: **Apache-2.0** — [LICENSE](./LICENSE) 참고.
- 문서: **CC BY 4.0**.
- SPDX 헤더: `Apache-2.0` · Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국).

---

*Not an official Anthropic product.*
