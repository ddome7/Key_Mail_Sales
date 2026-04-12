/**
 * edit_deltas 쿼리 팩토리 (D-07, D-09)
 *
 * 대표님의 드래프트 수정 패턴(original vs final)을 CRUD한다.
 * D-09: 새 이메일 작성 시 최근 3건의 수정 패턴을 system prompt에 주입한다.
 */

import { desc, eq } from 'drizzle-orm';
import { editDeltas } from '../db/schema.js';
import type { EditDelta, NewEditDelta } from '../db/schema.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** INSERT 시 자동 생성되는 필드를 제외한 입력 타입 */
export type EditDeltaInput = Omit<NewEditDelta, 'id' | 'createdAt'>;

/**
 * edit_deltas 쿼리 팩토리.
 * DI 패턴: 테스트에서 in-memory DB를 주입할 수 있다.
 */
export function createEditDeltaQueries(db: BetterSQLite3Database<any>) {
  return {
    /**
     * 새 edit delta 기록을 생성한다.
     */
    create(data: EditDeltaInput): EditDelta {
      return db.insert(editDeltas).values(data).returning().get();
    },

    /**
     * 특정 touchpointId에 연결된 edit delta를 조회한다.
     */
    getByTouchpointId(touchpointId: number): EditDelta | undefined {
      return db
        .select()
        .from(editDeltas)
        .where(eq(editDeltas.touchpointId, touchpointId))
        .get();
    },

    /**
     * 클라이언트별 최근 N건의 수정 패턴을 조회한다 (D-09).
     * default limit: 3 ("최근 3건의 수정 패턴")
     */
    getRecentByClient(clientId: number, limit = 3): EditDelta[] {
      return db
        .select()
        .from(editDeltas)
        .where(eq(editDeltas.clientId, clientId))
        .orderBy(desc(editDeltas.createdAt))
        .limit(limit)
        .all();
    },
  };
}
