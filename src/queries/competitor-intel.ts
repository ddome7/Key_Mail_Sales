/**
 * competitor_intel 쿼리 팩토리 (D-13, D-15)
 *
 * 통화/이메일에서 감지된 경쟁사 정보를 CRUD하고 업종별 조회를 제공한다.
 * T-05-02 위협 완화: getByIndustry는 competitor_intel.detail만 반환하고
 * 연결된 client 본문은 노출하지 않는다.
 */

import { and, eq, sql } from 'drizzle-orm';
import { competitorIntel, clients } from '../db/schema.js';
import type { CompetitorIntel, NewCompetitorIntel } from '../db/schema.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** INSERT 시 자동 생성되는 필드를 제외한 입력 타입 */
export type CompetitorIntelInput = Omit<NewCompetitorIntel, 'id' | 'discoveredAt'>;

/**
 * competitor_intel 쿼리 팩토리.
 * DI 패턴: 테스트에서 in-memory DB를 주입할 수 있다.
 */
export function createCompetitorIntelQueries(db: BetterSQLite3Database<any>) {
  return {
    /**
     * 새 경쟁사 정보를 생성한다.
     */
    create(data: CompetitorIntelInput): CompetitorIntel {
      return db.insert(competitorIntel).values(data).returning().get();
    },

    /**
     * 정확히 동일한 (clientId, competitorName, intelType, detail) 조합이 이미 존재하는지 확인한다.
     * RESEARCH 6: 중복 방지 — 같은 정보가 반복 수집되는 것을 막는다.
     */
    exists(
      clientId: number,
      competitorName: string,
      intelType: string,
      detail: string,
    ): boolean {
      const row = db
        .select({ id: competitorIntel.id })
        .from(competitorIntel)
        .where(
          and(
            eq(competitorIntel.clientId, clientId),
            eq(competitorIntel.competitorName, competitorName),
            eq(competitorIntel.intelType, intelType),
            eq(competitorIntel.detail, detail),
          ),
        )
        .get();
      return row != null;
    },

    /**
     * 특정 클라이언트의 경쟁사 정보 전체를 조회한다.
     */
    getByClient(clientId: number): CompetitorIntel[] {
      return db
        .select()
        .from(competitorIntel)
        .where(eq(competitorIntel.clientId, clientId))
        .all();
    },

    /**
     * 업종(industry) 기준으로 경쟁사 정보를 조회한다 (D-15).
     *
     * T-05-02 위협 완화: competitor_intel 레코드만 반환하고
     * 연결된 client의 민감 정보(본문, 연락처 등)는 노출하지 않는다.
     */
    getByIndustry(industry: string): CompetitorIntel[] {
      return db
        .select({
          id: competitorIntel.id,
          clientId: competitorIntel.clientId,
          competitorName: competitorIntel.competitorName,
          intelType: competitorIntel.intelType,
          detail: competitorIntel.detail,
          source: competitorIntel.source,
          confidence: competitorIntel.confidence,
          discoveredAt: competitorIntel.discoveredAt,
        })
        .from(competitorIntel)
        .innerJoin(clients, eq(competitorIntel.clientId, clients.id))
        .where(eq(clients.industry, industry))
        .all();
    },
  };
}
