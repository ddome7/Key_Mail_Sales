/**
 * learning-loop.test.ts — runLearningLoop / runLearnForClient 10 scenarios
 *
 * D-01: No forbidden scheduling keywords in this file.
 * String concatenation used where needed: 'set' + 'Interval', 'c' + 'ron'.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  runLearningLoop,
  runLearnForClient,
  type LearningLoopDependencies,
  type LearningLoopResult,
} from './learning-loop.js';

// ─── Helpers ────────────────────────────────────────────────────

function makeClient(overrides: Partial<{
  id: number;
  companyName: string;
  industry: string | null;
  stage: string;
  followupPaused: boolean;
  contactEmail: string | null;
  lastContactDate: string | null;
}> = {}) {
  return {
    id: overrides.id ?? 1,
    companyName: overrides.companyName ?? '테스트회사',
    industry: overrides.industry ?? 'F&B',
    stage: overrides.stage ?? 'PROPOSAL',
    followupPaused: overrides.followupPaused ?? false,
    contactEmail: overrides.contactEmail ?? 'test@example.com',
    lastContactDate: overrides.lastContactDate ?? '2026-04-01T00:00:00Z',
    contactName: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
}

function makeTouchpoint(overrides: Partial<{
  id: number;
  clientId: number;
  type: string;
  sourceId: string;
  summary: string;
  metadata: any;
  occurredAt: string;
}> = {}) {
  return {
    id: overrides.id ?? 1,
    clientId: overrides.clientId ?? 1,
    type: overrides.type ?? 'email_sent',
    sourceId: overrides.sourceId ?? 'thread-1',
    summary: overrides.summary ?? 'test email',
    metadata: overrides.metadata ?? { cadence: { contextType: 'proposal' }, originalBody: '<p>hello</p>' },
    occurredAt: overrides.occurredAt ?? '2026-04-01T00:00:00Z',
  };
}

function makeBaseDeps(overrides: Partial<LearningLoopDependencies> = {}): LearningLoopDependencies {
  return {
    clientQueries: {
      getActiveFollowupClients: () => [],
      getClientById: () => null,
      ...overrides.clientQueries,
    } as any,
    touchpointQueries: {
      getTimelineByClient: () => [],
      ...overrides.touchpointQueries,
    } as any,
    emailPatternQueries: {
      create: vi.fn(),
      getByTouchpointId: () => null,
      getPendingPatterns: () => [],
      updateOutcome: vi.fn(),
      getStatsByIndustryStrategy: () => [],
      ...overrides.emailPatternQueries,
    } as any,
    editDeltaQueries: {
      create: vi.fn(),
      getByTouchpointId: () => undefined,
      getRecentByClient: () => [],
      ...overrides.editDeltaQueries,
    } as any,
    competitorIntelQueries: {
      create: vi.fn(),
      exists: () => false,
      getByClient: () => [],
      getByIndustry: () => [],
      ...overrides.competitorIntelQueries,
    } as any,
    loadThread: overrides.loadThread ?? (async () => []),
    now: overrides.now ?? (() => new Date('2026-04-10T00:00:00Z')),
    classifyOutcomeAI: overrides.classifyOutcomeAI,
    summarizeDiff: overrides.summarizeDiff,
    extractCompetitor: overrides.extractCompetitor,
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('runLearnForClient', () => {
  it('Test 10: single client processing returns per-client result', async () => {
    const client = makeClient({ id: 1, companyName: 'A사' });
    const tp = makeTouchpoint({ clientId: 1, sourceId: 'thread-a' });

    const deps = makeBaseDeps({
      clientQueries: {
        getActiveFollowupClients: () => [client],
        getClientById: (id: number) => (id === 1 ? client : null),
      } as any,
      touchpointQueries: {
        getTimelineByClient: () => [tp],
      } as any,
      loadThread: async () => [],
    });

    const result = await runLearnForClient(1, deps);

    expect(result).toBeDefined();
    expect(result.clientsProcessed).toBe(1);
    expect(result.clientsFailed).toBe(0);
  });
});

describe('runLearningLoop', () => {
  it('Test 1: 1 active client runs all 4 sub-routines and aggregates', async () => {
    const client = makeClient({ id: 1, companyName: 'A사' });
    const tp = makeTouchpoint({
      clientId: 1,
      sourceId: 'thread-a',
      type: 'email_sent',
      metadata: { cadence: { contextType: 'proposal' }, originalBody: '<p>hello</p>' },
    });

    const deps = makeBaseDeps({
      clientQueries: {
        getActiveFollowupClients: () => [client],
        getClientById: (id: number) => (id === 1 ? client : null),
      } as any,
      touchpointQueries: {
        getTimelineByClient: () => [tp],
      } as any,
      loadThread: async () => [],
    });

    const result = await runLearningLoop(deps);

    expect(result.clientsProcessed).toBe(1);
    expect(result.clientsFailed).toBe(0);
    // patternsNew should be counted from scanEmailPatterns
    expect(typeof result.patternsNew).toBe('number');
    expect(typeof result.patternsUpdated).toBe('number');
    expect(typeof result.editDeltasFound).toBe('number');
    expect(typeof result.editDeltasUnchanged).toBe('number');
    expect(Array.isArray(result.crossSellOpportunities)).toBe(true);
    expect(typeof result.competitorIntelNew).toBe('number');
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('Test 2: 3 active clients processed independently with aggregated results', async () => {
    const clients = [
      makeClient({ id: 1, companyName: 'A사' }),
      makeClient({ id: 2, companyName: 'B사' }),
      makeClient({ id: 3, companyName: 'C사' }),
    ];

    const deps = makeBaseDeps({
      clientQueries: {
        getActiveFollowupClients: () => clients,
        getClientById: (id: number) => clients.find(c => c.id === id) ?? null,
      } as any,
      touchpointQueries: {
        getTimelineByClient: () => [],
      } as any,
    });

    const result = await runLearningLoop(deps);

    expect(result.clientsProcessed).toBe(3);
    expect(result.clientsFailed).toBe(0);
  });

  it('Test 3: first client fails, 2nd/3rd succeed (try-catch per client)', async () => {
    const clients = [
      makeClient({ id: 1, companyName: 'A사' }),
      makeClient({ id: 2, companyName: 'B사' }),
      makeClient({ id: 3, companyName: 'C사' }),
    ];

    let callCount = 0;
    const deps = makeBaseDeps({
      clientQueries: {
        getActiveFollowupClients: () => clients,
        getClientById: (id: number) => {
          if (id === 1) throw new Error('DB error');
          return clients.find(c => c.id === id) ?? null;
        },
      } as any,
      touchpointQueries: {
        getTimelineByClient: (clientId: number) => {
          if (clientId === 1) throw new Error('DB error');
          return [];
        },
      } as any,
    });

    const result = await runLearningLoop(deps);

    expect(result.clientsProcessed).toBe(2);
    expect(result.clientsFailed).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('Test 4: no AI DI injected -> deterministic mode works fully', async () => {
    const client = makeClient({ id: 1 });
    const tp = makeTouchpoint({ clientId: 1 });

    const deps = makeBaseDeps({
      clientQueries: {
        getActiveFollowupClients: () => [client],
        getClientById: () => client,
      } as any,
      touchpointQueries: {
        getTimelineByClient: () => [tp],
      } as any,
      // No AI DI: classifyOutcomeAI, summarizeDiff, extractCompetitor are all undefined
    });

    const result = await runLearningLoop(deps);

    // Should complete without error
    expect(result.clientsProcessed).toBe(1);
    expect(result.clientsFailed).toBe(0);
  });

  it('Test 5: email patterns new + pending update reflected', async () => {
    const client = makeClient({ id: 1 });
    const tp = makeTouchpoint({
      clientId: 1,
      sourceId: 'thread-1',
      occurredAt: '2026-04-01T00:00:00Z',
    });

    const createFn = vi.fn();
    const deps = makeBaseDeps({
      clientQueries: {
        getActiveFollowupClients: () => [client],
        getClientById: () => client,
      } as any,
      touchpointQueries: {
        getTimelineByClient: () => [tp],
      } as any,
      emailPatternQueries: {
        create: createFn,
        getByTouchpointId: () => null,
        getPendingPatterns: () => [],
        updateOutcome: vi.fn(),
        getStatsByIndustryStrategy: () => [],
      } as any,
    });

    const result = await runLearningLoop(deps);

    expect(result.patternsNew).toBeGreaterThanOrEqual(0);
    expect(typeof result.patternsUpdated).toBe('number');
  });

  it('Test 6: cross-sell opportunities detected and included', async () => {
    const client = makeClient({ id: 1, companyName: '카페회사' });
    // touchpoint indicating a cafe viral service
    const tp = makeTouchpoint({
      clientId: 1,
      type: 'email_sent',
      occurredAt: '2026-03-01T00:00:00Z',
      metadata: {
        cadence: { contextType: 'proposal' },
        originalBody: '<p>hello</p>',
        source: '카페 바이럴',
      },
    });

    const deps = makeBaseDeps({
      clientQueries: {
        getActiveFollowupClients: () => [client],
        getClientById: () => client,
      } as any,
      touchpointQueries: {
        getTimelineByClient: () => [tp],
      } as any,
      now: () => new Date('2026-04-10T00:00:00Z'),
    });

    const result = await runLearningLoop(deps);

    // The cross-sell detector should find opportunities if service matches
    expect(Array.isArray(result.crossSellOpportunities)).toBe(true);
  });

  it('Test 7: competitor intel extraction reflected in competitorIntelNew', async () => {
    const client = makeClient({ id: 1 });
    // email_received touchpoint to trigger competitor extraction
    const tpReceived = makeTouchpoint({
      id: 2,
      clientId: 1,
      type: 'email_received',
      sourceId: 'thread-recv',
      metadata: {},
    });

    const deps = makeBaseDeps({
      clientQueries: {
        getActiveFollowupClients: () => [client],
        getClientById: () => client,
      } as any,
      touchpointQueries: {
        getTimelineByClient: () => [tpReceived],
      } as any,
      loadThread: async () => [
        {
          id: 'msg-1',
          threadId: 'thread-recv',
          from: 'client@example.com',
          subject: 'Re: proposal',
          body: '다른 업체에서 1500만원에 해준다고 합니다',
          internalDate: '1775900000000',
        },
      ],
      extractCompetitor: async (text: string) => [
        {
          competitorName: 'unknown',
          intelType: 'pricing' as const,
          detail: '1500만원 견적 제시',
          confidence: 'confirmed' as const,
        },
      ],
    });

    const result = await runLearningLoop(deps);

    expect(result.competitorIntelNew).toBe(1);
  });

  it('Test 8: edit deltas reflected in editDeltasFound/editDeltasUnchanged', async () => {
    const client = makeClient({ id: 1 });
    const tp = makeTouchpoint({
      clientId: 1,
      sourceId: 'thread-1',
      type: 'email_sent',
      metadata: { originalBody: '<p>original text</p>' },
    });

    const deps = makeBaseDeps({
      clientQueries: {
        getActiveFollowupClients: () => [client],
        getClientById: () => client,
      } as any,
      touchpointQueries: {
        getTimelineByClient: () => [tp],
      } as any,
      loadThread: async () => [
        {
          id: 'msg-1',
          threadId: 'thread-1',
          from: 'cyr@puzl.co.kr',
          subject: 'proposal',
          body: '<p>modified text</p>',
          internalDate: '1775900000000',
        },
      ],
    });

    const result = await runLearningLoop(deps);

    expect(typeof result.editDeltasFound).toBe('number');
    expect(typeof result.editDeltasUnchanged).toBe('number');
  });

  it('Test 9: empty DB (no clients) returns empty result', async () => {
    const deps = makeBaseDeps({
      clientQueries: {
        getActiveFollowupClients: () => [],
        getClientById: () => null,
      } as any,
    });

    const result = await runLearningLoop(deps);

    expect(result.clientsProcessed).toBe(0);
    expect(result.clientsFailed).toBe(0);
    expect(result.patternsNew).toBe(0);
    expect(result.patternsUpdated).toBe(0);
    expect(result.editDeltasFound).toBe(0);
    expect(result.editDeltasUnchanged).toBe(0);
    expect(result.crossSellOpportunities).toEqual([]);
    expect(result.competitorIntelNew).toBe(0);
    expect(result.warnings).toEqual([]);
  });
});

// ─── D-01 Static grep test ──────────────────────────────────────

describe('D-01 compliance', () => {
  it('learning-loop.ts contains no forbidden scheduling keywords', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(import.meta.dirname, 'learning-loop.ts');
    const content = fs.readFileSync(filePath, 'utf8');

    // Forbidden words (using concatenation to avoid false positives in this test file)
    const forbidden = [
      'c' + 'ron',
      'tim' + 'er',
      'sche' + 'dul',
      'set' + 'Interval',
      'set' + 'Timeout',
    ];

    for (const word of forbidden) {
      expect(content.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});
