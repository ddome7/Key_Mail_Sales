/**
 * Phase 4 Plan 06 Task 1 — Workflow C 실행 결과 리포트 렌더러 (D-06).
 *
 * workflow-c.ts와 책임 분리: 이 모듈은 **포맷팅만** 담당한다.
 * DB 접근, 네트워크 호출, 부수 효과는 일절 없다 (순수 함수).
 *
 * 두 진입점:
 *   • renderCadenceReport(batch, meta?) — runWorkflowC() 의 batch 결과를 한국어 markdown 표로
 *   • renderSingleResult(result)        — runWorkflowCForClient() 의 단건 결과를 한 줄 요약으로
 *
 * 04-07 UAT 스크립트가 동일 함수를 그대로 재사용하여 운영 실측 결과를 출력한다.
 *
 * 실행 모드: 호출자가 명시적으로 호출할 때만 동작하는 평범한 동기 함수.
 * 어떠한 백그라운드/자동 트리거도 없다 (D-01 on-demand 원칙).
 *
 * @module cadence-report
 */

import type { WorkflowCBatchResult, WorkflowCResult } from './workflow-c.js';

// ─── 한국어 라벨 매핑 ──────────────────────────────────────────

/**
 * no_action.reason → 표 상태 컬럼 이모지 (renderSingleResult 용).
 * batch rows 의 note는 이미 한국어 사유 라벨이 채워져 있으므로 별도 매핑.
 */
const REASON_EMOJI: Record<
  Extract<WorkflowCResult, { status: 'no_action' }>['reason'],
  string
> = {
  recent_inbound: '⏭️',
  no_stage_due: '⏸️',
  paused: '⏸️',
  dormant: '🌙',
  no_last_outbound: '❔',
  skipped: '❔',
};

const REASON_LABEL_KO: Record<
  Extract<WorkflowCResult, { status: 'no_action' }>['reason'],
  string
> = {
  recent_inbound: '답장 수신됨 — 팔로업 건너뜀',
  no_stage_due: '아직 케이던스 도래 전',
  paused: '수동 차단 상태',
  dormant: '휴면 상태',
  no_last_outbound: '마지막 접점 기록 없음',
  skipped: '클라이언트 없음',
};

// ─── 내부 헬퍼 ────────────────────────────────────────────────

/**
 * batch row 1건의 "상태" 컬럼 라벨을 결정한다.
 *
 * - success + 휴면 확인 필요 → "⚠️ 휴면 확인"
 * - success(일반)            → "✅ 드래프트"
 * - error                    → "❌ 오류"  (note는 표에 노출하지 않음 — 간결성)
 * - no_action                → "⏭️ {note}" (note는 workflow-c REASON_LABELS의 한국어 사유)
 */
function statusLabelForRow(row: WorkflowCBatchResult['rows'][number]): string {
  if (row.status === 'success') {
    return row.note === '휴면 전환 확인 필요' ? '⚠️ 휴면 확인' : '✅ 드래프트';
  }
  if (row.status === 'error') {
    return '❌ 오류';
  }
  // no_action — workflow-c가 note에 한국어 사유 라벨을 채워둔다.
  return row.note ? `⏭️ ${row.note}` : '⏭️ 스킵';
}

/**
 * Markdown 테이블 셀 escape — 회사명에 `|` 가 포함될 가능성은 극히 낮지만 방어적.
 */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

// ─── public: renderCadenceReport ──────────────────────────────

/**
 * batch 결과를 D-06 한국어 markdown 리포트 문자열로 조립한다.
 *
 * 출력 구조 (조건부 섹션 포함):
 *
 * ```markdown
 * ## Workflow C 실행 결과 — YYYY-MM-DD
 *
 * **처리:** N건 검토 / M건 드래프트 생성 / K건 스킵 / E건 오류
 *
 * | 회사명 | 마지막 접점 | 경과 | 다음 케이던스 | 드래프트 ID | 상태 |
 * |--------|-------------|------|---------------|-------------|------|
 * | ... | ... | ... | ... | ... | ... |
 *
 * ### 대기 중                              ← pendingBeyondCap > 0 일 때만
 * 처리 상한(N건)을 초과한 K건이 남았습니다. 재실행이 필요합니다.
 *
 * ### 🌙 휴면 전환 확인 필요 (D-17)         ← dormantCandidates.length > 0 일 때만
 * 안내 문구...
 *
 * 1. **{회사명}** — 마지막 드래프트 `{draftId}`
 *    - 대표님 결정 필요: "전환해" / "유지해"
 * ```
 *
 * @param batch  runWorkflowC()의 batch 결과
 * @param meta   현재 시각(테스트 deterministic용) / 처리 상한
 */
export function renderCadenceReport(
  batch: WorkflowCBatchResult,
  meta?: { now?: Date; maxDrafts?: number },
): string {
  const now = meta?.now ?? new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const sections: string[] = [
    `## Workflow C 실행 결과 — ${dateStr}`,
    '',
    `**처리:** ${batch.processed}건 검토 / ${batch.drafted}건 드래프트 생성 / ${batch.skipped}건 스킵 / ${batch.errors}건 오류`,
    '',
    '| 회사명 | 마지막 접점 | 경과 | 다음 케이던스 | 드래프트 ID | 상태 |',
    '|--------|-------------|------|---------------|-------------|------|',
  ];

  // ─ 표 본문 행 ─
  for (const row of batch.rows) {
    const cells = [
      escapeCell(row.companyName),
      row.lastOutboundAt ?? '—',
      row.elapsedDays == null ? '—' : `${row.elapsedDays}일`,
      row.nextCadence ?? '—',
      row.draftId ?? '—',
      statusLabelForRow(row),
    ];
    sections.push(`| ${cells.join(' | ')} |`);
  }

  // ─ 대기 중 섹션 (pendingBeyondCap > 0 일 때만) ─
  if (batch.pendingBeyondCap > 0) {
    const cap = meta?.maxDrafts ?? 10;
    sections.push(
      '',
      '### 대기 중',
      `처리 상한(${cap}건)을 초과한 ${batch.pendingBeyondCap}건이 남았습니다. 재실행이 필요합니다.`,
    );
  }

  // ─ 휴면 전환 확인 섹션 (dormantCandidates.length > 0 일 때만) ─
  if (batch.dormantCandidates.length > 0) {
    sections.push(
      '',
      '### 🌙 휴면 전환 확인 필요 (D-17)',
      '',
      '아래 클라이언트는 30일 이상 미응답으로 STAGE 5 (Dormant) 전환 대상입니다. "마지막 터치" 드래프트를 작성해 두었으니 대표님이 확인해 주시고 전환 여부를 알려주세요.',
      '',
    );
    batch.dormantCandidates.forEach((cand, i) => {
      sections.push(
        `${i + 1}. **${cand.companyName}** — 마지막 드래프트 \`${cand.draftId}\``,
        '   - 대표님 결정 필요: "전환해" / "유지해"',
      );
    });
  }

  return sections.join('\n');
}

// ─── public: renderSingleResult ───────────────────────────────

/**
 * 단건 결과(`runWorkflowCForClient` 반환값)를 한 줄(또는 몇 줄) 요약으로 렌더링.
 *
 * - success → "✅ {company} 드래프트 생성 ({draftId})" + 단계/컨텍스트 라인
 *             dormantPending=true 면 "⚠️ 휴면 전환 확인 필요" 라인 추가
 *             warnings 가 있으면 "경고: ..." 라인 추가
 * - no_action → "{이모지} {company}: {한국어 사유}"
 * - error    → "❌ {company}: {error 메시지}"
 */
export function renderSingleResult(result: WorkflowCResult): string {
  if (result.status === 'success') {
    const lines = [
      `✅ ${result.companyName} 드래프트 생성 (${result.draftId})`,
      `   - 단계: ${result.stage.ordinal}차 (Day ${result.stage.dayMilestone}) / ${result.stage.contextType}`,
    ];
    if (result.dormantPending) {
      lines.push('   - ⚠️ 휴면 전환 확인 필요');
    }
    if (result.warnings && result.warnings.length > 0) {
      lines.push(`   - 경고: ${result.warnings.join(' · ')}`);
    }
    return lines.join('\n');
  }

  if (result.status === 'error') {
    return `❌ ${result.companyName}: ${result.error}`;
  }

  // no_action
  const emoji = REASON_EMOJI[result.reason] ?? '❔';
  const label = REASON_LABEL_KO[result.reason] ?? result.reason;
  return `${emoji} ${result.companyName}: ${label}`;
}
