// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// storage.js — localStorage 안전 래퍼. 모든 접근을 try/catch 로 감싸고,
// 손상/차단 시 메모리 폴백과 reset 기능을 제공합니다.

const PREFIX = "jeotgal:";
const memoryFallback = new Map();

/** 값 읽기. 실패 시 fallback 반환. */
export function load(key, fallback) {
  const k = PREFIX + key;
  try {
    const raw = localStorage.getItem(k);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (_e) {
    if (memoryFallback.has(k)) {
      try { return JSON.parse(memoryFallback.get(k)); } catch { return fallback; }
    }
    return fallback;
  }
}

/** 값 저장. 실패해도 예외를 던지지 않고 메모리 폴백에 보관. */
export function save(key, value) {
  const k = PREFIX + key;
  let json;
  try { json = JSON.stringify(value); } catch { return false; }
  try {
    localStorage.setItem(k, json);
    return true;
  } catch (_e) {
    memoryFallback.set(k, json);
    return false;
  }
}

/** 이 앱이 쓴 모든 키 삭제 (상태 초기화). */
export function resetAll() {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) toRemove.push(key);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch (_e) { /* ignore */ }
  memoryFallback.clear();
}
