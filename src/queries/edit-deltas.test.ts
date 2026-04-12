/**
 * edit_deltas 쿼리 모듈 단위 테스트
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { clients, touchpoints, editDeltas } from '../db/schema.js';
import { createEditDeltaQueries } from './edit-deltas.js';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      contact_name TEXT, contact_email TEXT, contact_phone TEXT,
      industry TEXT, history TEXT, budget_pattern TEXT, budget_tier INTEGER,
      preferred_services TEXT, notes TEXT, next_opportunity TEXT,
      communication_style TEXT, stage TEXT DEFAULT 'PROSPECT',
      last_contact_date TEXT, followup_paused INTEGER NOT NULL DEFAULT 0,
      followup_paused_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE touchpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      type TEXT NOT NULL, source_id TEXT NOT NULL, summary TEXT NOT NULL,
      metadata TEXT, occurred_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE edit_deltas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      touchpoint_id INTEGER REFERENCES touchpoints(id) ON DELETE SET NULL,
      original_body TEXT, final_body TEXT, diff_summary TEXT,
      diff_category TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX edit_deltas_client_idx ON edit_deltas(client_id);
    CREATE INDEX edit_deltas_touchpoint_idx ON edit_deltas(touchpoint_id);
  `);
  const db = drizzle(sqlite, { schema: { clients, touchpoints, editDeltas } });
  return { db, sqlite };
}

function insertClient(db: ReturnType<typeof drizzle>) {
  return db.insert(clients).values({ companyName: '테스트회사' }).returning().get();
}

function insertTouchpoint(db: ReturnType<typeof drizzle>, clientId: number, suffix = '001') {
  return db.insert(touchpoints).values({
    clientId, type: 'email_sent', sourceId: `thread-${suffix}`,
    summary: '테스트', occurredAt: '2026-04-01T10:00:00+09:00',
  }).returning().get();
}

describe('Edit Delta Queries', () => {
  let queries: ReturnType<typeof createEditDeltaQueries>;
  let db: ReturnType<typeof drizzle>;
  let clientId: number;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    queries = createEditDeltaQueries(db);
    clientId = insertClient(db).id;
  });

  // Test 6: create -> getByTouchpointId 왕복
  it('create -> getByTouchpointId 왕복', () => {
    const tp = insertTouchpoint(db, clientId);
    const created = queries.create({
      clientId, touchpointId: tp.id,
      originalBody: '<p>원본</p>', finalBody: '<p>수정본</p>',
      diffSummary: '톤 변경', diffCategory: 'tone',
    });
    expect(created.id).toBeGreaterThan(0);

    const found = queries.getByTouchpointId(tp.id);
    expect(found).toBeDefined();
    expect(found!.originalBody).toBe('<p>원본</p>');
    expect(found!.diffCategory).toBe('tone');
  });

  // Test 7: getRecentByClient (D-09 "최근 3건")
  it('getRecentByClient: clientId 기준 최근 N건 조회', () => {
    // 5건 INSERT — createdAt은 SQLite default로 동일하므로 id 순서로 대체
    for (let i = 0; i < 5; i++) {
      queries.create({
        clientId,
        originalBody: `원본 ${i}`,
        finalBody: `수정 ${i}`,
        diffSummary: `변경 ${i}`,
        diffCategory: 'tone',
      });
    }

    // default limit = 3
    const recent3 = queries.getRecentByClient(clientId);
    expect(recent3).toHaveLength(3);

    // limit = 5
    const recent5 = queries.getRecentByClient(clientId, 5);
    expect(recent5).toHaveLength(5);
  });

  // diffCategory 'none' 지원 (D-09: original === final 양성 신호)
  it('diffCategory "none"을 지원한다', () => {
    const created = queries.create({
      clientId,
      originalBody: '<p>동일</p>',
      finalBody: '<p>동일</p>',
      diffSummary: '수정 없음 — 스타일 OK',
      diffCategory: 'none',
    });
    expect(created.diffCategory).toBe('none');
  });
});
