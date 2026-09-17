// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// ai/config.js — AI 레이어 설정.
//
// AI_ENDPOINT 이 빈 문자열("")이면 데모(MockProvider) 모드로 동작합니다.
//   - 서버·API 키·네트워크 없이 브라우저 안에서 결정론적 한국어 응답을 생성합니다.
// 실제 Claude 를 쓰려면:
//   1) server/ 를 실행하고 (ANTHROPIC_API_KEY 는 반드시 서버 측 환경변수로만 보관),
//   2) 아래 AI_ENDPOINT 를 그 프록시 주소(예: "http://localhost:8787/api/ai")로 설정하세요.
//
// ⚠️ 보안: API 키를 이 파일이나 브라우저 코드/저장소에 절대 넣지 마세요.
//    키는 오직 server/ 의 환경변수(ANTHROPIC_API_KEY)로만 존재해야 합니다.
export const AI_ENDPOINT = "";
