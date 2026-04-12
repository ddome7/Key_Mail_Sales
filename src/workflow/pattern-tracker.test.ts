/**
 * pattern-tracker.test.ts — TDD tests for email pattern batch scanning.
 *
 * D-04/D-05: 이메일 성과 패턴 배치 스캔.
 * hasInboundSince 재사용, classifyOutcomeDeterministic/classifyOutcomeWithAI 연동.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  scanEmailPatterns,
  type PatternTrackerDeps,
  type PatternScanResult,
} from './pattern-tracker.js';
import type { ThreadMessage } from './thread-loader.js';

// ─── Helpers ──────────────────────────────────────────────────

const NOW = new Date('2026-04-12T10:00:00+09:00');
const NOW_MS = NOW.getTime();

/** 10일 전에 발송된 touchpoint (pending) */
const TP_10_DAYS_AGO = {
  id: 1,
  clientId: 100,
  type: 'email_sent' as const,
  summary: '[드래프트] F&B 캠페인 제안서',
  sourceId: 'thread-001',
  occurredAt: new Date(NOW_MS - 10 * 86400000).toISOString(),
  metadata: JSON.stringify({
    cadence: { contextType: 'proposal', toneLevel: 3 },
    originalBody: '안녕하세요, 퍼즐코퍼레이션입니다. 제안서를 보내드립니다. 검토 후 회신 부탁드립니다. 추가적으로 궁금하신 점이 있으시면 편하게 연락 주세요.',
  }),
  createdAt: '2026-04-02',
};

/** 35일 전에 발송 (no_reply) */
const TP_35_DAYS_AGO = {
  id: 2,
  clientId: 100,
  type: 'email_sent' as const,
  summary: '뷰티 마케팅 견적서',
  sourceId: 'thread-002',
  occurredAt: new Date(NOW_MS - 35 * 86400000).toISOString(),
  metadata: JSON.stringify({
    strategy: 'B',
    cadence: { contextType: 'contract', toneLevel: 2 },
  }),
  createdAt: '2026-03-08',
};

/** 5일 전에 발송 (답장 있음 -> replied) */
const TP_5_DAYS_AGO = {
  id: 3,
  clientId: 100,
  type: 'email_sent' as const,
  summary: '[드래프트] UGC 인플루언서 기획안',
  sourceId: 'thread-003',
  occurredAt: new Date(NOW_MS - 5 * 86400000).toISOString(),
  metadata: JSON.stringify({
    cadence: { contextType: 'meeting_qna', toneLevel: 4 },
    originalBody: '기획안을 보내드립니다.',
  }),
  createdAt: '2026-04-07',
};

/** call type touchpoint -- should be filtered out */
const TP_CALL = {
  id: 4,
  clientId: 100,
  type: 'call' as const,
  summary: '통화 내용',
  sourceId: null,
  occurredAt: '2026-04-10T10:00:00+09:00',
  metadata: null,
  createdAt: '2026-04-10',
};

const CLIENT_100 = {
  id: 100,
  companyName: '샘플컴퍼니',
  industry: 'F&B',
};

/** Thread with inbound reply (외부 답장 있음) */
function makeReplyThread(sentAtMs: number): ThreadMessage[] {
  return [
    {
      messageId: 'msg-001',
      from: 'cyr@puzl.co.kr',
      to: 'client@sample.co.kr',
      subject: '제안서',
      body: '제안서를 보내드립니다.',
      internalDate: String(sentAtMs),
    },
    {
      messageId: 'msg-002',
      from: 'client@sample.co.kr',
      to: 'cyr@puzl.co.kr',
      subject: 'Re: 제안서',
      body: '좋은 제안 감사합니다. 미팅 일정 잡아도 될까요?',
      internalDate: String(sentAtMs + 3 * 86400000), // 3일 뒤 답장
    },
  ];
}

/** Thread without reply */
function makeNoReplyThread(sentAtMs: number): ThreadMessage[] {
  return [
    {
      messageId: 'msg-001',
      from: 'cyr@puzl.co.kr',
      to: 'client@sample.co.kr',
      subject: '견적서',
      body: '견적서를 보내드립니다.',
      internalDate: String(sentAtMs),
    },
  ];
}

function makeDeps(overrides: Partial<PatternTrackerDeps> = {}): PatternTrackerDeps {
  return {
    touchpointQueries: {
      getTimelineByClient: vi.fn().mockReturnValue([]),
      createTouchpoint: vi.fn(),
      getLastOutboundByClient: vi.fn(),
      getLastInboundByClient: vi.fn(),
    } as any,
    emailPatternQueries: {
      create: vi.fn().mockImplementation((data: any) => ({ id: Math.floor(Math.random() * 1000), ...data })),
      getByTouchpointId: vi.fn().mockReturnValue(undefined),
      getPendingPatterns: vi.fn().mockReturnValue([]),
      updateOutcome: vi.fn(),
      getStatsByIndustryStrategy: vi.fn(),
    } as any,
    clientQueries: {
      getClientById: vi.fn().mockReturnValue(CLIENT_100),
    } as any,
    loadThread: vi.fn().mockResolvedValue([]),
    now: () => NOW,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('scanEmailPatterns', () => {
  it('Test 1: 답장 있는 touchpoint -> outcome="replied", daysToReply 계산', async () => {
    const sentAtMs = new Date(TP_5_DAYS_AGO.occurredAt).getTime();
    const deps = makeDeps({
      touchpointQueries: {
        getTimelineByClient: vi.fn().mockReturnValue([TP_5_DAYS_AGO]),
      } as any,
      loadThread: vi.fn().mockResolvedValue(makeReplyThread(sentAtMs)),
    });

    const result = await scanEmailPatterns(100, deps);

    expect(result.patternsNew).toBe(1);
    expect(deps.emailPatternQueries.create).toHaveBeenCalledTimes(1);
    const createArg = (deps.emailPatternQueries.create as any).mock.calls[0][0];
    expect(createArg.outcome).toBe('replied');
    expect(createArg.daysToReply).toBe(3);
  });

  it('Test 2: 30일 초과 미응답 -> outcome="no_reply"', async () => {
    const sentAtMs = new Date(TP_35_DAYS_AGO.occurredAt).getTime();
    const deps = makeDeps({
      touchpointQueries: {
        getTimelineByClient: vi.fn().mockReturnValue([TP_35_DAYS_AGO]),
      } as any,
      loadThread: vi.fn().mockResolvedValue(makeNoReplyThread(sentAtMs)),
    });

    const result = await scanEmailPatterns(100, deps);

    expect(result.patternsNew).toBe(1);
    const createArg = (deps.emailPatternQueries.create as any).mock.calls[0][0];
    expect(createArg.outcome).toBe('no_reply');
    expect(createArg.daysToReply).toBeNull();
  });

  it('Test 3: 30일 미만 미응답 -> outcome="pending"', async () => {
    const sentAtMs = new Date(TP_10_DAYS_AGO.occurredAt).getTime();
    const deps = makeDeps({
      touchpointQueries: {
        getTimelineByClient: vi.fn().mockReturnValue([TP_10_DAYS_AGO]),
      } as any,
      loadThread: vi.fn().mockResolvedValue(makeNoReplyThread(sentAtMs)),
    });

    const result = await scanEmailPatterns(100, deps);

    expect(result.patternsNew).toBe(1);
    const createArg = (deps.emailPatternQueries.create as any).mock.calls[0][0];
    expect(createArg.outcome).toBe('pending');
  });

  it('Test 4: AI DI 주입 + 답장 있음 -> positive/negative 세분화', async () => {
    const sentAtMs = new Date(TP_5_DAYS_AGO.occurredAt).getTime();
    const deps = makeDeps({
      touchpointQueries: {
        getTimelineByClient: vi.fn().mockReturnValue([TP_5_DAYS_AGO]),
      } as any,
      loadThread: vi.fn().mockResolvedValue(makeReplyThread(sentAtMs)),
      classifyOutcomeAI: vi.fn().mockResolvedValue('positive'),
    });

    const result = await scanEmailPatterns(100, deps);

    const createArg = (deps.emailPatternQueries.create as any).mock.calls[0][0];
    expect(createArg.outcome).toBe('positive');
  });

  it('Test 5: AI DI 미주입 -> "replied" 그대로 유지', async () => {
    const sentAtMs = new Date(TP_5_DAYS_AGO.occurredAt).getTime();
    const deps = makeDeps({
      touchpointQueries: {
        getTimelineByClient: vi.fn().mockReturnValue([TP_5_DAYS_AGO]),
      } as any,
      loadThread: vi.fn().mockResolvedValue(makeReplyThread(sentAtMs)),
      // no classifyOutcomeAI
    });

    const result = await scanEmailPatterns(100, deps);

    const createArg = (deps.emailPatternQueries.create as any).mock.calls[0][0];
    expect(createArg.outcome).toBe('replied');
  });

  it('Test 6: 이미 email_patterns에 기록된 touchpointId -> skip (Pitfall 6)', async () => {
    const deps = makeDeps({
      touchpointQueries: {
        getTimelineByClient: vi.fn().mockReturnValue([TP_10_DAYS_AGO]),
      } as any,
      emailPatternQueries: {
        ...makeDeps().emailPatternQueries,
        getByTouchpointId: vi.fn().mockReturnValue({ id: 99, touchpointId: 1 }), // exists
        getPendingPatterns: vi.fn().mockReturnValue([]),
      } as any,
    });

    const result = await scanEmailPatterns(100, deps);

    expect(result.skipped).toBe(1);
    expect(result.patternsNew).toBe(0);
    expect(deps.emailPatternQueries.create).not.toHaveBeenCalled();
  });

  it('Test 7: 기존 pending 건의 30일 재판정 -> no_reply로 업데이트', async () => {
    const oldSentAt = new Date(NOW_MS - 35 * 86400000).toISOString();
    const deps = makeDeps({
      touchpointQueries: {
        getTimelineByClient: vi.fn().mockReturnValue([]), // no new touchpoints
      } as any,
      emailPatternQueries: {
        ...makeDeps().emailPatternQueries,
        getByTouchpointId: vi.fn().mockReturnValue(undefined),
        getPendingPatterns: vi.fn().mockReturnValue([
          { id: 50, clientId: 100, sentAt: oldSentAt, outcome: 'pending' },
        ]),
        updateOutcome: vi.fn(),
      } as any,
    });

    const result = await scanEmailPatterns(100, deps);

    expect(result.patternsUpdated).toBe(1);
    expect(deps.emailPatternQueries.updateOutcome).toHaveBeenCalledWith(50, 'no_reply');
  });

  it('Test 8: touchpoint.metadata에서 strategy/contextType 추출 + industry는 client에서', async () => {
    const sentAtMs = new Date(TP_10_DAYS_AGO.occurredAt).getTime();
    const deps = makeDeps({
      touchpointQueries: {
        getTimelineByClient: vi.fn().mockReturnValue([TP_10_DAYS_AGO]),
      } as any,
      loadThread: vi.fn().mockResolvedValue(makeNoReplyThread(sentAtMs)),
    });

    await scanEmailPatterns(100, deps);

    const createArg = (deps.emailPatternQueries.create as any).mock.calls[0][0];
    expect(createArg.contextType).toBe('proposal');
    expect(createArg.toneLevel).toBe(3);
    expect(createArg.industry).toBe('F&B');
  });

  it('Test 9: bodyPreview는 200자 절단 (D-03)', async () => {
    const longBody = 'A'.repeat(300);
    const tpWithLongBody = {
      ...TP_10_DAYS_AGO,
      id: 10,
      metadata: JSON.stringify({
        cadence: { contextType: 'proposal' },
        originalBody: longBody,
      }),
    };
    const sentAtMs = new Date(tpWithLongBody.occurredAt).getTime();
    const deps = makeDeps({
      touchpointQueries: {
        getTimelineByClient: vi.fn().mockReturnValue([tpWithLongBody]),
      } as any,
      loadThread: vi.fn().mockResolvedValue(makeNoReplyThread(sentAtMs)),
    });

    await scanEmailPatterns(100, deps);

    const createArg = (deps.emailPatternQueries.create as any).mock.calls[0][0];
    expect(createArg.bodyPreview.length).toBe(200);
  });

  it('Test 10: subjectLine은 touchpoint.summary에서 "[드래프트]" 접두사 제거', async () => {
    const sentAtMs = new Date(TP_5_DAYS_AGO.occurredAt).getTime();
    const deps = makeDeps({
      touchpointQueries: {
        getTimelineByClient: vi.fn().mockReturnValue([TP_5_DAYS_AGO]),
      } as any,
      loadThread: vi.fn().mockResolvedValue(makeReplyThread(sentAtMs)),
    });

    await scanEmailPatterns(100, deps);

    const createArg = (deps.emailPatternQueries.create as any).mock.calls[0][0];
    // "[드래프트] UGC 인플루언서 기획안" -> "UGC 인플루언서 기획안"
    expect(createArg.subjectLine).toBe('UGC 인플루언서 기획안');
    expect(createArg.subjectLine).not.toContain('[드래프트]');
  });

  it('email_sent가 아닌 type의 touchpoint는 필터링됨', async () => {
    const deps = makeDeps({
      touchpointQueries: {
        getTimelineByClient: vi.fn().mockReturnValue([TP_CALL, TP_10_DAYS_AGO]),
      } as any,
      loadThread: vi.fn().mockResolvedValue(makeNoReplyThread(new Date(TP_10_DAYS_AGO.occurredAt).getTime())),
    });

    const result = await scanEmailPatterns(100, deps);

    // Only TP_10_DAYS_AGO (email_sent) processed, TP_CALL filtered
    expect(result.patternsNew).toBe(1);
    expect(deps.loadThread).toHaveBeenCalledTimes(1);
  });

  it('pending 재판정에서 다른 clientId는 skip', async () => {
    const deps = makeDeps({
      touchpointQueries: {
        getTimelineByClient: vi.fn().mockReturnValue([]),
      } as any,
      emailPatternQueries: {
        ...makeDeps().emailPatternQueries,
        getPendingPatterns: vi.fn().mockReturnValue([
          { id: 60, clientId: 999, sentAt: new Date(NOW_MS - 35 * 86400000).toISOString(), outcome: 'pending' },
        ]),
        updateOutcome: vi.fn(),
      } as any,
    });

    const result = await scanEmailPatterns(100, deps);

    expect(result.patternsUpdated).toBe(0);
    expect(deps.emailPatternQueries.updateOutcome).not.toHaveBeenCalled();
  });
});
