/**
 * Phase 5: 학습 데이터 → system prompt 주입 순수 함수 (D-06, D-09, D-18).
 *
 * DB/네트워크/AI 의존성 0.
 *
 * **D-18 준수:** compose.ts / follow-up-composer.ts를 수정하지 않는다.
 * 오케스트레이터가 buildEmailPrompt/buildFollowUpPrompt의 결과(system prompt)에
 * 이 모듈의 injectLearningContext를 적용하여 학습 데이터를 append한다.
 *
 * **T-05-04 경감:** competitorNotes에는 항상 "참고:" 접두사가 붙어,
 * AI가 경쟁사 단가를 직접 언급하지 않도록 유도한다 (CLAUDE.md 보안 규칙).
 *
 * 제공:
 * - LearningContext: 학습 데이터 3종 (patternInsights, editPatterns, competitorNotes)
 * - injectLearningContext: system prompt + LearningContext → 확장 prompt
 * - buildLearningContext: DB 쿼리 결과 → LearningContext 변환
 *
 * @module workflow/learning-prompt-injector
 */

// ─── Types ───────────────────────────────────────────────────

/**
 * 학습 컨텍스트 3종.
 *
 * 오케스트레이터가 DB에서 조회한 결과를 buildLearningContext로 변환하거나,
 * 직접 조립하여 이 shape을 만든다.
 */
export interface LearningContext {
  /** D-06: 업종/전략별 이메일 성과 인사이트 (예: "F&B 업종 전략 E: 답장률 60%") */
  patternInsights: string[];
  /** D-09: 대표님 수정 패턴 학습 (예: "공공기관은 톤 레벨 3~4 선호") */
  editPatterns: string[];
  /** D-15: 경쟁사/시장 참고 정보 (예: "참고: 경쟁사 A가 X원 제안 이력") */
  competitorNotes: string[];
}

// ─── injectLearningContext ───────────────────────────────────

/**
 * 기존 system prompt 뒤에 학습 컨텍스트를 append한다.
 *
 * - 모든 배열이 비어있으면 원본 systemPrompt를 그대로 반환 (D-18 준수)
 * - 비어있지 않은 카테고리만 섹션으로 추가
 * - 순서: patternInsights → editPatterns → competitorNotes (D-17 보고서 일관성)
 *
 * compose.ts / follow-up-composer.ts의 system prompt는 수정하지 않는다 (D-18).
 * 오케스트레이터가 prompt builder 결과에 이 함수를 적용한다.
 *
 * @param systemPrompt 기존 system prompt (compose.ts / follow-up-composer.ts 출력)
 * @param context 학습 데이터 3종
 * @returns 학습 컨텍스트가 append된 system prompt (비어있으면 원본 그대로)
 */
export function injectLearningContext(
  systemPrompt: string,
  context: LearningContext,
): string {
  const sections: string[] = [];

  if (context.patternInsights.length > 0) {
    sections.push(
      '[과거 이메일 성과 학습]\n' +
        context.patternInsights.map((s) => `- ${s}`).join('\n'),
    );
  }

  if (context.editPatterns.length > 0) {
    sections.push(
      '[대표님 수정 패턴 학습]\n' +
        context.editPatterns.map((s) => `- ${s}`).join('\n'),
    );
  }

  if (context.competitorNotes.length > 0) {
    sections.push(
      '[시장/경쟁사 참고 정보]\n' +
        context.competitorNotes.map((s) => `- ${s}`).join('\n'),
    );
  }

  if (sections.length === 0) return systemPrompt;

  return systemPrompt + '\n\n' + sections.join('\n\n');
}

// ─── buildLearningContext ────────────────────────────────────

/**
 * DB 쿼리 결과로부터 LearningContext를 조립하는 헬퍼.
 *
 * 순수 함수 — DB 쿼리 실행은 호출자(오케스트레이터)가 수행한다.
 * 이 함수는 쿼리 결과를 사람이 읽을 수 있는 인사이트 문자열로 변환만 한다.
 *
 * @param params DB 쿼리 결과 3종 (각각 optional)
 * @returns LearningContext — 비어있는 입력은 빈 배열로 처리
 */
export function buildLearningContext(params: {
  /** 업종/전략별 이메일 성과 통계 */
  industryStats?: Array<{
    strategyUsed: string;
    total: number;
    replied: number;
    replyRate: number;
  }>;
  /** 대표님 수정 패턴 요약 */
  editDeltas?: Array<{
    diffSummary: string;
    diffCategory: string;
  }>;
  /** 경쟁사/시장 참고 정보 */
  competitorNotes?: Array<{
    competitorName: string;
    detail: string;
  }>;
}): LearningContext {
  const patternInsights = (params.industryStats ?? []).map(
    (stat) =>
      `전략 ${stat.strategyUsed}: 답장률 ${stat.replyRate}% (${stat.total}건 중 ${stat.replied}건)`,
  );

  const editPatterns = (params.editDeltas ?? []).map(
    (delta) => `수정 패턴 (${delta.diffCategory}): ${delta.diffSummary}`,
  );

  const competitorNotes = (params.competitorNotes ?? []).map(
    (note) => `${note.competitorName}: ${note.detail}`,
  );

  return {
    patternInsights,
    editPatterns,
    competitorNotes,
  };
}
