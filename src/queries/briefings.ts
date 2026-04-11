import { eq, desc } from 'drizzle-orm';
import { briefings } from '../db/schema.js';
import type { NewBriefing, Briefing } from '../db/schema.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** 외부 호출자가 넘기는 브리핑 입력 (id/createdAt은 DB가 채움). */
export type BriefingInput = Omit<NewBriefing, 'id' | 'createdAt'>;

/**
 * 통화 브리핑(briefings) 쿼리 팩토리. DI 패턴으로 DB 인스턴스를 주입받아
 * 테스트(in-memory)와 운영(file-based) 환경을 동일 코드로 지원한다.
 *
 * D-04 교차 오염 방지: 모든 조회는 clientId 필수. 전역 조회 함수는 의도적으로 제공하지 않음.
 */
export function createBriefingQueries(db: BetterSQLite3Database<any>) {
  return {
    /**
     * 브리핑 저장. slackTs UNIQUE 제약 위반 시 onConflictDoNothing으로 조용히 skip
     * → 이미 존재하는 기존 레코드를 반환한다. (Pitfall 9 방지)
     *
     * CALL-04: 통화 브리핑 자동 저장.
     */
    saveBriefing(data: BriefingInput): Briefing | undefined {
      const inserted = db
        .insert(briefings)
        .values(data)
        .onConflictDoNothing()
        .returning()
        .get();
      // 이미 존재하면 returning이 undefined → 기존 레코드 조회
      return (
        inserted ??
        db
          .select()
          .from(briefings)
          .where(eq(briefings.slackTs, data.slackTs))
          .get()
      );
    },

    /**
     * 슬랙 메시지 ts로 브리핑 조회. 중복 처리 방지 확인용.
     * 항상 0 또는 1건만 반환 (slack_ts UNIQUE 인덱스 보장).
     */
    getBriefingBySlackTs(slackTs: string): Briefing | undefined {
      return db
        .select()
        .from(briefings)
        .where(eq(briefings.slackTs, slackTs))
        .get();
    },

    /**
     * 단일 클라이언트의 브리핑 전체 (occurredAt 내림차순).
     * D-04: 반드시 clientId 지정. 전역 조회 금지.
     */
    getBriefingsByClient(clientId: number): Briefing[] {
      return db
        .select()
        .from(briefings)
        .where(eq(briefings.clientId, clientId))
        .orderBy(desc(briefings.occurredAt))
        .all();
    },
  };
}

// NOTE: getAllBriefings, listBriefings는 의도적으로 제공하지 않음 (D-04).
// 교차 오염 방지를 위해 단일 clientId 조회만 허용한다.
