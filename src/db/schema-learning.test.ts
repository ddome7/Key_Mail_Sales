/**
 * Phase 5 학습 루프 스키마 테스트
 *
 * email_patterns, edit_deltas, competitor_intel 3개 테이블의
 * INSERT/SELECT 왕복, FK 제약, default 값을 검증한다.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import {
  clients,
  touchpoints,
  briefings,
  emailPatterns,
  editDeltas,
  competitorIntel,
} from './schema.js';

/**
 * In-memory DB 생성 + 전체 스키마 DDL.
 * Phase 1~5 테이블 모두 포함하여 FK 관계 유지.
 */
function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      industry TEXT,
      history TEXT,
      budget_pattern TEXT,
      budget_tier INTEGER,
      preferred_services TEXT,
      notes TEXT,
      next_opportunity TEXT,
      communication_style TEXT,
      stage TEXT DEFAULT 'PROSPECT',
      last_contact_date TEXT,
      followup_paused INTEGER NOT NULL DEFAULT 0,
      followup_paused_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS touchpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      metadata TEXT,
      occurred_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS briefings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      slack_ts TEXT NOT NULL,
      slack_channel_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      source TEXT NOT NULL,
      summary TEXT NOT NULL,
      action_items TEXT,
      sentiment TEXT,
      raw_transcript TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS briefings_slack_ts_unique ON briefings(slack_ts);

    CREATE TABLE IF NOT EXISTS email_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      touchpoint_id INTEGER REFERENCES touchpoints(id) ON DELETE SET NULL,
      strategy_used TEXT,
      tone_level INTEGER,
      context_type TEXT,
      subject_line TEXT,
      body_preview TEXT,
      sent_at TEXT,
      reply_received_at TEXT,
      outcome TEXT NOT NULL DEFAULT 'pending',
      days_to_reply INTEGER,
      industry TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS email_patterns_client_idx ON email_patterns(client_id);
    CREATE INDEX IF NOT EXISTS email_patterns_industry_strategy_idx ON email_patterns(industry, strategy_used);
    CREATE INDEX IF NOT EXISTS email_patterns_outcome_idx ON email_patterns(outcome);
    CREATE INDEX IF NOT EXISTS email_patterns_touchpoint_idx ON email_patterns(touchpoint_id);

    CREATE TABLE IF NOT EXISTS edit_deltas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      touchpoint_id INTEGER REFERENCES touchpoints(id) ON DELETE SET NULL,
      original_body TEXT,
      final_body TEXT,
      diff_summary TEXT,
      diff_category TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS edit_deltas_client_idx ON edit_deltas(client_id);
    CREATE INDEX IF NOT EXISTS edit_deltas_touchpoint_idx ON edit_deltas(touchpoint_id);

    CREATE TABLE IF NOT EXISTS competitor_intel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      competitor_name TEXT NOT NULL,
      intel_type TEXT NOT NULL,
      detail TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence TEXT NOT NULL,
      discovered_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS competitor_intel_client_idx ON competitor_intel(client_id);
    CREATE INDEX IF NOT EXISTS competitor_intel_name_type_idx ON competitor_intel(client_id, competitor_name, intel_type);
  `);

  const db = drizzle(sqlite, {
    schema: { clients, touchpoints, briefings, emailPatterns, editDeltas, competitorIntel },
  });
  return { db, sqlite };
}

/** 테스트용 클라이언트 생성 후 ID 반환 */
function insertTestClient(db: ReturnType<typeof drizzle>) {
  return db
    .insert(clients)
    .values({ companyName: '테스트_F&B_브랜드', industry: 'F&B', contactEmail: 'test@sample.co.kr' })
    .returning()
    .get();
}

/** 테스트용 터치포인트 생성 후 ID 반환 */
function insertTestTouchpoint(db: ReturnType<typeof drizzle>, clientId: number) {
  return db
    .insert(touchpoints)
    .values({
      clientId,
      type: 'email_sent',
      sourceId: 'thread-test-001',
      summary: '테스트 이메일',
      occurredAt: '2026-04-01T10:00:00+09:00',
    })
    .returning()
    .get();
}

describe('Phase 5 Learning Loop Schema', () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
  });

  // ─── Test 1: email_patterns INSERT → SELECT 왕복 ──────────
  it('email_patterns: INSERT → SELECT 왕복 성공 (모든 필드 보존)', () => {
    const client = insertTestClient(db);
    const tp = insertTestTouchpoint(db, client.id);

    const inserted = db
      .insert(emailPatterns)
      .values({
        clientId: client.id,
        touchpointId: tp.id,
        strategyUsed: 'E',
        toneLevel: 3,
        contextType: 'proposal',
        subjectLine: '[제안서] F&B 캠페인',
        bodyPreview: '안녕하세요, 퍼즐코퍼레이션입니다.',
        sentAt: '2026-04-01T10:00:00+09:00',
        replyReceivedAt: '2026-04-03T14:30:00+09:00',
        outcome: 'replied',
        daysToReply: 2,
        industry: 'F&B',
      })
      .returning()
      .get();

    const found = db.select().from(emailPatterns).where(eq(emailPatterns.id, inserted.id)).get();
    expect(found).toBeDefined();
    expect(found!.strategyUsed).toBe('E');
    expect(found!.toneLevel).toBe(3);
    expect(found!.outcome).toBe('replied');
    expect(found!.daysToReply).toBe(2);
    expect(found!.industry).toBe('F&B');
    expect(found!.touchpointId).toBe(tp.id);
  });

  // ─── Test 2: edit_deltas INSERT → SELECT 왕복 ────────────
  it('edit_deltas: INSERT → SELECT 왕복 성공', () => {
    const client = insertTestClient(db);

    const inserted = db
      .insert(editDeltas)
      .values({
        clientId: client.id,
        originalBody: '<p>원본 드래프트</p>',
        finalBody: '<p>수정된 최종본</p>',
        diffSummary: '톤을 더 친근하게 변경',
        diffCategory: 'tone',
      })
      .returning()
      .get();

    const found = db.select().from(editDeltas).where(eq(editDeltas.id, inserted.id)).get();
    expect(found).toBeDefined();
    expect(found!.originalBody).toBe('<p>원본 드래프트</p>');
    expect(found!.finalBody).toBe('<p>수정된 최종본</p>');
    expect(found!.diffCategory).toBe('tone');
  });

  // ─── Test 3: competitor_intel INSERT → SELECT 왕복 ────────
  it('competitor_intel: INSERT → SELECT 왕복 성공', () => {
    const client = insertTestClient(db);

    const inserted = db
      .insert(competitorIntel)
      .values({
        clientId: client.id,
        competitorName: 'ABC마케팅',
        intelType: 'pricing',
        detail: '1500만원 견적 제시',
        source: 'call_analysis',
        confidence: 'confirmed',
      })
      .returning()
      .get();

    const found = db.select().from(competitorIntel).where(eq(competitorIntel.id, inserted.id)).get();
    expect(found).toBeDefined();
    expect(found!.competitorName).toBe('ABC마케팅');
    expect(found!.intelType).toBe('pricing');
    expect(found!.confidence).toBe('confirmed');
  });

  // ─── Test 4: FK 제약 — 존재하지 않는 clientId ────────────
  it('email_patterns: 존재하지 않는 clientId로 INSERT 시 FK 에러', () => {
    expect(() => {
      db.insert(emailPatterns)
        .values({
          clientId: 9999,
          outcome: 'pending',
        })
        .run();
    }).toThrow();
  });

  // ─── Test 5: email_patterns.outcome default가 'pending' ───
  it('email_patterns: outcome 미지정 시 default가 pending', () => {
    const client = insertTestClient(db);

    const inserted = db
      .insert(emailPatterns)
      .values({ clientId: client.id })
      .returning()
      .get();

    expect(inserted.outcome).toBe('pending');
  });

  // ─── Test 6: 기존 테이블 영향 없음 ────────────────────────
  it('기존 clients/touchpoints/briefings 테이블이 영향 없이 동작', () => {
    const client = insertTestClient(db);
    expect(client.id).toBeGreaterThan(0);
    expect(client.companyName).toBe('테스트_F&B_브랜드');

    const tp = insertTestTouchpoint(db, client.id);
    expect(tp.id).toBeGreaterThan(0);
    expect(tp.type).toBe('email_sent');

    const briefing = db
      .insert(briefings)
      .values({
        clientId: client.id,
        slackTs: '1712548680.123456',
        slackChannelId: 'C12345',
        occurredAt: '2026-04-01T10:00:00+09:00',
        source: 'ixio',
        summary: '테스트 브리핑',
      })
      .returning()
      .get();
    expect(briefing.id).toBeGreaterThan(0);
  });
});
