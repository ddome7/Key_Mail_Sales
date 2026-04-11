/**
 * thread-loader 단위 테스트 (TDD RED 단계)
 *
 * Gmail MCP 스레드 조회를 DI로 격리한 loadThreadHistory 함수의 동작을 검증한다.
 * 실제 Gmail MCP 도구 이름(gmail_read_thread / gmail_get_thread / ...)은 아직
 * 확정되지 않았으므로 (A4), 이 테스트는 GmailReadThreadFn DI 인터페이스만
 * 사용한다. vi.fn()으로 다양한 raw 응답을 시뮬레이션한다.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  loadThreadHistory,
  type GmailReadThreadFn,
  type ThreadMessage,
} from './thread-loader.js';

// ─── 테스트 헬퍼 ───────────────────────────────────────────────────

function makeRawMessage(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    messageId: 'm-1',
    from: 'sender@example.com',
    to: 'recipient@example.com',
    subject: '[퍼즐/최영록] 샘플 _ 문의 _ 260408',
    body: '<p>본문</p>',
    internalDate: '1712548680000',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('loadThreadHistory — empty / missing threadId', () => {
  it('threadId가 undefined이면 빈 배열을 반환하고 도구를 호출하지 않는다', async () => {
    const mockTool = vi.fn<GmailReadThreadFn>();

    const result = await loadThreadHistory(undefined, mockTool);

    expect(result).toEqual([]);
    expect(mockTool).not.toHaveBeenCalled();
  });

  it('threadId가 null이면 빈 배열을 반환하고 도구를 호출하지 않는다', async () => {
    const mockTool = vi.fn<GmailReadThreadFn>();

    const result = await loadThreadHistory(null, mockTool);

    expect(result).toEqual([]);
    expect(mockTool).not.toHaveBeenCalled();
  });

  it('threadId가 빈 문자열이면 빈 배열을 반환하고 도구를 호출하지 않는다 (Pitfall: Gmail이 빈 threadId를 잘못된 스레드로 해석)', async () => {
    const mockTool = vi.fn<GmailReadThreadFn>();

    const result = await loadThreadHistory('', mockTool);

    expect(result).toEqual([]);
    expect(mockTool).not.toHaveBeenCalled();
  });

  it('threadId가 공백 문자열이면 빈 배열을 반환한다', async () => {
    const mockTool = vi.fn<GmailReadThreadFn>();

    const result = await loadThreadHistory('   ', mockTool);

    expect(result).toEqual([]);
    expect(mockTool).not.toHaveBeenCalled();
  });
});

describe('loadThreadHistory — 유효 threadId', () => {
  it('유효한 threadId가 주어지면 도구를 정확히 한 번 호출한다', async () => {
    const mockTool = vi.fn<GmailReadThreadFn>().mockResolvedValue([]);

    await loadThreadHistory('thread-abc', mockTool);

    expect(mockTool).toHaveBeenCalledTimes(1);
    expect(mockTool).toHaveBeenCalledWith({ threadId: 'thread-abc' });
  });

  it('도구 응답이 뒤섞인 순서로 와도 internalDate 오름차순(오래된 → 최신)으로 정렬한다', async () => {
    const unordered: ThreadMessage[] = [
      makeRawMessage({ messageId: 'm-3', internalDate: '3000', subject: '세 번째' }),
      makeRawMessage({ messageId: 'm-1', internalDate: '1000', subject: '첫 번째' }),
      makeRawMessage({ messageId: 'm-2', internalDate: '2000', subject: '두 번째' }),
    ];
    const mockTool = vi.fn<GmailReadThreadFn>().mockResolvedValue(unordered);

    const result = await loadThreadHistory('thread-xyz', mockTool);

    expect(result.map((m) => m.messageId)).toEqual(['m-1', 'm-2', 'm-3']);
    expect(result.map((m) => m.subject)).toEqual(['첫 번째', '두 번째', '세 번째']);
  });

  it('이미 정렬된 응답도 그대로 유지한다', async () => {
    const ordered: ThreadMessage[] = [
      makeRawMessage({ messageId: 'a', internalDate: '100' }),
      makeRawMessage({ messageId: 'b', internalDate: '200' }),
      makeRawMessage({ messageId: 'c', internalDate: '300' }),
    ];
    const mockTool = vi.fn<GmailReadThreadFn>().mockResolvedValue(ordered);

    const result = await loadThreadHistory('t', mockTool);

    expect(result.map((m) => m.messageId)).toEqual(['a', 'b', 'c']);
  });

  it('빈 배열 응답도 정상 처리한다', async () => {
    const mockTool = vi.fn<GmailReadThreadFn>().mockResolvedValue([]);

    const result = await loadThreadHistory('empty-thread', mockTool);

    expect(result).toEqual([]);
  });
});

describe('loadThreadHistory — ThreadMessage 스키마 정규화 (T-03-29)', () => {
  it('raw 응답에서 필드가 누락되면 빈 문자열 기본값을 채운다', async () => {
    const raw = [
      {
        messageId: undefined,
        from: undefined,
        to: undefined,
        subject: undefined,
        body: undefined,
        internalDate: undefined,
      } as unknown as ThreadMessage,
    ];
    const mockTool = vi.fn<GmailReadThreadFn>().mockResolvedValue(raw);

    const result = await loadThreadHistory('t', mockTool);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      messageId: '',
      from: '',
      to: '',
      subject: '',
      body: '',
      internalDate: '0',
    });
  });

  it('internalDate가 누락되면 기본값 "0"으로 설정되어 정렬 최상위에 온다', async () => {
    const raw = [
      makeRawMessage({ messageId: 'with-date', internalDate: '500' }),
      {
        messageId: 'no-date',
        from: 'x',
        to: 'y',
        subject: 's',
        body: 'b',
      } as unknown as ThreadMessage,
    ];
    const mockTool = vi.fn<GmailReadThreadFn>().mockResolvedValue(raw);

    const result = await loadThreadHistory('t', mockTool);

    // internalDate 없는 메시지는 '0'으로 → 가장 오래된 것으로 맨 앞
    expect(result[0].messageId).toBe('no-date');
    expect(result[1].messageId).toBe('with-date');
  });
});

describe('loadThreadHistory — 에러 전파', () => {
  it('도구 호출이 reject되면 에러를 그대로 throw한다 (오케스트레이터가 try/catch)', async () => {
    const mockTool = vi
      .fn<GmailReadThreadFn>()
      .mockRejectedValue(new Error('Gmail API failure'));

    await expect(loadThreadHistory('thread-id', mockTool)).rejects.toThrow(
      'Gmail API failure',
    );
  });
});
