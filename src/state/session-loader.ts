import { loadPipeline } from './pipeline.js';
import type { Deal, Pipeline, Stage } from './pipeline.js';

// ─── Types ───────────────────────────────────────────────

export interface SessionState {
  totalDeals: number;
  byStage: Record<Stage, number>;
  needFollowup: Deal[];
  summary: string;
}

// ─── Constants ───────────────────────────────────────────

const FOLLOWUP_THRESHOLD_DAYS = 3;

// ─── Functions ───────────────────────────────────────────

/**
 * Get deals that need follow-up action.
 * A deal needs follow-up if:
 * - lastActionDate is 3+ days ago from `today`
 * - Stage is NOT DORMANT (already inactive, no follow-up needed)
 *
 * @param deals - Array of deals to check
 * @param today - Reference date (YYYY-MM-DD). Defaults to today.
 */
export function getDealsNeedingFollowup(deals: Deal[], today?: string): Deal[] {
  const referenceDate = today ? new Date(today) : new Date();
  const thresholdMs = FOLLOWUP_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  return deals.filter((deal) => {
    // Exclude DORMANT deals
    if (deal.stage === 'DORMANT') return false;

    const lastAction = new Date(deal.lastActionDate);
    const daysSince = referenceDate.getTime() - lastAction.getTime();

    return daysSince >= thresholdMs;
  });
}

/**
 * Load session state: pipeline summary + follow-up needs.
 * Called at session start to give the CEO an overview of all deals.
 *
 * @param filePath - Path to pipeline.json
 * @param today - Reference date for follow-up detection (YYYY-MM-DD)
 */
export function loadSessionState(filePath?: string, today?: string): SessionState {
  const pipeline = loadPipeline(filePath);

  const stages: Stage[] = ['PROSPECT', 'LEAD', 'CLIENT', 'RETENTION', 'DORMANT'];
  const byStage = {} as Record<Stage, number>;
  for (const stage of stages) {
    byStage[stage] = pipeline.deals.filter((d) => d.stage === stage).length;
  }

  const needFollowup = getDealsNeedingFollowup(pipeline.deals, today);

  const summary = buildSummary(pipeline.deals.length, byStage, needFollowup);

  return {
    totalDeals: pipeline.deals.length,
    byStage,
    needFollowup,
    summary,
  };
}

// ─── Internal ────────────────────────────────────────────

function buildSummary(
  totalDeals: number,
  byStage: Record<Stage, number>,
  needFollowup: Deal[]
): string {
  if (totalDeals === 0) {
    return '현재 진행 중인 딜이 없습니다.';
  }

  const lines: string[] = [];
  lines.push(`전체 ${totalDeals}건의 딜이 진행 중입니다.`);

  const stageLabels: Record<Stage, string> = {
    PROSPECT: '잠재고객',
    LEAD: '영업진행',
    CLIENT: '계약/운영',
    RETENTION: '재계약유도',
    DORMANT: '휴면',
  };

  const activeParts: string[] = [];
  for (const stage of ['PROSPECT', 'LEAD', 'CLIENT', 'RETENTION', 'DORMANT'] as Stage[]) {
    if (byStage[stage] > 0) {
      activeParts.push(`${stageLabels[stage]} ${byStage[stage]}건`);
    }
  }
  if (activeParts.length > 0) {
    lines.push(`단계별: ${activeParts.join(', ')}`);
  }

  if (needFollowup.length > 0) {
    lines.push(`팔로업 필요: ${needFollowup.length}건`);
    for (const deal of needFollowup) {
      lines.push(`  - ${deal.companyName} (${deal.stage}, 마지막 소통: ${deal.lastActionDate})`);
    }
  }

  return lines.join('\n');
}
