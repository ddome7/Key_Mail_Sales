/**
 * Workflow C Orchestrator Tests (Phase 4 Plan 05)
 *
 * 케이던스 팔로업 파이프라인의 primitive(단일 클라이언트)와 batch(전수 스캔)
 * 두 진입점을 end-to-end로 검증. 모든 외부 의존성은 DI mock.
 *
 * Test 매트릭스:
 *  Task 1 (primitive, 19 scenarios):
 *    T-01: 존재하지 않는 companyName → no_action:'skipped'
 *    T-02: stage='DORMANT' → no_action:'dormant'
 *    T-03: followupPaused=true → no_action:'paused'
 *    T-04: last outbound 없음 + lastContactDate 없음 → no_action:'no_last_outbound'
 *    T-05: hasInboundSince=true → no_action:'recent_inbound'
 *    T-06: elapsedDays<3 → no_action:'no_stage_due'
 *    T-07: proposal Day 3 → success stage ordinal=1 contextType='proposal'
 *    T-08: contract Day 5 → success isFinalTouch=true
 *    T-09: Day 30 + no confirm DI → dormantPending=true, no stage update
 *    T-10: Day 30 + confirm → updateDealStage('DORMANT') 호출
 *    T-11: Day 30 + keep_active → stage 유지, dormantPending=true
 *    T-12: 금지 표현 → status:'error'
 *    T-13: cross-contamination → status:'error'
 *    T-14: quality fail → status:'error'
 *    T-15: 성공 subject에 Re: prefix
 *    T-16: touchpoint type='email_sent' metadata.cadence 기록
 *    T-17: deterministic null → classifyContextWithAI DI 호출
 *    T-18: generateCadenceFollowUpBody DI 미주입 → placeholder body, 금지표현 통과
 *    T-19: executedStageIndices catch-up
 *
 *  Task 2 (batch, 7 scenarios):
 *    T-20: companyName 주입 → WorkflowCResult 직접 반환
 *    T-21: 모두 no_action → drafted=0
 *    T-22: maxDrafts=2 + 후보 4건 → drafted=2, pendingBeyondCap=2
 *    T-23: iteration throw → errors++ 계속
 *    T-24: isFinalTouch 성공 → dormantCandidates push
 *    T-25: 오래된 순 정렬
 *    T-26: rows 필드 구조
 *    T-27: D-01 정적 grep (주기실행 API 단어 부재)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { runWorkflowC, runWorkflowCForClient } from './workflow-c.js';
import type {
  WorkflowCDependencies,
  WorkflowCResult,
  WorkflowCBatchResult,
} from './workflow-c.js';
import type { GmailToolFn } from './draft-creator.js';
import type { GmailReadThreadFn, ThreadMessage } from './thread-loader.js';
import type { Client, Touchpoint } from '../db/schema.js';
import {
  SAMPLE_OUTBOUND_PROPOSAL,
  SAMPLE_OUTBOUND_CONTRACT,
  THREAD_WITH_INBOUND,
  THREAD_NO_INBOUND,
} from '../../tests/fixtures/cadence-samples.js';
import { clients, touchpoints } from '../db/schema.js';
import { createClientQueries } from '../queries/clients.js';
import { createServiceQueries } from '../queries/services.js';
import { createTouchpointQueries } from '../queries/touchpoints.js';
import { createBriefingQueries } from '../queries/briefings.js';

// ─── 테스트용 경로 ─────────────────────────────────────────

const TEST_PIPELINE_PATH = resolve(
  process.cwd(),
  'state',
  'test-pipeline-workflow-c.json',
);

function cleanupTestFiles() {
  if (existsSync(TEST_PIPELINE_PATH)) {
    try {
      rmSync(TEST_PIPELINE_PATH);
    } catch {
      /* ignore */
    }
  }
}

function writePipelineFile(deals: Array<{ id: string; companyName: string; stage: string; emailThreadId?: string }>) {
  const data = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    deals: deals.map((d) => ({
      ...d,
      lastActionDate: '2026-04-01',
    })),
  };
  const dir = dirname(TEST_PIPELINE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TEST_PIPELINE_PATH, JSON.stringify(data, null, 2));
}

// ─── 인메모리 DB setup ─────────────────────────────────────

function createInMemoryDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      industry TEXT,
      history TEXT,
      budget_pattern TEXT,
      budget_tier INTEGER,
      preferred_services TEXT,
      notes TEXT,
      next_opportunity TEXT,
      communication_style TEXT,
      stage TEXT DEFAULT 'PROSPECT',
      last_contact_date TEXT,
      followup_paused INTEGER DEFAULT 0 NOT NULL,
      followup_paused_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS touchpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      metadata TEXT,
      occurred_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      base_price INTEGER,
      price_unit TEXT,
      price_note TEXT,
      process_steps TEXT,
      as_policy TEXT
    );
    CREATE TABLE IF NOT EXISTS service_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier INTEGER NOT NULL,
      industry TEXT,
      service_name TEXT NOT NULL,
      priority INTEGER,
      recommended_quantity TEXT,
      recommended_budget TEXT,
      sales_ment TEXT
    );
    CREATE TABLE IF NOT EXISTS briefings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      slack_ts TEXT NOT NULL UNIQUE,
      slack_channel_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      source TEXT NOT NULL,
      summary TEXT NOT NULL,
      action_items TEXT,
      sentiment TEXT,
      raw_transcript TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  return drizzle(sqlite);
}

// ─── 기본 fixture helpers ──────────────────────────────────

function insertClient(db: ReturnType<typeof createInMemoryDb>, overrides: Partial<Client> = {}): Client {
  const now = new Date().toISOString();
  const data = {
    companyName: '동반성장위원회',
    contactName: '이의선',
    contactEmail: 'iuiseon@example.com',
    contactPhone: null,
    industry: '공공기관',
    budgetTier: 3,
    budgetPattern: null,
    preferredServices: null,
    communicationStyle: null,
    notes: null,
    stage: 'LEAD',
    history: null,
    nextOpportunity: null,
    lastContactDate: '2026-04-01',
    followupPaused: false,
    followupPausedReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as any;
  const inserted = db.insert(clients).values(data).returning().get();
  return inserted as Client;
}

function makeGmailTool(
  result: { id: string; threadId?: string } = { id: 'draft_c1', threadId: 'THREAD_C1' },
): GmailToolFn {
  return vi.fn().mockResolvedValue(result) as unknown as GmailToolFn;
}

function makeGmailReadThreadTool(messages: ThreadMessage[]): GmailReadThreadFn {
  return vi.fn().mockResolvedValue(messages) as unknown as GmailReadThreadFn;
}

// 테스트 전체에서 공유하는 고정 "now" — deps.now와 seed 기준을 동일하게 맞춘다.
const FIXED_NOW = new Date('2026-04-15T10:00:00+09:00');

/**
 * 합성 outbound touchpoint 1건 삽입 — elapsedDays 계산용.
 *
 * occurredAt을 FIXED_NOW 기준으로 원하는 일수만큼 과거로 고정한다.
 * deps.now도 FIXED_NOW를 주입해야 정확한 elapsedDays가 계산된다.
 */
function seedOutboundTouchpoint(
  db: ReturnType<typeof createInMemoryDb>,
  clientId: number,
  daysAgo: number,
  opts: { metadata?: any; type?: string; sourceId?: string } = {},
) {
  const occurredAt = new Date(FIXED_NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  db.insert(touchpoints)
    .values({
      clientId,
      type: (opts.type ?? 'email_sent') as any,
      sourceId: opts.sourceId ?? 'THREAD_C1',
      summary: '이전 발송 이메일',
      metadata: opts.metadata ?? null,
      occurredAt,
    } as any)
    .run();
  return occurredAt;
}

/**
 * DI deps를 조립한다. 필요에 따라 override.
 */
function createDeps(
  db: ReturnType<typeof createInMemoryDb>,
  overrides: Partial<WorkflowCDependencies> = {},
): WorkflowCDependencies {
  const clientQueries = createClientQueries(db);
  const serviceQueries = createServiceQueries(db);
  const touchpointQueries = createTouchpointQueries(db);
  const briefingQueries = createBriefingQueries(db);

  return {
    clientQueries,
    serviceQueries,
    touchpointQueries,
    briefingQueries,

    gmailTool: makeGmailTool(),
    gmailReadThreadTool: makeGmailReadThreadTool(THREAD_NO_INBOUND),

    getAllCompanyNames: () => ['동반성장위원회'],

    // 기본: 안전한 placeholder body가 필요한 경우 DI 주입
    generateCadenceFollowUpBody: vi
      .fn()
      .mockResolvedValue(
        '<p>안녕하세요.</p><p>지난번 안내드린 내용 관련해서 확인 부탁드립니다. 문의주시면 감사하겠습니다.</p>',
      ),

    pipelinePath: TEST_PIPELINE_PATH,
    ultraPath: undefined, // v4 ULTRA 파일 없이도 동작하도록 orchestrator가 safeLoadSections 처리

    now: () => FIXED_NOW,
    ...overrides,
  };
}

// ─── 테스트 시작 ───────────────────────────────────────────

beforeEach(() => {
  cleanupTestFiles();
});

afterEach(() => {
  cleanupTestFiles();
});

// ════════════════════════════════════════════════════════════
// runWorkflowCForClient — primitive (Task 1)
// ════════════════════════════════════════════════════════════

describe('runWorkflowCForClient — 조기 반환 (no_action 분기)', () => {
  it('T-01: 존재하지 않는 companyName → skipped', async () => {
    const db = createInMemoryDb();
    const deps = createDeps(db);

    const result = await runWorkflowCForClient('없는회사', deps);

    expect(result.status).toBe('no_action');
    if (result.status === 'no_action') {
      expect(result.reason).toBe('skipped');
      expect(result.companyName).toBe('없는회사');
    }
  });

  it('T-02: stage=DORMANT → dormant', async () => {
    const db = createInMemoryDb();
    insertClient(db, { stage: 'DORMANT' });
    const deps = createDeps(db);

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    expect(result.status).toBe('no_action');
    if (result.status === 'no_action') {
      expect(result.reason).toBe('dormant');
    }
  });

  it('T-03: followupPaused=true → paused', async () => {
    const db = createInMemoryDb();
    insertClient(db, { followupPaused: true, followupPausedReason: '대표님 요청' });
    const deps = createDeps(db);

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    expect(result.status).toBe('no_action');
    if (result.status === 'no_action') {
      expect(result.reason).toBe('paused');
    }
  });

  it('T-04: last outbound + lastContactDate 모두 없음 → no_last_outbound', async () => {
    const db = createInMemoryDb();
    insertClient(db, { lastContactDate: null });
    const deps = createDeps(db);

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    expect(result.status).toBe('no_action');
    if (result.status === 'no_action') {
      expect(result.reason).toBe('no_last_outbound');
    }
  });

  it('T-05: hasInboundSince=true → recent_inbound', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    // THREAD_WITH_INBOUND fixture 는 2026-04-01 (outbound) + 2026-04-02 (inbound)
    // FIXED_NOW = 2026-04-15. touchpoint.occurredAt 이 inbound(2026-04-02)보다 과거여야
    // hasInboundSince가 true를 반환한다 → daysAgo=15 (2026-03-31)
    seedOutboundTouchpoint(db, client.id, 15);
    // deal.emailThreadId 가 있어야 loadThreadHistory가 gmailReadThreadTool 호출한다.
    writePipelineFile([
      { id: 'deal-t5', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_T5' },
    ]);
    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool(THREAD_WITH_INBOUND),
    });

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    expect(result.status).toBe('no_action');
    if (result.status === 'no_action') {
      expect(result.reason).toBe('recent_inbound');
    }
  });

  it('T-06: elapsedDays<3 + no stage due → no_stage_due', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    // 1일 전 outbound — Day 3 미도달
    seedOutboundTouchpoint(db, client.id, 1);
    const deps = createDeps(db);

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    expect(result.status).toBe('no_action');
    if (result.status === 'no_action') {
      expect(result.reason).toBe('no_stage_due');
    }
  });
});

describe('runWorkflowCForClient — 성공 경로 + 파이프라인 19단계', () => {
  it('T-07: proposal Day 3 → success stage=1', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    // 3일 전 outbound (proposal)
    seedOutboundTouchpoint(db, client.id, 3);

    // 파이프라인에 deal 등록 (emailThreadId=THREAD_C1)
    writePipelineFile([
      { id: 'deal-1', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_C1' },
    ]);

    const deps = createDeps(db, {
      // proposal 샘플로 thread 제공 → deterministic classifier가 'proposal' 반환
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
    });

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.stage.ordinal).toBe(1);
      expect(result.stage.dayMilestone).toBe(3);
      expect(result.stage.contextType).toBe('proposal');
      expect(result.stage.isFinalTouch).toBe(false);
      expect(result.draftId).toBe('draft_c1');
      expect(result.dormantPending).toBe(false);
    }
  });

  it('T-08: contract Day 5 (final) → isFinalTouch=true', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    seedOutboundTouchpoint(db, client.id, 5);
    writePipelineFile([
      { id: 'deal-2', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_C1' },
    ]);

    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_CONTRACT]),
    });

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.stage.contextType).toBe('contract');
      expect(result.stage.isFinalTouch).toBe(true);
      expect(result.stage.dayMilestone).toBe(5);
      // DI 미주입이므로 dormantPending=true
      expect(result.dormantPending).toBe(true);
    }
  });

  it('T-09: proposal Day 30 + no confirm DI → dormantPending=true, no stage update', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    seedOutboundTouchpoint(db, client.id, 30);
    writePipelineFile([
      { id: 'deal-3', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_C1' },
    ]);

    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
    });

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.stage.isFinalTouch).toBe(true);
      expect(result.stage.dayMilestone).toBe(30);
      expect(result.dormantPending).toBe(true);
    }
    // pipeline stage 여전히 LEAD
    const pipeline = JSON.parse(readFileSync(TEST_PIPELINE_PATH, 'utf-8'));
    expect(pipeline.deals[0].stage).toBe('LEAD');
  });

  it('T-10: Day 30 + confirm → updateDealStage DORMANT', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    seedOutboundTouchpoint(db, client.id, 30);
    writePipelineFile([
      { id: 'deal-4', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_C1' },
    ]);

    const askCeo = vi.fn().mockResolvedValue('confirm');
    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
      askCeoDormantConfirmation: askCeo,
    });

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.dormantPending).toBe(false);
    }
    expect(askCeo).toHaveBeenCalledOnce();
    const pipeline = JSON.parse(readFileSync(TEST_PIPELINE_PATH, 'utf-8'));
    expect(pipeline.deals[0].stage).toBe('DORMANT');
  });

  it('T-11: Day 30 + keep_active → stage 유지 dormantPending=true', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    seedOutboundTouchpoint(db, client.id, 30);
    writePipelineFile([
      { id: 'deal-5', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_C1' },
    ]);

    const askCeo = vi.fn().mockResolvedValue('keep_active');
    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
      askCeoDormantConfirmation: askCeo,
    });

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.dormantPending).toBe(true);
    }
    const pipeline = JSON.parse(readFileSync(TEST_PIPELINE_PATH, 'utf-8'));
    expect(pipeline.deals[0].stage).toBe('LEAD');
  });
});

describe('runWorkflowCForClient — 안전 게이트', () => {
  it('T-12: 금지 표현 포함 → error', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    seedOutboundTouchpoint(db, client.id, 3);
    writePipelineFile([
      { id: 'deal-6', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_C1' },
    ]);

    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
      generateCadenceFollowUpBody: vi
        .fn()
        .mockResolvedValue(
          '<p>안녕하세요. 답장 안 주시면 제안을 철회하겠습니다. 감사합니다.</p>',
        ),
    });

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('금지 표현');
    }
    // createDraft 호출되지 않아야 함
    expect(deps.gmailTool).not.toHaveBeenCalled();
  });

  it('T-13: cross-contamination → error', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    seedOutboundTouchpoint(db, client.id, 3);
    writePipelineFile([
      { id: 'deal-7', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_C1' },
    ]);

    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
      getAllCompanyNames: () => ['동반성장위원회', '경쟁사A'],
      generateCadenceFollowUpBody: vi
        .fn()
        .mockResolvedValue(
          '<p>안녕하세요. 경쟁사A 케이스를 참고하여 진행하겠습니다. 문의주시면 감사하겠습니다.</p>',
        ),
    });

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('교차 오염');
    }
    expect(deps.gmailTool).not.toHaveBeenCalled();
  });

  it('T-14: quality fail → error', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    seedOutboundTouchpoint(db, client.id, 3);
    writePipelineFile([
      { id: 'deal-8', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_C1' },
    ]);

    // 인사/감사/action 모두 없는 본문 → quality 실패
    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
      generateCadenceFollowUpBody: vi.fn().mockResolvedValue('<p>본문만 있음.</p>'),
    });

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('품질');
    }
    expect(deps.gmailTool).not.toHaveBeenCalled();
  });
});

describe('runWorkflowCForClient — Pitfall 4 / touchpoint / DI', () => {
  it('T-15: 성공 subject에 Re: prefix (Pitfall 4)', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    seedOutboundTouchpoint(db, client.id, 3);
    writePipelineFile([
      { id: 'deal-15', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_C1' },
    ]);

    const gmailMock = vi
      .fn()
      .mockResolvedValue({ id: 'D15', threadId: 'THREAD_C1' });
    const deps = createDeps(db, {
      gmailTool: gmailMock as any,
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
    });

    const result = await runWorkflowCForClient('동반성장위원회', deps);
    expect(result.status).toBe('success');

    const gmailArgs = gmailMock.mock.calls[0][0];
    expect(gmailArgs.subject).toMatch(/^Re:\s/);
  });

  it('T-16: touchpoint type=email_sent + metadata.cadence 기록', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    seedOutboundTouchpoint(db, client.id, 3);
    writePipelineFile([
      { id: 'deal-16', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_C1' },
    ]);

    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
    });
    // spy on createTouchpoint (proxy)
    const origCreate = deps.touchpointQueries.createTouchpoint.bind(deps.touchpointQueries);
    const spy = vi.fn((data: any) => origCreate(data));
    deps.touchpointQueries.createTouchpoint = spy as any;

    const result = await runWorkflowCForClient('동반성장위원회', deps);
    expect(result.status).toBe('success');

    // 새로 생성된 touchpoint 중 type='email_sent' 레코드 찾기
    const emailSentCalls = spy.mock.calls
      .map((c: any[]) => c[0])
      .filter((d: any) => d.type === 'email_sent');
    expect(emailSentCalls.length).toBeGreaterThan(0);
    const tp = emailSentCalls[0];
    expect(tp.metadata).toBeDefined();
    expect(tp.metadata.cadence).toBeDefined();
    expect(tp.metadata.cadence.contextType).toBe('proposal');
    expect(tp.metadata.cadence.stageIndex).toBe(0);
    expect(tp.metadata.cadence.dayMilestone).toBe(3);
    expect(tp.metadata.cadence.ordinal).toBe(1);
  });

  it('T-17: deterministic null → classifyContextWithAI DI 호출', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    seedOutboundTouchpoint(db, client.id, 3);
    writePipelineFile([
      { id: 'deal-17', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_C1' },
    ]);

    // general 샘플(어떤 키워드와도 매칭 안 됨)
    const generalMessage: ThreadMessage = {
      messageId: 'm-gen-1',
      from: 'cyr@puzl.co.kr',
      to: 'iuiseon@example.com',
      subject: '안녕하세요',
      body: '<p>간단히 인사드립니다.</p>',
      internalDate: String(Date.now() - 3 * 24 * 60 * 60 * 1000),
    };
    const aiClassify = vi.fn().mockResolvedValue('proposal');
    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([generalMessage]),
      classifyContextWithAI: aiClassify,
    });

    const result = await runWorkflowCForClient('동반성장위원회', deps);
    expect(aiClassify).toHaveBeenCalledOnce();
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.stage.contextType).toBe('proposal');
    }
  });

  it('T-18: generateCadenceFollowUpBody 미주입 → placeholder 사용 + 통과', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    seedOutboundTouchpoint(db, client.id, 3);
    writePipelineFile([
      { id: 'deal-18', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_C1' },
    ]);

    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
      generateCadenceFollowUpBody: undefined,
    });

    const result = await runWorkflowCForClient('동반성장위원회', deps);
    expect(result.status).toBe('success');
  });

  it('T-19: executedStageIndices — 이미 실행된 stage 제외', async () => {
    const db = createInMemoryDb();
    const client = insertClient(db);
    // 3일 전 outbound (Day 3) + 같은 시점 metadata.cadence.stageIndex=0 기록 존재
    seedOutboundTouchpoint(db, client.id, 3, {
      metadata: {
        cadence: {
          contextType: 'proposal',
          stageIndex: 0,
          ordinal: 1,
          dayMilestone: 3,
          toneIntent: 'confirm',
          isFinalTouch: false,
        },
      },
    });
    writePipelineFile([
      { id: 'deal-19', companyName: '동반성장위원회', stage: 'LEAD', emailThreadId: 'THREAD_C1' },
    ]);

    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
    });

    const result = await runWorkflowCForClient('동반성장위원회', deps);

    // elapsed=3, stage 0은 실행됨 → 다음 후보는 stage 1 (Day 7)이지만 7일 미도달 → null
    expect(result.status).toBe('no_action');
    if (result.status === 'no_action') {
      expect(result.reason).toBe('no_stage_due');
    }
  });
});

// ════════════════════════════════════════════════════════════
// runWorkflowC — batch (Task 2 시나리오, RED 먼저 작성)
// ════════════════════════════════════════════════════════════

describe('runWorkflowC — batch', () => {
  it('T-20: companyName 주입 → primitive 결과 직접 반환', async () => {
    const db = createInMemoryDb();
    const deps = createDeps(db);

    const result = await runWorkflowC(deps, { companyName: '없는회사' });

    // WorkflowCResult shape이어야 함 (rows 필드 없음)
    expect('rows' in result).toBe(false);
    expect(result.status).toBe('no_action');
  });

  it('T-21: 모두 no_action → drafted=0, processed=N', async () => {
    const db = createInMemoryDb();
    // 3명의 client, 모두 last outbound 없음
    insertClient(db, { companyName: 'A', lastContactDate: null });
    insertClient(db, { companyName: 'B', lastContactDate: null });
    insertClient(db, { companyName: 'C', lastContactDate: null });
    const deps = createDeps(db);

    const result = (await runWorkflowC(deps)) as WorkflowCBatchResult;

    expect(result.processed).toBe(3);
    expect(result.drafted).toBe(0);
    expect(result.skipped).toBe(3);
    expect(result.errors).toBe(0);
    expect(result.rows).toHaveLength(3);
    expect(result.pendingBeyondCap).toBe(0);
  });

  it('T-22: maxDrafts=2 + 성공 후보 4건 → drafted=2, pendingBeyondCap=2', async () => {
    const db = createInMemoryDb();
    const c1 = insertClient(db, { companyName: 'A', lastContactDate: '2026-04-01' });
    const c2 = insertClient(db, { companyName: 'B', lastContactDate: '2026-04-02' });
    const c3 = insertClient(db, { companyName: 'C', lastContactDate: '2026-04-03' });
    const c4 = insertClient(db, { companyName: 'D', lastContactDate: '2026-04-04' });
    for (const c of [c1, c2, c3, c4]) {
      seedOutboundTouchpoint(db, c.id, 3);
    }

    // 각 client별 deal 파일
    writePipelineFile([
      { id: 'd-a', companyName: 'A', stage: 'LEAD', emailThreadId: 'THREAD_A' },
      { id: 'd-b', companyName: 'B', stage: 'LEAD', emailThreadId: 'THREAD_B' },
      { id: 'd-c', companyName: 'C', stage: 'LEAD', emailThreadId: 'THREAD_C' },
      { id: 'd-d', companyName: 'D', stage: 'LEAD', emailThreadId: 'THREAD_D' },
    ]);

    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
      getAllCompanyNames: () => ['A', 'B', 'C', 'D'],
    });

    const result = (await runWorkflowC(deps, { maxDrafts: 2 })) as WorkflowCBatchResult;

    expect(result.drafted).toBe(2);
    expect(result.pendingBeyondCap).toBe(2);
  });

  it('T-23: iteration throw → errors++, 다른 client 계속 처리', async () => {
    const db = createInMemoryDb();
    const c1 = insertClient(db, { companyName: 'GoodCo', lastContactDate: '2026-04-01' });
    const c2 = insertClient(db, { companyName: 'BadCo', lastContactDate: '2026-04-02' });
    seedOutboundTouchpoint(db, c1.id, 3);
    seedOutboundTouchpoint(db, c2.id, 3);

    writePipelineFile([
      { id: 'good', companyName: 'GoodCo', stage: 'LEAD', emailThreadId: 'THREAD_GOOD' },
      { id: 'bad', companyName: 'BadCo', stage: 'LEAD', emailThreadId: 'THREAD_BAD' },
    ]);

    // gmailReadThreadTool이 BadCo 스레드에서 throw
    const threadTool = vi.fn(async ({ threadId }: { threadId: string }) => {
      if (threadId === 'THREAD_BAD') throw new Error('gmail api down');
      return [SAMPLE_OUTBOUND_PROPOSAL];
    });

    const deps = createDeps(db, {
      gmailReadThreadTool: threadTool as any,
      getAllCompanyNames: () => ['GoodCo', 'BadCo'],
    });

    const result = (await runWorkflowC(deps)) as WorkflowCBatchResult;

    expect(result.processed).toBeGreaterThanOrEqual(2);
    expect(result.errors).toBeGreaterThanOrEqual(1);
    expect(result.drafted).toBeGreaterThanOrEqual(1);
  });

  it('T-24: isFinalTouch 성공 → dormantCandidates에 추가', async () => {
    const db = createInMemoryDb();
    const c = insertClient(db, { companyName: 'FinalCo', lastContactDate: '2026-03-10' });
    seedOutboundTouchpoint(db, c.id, 30);

    writePipelineFile([
      { id: 'final', companyName: 'FinalCo', stage: 'LEAD', emailThreadId: 'THREAD_FINAL' },
    ]);

    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
      getAllCompanyNames: () => ['FinalCo'],
    });

    const result = (await runWorkflowC(deps)) as WorkflowCBatchResult;

    expect(result.dormantCandidates).toHaveLength(1);
    expect(result.dormantCandidates[0].companyName).toBe('FinalCo');
  });

  it('T-25: activeClients lastContactDate 오래된 순 정렬', async () => {
    const db = createInMemoryDb();
    insertClient(db, { companyName: 'Newer', lastContactDate: '2026-04-05' });
    insertClient(db, { companyName: 'Older', lastContactDate: '2026-04-01' });
    insertClient(db, { companyName: 'Middle', lastContactDate: '2026-04-03' });

    const deps = createDeps(db);

    const result = (await runWorkflowC(deps)) as WorkflowCBatchResult;

    // rows는 처리된 순서 — Older > Middle > Newer
    const names = result.rows.map((r) => r.companyName);
    expect(names[0]).toBe('Older');
    expect(names[1]).toBe('Middle');
    expect(names[2]).toBe('Newer');
  });

  it('T-26: rows 필드 구조 — 6개 필드 모두 채워짐', async () => {
    const db = createInMemoryDb();
    const c = insertClient(db, { companyName: 'RowCo', lastContactDate: '2026-04-12' });
    seedOutboundTouchpoint(db, c.id, 3);
    writePipelineFile([
      { id: 'row', companyName: 'RowCo', stage: 'LEAD', emailThreadId: 'THREAD_ROW' },
    ]);
    const deps = createDeps(db, {
      gmailReadThreadTool: makeGmailReadThreadTool([SAMPLE_OUTBOUND_PROPOSAL]),
      getAllCompanyNames: () => ['RowCo'],
    });

    const result = (await runWorkflowC(deps)) as WorkflowCBatchResult;

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.companyName).toBe('RowCo');
    expect(row.lastOutboundAt).toBe('2026-04-12');
    expect(row.elapsedDays).not.toBeNull();
    expect(row.nextCadence).toMatch(/Day\s+3/);
    expect(row.draftId).toBe('draft_c1');
    expect(row.status).toBe('success');
  });
});

// ════════════════════════════════════════════════════════════
// D-01 정적 검사 — 주기 실행 API 금지 (Task 2)
// ════════════════════════════════════════════════════════════

describe('runWorkflowC — D-01 no-scheduler regression', () => {
  it('T-27: workflow-c.ts 에 주기 실행 API 단어 부재', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/workflow/workflow-c.ts'),
      'utf-8',
    ).toLowerCase();

    // 하이픈/결합 우회 표기로 테스트 파일 자체는 검출 회피
    const forbidden = [
      'c' + 'ron',
      'set' + 'interval',
      'set' + 'timeout',
      'bull' + 'mq',
      'node-' + 'schedule',
      'agen' + 'da',
    ];
    for (const kw of forbidden) {
      expect(source).not.toContain(kw);
    }
  });
});
