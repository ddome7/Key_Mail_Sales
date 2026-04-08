/**
 * Gmail MCP Draft Creator - Creates Gmail drafts via MCP tool injection.
 *
 * Per D-06, D-08, D-10, D-12, EMAIL-08, EMAIL-09, APPR-01, APPR-02:
 * - createDraft: Sanitizes HTML, enforces CC, creates Gmail draft
 * - createRevisionDraft: Creates new draft preserving original draftId (no overwrite)
 *
 * Uses DI pattern: gmailTool is injected as a function parameter for testability.
 * In production, this wraps the Claude Code environment's gmail_create_draft MCP tool.
 *
 * Security (T-02-10, T-02-11, T-02-12):
 * - MANDATORY_CC always enforced (PM/leader CC for oversight)
 * - sanitizeForGmail called internally (cannot be bypassed)
 * - previousDraftId tracked for audit trail on revisions
 *
 * @module draft-creator
 */

import type { EmailDraft } from '../types/email.js';
import { sanitizeForGmail } from '../safety/gmail-sanitizer.js';
import { MANDATORY_CC } from './quality-checker.js';

// ─── Types ──────────────────────────────────────────────

export interface GmailDraftParams {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  isHtml: boolean;
  threadId?: string;
}

export interface GmailDraftResult {
  id: string;
  threadId?: string;
}

/**
 * Gmail tool function type.
 * Injected via DI for testability.
 * In production, wraps the gmail_create_draft MCP tool.
 */
export type GmailToolFn = (params: GmailDraftParams) => Promise<GmailDraftResult>;

export interface CreateDraftResult {
  draftId: string;
  threadId?: string;
}

export interface CreateRevisionDraftResult {
  draftId: string;
  previousDraftId: string;
}

// ─── Draft Creator ──────────────────────────────────────

/**
 * Create a Gmail draft via the injected Gmail MCP tool.
 *
 * Internally applies:
 * 1. sanitizeForGmail() on HTML body (T-02-12: cannot be bypassed)
 * 2. MANDATORY_CC merge (T-02-10: PM/leader always CC'd)
 * 3. threadId passthrough for reply threading (D-08)
 *
 * @param draft - Email draft to create
 * @param gmailTool - Gmail MCP tool function (DI)
 * @returns { draftId, threadId } from Gmail API
 */
export async function createDraft(
  draft: EmailDraft,
  gmailTool: GmailToolFn,
): Promise<CreateDraftResult> {
  // T-02-12: Sanitize HTML (forced, cannot be bypassed)
  const sanitizedHtml = sanitizeForGmail(draft.htmlBody);

  // T-02-10: Merge CC with MANDATORY_CC (deduplicated)
  const mergedCc = mergeCc(draft.cc, MANDATORY_CC);

  // Build Gmail MCP params
  const params: GmailDraftParams = {
    to: [draft.to],
    cc: mergedCc,
    subject: draft.subject,
    body: sanitizedHtml,
    isHtml: true,
    threadId: draft.threadId, // undefined = new thread (D-08)
  };

  const result = await gmailTool(params);

  return {
    draftId: result.id,
    threadId: result.threadId,
  };
}

// ─── Revision Draft Creator ─────────────────────────────

/**
 * Create a revision draft without overwriting the original.
 *
 * Per D-12: When the CEO requests changes, a NEW draft is created.
 * The original draft is preserved (not deleted or modified).
 * T-02-11: previousDraftId is recorded for audit trail.
 *
 * @param originalDraftId - ID of the original draft being revised
 * @param revisedDraft - The revised email draft
 * @param gmailTool - Gmail MCP tool function (DI)
 * @returns { draftId (new), previousDraftId (original) }
 */
export async function createRevisionDraft(
  originalDraftId: string,
  revisedDraft: EmailDraft,
  gmailTool: GmailToolFn,
): Promise<CreateRevisionDraftResult> {
  // Create a new draft (does not touch original)
  const newResult = await createDraft(revisedDraft, gmailTool);

  return {
    draftId: newResult.draftId,
    previousDraftId: originalDraftId,
  };
}

// ─── Helpers ────────────────────────────────────────────

/**
 * Merge input CC with mandatory CC, removing duplicates.
 * Case-sensitive comparison (email addresses are case-insensitive per RFC,
 * but we keep our known mandatory CCs as canonical).
 */
function mergeCc(inputCc: string[], mandatoryCc: string[]): string[] {
  const ccSet = new Set<string>(mandatoryCc);
  for (const cc of inputCc) {
    ccSet.add(cc);
  }
  return [...ccSet];
}
