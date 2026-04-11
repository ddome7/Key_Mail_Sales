/**
 * Phase 4-02 Task 2 — inbound-detector.ts 단위 테스트
 *
 * 자사 도메인 판정 (SENT label 대체) 순수 함수 검증:
 * - isOwnMessage: @puzl.co.kr 도메인 판정
 * - hasInboundSince: 특정 시점 이후 inbound 메시지 존재 여부
 *
 * 04-01 픽스처가 병렬 실행 중이라 아직 없을 수 있으므로, 이 테스트 파일은
 * 자체 인라인 fixture를 사용한다 (외부 의존 0).
 */

import { describe, it, expect } from 'vitest';
import type { ThreadMessage } from './thread-loader.js';
import {
  OWN_EMAIL_DOMAINS,
  isOwnMessage,
  hasInboundSince,
} from './inbound-detector.js';

// ─── 인라인 fixture ────────────────────────────────────────

/** 기본 ThreadMessage 팩토리 — 필요한 필드만 override */
function msg(overrides: Partial<ThreadMessage>): ThreadMessage {
  return {
    messageId: 'id-' + Math.random().toString(36).slice(2, 8),
    from: '',
    to: '',
    subject: '',
    body: '',
    internalDate: '0',
    ...overrides,
  };
}

/** ms epoch 문자열 생성 헬퍼 */
function ms(iso: string): string {
  return String(new Date(iso).getTime());
}

const OUTBOUND_TS = ms('2026-04-01T10:00:00+09:00');
const INBOUND_AFTER_TS = ms('2026-04-03T09:30:00+09:00');
const INBOUND_BEFORE_TS = ms('2026-03-28T15:00:00+09:00');

// "inbound 있는" 스레드: 자사 발송 → 외부 답장 → 자사 재발송
const THREAD_WITH_INBOUND: ThreadMessage[] = [
  msg({
    messageId: 'out-1',
    from: 'Choi Youngrok <cyr@puzl.co.kr>',
    to: 'client@example.com',
    subject: '[제안] 테스트',
    body: '제안서 드립니다',
    internalDate: OUTBOUND_TS,
  }),
  msg({
    messageId: 'in-1',
    from: '이의선 <contact@example.com>',
    to: 'cyr@puzl.co.kr',
    subject: 'Re: [제안] 테스트',
    body: '잘 받았습니다',
    internalDate: INBOUND_AFTER_TS,
  }),
];

// "inbound 없는" 스레드: 자사 발송만 여러 번 (팔로업 내역)
const THREAD_NO_INBOUND: ThreadMessage[] = [
  msg({
    messageId: 'out-a',
    from: 'cyr@puzl.co.kr',
    to: 'client@example.com',
    subject: '[제안] 테스트',
    body: '초안',
    internalDate: OUTBOUND_TS,
  }),
  msg({
    messageId: 'out-b',
    from: 'PM <PM@puzl.co.kr>',
    to: 'client@example.com',
    subject: 'Re: [제안] 테스트',
    body: '팔로업',
    internalDate: INBOUND_AFTER_TS,
  }),
];

// ─── OWN_EMAIL_DOMAINS 상수 ─────────────────────────────────
describe('OWN_EMAIL_DOMAINS', () => {
  it('@puzl.co.kr 를 포함한다', () => {
    expect(OWN_EMAIL_DOMAINS).toContain('@puzl.co.kr');
  });

  it('배열로 export 된다', () => {
    expect(Array.isArray(OWN_EMAIL_DOMAINS)).toBe(true);
    expect(OWN_EMAIL_DOMAINS.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── isOwnMessage ────────────────────────────────────────
describe('isOwnMessage', () => {
  it('자사 도메인 이메일 (순수 주소) → true', () => {
    expect(isOwnMessage({ from: 'cyr@puzl.co.kr' })).toBe(true);
  });

  it('자사 도메인 + display name → true', () => {
    expect(isOwnMessage({ from: 'Choi Youngrok <cyr@puzl.co.kr>' })).toBe(true);
  });

  it('자사 도메인 대문자 혼용 → true', () => {
    expect(isOwnMessage({ from: 'CYR@PUZL.CO.KR' })).toBe(true);
  });

  it('외부 도메인 → false', () => {
    expect(isOwnMessage({ from: 'client@example.co.kr' })).toBe(false);
  });

  it('빈 문자열 → false (safe default)', () => {
    expect(isOwnMessage({ from: '' })).toBe(false);
  });

  it('puzl.co.kr 이 포함된 이메일은 판정 (substring 매칭)', () => {
    expect(isOwnMessage({ from: 'PM@puzl.co.kr' })).toBe(true);
    expect(isOwnMessage({ from: 'leader@puzl.co.kr' })).toBe(true);
  });
});

// ─── hasInboundSince ────────────────────────────────────
describe('hasInboundSince', () => {
  it('빈 배열 → false', () => {
    expect(hasInboundSince([], 0)).toBe(false);
  });

  it('inbound 있는 스레드 + sinceMs=outbound 시점 → true', () => {
    const sinceMs = parseInt(OUTBOUND_TS, 10);
    expect(hasInboundSince(THREAD_WITH_INBOUND, sinceMs)).toBe(true);
  });

  it('inbound 없는 스레드 (자사 발송만) → false', () => {
    expect(hasInboundSince(THREAD_NO_INBOUND, 0)).toBe(false);
  });

  it('inbound internalDate === sinceMs → false (엄격 > 비교)', () => {
    const sinceMs = parseInt(INBOUND_AFTER_TS, 10);
    expect(hasInboundSince(THREAD_WITH_INBOUND, sinceMs)).toBe(false);
  });

  it('inbound internalDate < sinceMs → false (이전 inbound 무시)', () => {
    const sinceMs = parseInt(OUTBOUND_TS, 10); // = 4월 1일
    const thread: ThreadMessage[] = [
      msg({
        messageId: 'old-in',
        from: 'contact@example.com',
        internalDate: INBOUND_BEFORE_TS, // 3월 28일 — sinceMs 보다 이전
      }),
    ];
    expect(hasInboundSince(thread, sinceMs)).toBe(false);
  });

  it('from 헤더 누락 (빈 문자열) → false (false-negative safe default)', () => {
    const thread: ThreadMessage[] = [
      msg({
        messageId: 'ghost',
        from: '',
        internalDate: INBOUND_AFTER_TS,
      }),
    ];
    expect(hasInboundSince(thread, 0)).toBe(false);
  });

  it('from 헤더 공백만 → false (trim 후 빈 문자열)', () => {
    const thread: ThreadMessage[] = [
      msg({
        messageId: 'ghost2',
        from: '   ',
        internalDate: INBOUND_AFTER_TS,
      }),
    ];
    expect(hasInboundSince(thread, 0)).toBe(false);
  });

  it('여러 inbound 중 하나만 유효해도 true 반환', () => {
    const thread: ThreadMessage[] = [
      msg({
        messageId: 'old',
        from: 'contact@example.com',
        internalDate: INBOUND_BEFORE_TS, // 너무 오래된 것
      }),
      msg({
        messageId: 'new',
        from: 'contact@example.com',
        internalDate: INBOUND_AFTER_TS, // 유효
      }),
    ];
    const sinceMs = parseInt(OUTBOUND_TS, 10);
    expect(hasInboundSince(thread, sinceMs)).toBe(true);
  });

  it('자사 발신 + 외부 발신 혼재 — 외부 발신만 inbound로 카운트', () => {
    const thread: ThreadMessage[] = [
      msg({
        from: 'cyr@puzl.co.kr',
        internalDate: INBOUND_AFTER_TS,
      }),
      msg({
        from: 'PM@puzl.co.kr',
        internalDate: INBOUND_AFTER_TS,
      }),
    ];
    expect(hasInboundSince(thread, 0)).toBe(false);
  });

  it('internalDate가 undefined/빈 문자열 메시지 → 안전하게 0 처리', () => {
    const thread: ThreadMessage[] = [
      msg({
        from: 'contact@example.com',
        internalDate: '',
      }),
    ];
    // internalDate=0, sinceMs=0 → 0 <= 0 이므로 false
    expect(hasInboundSince(thread, 0)).toBe(false);
  });

  it('Phase 3 ThreadMessage shape 그대로 사용 가능 (type 호환)', () => {
    const thread: ThreadMessage[] = [
      {
        messageId: 'm1',
        from: 'contact@example.com',
        to: 'cyr@puzl.co.kr',
        subject: 'Re',
        body: '답장드립니다',
        internalDate: INBOUND_AFTER_TS,
      },
    ];
    expect(hasInboundSince(thread, parseInt(OUTBOUND_TS, 10))).toBe(true);
  });
});
