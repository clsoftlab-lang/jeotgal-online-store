<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->

# 젓갈 스토어 AI 프록시 서버 (선택 사항 · 무인·저비용)

이 서버는 프런트엔드가 Claude를 **안전하게·저비용으로** 사용할 수 있도록 하는 얇은 프록시입니다.
프런트엔드(`ai/ai.js`)는 `{ task, payload }`를 `POST /api/ai`로 보내고, **이 서버만**
Claude를 호출합니다. `ANTHROPIC_API_KEY`는 오직 **서버 측 환경변수**로만 존재합니다.

> **🔐 보안 원칙: API 키는 서버 측에만.**
> 키를 브라우저 코드, `ai/config.js`, 저장소(git), 로그에 **절대** 넣지 마세요.
> `.env`는 `.gitignore`로 제외됩니다. Workers 에서는 `wrangler secret` 으로만 보관합니다.

데모 기본값은 서버가 **필요 없습니다** — `ai/config.js`의 `AI_ENDPOINT`가 비어 있으면
브라우저 안의 결정론적 한국어 MockProvider가 응답합니다. 실제 Claude를 붙일 때만 이 서버를 씁니다.
또한 엔드포인트가 오류/429를 내면 프런트가 **자동으로 목업으로 폴백**하므로 앱은 무중단(무인)입니다.

## 두 가지 배포 방법

| 방법 | 파일 | 특징 |
|---|---|---|
| **A. Node 프록시** | `index.mjs` | 로컬/자체 서버. `@anthropic-ai/sdk` 스트리밍 |
| **B. Cloudflare Workers** | `worker.js` + `wrangler.toml` | **무료 티어·무인**(상시 서버 불필요), REST 직접 호출 |

---

## A) Node 프록시 실행

```bash
cd server
npm install                 # @anthropic-ai/sdk 설치 (CI에서는 실행하지 않음)
cp .env.example .env        # 그리고 ANTHROPIC_API_KEY 를 채웁니다
npm start                   # http://localhost:8787 에서 대기
```

그런 다음 `ai/config.js`에서 엔드포인트를 설정합니다:

```js
export const AI_ENDPOINT = "http://localhost:8787/api/ai";
```

이제 프런트엔드의 AI 기능이 실제 Claude(기본 모델 `claude-haiku-4-5`, prompt caching, 스트리밍)로 동작합니다.

## B) Cloudflare Workers 배포 (무료·무인, 원-디플로이)

상시 운영할 서버가 없어도 되는 무인 방식입니다. 무료 티어로 배포하고 방치할 수 있습니다.

```bash
cd server
npm i -g wrangler                      # 또는 npx wrangler ...
wrangler secret put ANTHROPIC_API_KEY  # 키는 시크릿으로만! (코드/저장소 금지)
wrangler deploy                        # https://jeotgal-ai.<계정>.workers.dev 로 배포
```

그리고 `ai/config.js`의 `AI_ENDPOINT`를 배포된 주소로 설정합니다:

```js
export const AI_ENDPOINT = "https://jeotgal-ai.<계정>.workers.dev/api/ai";
```

모델·effort·레이트리밋은 `wrangler.toml`의 `[vars]`(비밀 아님)로 조정합니다. 키만 시크릿으로 둡니다.

## API

`POST /api/ai`

```json
{ "task": "chat" | "giftset" | "copy" | "daily", "payload": { ... } }
```

- `chat` — 젓갈 추천 + 먹는 법/요리법
- `giftset` — 선물세트 구성 추천
- `copy` — 상품/산지 스토리 카피 생성
- `daily` — 오늘의 추천 젓갈 + 요리 팁(앱 로드 시 자동 호출되는 무인 다이제스트)

응답은 `text/plain` **스트리밍**(Node) 또는 텍스트(Workers)이며, `ai/ai.js`가 토큰 단위로 읽습니다.
서버 오류/429 `{fallback:true}` 시 프런트는 **자동으로 목업으로 폴백**합니다.

`GET /health` — 상태 확인. 키 값 자체는 반환하지 않습니다.

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | — | Anthropic API 키. **서버 측에만** 보관 |
| `PORT` | | `8787` | (Node) 프록시 포트 |
| `ALLOW_ORIGIN` | | `*` | CORS 허용 오리진 (운영 시 좁히세요) |
| `AI_MODEL` | | `claude-haiku-4-5` | 모델 ID. `claude-sonnet-5`/`claude-opus-5` 로 상향 가능 |
| `AI_EFFORT` | | `low` | 사고 강도(effort). **Haiku 에는 적용 안 함** |
| `AI_RATE_PER_MIN` | | `20` | IP당 분당 요청 상한(초과 → 429 `{fallback:true}`) |
| `AI_MONTHLY_TOKEN_CAP` | | `2000000` | 월간 토큰 예산(초과 → 429 `{fallback:true}`) |

## 비용 최적화 구현 메모

- **비용 우선 기본 모델**: `claude-haiku-4-5` ($1 / $5 per MTok). 필요 시 `AI_MODEL`로 상향.
- **Prompt caching**: 안정적인 task 별 시스템 프롬프트를 `cache_control:{type:"ephemeral"}` 블록으로
  보내 반복 호출 시 캐시 히트로 비용을 낮춥니다.
- **thinking/effort(400 방지)**: `claude-haiku-*` 모델에는 `thinking`/`output_config.effort`를
  **보내지 않습니다**(Haiku 4.5 미지원). 그 외 모델에만 `thinking:{type:"adaptive"}` +
  `output_config:{effort}`를 적용합니다.
- **출력 상한**: task 별 `max_tokens`(기본 700, `daily`는 350 등)로 토큰을 절약합니다.
- **가드레일**: per-IP 레이트리밋 + 월간 토큰 예산. 초과 시 429 `{fallback:true}` → 프런트 자동 폴백.
- `task`별 시스템 프롬프트로 payload(실제 상품/명인 데이터)에 **그라운딩**하여 환각을 억제합니다.
