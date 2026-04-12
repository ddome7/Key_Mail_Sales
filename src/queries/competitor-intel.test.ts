/**
 * competitor_intel 쿼리 모듈 단위 테스트
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { clients, competitorIntel } from '../db/schema.js';
import { createCompetitorIntelQueries } from './competitor-intel.js';

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
    CREATE TABLE competitor_intel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      competitor_name TEXT NOT NULL,
      intel_type TEXT NOT NULL,
      detail TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence TEXT NOT NULL,
      discovered_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX competitor_intel_client_idx ON competitor_intel(client_id);
    CREATE INDEX competitor_intel_name_type_idx ON competitor_intel(client_id, competitor_name, intel_type);
  `);
  const db = drizzle(sqlite, { schema: { clients, competitorIntel } });
  return { db, sqlite };
}

function insertClient(db: ReturnType<typeof drizzle>, industry = 'F&B') {
  return db.insert(clients).values({ companyName: `테스트_${industry}`, industry }).returning().get();
}

describe('Competitor Intel Queries', () => {
  let queries: ReturnType<typeof createCompetitorIntelQueries>;
  let db: ReturnType<typeof drizzle>;
  let clientId: number;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    queries = createCompetitorIntelQueries(db);
    clientId = insertClient(db).id;
  });

  // Test 8: create -> getByClient 왕복
  it('create -> getByClient 왕복', () => {
    const created = queries.create({
      clientId,
      competitorName: 'ABC마케팅',
      intelType: 'pricing',
      detail: '1500만원 견적 제시',
      source: 'call_analysis',
      confidence: 'confirmed',
    });
    expect(created.id).toBeGreaterThan(0);

    const results = queries.getByClient(clientId);
    expect(results).toHaveLength(1);
    expect(results[0].competitorName).toBe('ABC마케팅');
    expect(results[0].detail).toBe('1500만원 견적 제시');
  });

  // Test 9: exists 중복 체크 (RESEARCH 6)
  it('exists: 동일 (clientId, competitorName, intelType, detail) 중복 체크', () => {
    queries.create({
      clientId,
      competitorName: 'ABC마케팅',
      intelType: 'pricing',
      detail: '1500만원 견적 제시',
      source: 'call_analysis',
      confidence: 'confirmed',
    });

    // 정확히 동일한 조합 → true
    expect(queries.exists(clientId, 'ABC마케팅', 'pricing', '1500만원 견적 제시')).toBe(true);

    // 다른 detail → false
    expect(queries.exists(clientId, 'ABC마케팅', 'pricing', '2000만원 견적 제시')).toBe(false);

    // 다른 competitorName → false
    expect(queries.exists(clientId, 'XYZ에이전시', 'pricing', '1500만원 견적 제시')).toBe(false);
  });

  // Test 10: getByIndustry (D-15)
  it('getByIndustry: industry 기반 경쟁사 정보 조회', () => {
    // F&B 업종 클라이언트에 경쟁사 정보 추가
    queries.create({
      clientId,
      competitorName: 'ABC마케팅',
      intelType: 'pricing',
      detail: '1500만원 견적',
      source: 'call_analysis',
      confidence: 'confirmed',
    });

    // 뷰티 업종 클라이언트 추가
    const beautyClient = insertClient(db, '뷰티');
    queries.create({
      clientId: beautyClient.id,
      competitorName: 'DEF에이전시',
      intelType: 'service',
      detail: '패키지 상품',
      source: 'market_research',
      confidence: 'inferred',
    });

    // F&B만 조회
    const fbResults = queries.getByIndustry('F&B');
    expect(fbResults).toHaveLength(1);
    expect(fbResults[0].competitorName).toBe('ABC마케팅');

    // 뷰티만 조회
    const beautyResults = queries.getByIndustry('뷰티');
    expect(beautyResults).toHaveLength(1);
    expect(beautyResults[0].competitorName).toBe('DEF에이전시');

    // IT 조회 → 0건
    const itResults = queries.getByIndustry('IT');
    expect(itResults).toHaveLength(0);
  });
});
