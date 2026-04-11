/**
 * Workflow B Orchestrator Tests (Phase 3 Plan 05)
 *
 * 전체 통화 후속 이메일 파이프라인 통합 테스트 — 모든 외부 의존성은 mock.
 *
 * 시나리오:
 *  1. 성공 경로 — 기존 스레드 있음 (Re: subject 보존)
 *  2. 성공 경로 — 기존 스레드 없음 (threadId=undefined)
 *  3. 파싱 실패 → skipped + 커서 전진
 *  4. 매칭 cancel → cancelled + 커서 갱신 안 함
 *  5. 교차 오염 차단 → error + 커서 갱신 안 함
 *  6. 품질 체크 실패 → error + 커서 갱신 안 함
 *  7. assertAllowedChannel 작동 (변조된 커서)
 *  8. 여러 메시지 순차 처리
 *  9. maxMessages option 준수
 * 10. D-06 자동 폴링 금지 정적 검사
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { runWorkflowB } from './workflow-b.js';
import type {
  WorkflowBDependencies,
  SlackToolFn,
  SlackMessage,
} from './workflow-b.js';
import type { GmailToolFn } from './draft-creator.js';
import type { GmailReadThreadFn, ThreadMessage } from './thread-loader.js';
import type { AnthropicToolFn } from './call-analyzer.js';
import type { CallAnalysisResult } from './call-analyzer.js';
import type { Client } from '../db/schema.js';
import {
  IXIO_SAMPLE_PATTERN_1,
  IXIO_SAMPLE_PATTERN_2,
} from '../../tests/fixtures/ixio-samples.js';
import { ALLOWED_CHANNEL_ID } from '../state/slack-cursor.js';

// ─── 테스트용 픽스처 ─────────────────────────────────────

const TEST_CURSOR_PATH = resolve(
  process.cwd(),
  'state',
  'test-slack-cursor-workflow-b.json',
);
const TEST_PIPELINE_PATH = resolve(
  process.cwd(),
  'state',
  'test-pipeline-workflow-b.json',
);

function writeCursorFile(overrides: {
  lastReadTs?: string;
  channelId?: string;
}) {
  const cursor = {
    version: 1 as const,
    lastReadTs: overrides.lastReadTs ?? '0',
    lastReadAt: new Date(0).toISOString(),
    channelId: overrides.channelId ?? ALLOWED_CHANNEL_ID,
  };
  const dir = dirname(TEST_CURSOR_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TEST_CURSOR_PATH, JSON.stringify(cursor, null, 2));
}

function readCursorFile(): { lastReadTs: string; channelId: string } {
  const raw = readFileSync(TEST_CURSOR_PATH, 'utf-8');
  return JSON.parse(raw);
}

function cleanupTestFiles() {
  for (const p of [TEST_CURSOR_PATH, TEST_PIPELINE_PATH]) {
    if (existsSync(p)) {
      try {
        rmSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 42,
    companyName: '동반성장위원회',
    contactName: '이의선',
    contactEmail: 'iuiseon@example.com',
    contactPhone: '01036906867',
    industry: '공공기관',
    budgetTier: 3,
    budgetPattern: null,
    preferredServices: null,
    communicationStyle: null,
    notes: null,
    stage: 'PROSPECT',
    history: null,
    nextOpportunity: null,
    lastContactDate: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as Client;
}

function makeAnalysis(
  overrides: Partial<CallAnalysisResult> = {},
): CallAnalysisResult {
  return {
    summary: '동반성장위원회 이의선 위원과 콘텐츠 제작 논의. 3천만원 규모 수의계약 검토.',
    actionItems: [
      {
        who: '대표님',
        what: '견적서 송부',
        dueDate: '2026-04-30T18:00:00+09:00',
      },
      { who: '상대방', what: '내부 결재 확인', dueDate: null },
    ],
    sentiment: {
      tone: 'positive',
      temperature: 'warm',
      rationale: '구체적 금액과 일정 언급',
    },
    extractedCompanyName: '동반성장위원회',
    extractedContactName: '이의선',
    nextContactSuggestion: 'D+2 견적서 이메일',
    ...overrides,
  };
}

function makeAnalyzeToolReturning(
  result: CallAnalysisResult,
): AnthropicToolFn {
  return vi.fn().mockResolvedValue({
    content: [
      {
        type: 'tool_use',
        name: 'record_call_analysis',
        input: result,
      },
    ],
  }) as unknown as AnthropicToolFn;
}

function makeSlackTool(messages: SlackMessage[]): SlackToolFn {
  return vi.fn().mockResolvedValue(messages) as unknown as SlackToolFn;
}

function makeGmailTool(
  result: { id: string; threadId?: string } = {
    id: 'draft_xyz',
    threadId: 'THREAD_NEW',
  },
): GmailToolFn {
  return vi.fn().mockResolvedValue(result) as unknown as GmailToolFn;
}

function makeGmailReadThreadTool(
  messages: ThreadMessage[],
): GmailReadThreadFn {
  return vi.fn().mockResolvedValue(messages) as unknown as GmailReadThreadFn;
}

function createDeps(
  overrides: Partial<WorkflowBDependencies> = {},
): WorkflowBDependencies {
  const client = makeClient();

  const clientQueries = {
    getClient: vi.fn().mockReturnValue(client),
    getClientById: vi.fn().mockReturnValue(client),
    getClientByPhone: vi.fn().mockReturnValue(client),
    getClientByEmail: vi.fn().mockReturnValue(undefined),
    upsertClient: vi.fn(),
    updateClientField: vi.fn(),
    savePhoneLearning: vi.fn(),
    getAllCompanyNames: vi.fn().mockReturnValue(['동반성장위원회']),
  } as any;

  const serviceQueries = {
    getServiceByName: vi.fn().mockReturnValue(undefined),
    getServicePrice: vi.fn().mockReturnValue(undefined),
    getRecommendationsByTier: vi.fn().mockReturnValue([]),
    getRecommendationsByTierAndIndustry: vi.fn().mockReturnValue([]),
  } as any;

  const briefingQueries = {
    saveBriefing: vi.fn().mockReturnValue({ id: 1 }),
    getBriefingBySlackTs: vi.fn().mockReturnValue(undefined),
    getBriefingsByClient: vi.fn().mockReturnValue([]),
  } as any;

  const touchpointQueries = {
    createTouchpoint: vi.fn().mockReturnValue({ id: 1 }),
    getTimelineByClient: vi.fn().mockReturnValue([]),
  } as any;

  return {
    clientQueries,
    serviceQueries,
    briefingQueries,
    touchpointQueries,
    gmailTool: makeGmailTool(),
    slackTool: makeSlackTool([]),
    anthropicTool: makeAnalyzeToolReturning(makeAnalysis()),
    gmailReadThreadTool: makeGmailReadThreadTool([]),
    askCeoConfirmation: vi.fn().mockResolvedValue({ action: 'cancel' }),
    getAllCompanyNames: () => ['동반성장위원회'],
    slackCursorPath: TEST_CURSOR_PATH,
    pipelinePath: TEST_PIPELINE_PATH,
    ultraPath: undefined,
    generateFollowUpBody: vi
      .fn()
      .mockResolvedValue(
        '<p>안녕하세요.</p><p>통화에서 논의한 내용을 정리하여 감사합니다. 문의주시면 안내 도와드리겠습니다.</p>',
      ),
    ...overrides,
  };
}

// ─── 테스트 시작 ─────────────────────────────────────────

beforeEach(() => {
  cleanupTestFiles();
  writeCursorFile({ lastReadTs: '0' });
});

afterEach(() => {
  cleanupTestFiles();
});

describe('runWorkflowB — 성공 경로', () => {
  it('시나리오 1: 기존 스레드 있음 → 브리핑/터치포인트 2건 기록, threadId 보존, Re: subject', async () => {
    const deps = createDeps();

    deps.slackTool = makeSlackTool([
      { ts: '1712000000.000001', text: IXIO_SAMPLE_PATTERN_1 },
    ]);

    // 기존 딜 파일 생성 (emailThreadId 포함)
    const dealsFile = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      deals: [
        {
          id: 'deal-1',
          companyName: '동반성장위원회',
          stage: 'PROSPECT',
          lastActionDate: '2026-04-01',
          emailThreadId: 'THREAD123',
        },
      ],
    };
    const dir = dirname(TEST_PIPELINE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(TEST_PIPELINE_PATH, JSON.stringify(dealsFile, null, 2));

    const threadMessages: ThreadMessage[] = [
      {
        messageId: 'msg1',
        from: '이의선 <iuiseon@example.com>',
        to: 'cyr@puzl.co.kr',
        subject: '[퍼즐/최영록] 동반성장위원회 _ 콘텐츠 제작 _ 260401',
        body: '안녕하세요, 문의드립니다.',
        internalDate: '1712000000000',
      },
    ];
    deps.gmailReadThreadTool = makeGmailReadThreadTool(threadMessages);

    const gmailMock = vi
      .fn()
      .mockResolvedValue({ id: 'D1', threadId: 'THREAD123' });
    deps.gmailTool = gmailMock as any;

    const result = await runWorkflowB(deps);

    // 결과 검증
    expect(result.processed).toBe(1);
    expect(result.results[0].status).toBe('success');
    if (result.results[0].status === 'success') {
      expect(result.results[0].draftId).toBe('D1');
      expect(result.results[0].clientName).toBe('동반성장위원회');
    }

    // briefings 저장 1회
    expect(deps.briefingQueries.saveBriefing).toHaveBeenCalledOnce();
    const briefingCall = (deps.briefingQueries.saveBriefing as any).mock
      .calls[0][0];
    expect(briefingCall.clientId).toBe(42);
    expect(briefingCall.slackTs).toBe('1712000000.000001');
    expect(briefingCall.source).toBe('ixio');
    expect(briefingCall.summary).toContain('동반성장위원회');

    // touchpoints: call + email = 2건
    expect(deps.touchpointQueries.createTouchpoint).toHaveBeenCalledTimes(2);
    const tpCalls = (deps.touchpointQueries.createTouchpoint as any).mock.calls;
    expect(tpCalls[0][0].type).toBe('call');
    expect(tpCalls[0][0].sourceId).toBe('1712000000.000001');
    expect(tpCalls[1][0].type).toBe('email');
    expect(tpCalls[1][0].metadata.isReply).toBe(true);

    // createDraft가 THREAD123으로 호출됨 (Pitfall 4 — 기존 스레드 유지)
    expect(gmailMock).toHaveBeenCalledOnce();
    const gmailArgs = gmailMock.mock.calls[0][0];
    expect(gmailArgs.threadId).toBe('THREAD123');
    // subject는 Re: 접두사가 붙어야 함 (원본 subject 기반)
    expect(gmailArgs.subject).toMatch(/^Re: /);
    expect(gmailArgs.subject).toContain('콘텐츠 제작');

    // 커서 전진 (성공)
    const cursor = readCursorFile();
    expect(cursor.lastReadTs).toBe('1712000000.000001');
  });

  it('시나리오 2: 기존 스레드 없음 → threadId=undefined, 신규 subject', async () => {
    const deps = createDeps();

    deps.slackTool = makeSlackTool([
      { ts: '1712000001.000001', text: IXIO_SAMPLE_PATTERN_1 },
    ]);

    // pipeline 파일 없음 → getDealByCompany가 undefined 반환
    deps.gmailReadThreadTool = makeGmailReadThreadTool([]);

    const gmailMock = vi
      .fn()
      .mockResolvedValue({ id: 'D2', threadId: 'NEW_THREAD' });
    deps.gmailTool = gmailMock as any;

    const result = await runWorkflowB(deps);

    expect(result.results[0].status).toBe('success');

    // createDraft 호출 시 threadId === undefined (빈 문자열 금지)
    const gmailArgs = gmailMock.mock.calls[0][0];
    expect(gmailArgs.threadId).toBeUndefined();

    // subject는 신규 — [퍼즐/최영록] 프리픽스
    expect(gmailArgs.subject).toMatch(/^\[퍼즐\/최영록\]/);
    expect(gmailArgs.subject).toContain('통화 후속');
  });
});

describe('runWorkflowB — 파싱/매칭/안전 게이트', () => {
  it('시나리오 3: 익시오 형식이 아닌 메시지 → skipped + 커서 전진', async () => {
    const deps = createDeps();
    deps.slackTool = makeSlackTool([
      { ts: '1712000002.000001', text: '그냥 일반 텍스트 메시지입니다.' },
    ]);

    const result = await runWorkflowB(deps);

    expect(result.results[0].status).toBe('skipped');
    // 이후 단계 호출 없음
    expect(deps.anthropicTool).not.toHaveBeenCalled();
    expect(deps.briefingQueries.saveBriefing).not.toHaveBeenCalled();
    expect(deps.touchpointQueries.createTouchpoint).not.toHaveBeenCalled();
    expect(deps.gmailTool).not.toHaveBeenCalled();
    // 커서 전진 (재처리 무가치)
    expect(readCursorFile().lastReadTs).toBe('1712000002.000001');
  });

  it('시나리오 4: matchClient cancel → cancelled + 커서 갱신 안 함', async () => {
    const deps = createDeps();

    // clientQueries를 비워서 Step 1, 2 모두 매칭 실패하도록 구성
    deps.clientQueries.getClientByPhone = vi.fn().mockReturnValue(undefined);
    deps.clientQueries.getClient = vi.fn().mockReturnValue(undefined);
    deps.clientQueries.getAllCompanyNames = vi.fn().mockReturnValue([]);
    deps.askCeoConfirmation = vi
      .fn()
      .mockResolvedValue({ action: 'cancel' }) as any;

    deps.slackTool = makeSlackTool([
      { ts: '1712000003.000001', text: IXIO_SAMPLE_PATTERN_2 },
    ]);

    const result = await runWorkflowB(deps);

    expect(result.results[0].status).toBe('cancelled');
    expect(deps.briefingQueries.saveBriefing).not.toHaveBeenCalled();
    expect(deps.touchpointQueries.createTouchpoint).not.toHaveBeenCalled();
    expect(deps.gmailTool).not.toHaveBeenCalled();
    // 커서 갱신 X — 여전히 초기값 '0'
    expect(readCursorFile().lastReadTs).toBe('0');
  });

  it('시나리오 5: 교차 오염 감지 → error + 커서 갱신 안 함', async () => {
    const deps = createDeps();

    deps.slackTool = makeSlackTool([
      { ts: '1712000004.000001', text: IXIO_SAMPLE_PATTERN_1 },
    ]);

    // getAllCompanyNames에 다른 회사 추가 → AI 본문이 그 이름을 언급하면 차단
    deps.getAllCompanyNames = () => ['동반성장위원회', '경쟁사A'];

    // AI 본문에 '경쟁사A' 포함 → contamination
    deps.generateFollowUpBody = vi
      .fn()
      .mockResolvedValue(
        '<p>안녕하세요. 경쟁사A 경험과 비교하여 진행하겠습니다. 감사합니다. 문의주시면 안내 도와드리겠습니다.</p>',
      );

    const result = await runWorkflowB(deps);

    expect(result.results[0].status).toBe('error');
    if (result.results[0].status === 'error') {
      expect(result.results[0].error).toContain('교차 오염');
    }
    // createDraft 호출 안 됨
    expect(deps.gmailTool).not.toHaveBeenCalled();
    // briefings와 touchpoints(call)은 저장됨 (Step 5가 이미 실행됨)
    expect(deps.briefingQueries.saveBriefing).toHaveBeenCalledOnce();
    expect(deps.touchpointQueries.createTouchpoint).toHaveBeenCalledTimes(1); // call만, email 없음
    // 커서 갱신 X
    expect(readCursorFile().lastReadTs).toBe('0');
  });

  it('시나리오 6: 품질 체크 실패 → error + 커서 갱신 안 함', async () => {
    const deps = createDeps();

    deps.slackTool = makeSlackTool([
      { ts: '1712000005.000001', text: IXIO_SAMPLE_PATTERN_1 },
    ]);

    // 품질 체크에서 greeting(안녕하세요) 누락 → failures
    deps.generateFollowUpBody = vi
      .fn()
      .mockResolvedValue('<p>본문만 있고 인사도 감사 인사도 없음</p>');

    const result = await runWorkflowB(deps);

    expect(result.results[0].status).toBe('error');
    if (result.results[0].status === 'error') {
      expect(result.results[0].error).toContain('품질 실패');
    }
    expect(deps.gmailTool).not.toHaveBeenCalled();
    expect(readCursorFile().lastReadTs).toBe('0');
  });
});

describe('runWorkflowB — 채널 화이트리스트 & 소스 순회', () => {
  it('시나리오 7: 변조된 채널 ID → assertAllowedChannel throw', async () => {
    writeCursorFile({ channelId: 'C_HACKED' });
    const deps = createDeps();
    deps.slackTool = makeSlackTool([]);

    await expect(runWorkflowB(deps)).rejects.toThrow(/금지된 채널 접근/);
    // Slack MCP는 호출조차 되지 않아야 함
    expect(deps.slackTool).not.toHaveBeenCalled();
  });

  it('시나리오 8: 여러 메시지 순차 처리 — 중간 실패가 다른 메시지를 막지 않음', async () => {
    const deps = createDeps();

    deps.slackTool = makeSlackTool([
      { ts: '1712000010.000001', text: IXIO_SAMPLE_PATTERN_1 }, // 성공
      { ts: '1712000011.000001', text: '일반 텍스트' }, // skipped
      { ts: '1712000012.000001', text: IXIO_SAMPLE_PATTERN_2 }, // 성공
    ]);

    const result = await runWorkflowB(deps);

    expect(result.processed).toBe(3);
    expect(result.results[0].status).toBe('success');
    expect(result.results[1].status).toBe('skipped');
    expect(result.results[2].status).toBe('success');
    // 3건 성공적으로 순차 처리되어 커서는 마지막 ts로 전진
    expect(readCursorFile().lastReadTs).toBe('1712000012.000001');
  });

  it('시나리오 9: maxMessages option 준수', async () => {
    const deps = createDeps();
    const slackMock = vi.fn().mockResolvedValue([]);
    deps.slackTool = slackMock as any;

    await runWorkflowB(deps, { maxMessages: 5 });

    expect(slackMock).toHaveBeenCalledOnce();
    const args = slackMock.mock.calls[0][0];
    expect(args.limit).toBe(5);
    expect(args.channel).toBe(ALLOWED_CHANNEL_ID);
  });
});

describe('runWorkflowB — D-06 자동 폴링 금지 정적 검사', () => {
  it('시나리오 10: workflow-b.ts 소스에 타이머/스케줄러 API 호출 없음', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/workflow/workflow-b.ts'),
      'utf-8',
    );

    // 금지 패턴 — 코드 본문이든 주석이든 상관없이 전부 부재해야 함.
    // setI + nterval, setT + imeout 토큰 조합도 차단.
    const forbidden = [
      /\bset\s*Interval\b/,
      /\bset\s*Timeout\b/,
      /\bnode-cron\b/,
      /\bcron\b/,
      /\bschedule\s*\(/,
      /\bbull(mq)?\b/i,
    ];
    for (const pattern of forbidden) {
      expect(source).not.toMatch(pattern);
    }
  });
});
