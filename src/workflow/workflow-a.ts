/**
 * Workflow A Orchestrator - New Inquiry -> First Contact Email (End-to-End Pipeline)
 *
 * 9-step pipeline per RESEARCH.md Pattern 4 and D-01~D-17:
 *   1. 분류 (classifyInquiry)
 *   2. 시장조사 (researchCompany)
 *   3. 클라이언트 확인/생성 (ensureClient)
 *   4. v4 ULTRA 섹션 로드 (loadSections + getSectionsForClassification)
 *   5. 서비스 추천 (getServiceRecommendation)
 *   6. 이메일 작성 (composeEmail)
 *   7. 안전 검사 3중 게이트 (contamination + prices + quality)
 *   8. Gmail 드래프트 생성 (createDraft)
 *   9. 파이프라인 업데이트 (addDeal)
 *
 * @module workflow-a
 */

import type { InquiryInput, WorkflowResult } from '../types/email.js';
import type { GmailToolFn } from './draft-creator.js';
import type { createClientQueries } from '../queries/clients.js';
import type { createServiceQueries } from '../queries/services.js';

import { classifyInquiry } from './classify.js';
import { getServiceRecommendation } from './classify.js';
import { researchCompany, ensureClient } from './research.js';
import { loadSections, getSectionsForClassification } from './prompt-loader.js';
import { composeEmail } from './compose.js';
import { validateNoContamination } from '../safety/cross-contamination.js';
import { validatePrices } from '../safety/price-validator.js';
import { validateQualityChecklist } from './quality-checker.js';
import { createDraft, createRevisionDraft } from './draft-creator.js';
import { addDeal, getDealByCompany } from '../state/pipeline.js';

// ─── Types ──────────────────────────────────────────────

export interface WorkflowDependencies {
  clientQueries: ReturnType<typeof createClientQueries>;
  serviceQueries: ReturnType<typeof createServiceQueries>;
  gmailTool: GmailToolFn;
  pipelinePath?: string;
  ultraPath?: string;
  /** Returns all known company names for cross-contamination check */
  getAllCompanyNames: () => string[];
}

/** Options for testing: inject AI-generated body instead of calling AI */
export interface WorkflowTestOptions {
  aiGeneratedBody?: string;
}

// ─── Main Workflow ──────────────────────────────────────

/**
 * Run Workflow A: New Inquiry -> First Contact Email (end-to-end).
 *
 * 9-step pipeline that takes a new inquiry and produces a Gmail draft.
 * Safety checks (contamination, pricing, quality) gate draft creation.
 *
 * @param input - Inquiry input from the CEO
 * @param deps - Injected dependencies (DI pattern)
 * @param testOptions - Optional: inject AI body for testing
 * @returns WorkflowResult with success/failure, draftId, warnings, errors
 */
export async function runWorkflowA(
  input: InquiryInput,
  deps: WorkflowDependencies,
  testOptions?: WorkflowTestOptions,
): Promise<WorkflowResult> {
  // ─── Step 1: 분류 (D-05) ─────────────────────────────
  const classification = classifyInquiry(
    input.emailBody,
    input.companyName,
    {
      getDealByCompanyFn: (name: string) =>
        getDealByCompany(name, deps.pipelinePath),
    },
  );

  // ─── Step 2: 시장조사 (D-01) ─────────────────────────
  const research = await researchCompany(input.companyName);

  // ─── Step 3: 클라이언트 확인/생성 (D-16, D-17) ───────
  const client = ensureClient(
    input.companyName,
    research,
    input.contactName,
    input.contactEmail,
    deps.clientQueries,
  );

  // ─── Step 4: v4 ULTRA 섹션 로드 (D-04) ───────────────
  const sectionIds = getSectionsForClassification(classification);
  let promptSections = '';
  try {
    promptSections = loadSections(sectionIds, deps.ultraPath);
  } catch {
    // If ultra file not found (e.g., in tests), use empty prompt
    promptSections = '';
  }

  // ─── Step 5: 서비스 추천 (D-15, OBJC-03) ─────────────
  const recommendations = getServiceRecommendation(
    client?.budgetTier ?? null,
    client?.industry ?? null,
    deps.serviceQueries,
  );

  // ─── Step 6: 이메일 작성 (EMAIL-01) ──────────────────
  // In production: AI generates the body. In tests: use injected body.
  const aiGeneratedBody = testOptions?.aiGeneratedBody ??
    '<p>안녕하세요.</p><p>감사합니다. 문의주시면 안내 도와드리겠습니다.</p>';

  const emailDraft = composeEmail({
    classification,
    research,
    client: client ?? undefined,
    recommendations,
    inquiryContext: input.emailBody,
    promptSections,
    aiGeneratedBody,
    companyName: input.companyName,
    recipientEmail: input.recipientEmail,
    threadId: input.threadId,
    contentSummary: '문의 회신',
  });

  // ─── Step 7: 안전 검사 3중 게이트 ────────────────────

  // 7a. 교차 오염 검증 (T-02-15)
  const allKnownCompanies = deps.getAllCompanyNames();
  const contaminationCheck = validateNoContamination(
    emailDraft.htmlBody,
    input.companyName,
    allKnownCompanies,
  );

  if (!contaminationCheck.safe) {
    return {
      success: false,
      errors: contaminationCheck.contaminations.map(
        (c) => `교차 오염 감지: ${c} 정보가 이메일에 포함되어 있습니다.`,
      ),
    };
  }

  // 7b. 가격 검증 (D-11, APPR-03)
  const priceCheck = validatePrices(emailDraft.htmlBody, deps.serviceQueries);
  const allWarnings: string[] = [
    ...priceCheck.mismatches,
    ...priceCheck.warnings,
  ];

  // 7c. 품질 체크리스트 (D-09)
  const qualityCheck = validateQualityChecklist(
    emailDraft.htmlBody,
    emailDraft.subject,
    classification,
  );

  if (!qualityCheck.passed) {
    return {
      success: false,
      errors: qualityCheck.failures,
      warnings: [...allWarnings, ...qualityCheck.warnings],
    };
  }

  // Collect quality warnings
  allWarnings.push(...qualityCheck.warnings);

  // ─── Step 8: Gmail 드래프트 생성 (D-10, APPR-01) ─────
  const draftResult = await createDraft(emailDraft, deps.gmailTool);

  // ─── Step 9: 파이프라인 업데이트 ─────────────────────
  try {
    addDeal(
      {
        companyName: input.companyName,
        contactName: input.contactName,
        stage: 'PROSPECT',
        lastActionDate: new Date().toISOString().split('T')[0],
        emailThreadId: draftResult.threadId,
      },
      deps.pipelinePath,
    );
  } catch {
    // Pipeline update failure is non-critical; log but don't fail
    allWarnings.push('파이프라인 업데이트 실패 (비치명적)');
  }

  return {
    success: true,
    draftId: draftResult.draftId,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}

// ─── Revision Flow ──────────────────────────────────────

/**
 * Handle a revision request from the CEO (D-12).
 *
 * Re-composes the email with revision instructions, runs safety checks,
 * and creates a new draft (preserving the original).
 *
 * @param originalDraftId - ID of the original draft being revised
 * @param revisionInstructions - CEO's revision instructions
 * @param originalInput - Original inquiry input
 * @param deps - Injected dependencies
 * @param testOptions - Optional: inject AI body for testing
 * @returns WorkflowResult with new draftId
 */
export async function handleRevisionRequest(
  originalDraftId: string,
  revisionInstructions: string,
  originalInput: InquiryInput,
  deps: WorkflowDependencies,
  testOptions?: WorkflowTestOptions,
): Promise<WorkflowResult> {
  // Re-classify with original input
  const classification = classifyInquiry(
    originalInput.emailBody,
    originalInput.companyName,
    {
      getDealByCompanyFn: (name: string) =>
        getDealByCompany(name, deps.pipelinePath),
    },
  );

  // Re-compose with revision instructions
  const sectionIds = getSectionsForClassification(classification);
  let promptSections = '';
  try {
    promptSections = loadSections(sectionIds, deps.ultraPath);
  } catch {
    promptSections = '';
  }

  const recommendations = getServiceRecommendation(
    null,
    null,
    deps.serviceQueries,
  );

  // In production: AI re-generates with revision instructions
  const aiGeneratedBody = testOptions?.aiGeneratedBody ??
    '<p>안녕하세요.</p><p>감사합니다. 문의주시면 안내 도와드리겠습니다.</p>';

  const revisedDraft = composeEmail({
    classification,
    inquiryContext: `${originalInput.emailBody}\n\n수정 요청: ${revisionInstructions}`,
    promptSections,
    aiGeneratedBody,
    companyName: originalInput.companyName,
    recipientEmail: originalInput.recipientEmail,
    threadId: originalInput.threadId,
    contentSummary: '문의 회신 (수정)',
  });

  // Run safety checks on revised draft
  const allKnownCompanies = deps.getAllCompanyNames();
  const contaminationCheck = validateNoContamination(
    revisedDraft.htmlBody,
    originalInput.companyName,
    allKnownCompanies,
  );

  if (!contaminationCheck.safe) {
    return {
      success: false,
      errors: contaminationCheck.contaminations.map(
        (c) => `교차 오염 감지: ${c} 정보가 이메일에 포함되어 있습니다.`,
      ),
    };
  }

  const priceCheck = validatePrices(revisedDraft.htmlBody, deps.serviceQueries);
  const allWarnings: string[] = [...priceCheck.mismatches, ...priceCheck.warnings];

  const qualityCheck = validateQualityChecklist(
    revisedDraft.htmlBody,
    revisedDraft.subject,
    classification,
  );

  if (!qualityCheck.passed) {
    return {
      success: false,
      errors: qualityCheck.failures,
      warnings: [...allWarnings, ...qualityCheck.warnings],
    };
  }

  allWarnings.push(...qualityCheck.warnings);

  // Create revision draft (preserves original)
  const revisionResult = await createRevisionDraft(
    originalDraftId,
    revisedDraft,
    deps.gmailTool,
  );

  return {
    success: true,
    draftId: revisionResult.draftId,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}
