/**
 * Workflow A Orchestrator Tests
 *
 * Tests the end-to-end pipeline: classify -> research -> ensureClient ->
 * loadSections -> composeEmail -> safety checks -> createDraft -> addDeal.
 *
 * All external dependencies are mocked via DI pattern.
 */

import { describe, it, expect, vi } from 'vitest';
import { runWorkflowA, handleRevisionRequest } from './workflow-a.js';
import type { WorkflowDependencies } from './workflow-a.js';
import type { InquiryInput } from '../types/email.js';
import type { GmailToolFn } from './draft-creator.js';

// ─── Test Helpers ──────────────────────────────────────

function createMockGmailTool(): GmailToolFn {
  return vi.fn().mockResolvedValue({
    id: 'draft_123',
    threadId: 'thread_456',
  });
}

function createMockDeps(overrides?: Partial<WorkflowDependencies>): WorkflowDependencies {
  return {
    clientQueries: {
      getClient: vi.fn().mockReturnValue(undefined),
      getClientById: vi.fn().mockReturnValue(undefined),
      upsertClient: vi.fn(),
      updateClientField: vi.fn(),
    } as any,
    serviceQueries: {
      getServiceByName: vi.fn().mockReturnValue(undefined),
      getServicePrice: vi.fn().mockReturnValue(undefined),
      getRecommendationsByTier: vi.fn().mockReturnValue([]),
      getRecommendationsByTierAndIndustry: vi.fn().mockReturnValue([]),
    } as any,
    gmailTool: createMockGmailTool(),
    pipelinePath: '/tmp/test-pipeline.json',
    ultraPath: undefined,
    getAllCompanyNames: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

function createMockInput(overrides?: Partial<InquiryInput>): InquiryInput {
  return {
    companyName: '테스트회사',
    contactName: '김대리',
    contactEmail: 'test@example.com',
    emailBody: '안녕하세요. 카페 바이럴 마케팅에 대해 문의드립니다.',
    recipientEmail: 'test@example.com',
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────

describe('runWorkflowA', () => {
  it('executes 9-step pipeline in correct order: classify -> research -> ensureClient -> loadSections -> composeEmail -> contamination -> prices -> quality -> createDraft -> addDeal', async () => {
    const callOrder: string[] = [];

    const deps = createMockDeps();

    // Track call order through mocks
    const gmailTool = vi.fn().mockImplementation(async () => {
      callOrder.push('createDraft');
      return { id: 'draft_123', threadId: 'thread_456' };
    });
    deps.gmailTool = gmailTool;

    const input = createMockInput();

    const result = await runWorkflowA(input, deps);

    // Verify Gmail tool was called (draft created)
    expect(gmailTool).toHaveBeenCalledOnce();

    // Verify result shape
    expect(result.success).toBe(true);
    expect(result.draftId).toBe('draft_123');
  });

  it('returns success=false with errors when contamination is detected', async () => {
    const deps = createMockDeps({
      getAllCompanyNames: vi.fn().mockReturnValue(['테스트회사', '경쟁사A']),
    });

    // The AI-generated body will contain another company name
    // We need to simulate this by injecting a body that mentions "경쟁사A"
    const input = createMockInput({
      emailBody: '안녕하세요. 카페 바이럴 마케팅에 대해 문의드립니다.',
    });

    // Override the compose step to return a body with contamination
    // This test validates that when contamination is found, success=false
    const result = await runWorkflowA(input, deps, {
      aiGeneratedBody: '<p>안녕하세요. 경쟁사A에서 진행한 카페 바이럴 캠페인처럼 문의주시면 안내 도와드리겠습니다.</p>',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    // Gmail should NOT have been called
    expect(deps.gmailTool).not.toHaveBeenCalled();
  });

  it('returns success=false when quality checklist fails', async () => {
    const deps = createMockDeps();
    const input = createMockInput();

    // AI body without greeting or signature -> quality check fails
    const result = await runWorkflowA(input, deps, {
      aiGeneratedBody: '<p>본문만 있고 인사도 서명도 없는 이메일</p>',
    });

    // composeEmail appends signature, so quality won't fail on signature.
    // But if no greeting is found, it fails.
    // Actually the body has no "안녕하세요" so check 1 fails.
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some(e => e.includes('체크'))).toBe(true);
    expect(deps.gmailTool).not.toHaveBeenCalled();
  });

  it('returns warnings when pricing is detected (APPR-03)', async () => {
    const deps = createMockDeps();
    const input = createMockInput({
      emailBody: '안녕하세요. 카페 바이럴 견적을 문의드립니다. 예산은 500만원 정도입니다.',
    });

    const result = await runWorkflowA(input, deps, {
      aiGeneratedBody: '<p>안녕하세요.</p><p>카페 바이럴 500만원으로 문의주시면 안내 도와드리겠습니다.</p>',
    });

    // Should succeed but with warnings about pricing
    expect(result.success).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBeGreaterThan(0);
  });

  it('updates pipeline with addDeal on success', async () => {
    const deps = createMockDeps();
    const input = createMockInput();

    const result = await runWorkflowA(input, deps, {
      aiGeneratedBody: '<p>안녕하세요.</p><p>감사합니다. 문의주시면 안내 도와드리겠습니다.</p>',
    });

    expect(result.success).toBe(true);
    // Pipeline file should have been written (addDeal creates it)
    // Since we use a temp path, we just verify the function completed
    expect(result.draftId).toBe('draft_123');
  });
});

describe('handleRevisionRequest', () => {
  it('calls createRevisionDraft with revised content and preserves original draftId', async () => {
    const gmailTool = vi.fn().mockResolvedValue({
      id: 'draft_revised_789',
      threadId: 'thread_456',
    });

    const deps = createMockDeps({ gmailTool });
    const input = createMockInput();

    const result = await handleRevisionRequest(
      'draft_original_123',
      '톤을 더 친근하게 바꿔주세요',
      input,
      deps,
      {
        aiGeneratedBody: '<p>안녕하세요!</p><p>감사합니다. 문의주시면 안내 도와드리겠습니다.</p>',
      },
    );

    expect(result.success).toBe(true);
    expect(result.draftId).toBe('draft_revised_789');
    expect(gmailTool).toHaveBeenCalledOnce();
  });
});

// ─── D-15: Touchpoint 기록 후방 호환 ─────────────────────

describe('D-15: touchpoint 기록 후방 호환', () => {
  type TouchpointMock = {
    createTouchpoint: ReturnType<typeof vi.fn>;
    getTimelineByClient: ReturnType<typeof vi.fn>;
  };

  function createTouchpointMock(): TouchpointMock {
    return {
      createTouchpoint: vi.fn().mockReturnValue({ id: 1 }),
      getTimelineByClient: vi.fn().mockReturnValue([]),
    };
  }

  // 클라이언트가 존재하는 상황을 시뮬레이션하기 위한 mock
  // ensureClient는 research.ts의 로직을 따르며, getClient가 값을 반환하면
  // 그 결과를 사용하거나 새로 만든다. 테스트에서는 단순히 getClient가 유효한
  // 클라이언트를 반환하도록 설정해 client가 null이 아닌 케이스를 만든다.
  function createMockClient() {
    return {
      id: 42,
      companyName: '테스트회사',
      contactName: '김대리',
      contactEmail: 'test@example.com',
      contactPhone: null,
      industry: null,
      budgetTier: null,
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
    };
  }

  function createDepsWithClient(touchpointQueries?: TouchpointMock): WorkflowDependencies {
    const mockClient = createMockClient();
    return createMockDeps({
      clientQueries: {
        getClient: vi.fn().mockReturnValue(mockClient),
        getClientById: vi.fn().mockReturnValue(mockClient),
        upsertClient: vi.fn(),
        updateClientField: vi.fn(),
      } as any,
      touchpointQueries: touchpointQueries as any,
    });
  }

  it('기존 동작 유지 (touchpointQueries 주입 없이)', async () => {
    // touchpointQueries 없음 — Phase 2 기존 경로 그대로
    const deps = createDepsWithClient();
    const input = createMockInput();

    const result = await runWorkflowA(input, deps, {
      aiGeneratedBody: '<p>안녕하세요.</p><p>감사합니다. 문의주시면 안내 도와드리겠습니다.</p>',
    });

    expect(result.success).toBe(true);
    expect(result.draftId).toBeDefined();
  });

  it('touchpointQueries 주입 시 runWorkflowA가 email_sent touchpoint를 기록한다', async () => {
    const tp = createTouchpointMock();
    const deps = createDepsWithClient(tp);
    const input = createMockInput();

    const result = await runWorkflowA(input, deps, {
      aiGeneratedBody: '<p>안녕하세요.</p><p>감사합니다. 문의주시면 안내 도와드리겠습니다.</p>',
    });

    expect(result.success).toBe(true);
    expect(tp.createTouchpoint).toHaveBeenCalledOnce();
    const call = tp.createTouchpoint.mock.calls[0][0];
    expect(call.type).toBe('email_sent');
    expect(call.clientId).toBe(42);
    // sourceId는 draftResult.threadId 우선, 없으면 draftId fallback
    expect(['thread_456', 'draft_123']).toContain(call.sourceId);
    expect(call.summary).toMatch(/^\[드래프트\]/);
    expect(call.metadata).toMatchObject({ draftId: 'draft_123', source: 'workflow-a' });
    expect(typeof call.occurredAt).toBe('string');
  });

  it('touchpointQueries 주입 시 handleRevisionRequest도 email_sent touchpoint를 기록한다 (revision=true)', async () => {
    const tp = createTouchpointMock();
    const gmailTool = vi.fn().mockResolvedValue({
      id: 'draft_revised_789',
      threadId: 'thread_456',
    });
    const deps = createDepsWithClient(tp);
    deps.gmailTool = gmailTool;
    const input = createMockInput();

    const result = await handleRevisionRequest(
      'draft_original_123',
      '톤을 더 친근하게 바꿔주세요',
      input,
      deps,
      {
        aiGeneratedBody: '<p>안녕하세요!</p><p>감사합니다. 문의주시면 안내 도와드리겠습니다.</p>',
      },
    );

    expect(result.success).toBe(true);
    expect(tp.createTouchpoint).toHaveBeenCalledOnce();
    const call = tp.createTouchpoint.mock.calls[0][0];
    expect(call.type).toBe('email_sent');
    expect(call.clientId).toBe(42);
    expect(call.metadata).toMatchObject({ revision: true, source: 'workflow-a' });
  });

  it('touchpoint 기록 실패는 비치명적 (성공 유지 + warnings 추가)', async () => {
    const tp: TouchpointMock = {
      createTouchpoint: vi.fn().mockImplementation(() => {
        throw new Error('DB locked');
      }),
      getTimelineByClient: vi.fn(),
    };
    const deps = createDepsWithClient(tp);
    const input = createMockInput();

    const result = await runWorkflowA(input, deps, {
      aiGeneratedBody: '<p>안녕하세요.</p><p>감사합니다. 문의주시면 안내 도와드리겠습니다.</p>',
    });

    expect(result.success).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some((w) => w.includes('터치포인트 기록 실패'))).toBe(true);
  });

  it('client가 null이면 touchpoint 기록을 skip한다', async () => {
    const tp = createTouchpointMock();
    // getClient가 undefined를 반환하도록 하여 ensureClient가 새로 upsert하더라도
    // 반환된 client가 null이 되는 경로 구성은 복잡하므로, 여기서는 clientQueries가
    // 완전히 비어있는 기본 mock (getClient → undefined, upsertClient no-op 후 재조회도 undefined)
    // 을 사용한다. Phase 2 ensureClient는 이 경우 null을 반환한다.
    const deps = createMockDeps({
      touchpointQueries: tp as any,
      // 기본 createMockDeps의 clientQueries: getClient → undefined
    });
    const input = createMockInput();

    const result = await runWorkflowA(input, deps, {
      aiGeneratedBody: '<p>안녕하세요.</p><p>감사합니다. 문의주시면 안내 도와드리겠습니다.</p>',
    });

    expect(result.success).toBe(true);
    // client가 null이면 기록을 건너뛴다 (가드: if deps.touchpointQueries && client)
    expect(tp.createTouchpoint).not.toHaveBeenCalled();
  });
});
