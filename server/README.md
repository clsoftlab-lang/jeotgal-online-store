<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->

# 젓갈 스토어 AI 프록시 서버 (선택 사항)

이 서버는 프런트엔드가 Claude를 **안전하게** 사용할 수 있도록 하는 얇은 프록시입니다.
프런트엔드(`ai/ai.js`)는 `{ task, payload }`를 `POST /api/ai`로 보내고, **이 서버만**
`@anthropic-ai/sdk`로 Claude를 호출합니다.

> **🔐 보안 원칙: API 키는 서버 측에만.**
> `ANTHROPIC_API_KEY`는 오직 이 서버의 **환경변수**로만 존재합니다.
> 키를 브라우저 코드, `ai/config.js`, 저장소(git), 로그에 **절대** 넣지 마세요.
> `.env`는 `.gitignore`로 제외됩니다.

데모 기본값은 서버가 **필요 없습니다** — `ai/config.js`의 `AI_ENDPOINT`가 비어 있으면
브라우저 안의 결정론적 한국어 MockProvider가 응답합니다. 실제 Claude를 붙일 때만 이 서버를 씁니다.

## 실행

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

이제 프런트엔드의 AI 기능이 실제 Claude(모델 `claude-opus-5`, 적응형 사고, 스트리밍)로 동작합니다.

## API

`POST /api/ai`

```json
{ "task": "chat" | "giftset" | "copy", "payload": { ... } }
```

- `chat` — 젓갈 추천 + 먹는 법/요리법
- `giftset` — 선물세트 구성 추천
- `copy` — 상품/산지 스토리 카피 생성

응답은 `text/plain` **스트리밍**(청크)이며, `ai/ai.js`가 토큰 단위로 읽어 `onToken`으로 흘려보냅니다.

`GET /health` — 상태 확인(`{ ok, model, hasKey }`). 키 값 자체는 반환하지 않습니다.

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | — | Anthropic API 키. **서버 측에만** 보관 |
| `PORT` | | `8787` | 프록시 포트 |
| `ALLOW_ORIGIN` | | `*` | CORS 허용 오리진 (운영 시 좁히세요) |
| `AI_MODEL` | | `claude-opus-5` | 사용할 모델 ID |

## 구현 메모

- 모델: `claude-opus-5`, `thinking: { type: "adaptive" }`, `max_tokens: 2048`, 스트리밍.
- `task`별 시스템 프롬프트로 payload(실제 상품/명인 데이터)에 **그라운딩**하여 환각을 억제합니다.
- 요청 본문 크기를 제한하고, 오류는 스트림 본문으로 안전하게 전달합니다.
