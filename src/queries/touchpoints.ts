import { eq, desc } from 'drizzle-orm';
import { touchpoints } from '../db/schema.js';
import type { NewTouchpoint, Touchpoint } from '../db/schema.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** 외부 호출자가 넘기는 터치포인트 입력 (id/createdAt은 DB가 채움). */
export type TouchpointInput = Omit<NewTouchpoint, 'id' | 'createdAt'>;

/**
 * 통합 타임라인(touchpoints) 쿼리 팩토리.
 *
 * D-14: 이메일 발송 / 통화 / 파이프라인 상태변경 등 모든 접점을 하나의 테이블에 기록.
 * D-16: "이 클라이언트와 지금까지 뭘 했는지"를 한눈에 보기 위한 타임라인 조회.
 * D-04: 교차 오염 방지를 위해 전역 조회 함수는 제공하지 않음.
 */
export function createTouchpointQueries(db: BetterSQLite3Database<any>) {
  return {
    /**
     * D-14: 접점 기록 (email | call | stage_change).
     * Workflow A(D-15) 이메일 드래프트 생성 시, Workflow B 통화 브리핑 생성 시 모두 호출.
     * FK 위반 시 SQLite가 에러를 던진다 (foreign_keys=ON).
     */
    createTouchpoint(data: TouchpointInput): Touchpoint {
      const inserted = db
        .insert(touchpoints)
        .values(data)
        .returning()
        .get();
      if (!inserted) throw new Error('touchpoint insert failed');
      return inserted;
    },

    /**
     * D-16: 단일 클라이언트 타임라인 (occurredAt 내림차순).
     * D-04 엄수: 반드시 clientId 지정.
     *
     * @param limit 기본 50건. 과거 이력 전체가 필요할 때만 늘린다.
     */
    getTimelineByClient(clientId: number, limit = 50): Touchpoint[] {
      return db
        .select()
        .from(touchpoints)
        .where(eq(touchpoints.clientId, clientId))
        .orderBy(desc(touchpoints.occurredAt))
        .limit(limit)
        .all();
    },
  };
}

// NOTE: getAllTouchpoints, listTouchpoints는 의도적으로 제공하지 않음 (D-04).
// ASVS V4 Access Control: 교차 클라이언트 데이터 노출 방지.
