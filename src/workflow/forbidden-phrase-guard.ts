/**
 * Phase 4: 팔로업 금기 표현 검증 가드 (D-15).
 *
 * **배경:**
 * v4 ULTRA §15 [팔로업 톤 규칙] L880-886은 "절대 하지 않는 것"으로
 * "답장 안 주시면 제안을 철회하겠습니다" 식의 압박 문구를 명시한다.
 * 팔로업 철학은 "압박이 아니라 대표님의 따뜻한 리마인드" (CONTEXT.md specifics).
 *
 * 이 모듈은 draft 생성 직후, quality-checker 이전 단계에 호출되어
 * 압박/철회/관계 단절 위협/정서 조작 류 표현이 본문에 포함되어 있으면
 * 차단한다.
 *
 * **적용 카테고리 (pitfall #3 보수적 해석):**
 * 1. 조건부 철회 암시 ("답장 안 주시면", "답변 없으시면")
 * 2. 철회/취소 언급 ("제안을 철회", "견적을 철회", "제안서를 철회")
 * 3. urgency 조작 ("마지막 기회", "이번이 정말 마지막")
 * 4. 관계 단절 위협 ("더 이상 연락드리지 않", "더 이상 연락 안")
 * 5. 정서 조작 ("실망스럽", "실망했")
 *
 * **대소문자:**
 * 한국어는 대소문자 개념이 없으나, 향후 영문 변형 추가 가능성을 고려해
 * toLowerCase 비교를 적용한다 (pitfall #5).
 *
 * **순수 함수 원칙:**
 * DB / 네트워크 / AI 의존성 0. substring 매칭만 사용.
 *
 * @module workflow/forbidden-phrase-guard
 */

/**
 * 블랙리스트 엔트리 1건.
 *
 * phrase는 본문에 직접 포함되면 안 되는 문자열(부분 매칭).
 * reason은 위반 보고 시 대표님/로그에 노출되는 사유 설명.
 */
export interface ForbiddenPhraseEntry {
  phrase: string;
  reason: string;
}

/**
 * v4 ULTRA §15 기반 금기 표현 블랙리스트 (9+ 엔트리).
 *
 * 각 phrase는 substring 매칭이므로 어미 변형 ("철회하겠습니다",
 * "철회합니다", "철회할 수도") 모두 커버되도록 어간 위주로 작성.
 */
export const FORBIDDEN_FOLLOWUP_PHRASES: readonly ForbiddenPhraseEntry[] = [
  // ── 1. 조건부 철회 암시 ─────────────────────────────
  {
    phrase: '답장 안 주시면',
    reason: '조건부 철회 암시 — 답장 압박 (v4 ULTRA §15 금지)',
  },
  {
    phrase: '답변 없으시면',
    reason: '조건부 철회 암시 — 답변 강요 (v4 ULTRA §15 금지)',
  },
  {
    phrase: '회신 없으시면',
    reason: '조건부 철회 암시 — 회신 압박 변형',
  },

  // ── 2. 철회/취소 언급 ───────────────────────────────
  {
    phrase: '제안을 철회',
    reason: '제안 철회 위협 — v4 ULTRA §15에 명시된 대표 금기 표현',
  },
  {
    phrase: '제안서를 철회',
    reason: '제안서 철회 위협 — 제안 철회 변형',
  },
  {
    phrase: '견적을 철회',
    reason: '견적 철회 위협 — 압박 표현',
  },
  {
    phrase: '견적서를 철회',
    reason: '견적서 철회 위협 — 견적 철회 변형',
  },

  // ── 3. urgency 조작 ───────────────────────────────
  {
    phrase: '마지막 기회',
    reason: 'urgency 조작 — 관계 기반 세일즈 철학 위반',
  },
  {
    phrase: '이번이 정말 마지막',
    reason: 'urgency 조작 강조 변형',
  },
  {
    phrase: '마지막으로 한 번만',
    reason: 'urgency 조작 — 재촉 문구',
  },

  // ── 4. 관계 단절 위협 ────────────────────────────
  {
    phrase: '더 이상 연락드리지 않',
    reason: '관계 단절 위협 — 관계 유지 전환 원칙 위반 (D-14)',
  },
  {
    phrase: '더 이상 연락 안',
    reason: '관계 단절 위협 축약 변형',
  },

  // ── 5. 정서 조작 ───────────────────────────────────
  {
    phrase: '실망스럽',
    reason: '정서 조작 — 상대방 죄책감 유도',
  },
  {
    phrase: '실망했',
    reason: '정서 조작 — 상대방 죄책감 유도 변형',
  },
] as const;

/**
 * validateNoForbiddenPhrases 결과 shape.
 */
export interface ForbiddenPhraseCheckResult {
  /** 위반이 0건이면 true */
  safe: boolean;
  /** 검출된 위반 엔트리 목록 (모두 반환, 첫 hit에서 중단하지 않음) */
  violations: Array<{ phrase: string; reason: string }>;
}

/**
 * 팔로업 이메일 본문에 금기 표현이 포함되어 있는지 검사.
 *
 * **매칭 규칙:**
 * - 대소문자 무시 substring 매칭 (`.includes`)
 * - 모든 위반을 수집 (첫 hit에서 조기 반환하지 않음) — 대표님에게 전체
 *   문제점을 한 번에 보고하여 재작성 부담 최소화
 *
 * **사용 위치:**
 * 04-03 follow-up-composer 확장 및 04-05 workflow-c 에서 draft 생성 직후,
 * quality-checker 이전 단계에 호출. safe=false이면 workflow는 draft를
 * 폐기하고 AI 재작성을 요청한다.
 *
 * @param htmlBody 검사할 이메일 본문 (plain text 또는 HTML 모두 허용)
 * @returns { safe, violations } — safe는 위반 0건일 때 true
 */
export function validateNoForbiddenPhrases(
  htmlBody: string,
): ForbiddenPhraseCheckResult {
  const normalized = (htmlBody ?? '').toLowerCase();
  const violations = FORBIDDEN_FOLLOWUP_PHRASES.filter(({ phrase }) =>
    normalized.includes(phrase.toLowerCase()),
  ).map(({ phrase, reason }) => ({ phrase, reason }));

  return {
    safe: violations.length === 0,
    violations,
  };
}
