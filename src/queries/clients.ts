import { eq, sql } from 'drizzle-orm';
import { clients } from '../db/schema.js';
import type { NewClient } from '../db/schema.js';
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
  };
}

// NOTE: getAllClients, listClients are intentionally NOT provided.
// This is by design (D-04): single-client queries only to prevent cross-contamination.
