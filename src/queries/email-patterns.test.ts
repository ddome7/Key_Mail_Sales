/**
 * email_patterns 쿼리 모듈 단위 테스트
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { clients, touchpoints, emailPatterns } from '../db/schema.js';
import { createEmailPatternQueries } from './email-patterns.js';

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
    CREATE TABLE email_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      touchpoint_id INTEGER REFERENCES touchpoints(id) ON DELETE SET NULL,
      strategy_used TEXT, tone_level INTEGER, context_type TEXT,
      subject_line TEXT, body_preview TEXT, sent_at TEXT,
      reply_received_at TEXT,
      outcome TEXT NOT NULL DEFAULT 'pending',
      days_to_reply INTEGER, industry TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX email_patterns_client_idx ON email_patterns(client_id);
    CREATE INDEX email_patterns_industry_strategy_idx ON email_patterns(industry, strategy_used);
    CREATE INDEX email_patterns_outcome_idx ON email_patterns(outcome);
    CREATE INDEX email_patterns_touchpoint_idx ON email_patterns(touchpoint_id);
  `);
  const db = drizzle(sqlite, { schema: { clients, touchpoints, emailPatterns } });
  return { db, sqlite };
}

function insertClient(db: ReturnType<typeof drizzle>) {
  return db.insert(clients).values({ companyName: '테스트회사', industry: 'F&B' }).returning().get();
}

function insertTouchpoint(db: ReturnType<typeof drizzle>, clientId: number, suffix = '001') {
  return db.insert(touchpoints).values({
    clientId, type: 'email_sent', sourceId: `thread-${suffix}`,
    summary: '테스트', occurredAt: '2026-04-01T10:00:00+09:00',
  }).returning().get();
}

describe('Email Pattern Queries', () => {
  let queries: ReturnType<typeof createEmailPatternQueries>;
  let db: ReturnType<typeof drizzle>;
  let clientId: number;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    queries = createEmailPatternQueries(db);
    clientId = insertClient(db).id;
  });

  // Test 1: create -> getByTouchpointId 왕복
  it('create -> getByTouchpointId 왕복', () => {
    const tp = insertTouchpoint(db, clientId);
    const created = queries.create({
      clientId, touchpointId: tp.id, strategyUsed: 'E',
      toneLevel: 3, outcome: 'pending', industry: 'F&B',
    });
    expect(created.id).toBeGreaterThan(0);

    const found = queries.getByTouchpointId(tp.id);
    expect(found).toBeDefined();
    expect(found!.strategyUsed).toBe('E');
    expect(found!.clientId).toBe(clientId);
  });

  // Test 2: getPendingPatterns
  it('getPendingPatterns: outcome=pending 건만 반환', () => {
    queries.create({ clientId, outcome: 'pending', industry: 'F&B' });
    queries.create({ clientId, outcome: 'replied', industry: 'F&B' });
    queries.create({ clientId, outcome: 'pending', industry: 'F&B' });

    const pending = queries.getPendingPatterns();
    expect(pending).toHaveLength(2);
    expect(pending.every((p) => p.outcome === 'pending')).toBe(true);
  });

  // Test 3: updateOutcome
  it('updateOutcome: pending -> replied 업데이트 + daysToReply', () => {
    const created = queries.create({ clientId, outcome: 'pending', industry: 'F&B' });
    queries.updateOutcome(created.id, 'replied', '2026-04-03T14:30:00+09:00', 2);

    const found = queries.getByTouchpointId(created.touchpointId!);
    // touchpointId is null, use direct select
    const updated = db.select().from(emailPatterns).all().find((r) => r.id === created.id);
    expect(updated!.outcome).toBe('replied');
    expect(updated!.daysToReply).toBe(2);
    expect(updated!.replyReceivedAt).toBe('2026-04-03T14:30:00+09:00');
  });

  // Test 4: getStatsByIndustryStrategy (D-06)
  it('getStatsByIndustryStrategy: 업종별/전략별 답장률 집계', () => {
    // F&B 업종에 전략 E 3건 (2건 replied, 1건 pending)
    queries.create({ clientId, strategyUsed: 'E', outcome: 'replied', industry: 'F&B' });
    queries.create({ clientId, strategyUsed: 'E', outcome: 'positive', industry: 'F&B' });
    queries.create({ clientId, strategyUsed: 'E', outcome: 'pending', industry: 'F&B' });
    // F&B 업종에 전략 A 2건 (0건 replied)
    queries.create({ clientId, strategyUsed: 'A', outcome: 'no_reply', industry: 'F&B' });
    queries.create({ clientId, strategyUsed: 'A', outcome: 'pending', industry: 'F&B' });

    const stats = queries.getStatsByIndustryStrategy('F&B');
    expect(stats).toHaveLength(2);

    const stratE = stats.find((s) => s.strategyUsed === 'E');
    expect(stratE).toBeDefined();
    expect(stratE!.total).toBe(3);
    expect(stratE!.replied).toBe(2); // replied + positive
    expect(stratE!.replyRate).toBe(67); // Math.round(2/3 * 100)

    const stratA = stats.find((s) => s.strategyUsed === 'A');
    expect(stratA).toBeDefined();
    expect(stratA!.total).toBe(2);
    expect(stratA!.replied).toBe(0);
    expect(stratA!.replyRate).toBe(0);
  });

  // Test 5: 중복 방지 — 동일 touchpointId로 두 번 create 시 기존 것 반환
  it('중복 방지: 동일 touchpointId로 두 번 create 시 기존 것 반환', () => {
    const tp = insertTouchpoint(db, clientId);
    const first = queries.create({ clientId, touchpointId: tp.id, outcome: 'pending' });
    const second = queries.create({ clientId, touchpointId: tp.id, outcome: 'replied' });

    expect(second.id).toBe(first.id);
    expect(second.outcome).toBe('pending'); // 첫 번째 것이 반환됨
  });
});
