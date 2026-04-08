/**
 * Email Composition Module - Prompt Builder + Fixed HTML Block Combination.
 *
 * Per D-04, D-05, D-06, D-07, EMAIL-01:
 * - buildEmailPrompt: Constructs system prompt + user message for AI email generation
 * - composeEmail: Combines AI-generated body with fixed HTML blocks (signature, links)
 *
 * This module does NOT call the AI directly. It prepares the prompt and assembles
 * the final email draft. AI invocation happens in the workflow orchestrator (Plan 05).
 *
 * @module compose
 */

import type { ClassificationResult } from '../types/classification.js';
import type { MarketResearchResult } from '../types/research.js';
import type { EmailDraft } from '../types/email.js';
import type { Client, ServiceRecommendation } from '../db/schema.js';
import {
  EMAIL_SIGNATURE_HTML,
  INTRO_LINKS_HTML,
  MANDATORY_CC,
  generateSubject,
} from './quality-checker.js';

// ─── Types ──────────────────────────────────────────────

export interface BuildEmailPromptParams {
  classification: ClassificationResult;
  research?: MarketResearchResult;
  client?: Client;
  recommendations?: ServiceRecommendation[];
  inquiryContext: string;
  promptSections: string;
}

export interface EmailPromptResult {
  systemPrompt: string;
  userMessage: string;
}

export interface ComposeEmailParams {
  classification: ClassificationResult;
  research?: MarketResearchResult;
  client?: Client;
  recommendations?: ServiceRecommendation[];
  inquiryContext: string;
  promptSections: string;
  aiGeneratedBody: string;
  companyName: string;
  recipientEmail: string;
  threadId?: string;
  contentSummary?: string;
}

// ─── Prompt Builder ─────────────────────────────────────

/**
 * Build the system prompt + user message for AI email generation.
 *
 * systemPrompt: v4 ULTRA selected sections (passed through as-is)
 * userMessage: Structured context combining classification, research,
 *              recommendations, and inquiry details.
 *
 * @param params - Classification, research, client, recommendations, inquiry, and prompt sections
 * @returns { systemPrompt, userMessage } ready for AI invocation
 */
export function buildEmailPrompt(params: BuildEmailPromptParams): EmailPromptResult {
  const { classification, research, client, recommendations, inquiryContext, promptSections } = params;

  // System prompt: v4 ULTRA sections as-is
  const systemPrompt = promptSections;

  // Derive company name from client or research
  const companyName = client?.companyName ?? research?.companyName ?? 'N/A';
  const contactName = client?.contactName ?? 'N/A';
  const industry = classification.industry ?? client?.industry ?? 'N/A';

  // Build structured user message
  const sections: string[] = [];

  // Request context
  sections.push(`## 작성 요청
상대방: ${companyName}
담당자: ${contactName}
업종: ${industry}
전략: ${classification.strategy}
톤 레벨: ${classification.toneLevel}`);

  // Inquiry content
  sections.push(`## 문의 내용
${inquiryContext}`);

  // Market research results
  if (research) {
    const researchLines: string[] = [
      `## 시장조사 결과`,
      `회사명: ${research.companyName}`,
      `실존 확인: ${research.verified ? '확인됨' : '미확인'}`,
    ];
    if (research.industry) researchLines.push(`업종: ${research.industry}`);
    if (research.mainProducts.length > 0) {
      researchLines.push(`주요 상품: ${research.mainProducts.join(', ')}`);
    }
    if (research.companySize) researchLines.push(`규모: ${research.companySize}`);
    if (research.websiteUrl) researchLines.push(`웹사이트: ${research.websiteUrl}`);

    // Marketing activity
    const marketing = research.marketingActivity;
    const marketingEntries: string[] = [];
    if (marketing.instagram) marketingEntries.push(`인스타그램: ${marketing.instagram}`);
    if (marketing.blog) marketingEntries.push(`블로그: ${marketing.blog}`);
    if (marketing.youtube) marketingEntries.push(`유튜브: ${marketing.youtube}`);
    if (marketing.advertising) marketingEntries.push(`광고: ${marketing.advertising}`);
    if (marketing.other) marketingEntries.push(`기타: ${marketing.other}`);
    if (marketingEntries.length > 0) {
      researchLines.push(`마케팅 현황: ${marketingEntries.join(' / ')}`);
    }

    if (research.recentNews && research.recentNews.length > 0) {
      researchLines.push(`최근 뉴스: ${research.recentNews.join(', ')}`);
    }

    sections.push(researchLines.join('\n'));
  } else {
    sections.push(`## 시장조사 결과\n시장조사 미실시`);
  }

  // Service recommendations
  if (recommendations && recommendations.length > 0) {
    const recLines = recommendations.map(
      (r) => `- ${r.serviceName}: ${r.salesMent ?? '추천'}`
    );
    sections.push(`## 서비스 추천\n${recLines.join('\n')}`);
  }

  // Writing rules
  sections.push(`## 작성 규칙
- 구조화 기호: ■●★◎※ 만 사용 (└→─│ 절대 금지)
- 서명은 별도 추가됨 (본문에 포함 금지)
- 소개 자료 링크는 별도 추가됨 (본문에 포함 금지)
- HTML 형식으로 작성 (<p>, <br> 태그 사용)`);

  const userMessage = sections.join('\n\n');

  return { systemPrompt, userMessage };
}

// ─── Email Composer ─────────────────────────────────────

/**
 * Compose the final EmailDraft by combining AI-generated body with fixed HTML blocks.
 *
 * Fixed blocks appended (per D-06, D-07):
 * - INTRO_LINKS_HTML: Only for strategy 'A' (new inquiry)
 * - EMAIL_SIGNATURE_HTML: Always appended
 *
 * CC is always set to MANDATORY_CC (PM@puzl.co.kr, leader@puzl.co.kr).
 *
 * @param params - AI output body + composition context
 * @returns Complete EmailDraft ready for draft-creator
 */
export function composeEmail(params: ComposeEmailParams): EmailDraft {
  const {
    classification,
    aiGeneratedBody,
    companyName,
    recipientEmail,
    threadId,
    contentSummary,
  } = params;

  // Build HTML body: AI body + fixed blocks
  let htmlBody = aiGeneratedBody;

  // Append intro links for strategy A (new inquiry) per D-07
  if (classification.strategy === 'A') {
    htmlBody += INTRO_LINKS_HTML;
  }

  // Always append signature per D-07
  htmlBody += EMAIL_SIGNATURE_HTML;

  // Generate subject line per SECTION 8 format
  const subject = generateSubject(
    classification.strategy,
    companyName,
    contentSummary ?? '문의 회신',
  );

  return {
    subject,
    htmlBody,
    to: recipientEmail,
    cc: [...MANDATORY_CC],
    threadId,
  };
}
