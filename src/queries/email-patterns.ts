/**
 * email_patterns 쿼리 팩토리 (D-03, D-06)
 *
 * 이메일 소통의 성공/실패 패턴을 CRUD하고, 업종별/전략별 답장률 통계를 제공한다.
 * T-05-01 위협 완화: getStatsByIndustryStrategy는 업종/전략 단위 집계만 반환하고
 * 개별 클라이언트 본문(bodyPreview)은 통계 쿼리에서 제외한다.
 */

import { and, eq, sql } from 'drizzle-orm';
import { emailPatterns } from '../db/schema.js';
import type { EmailPattern, NewEmailPattern } from '../db/schema.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** INSERT 시 자동 생성되는 필드를 제외한 입력 타입 */
export type EmailPatternInput = Omit<NewEmailPattern, 'id' | 'createdAt'>;

/**
 * email_patterns 쿼리 팩토리.
 * DI 패턴: 테스트에서 in-memory DB를 주입할 수 있다.
 */
export function createEmailPatternQueries(db: BetterSQLite3Database<any>) {
  return {
    /**
     * 새 이메일 패턴 기록을 생성한다.
     * 동일 touchpointId가 이미 존재하면 기존 레코드를 반환한다 (중복 방지).
     */
    create(data: EmailPatternInput): EmailPattern {
      // 중복 방지: touchpointId가 있으면 기존 레코드 체크
      if (data.touchpointId != null) {
        const existing = db
          .select()
          .from(emailPatterns)
          .where(eq(emailPatterns.touchpointId, data.touchpointId))
          .get();
        if (existing) return existing;
      }

      return db.insert(emailPatterns).values(data).returning().get();
    },

    /**
     * 특정 touchpointId에 연결된 이메일 패턴을 조회한다.
     */
    getByTouchpointId(touchpointId: number): EmailPattern | undefined {
      return db
        .select()
        .from(emailPatterns)
        .where(eq(emailPatterns.touchpointId, touchpointId))
        .get();
    },

    /**
     * outcome이 'pending'인 패턴 목록을 반환한다.
     * D-05: "학습 돌려줘" 시 pending 건들의 답장 여부를 일괄 업데이트한다.
     * T-05-03: single-user 시스템이므로 전체 스캔 허용.
     */
    getPendingPatterns(): EmailPattern[] {
      return db
        .select()
        .from(emailPatterns)
        .where(eq(emailPatterns.outcome, 'pending'))
        .all();
    },

    /**
     * 이메일 패턴의 outcome을 업데이트한다.
     * D-04: replied/positive/negative/no_reply로 전환.
     */
    updateOutcome(
      id: number,
      outcome: string,
      replyReceivedAt?: string,
      daysToReply?: number,
    ): void {
      db.update(emailPatterns)
        .set({
          outcome,
          ...(replyReceivedAt != null ? { replyReceivedAt } : {}),
          ...(daysToReply != null ? { daysToReply } : {}),
        })
        .where(eq(emailPatterns.id, id))
        .run();
    },

    /**
     * 업종별/전략별 답장률 통계를 반환한다 (D-06).
     *
     * T-05-01 위협 완화: 개별 클라이언트 bodyPreview는 포함하지 않는다.
     * 업종/전략 단위 집계만 반환하여 정보 노출을 최소화한다.
     *
     * replyRate = (replied + positive) / total * 100
     */
    getStatsByIndustryStrategy(
      industry: string,
    ): Array<{
      strategyUsed: string | null;
      total: number;
      replied: number;
      replyRate: number;
    }> {
      const rows = db
        .select({
          strategyUsed: emailPatterns.strategyUsed,
          total: sql<number>`count(*)`,
          replied: sql<number>`sum(case when ${emailPatterns.outcome} in ('replied', 'positive') then 1 else 0 end)`,
        })
        .from(emailPatterns)
        .where(eq(emailPatterns.industry, industry))
        .groupBy(emailPatterns.strategyUsed)
        .all();

      return rows.map((r) => ({
        strategyUsed: r.strategyUsed,
        total: Number(r.total),
        replied: Number(r.replied),
        replyRate: r.total > 0 ? Math.round((Number(r.replied) / Number(r.total)) * 100) : 0,
      }));
    },
  };
}
