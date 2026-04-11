/**
 * Phase 4-02 Task 3 — forbidden-phrase-guard.ts 단위 테스트
 *
 * v4 ULTRA §15 블랙리스트 + validateNoForbiddenPhrases 순수 함수 검증.
 *
 * DB/네트워크/AI 의존성 0. substring 매칭만 사용.
 */

import { describe, it, expect } from 'vitest';
import {
  FORBIDDEN_FOLLOWUP_PHRASES,
  validateNoForbiddenPhrases,
} from './forbidden-phrase-guard.js';

// ─── 블랙리스트 상수 검증 ────────────────────────────────
describe('FORBIDDEN_FOLLOWUP_PHRASES constant', () => {
  it('9개 이상 엔트리를 가진다 (D-15 요구사항)', () => {
    expect(FORBIDDEN_FOLLOWUP_PHRASES.length).toBeGreaterThanOrEqual(9);
  });

  it('각 엔트리는 { phrase, reason } 구조', () => {
    for (const entry of FORBIDDEN_FOLLOWUP_PHRASES) {
      expect(entry).toHaveProperty('phrase');
      expect(entry).toHaveProperty('reason');
      expect(typeof entry.phrase).toBe('string');
      expect(typeof entry.reason).toBe('string');
      expect(entry.phrase.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it('중복 phrase가 없다', () => {
    const phrases = FORBIDDEN_FOLLOWUP_PHRASES.map((e) => e.phrase);
    expect(new Set(phrases).size).toBe(phrases.length);
  });

  it('5대 카테고리를 모두 커버한다 (철회/urgency/단절/정서조작/조건부)', () => {
    const allPhrases = FORBIDDEN_FOLLOWUP_PHRASES.map((e) => e.phrase).join('|');
    expect(allPhrases).toMatch(/철회/); // 철회/취소
    expect(allPhrases).toMatch(/마지막/); // urgency
    expect(allPhrases).toMatch(/더 이상 연락/); // 관계 단절
    expect(allPhrases).toMatch(/실망/); // 정서 조작
    expect(allPhrases).toMatch(/답장 안 주시면|답변 없으시면|회신 없으시면/); // 조건부
  });
});

// ─── validateNoForbiddenPhrases — 안전한 본문 ────────
describe('validateNoForbiddenPhrases — safe bodies', () => {
  it('빈 문자열 → safe: true', () => {
    const result = validateNoForbiddenPhrases('');
    expect(result.safe).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('일반 인사말 본문 → safe: true', () => {
    const result = validateNoForbiddenPhrases('<p>안녕하세요. 잘 지내고 계신가요?</p>');
    expect(result.safe).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('1차 팔로업 톤 (확인 여부만 물어보기) → safe: true', () => {
    const body = `
      <p>안녕하세요 대표님,</p>
      <p>혹시 확인이 안 되셨을까봐 한번 더 공유드립니다 :)</p>
      <p>추가 자료나 질문 있으시면 편하게 말씀 부탁드립니다.</p>
    `;
    expect(validateNoForbiddenPhrases(body).safe).toBe(true);
  });

  it('2차 팔로업 톤 (가치 추가) → safe: true', () => {
    const body = `
      <p>추가로 참고가 되실 만한 케이스 스터디를 함께 공유드립니다 :D</p>
      <p>관련 업종 레퍼런스입니다.</p>
    `;
    expect(validateNoForbiddenPhrases(body).safe).toBe(true);
  });

  it('마지막 터치 톤 (관계 유지 전환) → safe: true', () => {
    const body = `
      <p>바쁘신 가운데 여러 번 연락드려 죄송합니다 :)</p>
      <p>향후에 필요하실 때 편하게 연락주시면 감사하겠습니다.</p>
    `;
    expect(validateNoForbiddenPhrases(body).safe).toBe(true);
  });

  it('본문에 "제안" 단어 존재 but "철회" 없음 → safe: true', () => {
    const body = '<p>제안드린 내용 중 궁금하신 부분 있으시면 알려주세요.</p>';
    expect(validateNoForbiddenPhrases(body).safe).toBe(true);
  });
});

// ─── validateNoForbiddenPhrases — 위반 검출 ────────
describe('validateNoForbiddenPhrases — violations detected', () => {
  // 블랙리스트의 각 엔트리가 실제로 검출되는지 파라미터화 테스트
  it.each(FORBIDDEN_FOLLOWUP_PHRASES.map((e) => e.phrase))(
    '금기 phrase "%s" 포함 → safe: false, violations에 포함',
    (phrase) => {
      const body = `본문 시작 ${phrase} 본문 끝`;
      const result = validateNoForbiddenPhrases(body);
      expect(result.safe).toBe(false);
      expect(result.violations.some((v) => v.phrase === phrase)).toBe(true);
    },
  );

  it('"답장 안 주시면 제안을 철회하겠습니다" → 2+ 위반 검출', () => {
    const body = '<p>답장 안 주시면 제안을 철회하겠습니다.</p>';
    const result = validateNoForbiddenPhrases(body);
    expect(result.safe).toBe(false);
    // "답장 안 주시면" + "제안을 철회" 두 개가 동시 검출되어야 함
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
    expect(result.violations.some((v) => v.phrase === '답장 안 주시면')).toBe(true);
    expect(result.violations.some((v) => v.phrase === '제안을 철회')).toBe(true);
  });

  it('"이번이 정말 마지막 기회" → 2+ 위반 (urgency 강조 변형)', () => {
    const body = '<p>이번이 정말 마지막 기회입니다.</p>';
    const result = validateNoForbiddenPhrases(body);
    expect(result.safe).toBe(false);
    // "이번이 정말 마지막" + "마지막 기회" 동시 매칭
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });

  it('"더 이상 연락드리지 않겠습니다" 검출', () => {
    const result = validateNoForbiddenPhrases('<p>더 이상 연락드리지 않겠습니다.</p>');
    expect(result.safe).toBe(false);
    expect(result.violations.some((v) => v.phrase === '더 이상 연락드리지 않')).toBe(true);
  });

  it('"실망스럽습니다" 어미 변형도 substring 매칭으로 검출', () => {
    const result = validateNoForbiddenPhrases('<p>답장이 없어 실망스럽습니다.</p>');
    expect(result.safe).toBe(false);
    expect(result.violations.some((v) => v.phrase === '실망스럽')).toBe(true);
  });

  it('모든 위반을 수집 (첫 hit에서 중단 X)', () => {
    // 여러 카테고리 동시 위반
    const body =
      '답장 안 주시면 제안을 철회하겠습니다. 마지막 기회입니다. 더 이상 연락드리지 않겠습니다.';
    const result = validateNoForbiddenPhrases(body);
    expect(result.safe).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(4);
  });

  it('violations 원소는 { phrase, reason } shape 유지', () => {
    const result = validateNoForbiddenPhrases('제안을 철회');
    expect(result.violations[0]).toHaveProperty('phrase');
    expect(result.violations[0]).toHaveProperty('reason');
    expect(result.violations[0].reason.length).toBeGreaterThan(0);
  });

  it('HTML 마크업이 섞여 있어도 본문 속 금기 표현 검출', () => {
    const body =
      '<div><strong>제안을 철회</strong>하겠습니다. <br/> 확인 부탁드립니다.</div>';
    expect(validateNoForbiddenPhrases(body).safe).toBe(false);
  });

  it('대소문자 무시 — 영문 변형 (현재 블랙리스트 한국어 기준이라 스모크)', () => {
    // 한국어는 대소문자 개념이 없으나 toLowerCase 호출이 문제를 일으키지 않는지 스모크
    const body = '제안을 철회'; // 그대로
    expect(validateNoForbiddenPhrases(body).safe).toBe(false);
  });

  it('null/undefined 입력 방어 (?? "" fallback)', () => {
    // TypeScript는 string 타입을 강제하지만 런타임 방어 확인
    const result = validateNoForbiddenPhrases(undefined as unknown as string);
    expect(result.safe).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
