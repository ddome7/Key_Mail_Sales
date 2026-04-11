import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { clients } from '../db/schema.js';
import type { Client, NewClient } from '../db/schema.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { normalizePhone } from '../workflow/phone-normalizer.js';

// Client data for upsert (without auto-generated fields)
export type ClientInput = Omit<NewClient, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Create client query functions bound to a specific DB instance.
 * This pattern allows dependency injection for testing with in-memory DBs.
 */
export function createClientQueries(db: BetterSQLite3Database<any>) {
  return {
    /**
     * Get a single client by company name.
     * Returns undefined if not found.
     * IMPORTANT: Always returns exactly 0 or 1 result (D-04 cross-contamination prevention).
     */
    getClient(companyName: string) {
      return db.select().from(clients).where(eq(clients.companyName, companyName)).get();
    },

    /**
     * Get a single client by ID.
     */
    getClientById(id: number) {
      return db.select().from(clients).where(eq(clients.id, id)).get();
    },

    /**
     * Upsert a client: insert if not exists, update if exists (by companyName).
     * Always updates the updatedAt timestamp.
     */
    upsertClient(data: ClientInput) {
      const existing = db.select().from(clients).where(eq(clients.companyName, data.companyName)).get();

      if (existing) {
        db.update(clients)
          .set({
            ...data,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(clients.companyName, data.companyName))
          .run();
      } else {
        db.insert(clients)
          .values({
            ...data,
          })
          .run();
      }
    },

    /**
     * Update a specific field on a client by companyName.
     */
    updateClientField(companyName: string, field: string, value: any) {
      db.update(clients)
        .set({
          [field]: value,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(clients.companyName, companyName))
        .run();
    },

    /**
     * D-04: 전화번호로 단일 클라이언트 조회.
     * 입력 번호와 저장된 번호 모두 normalizePhone을 거쳐 비교.
     * (Pitfall 1 방지: 하이픈/공백/+82 등 표기 차이로 매칭 실패 방지)
     *
     * 저장된 contactPhone이 null이거나 정규화 결과가 다르면 매칭되지 않는다.
     * 입력이 빈 문자열이면 undefined 반환 (throw 없음).
     */
    getClientByPhone(phone: string) {
      if (!phone) return undefined;
      const normalized = normalizePhone(phone);
      if (!normalized) return undefined;
      return db
        .select()
        .from(clients)
        .where(eq(clients.contactPhone, normalized))
        .get();
    },

    /**
     * D-04: 이메일로 단일 클라이언트 조회 (대소문자 무시).
     * SQLite `lower()` 함수로 저장된 값과 입력값 모두 소문자화한 후 비교한다.
     */
    getClientByEmail(email: string) {
      if (!email) return undefined;
      const lower = email.trim().toLowerCase();
      if (!lower) return undefined;
      return db
        .select()
        .from(clients)
        .where(sql`lower(${clients.contactEmail}) = ${lower}`)
        .get();
    },

    /**
     * D-03: 통화로 확인된 전화번호를 기존 client에 저장(학습).
     * 반드시 normalizePhone을 거쳐 저장 (Pitfall 1).
     *
     * 존재하지 않는 회사명이면 no-op (오케스트레이터가 매칭 후 호출하는 것이 전제).
     * phone이 빈 문자열이거나 normalize 결과가 비어 있으면 no-op.
     */
    savePhoneLearning(companyName: string, phone: string): void {
      if (!companyName || !phone) return;
      const normalized = normalizePhone(phone);
      if (!normalized) return;
      db.update(clients)
        .set({
          contactPhone: normalized,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(clients.companyName, companyName))
        .run();
    },

    /**
     * 퍼지 매칭 전용: 전체 회사명 목록만 반환.
     *
     * D-04 예외 설계:
     *   - 회사명 "문자열 배열"만 반환한다.
     *   - Client 객체 전체를 반환하지 않음으로써 교차 정보 노출 위험을 최소화.
     *   - 매처는 회사명 매칭 후 다시 `getClient(name)`으로 단건 조회한다.
     */
    getAllCompanyNames(): string[] {
      return db
        .select({ companyName: clients.companyName })
        .from(clients)
        .all()
        .map((r) => r.companyName);
    },

    // ─── Phase 4 Plan 04-01 (D-20/D-21) ─────────────────────────
    // 팔로업 케이던스의 수동 차단/활성 클라이언트 조회 메서드.
    // D-04 격리 원칙 유지: 단건 토글 + 조건부 활성 목록만 제공.

    /**
     * D-20/D-21: 특정 클라이언트의 팔로업 차단 플래그를 토글한다.
     *
     * - paused=true: `followupPaused=1`, `followupPausedReason=reason ?? null`
     * - paused=false: `followupPaused=0`, `followupPausedReason=null` (reason 자동 초기화)
     *
     * 존재하지 않는 companyName, 빈 문자열 모두 **no-op**으로 조용히 반환한다
     * (Phase 3 `savePhoneLearning`과 동일한 방어 패턴). 오케스트레이터가
     * 매칭 성공 후 호출하는 것이 전제이므로, 실패 시 throw하지 않는다.
     *
     * Dormant 전환(D-17)과 **별개** — Dormant는 `updateClientField(stage)`로
     * 다룬다. 수동 차단은 딜을 살려둔 채 자동 팔로업만 제외하는 플래그다.
     */
    setFollowupPause(
      companyName: string,
      paused: boolean,
      reason?: string,
    ): void {
      if (!companyName) return;
      db.update(clients)
        .set({
          followupPaused: paused,
          // paused=false일 때 reason을 null로 자동 초기화 (상태 일관성).
          followupPausedReason: paused ? (reason ?? null) : null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(clients.companyName, companyName))
        .run();
    },

    /**
     * D-20: 팔로업 대상 활성 클라이언트 목록.
     *
     * 조건:
     *   - `stage != 'DORMANT'` (휴면 제외)
     *   - `followupPaused = false` (수동 차단 제외)
     *
     * 정렬: `lastContactDate ASC` (오래된 순 — Claude's Discretion per 04-01 PLAN).
     * SQLite ORDER BY ASC는 NULL을 가장 앞에 두므로, lastContactDate가 null인
     * 레코드는 최우선 반환된다. 04-05 workflow-c가 실제 경과 일수를 계산할 때
     * null은 skip하지만, 정렬 자체는 null-first로 둔다 (Phase 1/2 시절 데이터 호환).
     *
     * D-04 예외 설계: `getAllClients`가 없는 것과 달리, 이 메서드는 "팔로업 루프"
     * 라는 명확한 목적(전수 스캔)이 있으므로 허용된다. 호출자는 반환된 Client 객체를
     * 루프 돌며 처리해야 하며, 다른 클라이언트의 민감 정보를 교차 노출해서는 안 된다.
     */
    getActiveFollowupClients(): Client[] {
      return db
        .select()
        .from(clients)
        .where(
          and(
            ne(clients.stage, 'DORMANT'),
            eq(clients.followupPaused, false),
          ),
        )
        .orderBy(asc(clients.lastContactDate))
        .all();
    },
  };
}

// NOTE: getAllClients, listClients are intentionally NOT provided.
// This is by design (D-04): single-client queries only to prevent cross-contamination.
