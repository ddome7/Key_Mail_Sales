/**
 * Market research pipeline for company investigation.
 *
 * Builds search queries, structures research results,
 * and auto-updates the client DB with findings.
 *
 * Per D-01, D-02, D-03, D-16, D-17 from CONTEXT.md.
 */

import type { MarketResearchResult } from '../types/research.js';
import type { ClientInput } from '../queries/clients.js';
import type { createClientQueries } from '../queries/clients.js';

/**
 * Build search queries for comprehensive Korean company research.
 * Generates 5 targeted queries covering: company info, business registration,
 * products/services, marketing activity, and recent news.
 *
 * @param companyName - The company to research
 * @param additionalContext - Optional hints (industry, region) appended to first query
 * @returns Array of search query strings
 */
export function buildSearchQueries(companyName: string, additionalContext?: string): string[] {
  const baseQueries = [
    // 1. 회사 기본 정보 (업종, 규모)
    `"${companyName}" 회사 소개${additionalContext ? ` ${additionalContext}` : ''}`,
    // 2. 실존 확인 (RSCH-02)
    `"${companyName}" 사업자등록`,
    // 3. 주요 상품/서비스 (RSCH-01)
    `"${companyName}" 제품 서비스`,
    // 4. 마케팅 활동 (RSCH-03)
    `"${companyName}" 인스타그램 OR 블로그 OR 유튜브 OR 마케팅`,
    // 5. 최근 뉴스/동향
    `"${companyName}" site:news.naver.com OR site:news.google.com`,
  ];

  return baseQueries;
}

/**
 * Convert MarketResearchResult to ClientInput for DB storage.
 * Maps research fields to client DB schema, sets initial stage to PROSPECT.
 *
 * Per RESEARCH.md Example 2 and D-17.
 *
 * @param research - Structured research result
 * @param contactName - Optional contact person name
 * @param contactEmail - Optional contact email
 * @returns ClientInput ready for upsertClient
 */
export function researchToClientInput(
  research: MarketResearchResult,
  contactName?: string,
  contactEmail?: string,
): ClientInput {
  return {
    companyName: research.companyName,
    contactName: contactName ?? null,
    contactEmail: contactEmail ?? null,
    contactPhone: null,
    industry: research.industry ?? null,
    history: null,
    budgetPattern: null,
    budgetTier: null,
    preferredServices: null,
    notes: research.rawNotes,
    nextOpportunity: null,
    communicationStyle: null,
    stage: 'PROSPECT',
    lastContactDate: new Date().toISOString().split('T')[0],
  };
}

/**
 * Ensure a client record exists in the DB for the researched company.
 * - If the company doesn't exist: creates a new client from research data (D-17)
 * - If the company exists: updates the notes field with latest research (D-16)
 *
 * Uses DI pattern: clientQueries is injected for testability.
 *
 * @param companyName - Company name to look up
 * @param research - Market research result
 * @param contactName - Optional contact person
 * @param contactEmail - Optional contact email
 * @param clientQueries - Injected client query functions
 * @returns The client record (existing or newly created)
 */
export function ensureClient(
  companyName: string,
  research: MarketResearchResult,
  contactName: string | undefined,
  contactEmail: string | undefined,
  clientQueries: ReturnType<typeof createClientQueries>,
) {
  const existing = clientQueries.getClient(companyName);

  if (existing) {
    // D-16: Update notes with latest research
    clientQueries.updateClientField(companyName, 'notes', research.rawNotes);
    return existing;
  }

  // D-17: Create new client from research data
  const input = researchToClientInput(research, contactName, contactEmail);
  clientQueries.upsertClient(input);
  return clientQueries.getClient(companyName);
}

/**
 * Research a company using web search and structure the results.
 *
 * This function builds search queries and provides the framework for
 * structuring search results into MarketResearchResult. The actual web
 * search is performed externally (Claude Code WebSearch tool).
 *
 * Verification logic (RESEARCH.md Pitfall 3):
 * - verified=true when 2+ search results confirm the company exists
 * - verified=false otherwise (prevents asserting company info in emails)
 *
 * @param companyName - Company to research
 * @param additionalContext - Optional hints for search refinement
 * @returns Structured market research result
 */
export async function researchCompany(
  companyName: string,
  additionalContext?: string,
): Promise<MarketResearchResult> {
  // Build search queries for external WebSearch tool
  const queries = buildSearchQueries(companyName, additionalContext);

  // NOTE: In production, each query is executed via WebSearch tool
  // and results are aggregated. This function structures the output.
  // The actual search execution happens in the workflow orchestrator
  // which has access to Claude's tool use capabilities.

  // Return a minimal unverified result as a template.
  // The workflow orchestrator will populate this with actual search results.
  return {
    companyName,
    verified: false,
    mainProducts: [],
    marketingActivity: {},
    rawNotes: `검색 쿼리 생성 완료: ${queries.length}개`,
    researchedAt: new Date().toISOString(),
  };
}
