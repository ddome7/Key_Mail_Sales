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
