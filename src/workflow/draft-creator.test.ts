/**
 * Tests for Gmail MCP draft creator module.
 * Uses mock gmailTool injection (DI pattern) for all tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { createDraft, createRevisionDraft, type GmailToolFn } from './draft-creator.js';
import type { EmailDraft } from '../types/email.js';

const baseDraft: EmailDraft = {
  subject: '[퍼즐/최영록] 테스트컴퍼니 _ 문의 회신 _ 260408',
  htmlBody: '<p>안녕하세요.</p><p>감사합니다.</p><br><p>감사합니다.</p><br><p>퍼즐코퍼레이션</p><p>최 영 록</p><p>드림.</p>',
  to: 'test@company.com',
  cc: ['PM@puzl.co.kr', 'leader@puzl.co.kr'],
};

function createMockGmailTool(returnId = 'draft_123', returnThreadId = 'thread_456'): GmailToolFn {
  return vi.fn().mockResolvedValue({ id: returnId, threadId: returnThreadId });
}

describe('createDraft', () => {
  it('sanitizes HTML before creating draft', async () => {
    const mockTool = createMockGmailTool();
    // Include unsafe char that should be sanitized
    const draftWithUnsafe: EmailDraft = {
      ...baseDraft,
      htmlBody: '<p>안녕하세요.</p><p>└ 이것은 위험 문자</p>',
    };

    await createDraft(draftWithUnsafe, mockTool);

    const callArgs = (mockTool as any).mock.calls[0][0];
    // └ should be replaced with -
    expect(callArgs.body).not.toContain('\u2514');
    expect(callArgs.body).toContain('- 이것은 위험 문자');
  });

  it('always includes MANDATORY_CC regardless of input', async () => {
    const mockTool = createMockGmailTool();
    const draftNoCC: EmailDraft = {
      ...baseDraft,
      cc: [], // Empty CC
    };

    await createDraft(draftNoCC, mockTool);

    const callArgs = (mockTool as any).mock.calls[0][0];
    expect(callArgs.cc).toContain('PM@puzl.co.kr');
    expect(callArgs.cc).toContain('leader@puzl.co.kr');
  });

  it('merges input CC with MANDATORY_CC without duplicates', async () => {
    const mockTool = createMockGmailTool();
    const draftExtraCC: EmailDraft = {
      ...baseDraft,
      cc: ['PM@puzl.co.kr', 'extra@company.com'],
    };

    await createDraft(draftExtraCC, mockTool);

    const callArgs = (mockTool as any).mock.calls[0][0];
    expect(callArgs.cc).toContain('PM@puzl.co.kr');
    expect(callArgs.cc).toContain('leader@puzl.co.kr');
    expect(callArgs.cc).toContain('extra@company.com');
    // No duplicates
    const pmCount = callArgs.cc.filter((c: string) => c === 'PM@puzl.co.kr').length;
    expect(pmCount).toBe(1);
  });

  it('passes threadId when provided (reply)', async () => {
    const mockTool = createMockGmailTool();
    const draftWithThread: EmailDraft = {
      ...baseDraft,
      threadId: 'existing_thread_789',
    };

    await createDraft(draftWithThread, mockTool);

    const callArgs = (mockTool as any).mock.calls[0][0];
    expect(callArgs.threadId).toBe('existing_thread_789');
  });

  it('omits threadId when undefined (new thread)', async () => {
    const mockTool = createMockGmailTool();
    const draftNoThread: EmailDraft = {
      ...baseDraft,
      threadId: undefined,
    };

    await createDraft(draftNoThread, mockTool);

    const callArgs = (mockTool as any).mock.calls[0][0];
    expect(callArgs.threadId).toBeUndefined();
  });
});

describe('createRevisionDraft', () => {
  it('creates a new draft (does not overwrite existing)', async () => {
    const mockTool = createMockGmailTool('new_draft_456');
    const revisedDraft: EmailDraft = {
      ...baseDraft,
      htmlBody: '<p>수정된 내용입니다.</p>',
    };

    const result = await createRevisionDraft('original_draft_123', revisedDraft, mockTool);

    expect(result.draftId).toBe('new_draft_456');
    expect(result.previousDraftId).toBe('original_draft_123');
    // Verify gmailTool was called (new draft created)
    expect(mockTool).toHaveBeenCalledTimes(1);
  });

  it('preserves original draftId in metadata', async () => {
    const mockTool = createMockGmailTool('revision_789');

    const result = await createRevisionDraft('orig_001', baseDraft, mockTool);

    expect(result.previousDraftId).toBe('orig_001');
    expect(result.draftId).toBe('revision_789');
  });
});
