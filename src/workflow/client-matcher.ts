/**
 * ⚠️ PLACEHOLDER STUB for Plan 03-03 parallel execution.
 *
 * This file is intentionally a minimal stub during parallel Wave 2 execution.
 * Plan 03-02 owns the real implementation (matchClient + 3-step state machine +
 * fuzzyMatchCompanyName + full ClientMatcherDeps).
 *
 * Plan 03-03 (call-analyzer) only depends on the COMPANY_BLACKLIST constant here.
 * When 03-02 merges, the real implementation will replace this stub while
 * preserving `COMPANY_BLACKLIST` export (contract enforced in 03-02-PLAN must_haves).
 *
 * Do NOT add runtime logic beyond the blacklist constant here.
 */

/**
 * 자사 이름 블랙리스트 (Pitfall 6).
 *
 * AI가 통화 분석 시 "퍼즐", "퍼즐코퍼레이션" 같은 자사 이름을 "상대방 회사"로
 * 환각 추출하는 것을 차단하기 위한 필터 소스.
 *
 * call-analyzer.ts 의 isCompanyBlacklisted 와 client-matcher.ts 의 매칭 로직이
 * 모두 이 동일 상수를 import 해야 한다 — "블랙리스트 단일 소스" 원칙.
 *
 * 03-02가 이 파일을 덮어쓸 때 반드시 이 상수와 동일한 값을 유지해야 한다.
 * (03-02-PLAN must_haves: "자사 이름 블랙리스트(['퍼즐','puzl','퍼즐코퍼레이션','puzzle corporation'])")
 */
export const COMPANY_BLACKLIST: readonly string[] = [
  '퍼즐',
  'puzl',
  '퍼즐코퍼레이션',
  'puzzle corporation',
];
