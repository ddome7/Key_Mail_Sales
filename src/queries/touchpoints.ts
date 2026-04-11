import { and, desc, eq, gt, inArray } from 'drizzle-orm';
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

    // ─── Phase 4 Plan 04-01 (D-02/D-04) ─────────────────────────
    // 팔로업 케이던스 판정을 위한 "마지막 outbound/inbound" 단건 조회.
    // 두 메서드 모두 clientId를 강제 — D-04 격리 원칙 유지.

    /**
     * D-02: 특정 클라이언트의 "마지막 outbound 접점" 1건을 반환한다.
     *
     * **Outbound 간주 타입:**
     *   - `'email_sent'`: Phase 4 신규 표준 발신 이메일
     *   - `'email'`: **D-04 후방 호환** — Phase 3 운영 DB에 쌓인 레거시 이메일
     *     레코드는 모두 대표님 발신 드래프트였으므로 outbound로 간주한다. 이 규칙이
     *     없으면 Phase 3 기간 동안 발송된 이메일들의 케이던스가 Phase 4 전환 시
     *     모두 "최초 접촉"으로 잘못 판정되어 팔로업이 과중 생성된다.
     *   - `'call'`: D-08에 따라 통화도 케이던스 기준일을 리셋하는 outbound다.
     *
     * **제외되는 타입:**
     *   - `'email_received'` (inbound)
     *   - `'stage_change'` (이벤트성, 접점 아님)
     *   - `'manual_pause'` (audit 기록, 접점 아님)
     *
     * 정렬: `occurredAt DESC` → 가장 최근 접점 1건만 반환. 없으면 `undefined`.
     */
    getLastOutboundByClient(clientId: number): Touchpoint | undefined {
      return db
        .select()
        .from(touchpoints)
        .where(
          and(
            eq(touchpoints.clientId, clientId),
            inArray(touchpoints.type, ['email_sent', 'email', 'call'] as const),
          ),
        )
        .orderBy(desc(touchpoints.occurredAt))
        .limit(1)
        .get();
    },

    /**
     * D-02: 특정 클라이언트의 "sinceIso 이후 가장 최근 inbound 이메일" 1건을 반환한다.
     *
     * **Inbound 정의:** `type = 'email_received'` 만 해당.
     *   - 04-02 inbound-detector가 "마지막 outbound 이후 inbound 있음"을 판정할 때
     *     `sinceIso = lastOutbound.occurredAt` 을 넘겨서 사용한다.
     *   - 04-04 cadence 파이프라인이 "답장 오면 케이던스 자동 중단"(D-20 자동 차단)을
     *     판정할 때도 동일하게 호출된다.
     *
     * **정렬:** `occurredAt DESC` — 동일 조건에서 가장 최근 inbound 1건만 반환.
     * 매칭 없으면 `undefined` → 호출자는 "답장 없음"으로 해석하고 케이던스 진행.
     *
     * @param sinceIso "마지막 outbound 시점" ISO 8601 문자열. 이 시점 이후 inbound만 조회.
     */
    getLastInboundByClient(
      clientId: number,
      sinceIso: string,
    ): Touchpoint | undefined {
      return db
        .select()
        .from(touchpoints)
        .where(
          and(
            eq(touchpoints.clientId, clientId),
            eq(touchpoints.type, 'email_received'),
            gt(touchpoints.occurredAt, sinceIso),
          ),
        )
        .orderBy(desc(touchpoints.occurredAt))
        .limit(1)
        .get();
    },
  };
}

// NOTE: getAllTouchpoints, listTouchpoints는 의도적으로 제공하지 않음 (D-04).
// ASVS V4 Access Control: 교차 클라이언트 데이터 노출 방지.
