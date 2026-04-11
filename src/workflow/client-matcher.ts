/**
 * 3단계 클라이언트 매칭 상태 머신.
 *
 * D-02 "추측 금지" 원칙 구현체:
 *   자동 매칭에 확신이 없으면 반드시 대표님에게 확인(Step 3).
 *   경계선 케이스는 조용히 틀린 것보다 한 번 더 묻는 것이 낫다.
 *
 * 3단계:
 *   Step 1. phone_exact   — 전화번호 정확 일치 (confidence 1.0)
 *   Step 2a. name_exact   — 회사명 정확 일치 + D-03 전화번호 학습
 *   Step 2b. name_fuzzy   — 엄격한 퍼지 매칭 자동 통과 (Pitfall 3 방지 3-AND)
 *   Step 3. askCeoConfirmation — 대표님 확인 (select/new_client/cancel)
 *
 * 자사 블랙리스트(Pitfall 6): '퍼즐' 계열은 매칭 대상에서 제외.
 */

import type { ParsedCall } from './call-parser.js';
import { normalizePhone } from './phone-normalizer.js';
import type { Client } from '../db/schema.js';
import type { createClientQueries } from '../queries/clients.js';

/** 자사 이름 — 매칭 대상에서 제외 (Pitfall 6). 대소문자 무시. */
export const COMPANY_BLACKLIST: readonly string[] = [
  '퍼즐',
  'puzl',
  '퍼즐코퍼레이션',
  'puzzle corporation',
];

// ─── 타입 ──────────────────────────────────────────
export interface MatchCandidate {
  companyName: string;
  score: number;
  reason: 'exact' | 'prefix' | 'contains';
}

export type MatchResult =
  | {
      status: 'matched';
      client: Client;
      method: 'phone_exact' | 'name_exact' | 'name_fuzzy' | 'ceo_select';
      confidence: number;
    }
  | { status: 'new_client'; client: Client; method: 'ceo_new' }
  | { status: 'cancelled' };

export interface CeoConfirmationRequest {
  callSummary: string;
  extractedInfo: {
    phone: string | null;
    companyName: string | null;
    contactName: string | null;
  };
  candidates: Array<{
    client: Client;
    score: number;
    reason: string;
  }>;
}

export interface CeoConfirmationResponse {
  action: 'select' | 'new_client' | 'cancel';
  selectedClientId?: number;
  newClientName?: string;
}

export interface ClientMatcherDeps {
  clientQueries: ReturnType<typeof createClientQueries>;
  askCeoConfirmation: (
    req: CeoConfirmationRequest,
  ) => Promise<CeoConfirmationResponse>;
}

// ─── 회사명 정규화 / 블랙리스트 ───────────────────
/**
 * 한국 회사명을 퍼지 매칭용으로 정규화.
 *  - lowercase
 *  - 공백/기호 제거
 *  - 법인 접미사(주식회사/(주)/㈜/코퍼레이션/corp/inc/ltd) 제거
 */
export function normalizeKoreanCompany(name: string): string {
  return (
    name
      .toLowerCase()
      // 1) 법인 접미사/접두사를 "먼저" 제거 (괄호가 남아 있을 때 매칭)
      .replace(/㈜/g, '')
      .replace(/\(주\)/g, '')
      .replace(/주식회사/g, '')
      .replace(/코퍼레이션/g, '')
      .replace(/corp(oration)?/gi, '')
      .replace(/\binc\b\.?/gi, '')
      .replace(/\bltd\b\.?/gi, '')
      // 2) 공백 제거
      .replace(/\s+/g, '')
      // 3) 남은 구두점/기호 제거
      .replace(/[()[\]{}/,.\-]/g, '')
  );
}

function isBlacklisted(name: string): boolean {
  if (!name) return false;
  const n = normalizeKoreanCompany(name);
  if (!n) return false;
  for (const b of COMPANY_BLACKLIST) {
    const nb = normalizeKoreanCompany(b);
    if (!nb) continue;
    if (n === nb || n.includes(nb) || nb.includes(n)) return true;
  }
  return false;
}

// ─── 퍼지 매칭 ─────────────────────────────────────
/**
 * 회사명 퍼지 매칭 점수 계산.
 *
 * 점수 체계:
 *   exact    → 1.00 (정규화 후 완전 일치)
 *   prefix   → 0.75 ~ 0.95 (shorter/longer 비율에 비례)
 *   contains → 0.70 (부분 문자열 포함)
 *
 * 자사 블랙리스트는 후보에서 제외된다 (Pitfall 6).
 */
export function fuzzyMatchCompanyName(
  extracted: string,
  allCompanyNames: string[],
): MatchCandidate[] {
  if (!extracted || isBlacklisted(extracted)) return [];
  const needle = normalizeKoreanCompany(extracted);
  if (!needle) return [];

  const candidates: MatchCandidate[] = [];
  for (const name of allCompanyNames) {
    if (isBlacklisted(name)) continue;
    const hay = normalizeKoreanCompany(name);
    if (!hay) continue;

    if (hay === needle) {
      candidates.push({ companyName: name, score: 1.0, reason: 'exact' });
    } else if (hay.startsWith(needle) || needle.startsWith(hay)) {
      const longer = Math.max(hay.length, needle.length);
      const shorter = Math.min(hay.length, needle.length);
      const score = 0.75 + (shorter / longer) * 0.2;
      candidates.push({
        companyName: name,
        score: Math.round(score * 1000) / 1000,
        reason: 'prefix',
      });
    } else if (hay.includes(needle) || needle.includes(hay)) {
      candidates.push({ companyName: name, score: 0.7, reason: 'contains' });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

// ─── 3단계 매칭 상태 머신 ─────────────────────────
/**
 * 통화 메시지에서 추출한 정보로 기존 client를 찾는다.
 *
 * @param parsed                   call-parser의 ParsedCall
 * @param deps                     clientQueries + askCeoConfirmation (DI)
 * @param extractedCompanyName     AI가 통화 내용에서 추출한 회사명 (nullable)
 */
export async function matchClient(
  parsed: ParsedCall,
  deps: ClientMatcherDeps,
  extractedCompanyName: string | null,
): Promise<MatchResult> {
  // ─ Step 1: 전화번호 정확 매칭 ───────────────────
  if (parsed.contact.phone) {
    const byPhone = deps.clientQueries.getClientByPhone(parsed.contact.phone);
    if (byPhone) {
      return {
        status: 'matched',
        client: byPhone,
        method: 'phone_exact',
        confidence: 1.0,
      };
    }
  }

  // ─ Step 2: 회사명 기반 매칭 (자사 블랙리스트 필터) ──
  let nameToMatch: string | null =
    parsed.contact.companyName ?? extractedCompanyName;
  if (nameToMatch && isBlacklisted(nameToMatch)) {
    nameToMatch = null;
  }

  if (nameToMatch) {
    // Step 2a. 정확 매칭 (DB의 company_name 컬럼과 글자 단위 일치)
    const exact = deps.clientQueries.getClient(nameToMatch);
    if (exact) {
      if (parsed.contact.phone) {
        // D-03: 통화로 확인된 전화번호를 학습
        deps.clientQueries.savePhoneLearning(
          exact.companyName,
          parsed.contact.phone,
        );
      }
      return {
        status: 'matched',
        client: exact,
        method: 'name_exact',
        confidence: 1.0,
      };
    }

    // Step 2b. 퍼지 매칭 — 엄격 자동 통과 조건 (Pitfall 3 방지)
    const allNames = deps.clientQueries.getAllCompanyNames();
    const candidates = fuzzyMatchCompanyName(nameToMatch, allNames);
    const top = candidates[0];

    // 자동 통과 조건은 3개 모두 AND:
    //   (1) score >= 0.95
    //   (2) 후보가 유일 (candidates.length === 1)
    //   (3) reason이 'exact' 또는 'prefix' (contains는 자동 통과 금지)
    const autoPassOk =
      top !== undefined &&
      top.score >= 0.95 &&
      candidates.length === 1 &&
      (top.reason === 'exact' || top.reason === 'prefix');

    if (autoPassOk) {
      const client = deps.clientQueries.getClient(top.companyName);
      if (client) {
        if (parsed.contact.phone) {
          deps.clientQueries.savePhoneLearning(
            client.companyName,
            parsed.contact.phone,
          );
        }
        return {
          status: 'matched',
          client,
          method: 'name_fuzzy',
          confidence: top.score,
        };
      }
    }
  }

  // ─ Step 3: 대표님 확인 (D-05) ─────────────────
  //   자동 매칭이 불확실하거나, 회사명이 아예 없는 경우.
  //   candidates 페이로드는 상위 5개로 제한하고, 각 후보는
  //   { client, score, reason } 형태로 전달. transcript 전체 전달 금지(T-03-14).
  const candidatesForCeo = nameToMatch
    ? fuzzyMatchCompanyName(nameToMatch, deps.clientQueries.getAllCompanyNames())
        .slice(0, 5)
        .map((c) => {
          const client = deps.clientQueries.getClient(c.companyName);
          return client
            ? { client, score: c.score, reason: c.reason }
            : null;
        })
        .filter(
          (c): c is { client: Client; score: number; reason: string } =>
            c !== null,
        )
    : [];

  const callSummary =
    (parsed.mainPoints ?? []).slice(0, 2).join(' / ') || '요약 없음';

  const response = await deps.askCeoConfirmation({
    callSummary,
    extractedInfo: {
      phone: parsed.contact.phone,
      companyName: nameToMatch,
      contactName: parsed.contact.contactName,
    },
    candidates: candidatesForCeo,
  });

  if (response.action === 'cancel') {
    return { status: 'cancelled' };
  }

  if (response.action === 'select' && response.selectedClientId != null) {
    const client = deps.clientQueries.getClientById(response.selectedClientId);
    if (!client) {
      throw new Error(
        `선택된 클라이언트 ID가 존재하지 않음: ${response.selectedClientId}`,
      );
    }
    if (parsed.contact.phone) {
      deps.clientQueries.savePhoneLearning(
        client.companyName,
        parsed.contact.phone,
      );
    }
    return {
      status: 'matched',
      client,
      method: 'ceo_select',
      confidence: 1.0,
    };
  }

  if (response.action === 'new_client' && response.newClientName) {
    deps.clientQueries.upsertClient({
      companyName: response.newClientName,
      contactName: parsed.contact.contactName,
      contactPhone: parsed.contact.phone
        ? normalizePhone(parsed.contact.phone)
        : null,
      contactEmail: null,
      industry: null,
      history: null,
      budgetPattern: null,
      budgetTier: null,
      preferredServices: null,
      notes: `Phase 3 통화로부터 자동 생성 (${parsed.occurredAt})`,
      nextOpportunity: null,
      communicationStyle: null,
      stage: 'PROSPECT',
      lastContactDate: parsed.occurredAt.slice(0, 10),
    });
    const newClient = deps.clientQueries.getClient(response.newClientName);
    if (!newClient) {
      throw new Error('new_client 생성 실패: getClient가 undefined 반환');
    }
    return { status: 'new_client', client: newClient, method: 'ceo_new' };
  }

  throw new Error(
    '대표님 응답 파싱 실패: ' + JSON.stringify(response),
  );
}
