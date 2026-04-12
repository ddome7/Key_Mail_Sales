/**
 * Learning Report Renderer (Phase 5 Plan 05) — D-17 한국어 보고서
 *
 * runLearningLoop() 결과를 한국어 마크다운 보고서로 변환한다.
 * cadence-report.ts 패턴을 복제한 순수 함수.
 *
 * 4개 섹션:
 *   1. 이메일 성과 (LRNG-01)
 *   2. 수정 패턴 (LRNG-02)
 *   3. 크로스셀 기회 (LRNG-03) — 테이블 또는 "감지된 기회 없음"
 *   4. 시장 정보 (LRNG-04)
 *
 * T-05-12: 크로스셀 보고서에 경쟁사 단가를 직접 노출하지 않음.
 *   서비스 제안 타이밍만 표시한다.
 *
 * @module workflow/learning-report
 */

import type { LearningLoopResult } from './learning-loop.js';

/**
 * LearningLoopResult를 D-17 형식의 한국어 마크다운 보고서로 변환한다.
 *
 * @param result runLearningLoop() 또는 runLearnForClient() 결과
 * @param options date: 보고서 날짜 (기본값: 오늘)
 * @returns 한국어 마크다운 문자열
 */
export function renderLearningReport(
  result: LearningLoopResult,
  options?: { date?: string },
): string {
  const date = options?.date ?? new Date().toISOString().split('T')[0];

  // 모든 수치가 0이면 "분석 대상 없음" 반환
  const hasAnyData =
    result.patternsNew > 0 ||
    result.patternsUpdated > 0 ||
    result.editDeltasFound > 0 ||
    result.crossSellOpportunities.length > 0 ||
    result.competitorIntelNew > 0 ||
    result.clientsProcessed > 0;

  if (!hasAnyData) {
    return [
      `## 학습 루프 실행 결과 — ${date}`,
      '',
      '분석 대상 없음 — 활성 거래처가 없거나 학습할 데이터가 없습니다.',
    ].join('\n');
  }

  const sections: string[] = [];

  // ─── Header ──────────────────────────────────────────────────
  sections.push(`## 학습 루프 실행 결과 — ${date}`);
  sections.push('');

  // ─── LRNG-01: 이메일 성과 ────────────────────────────────────
  sections.push('### 이메일 성과 (LRNG-01)');
  sections.push(`- 신규 분석: ${result.patternsNew}건`);
  sections.push(`- 기존 업데이트: ${result.patternsUpdated}건`);
  sections.push('');

  // ─── LRNG-02: 수정 패턴 ──────────────────────────────────────
  const modified = result.editDeltasFound - result.editDeltasUnchanged;
  sections.push('### 수정 패턴 (LRNG-02)');
  sections.push(
    `- 발견: ${result.editDeltasFound}건 (수정됨: ${modified}건, 수정 없음(양성): ${result.editDeltasUnchanged}건)`,
  );
  sections.push('');

  // ─── LRNG-03: 크로스셀 기회 ──────────────────────────────────
  sections.push('### 크로스셀 기회 (LRNG-03)');

  if (result.crossSellOpportunities.length === 0) {
    sections.push('감지된 기회 없음');
  } else {
    // T-05-12: 경쟁사 단가 미노출 — 서비스 제안 타이밍만 표시
    sections.push('| 거래처 | 현재 서비스 | 제안 서비스 | 타이밍 |');
    sections.push('|--------|-------------|-------------|--------|');
    for (const opp of result.crossSellOpportunities) {
      sections.push(
        `| ${escapeCell(opp.companyName)} | ${escapeCell(opp.rule.fromService)} | ${escapeCell(opp.rule.toService)} | ${escapeCell(opp.rule.timingCondition)} |`,
      );
    }
  }
  sections.push('');

  // ─── LRNG-04: 시장 정보 ──────────────────────────────────────
  sections.push('### 시장 정보 (LRNG-04)');
  sections.push(`- 신규 수집: ${result.competitorIntelNew}건`);
  sections.push('');

  // ─── Footer ──────────────────────────────────────────────────
  sections.push('---');
  sections.push(`처리: ${result.clientsProcessed}개 거래처 / 실패: ${result.clientsFailed}건`);

  return sections.join('\n');
}

/**
 * Markdown 테이블 셀 escape (cadence-report.ts 패턴 복제).
 */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}
