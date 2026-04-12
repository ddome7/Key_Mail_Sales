import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { clients, services, serviceRecommendations } from './schema.js';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite, { schema: { clients, services, serviceRecommendations } });

  // Push schema manually for in-memory DB
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

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      base_price INTEGER,
      price_unit TEXT,
      price_note TEXT,
      process_steps TEXT,
      as_policy TEXT
    );

    CREATE TABLE IF NOT EXISTS service_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier INTEGER NOT NULL,
      industry TEXT,
      service_name TEXT NOT NULL,
      priority INTEGER,
      recommended_quantity TEXT,
      recommended_budget TEXT,
      sales_ment TEXT
    );
  `);

  return { db, sqlite };
}

describe('Database Schema', () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
  });

  it('should insert and retrieve a client by companyName', () => {
    db.insert(clients).values({
      companyName: '오아름_뷰티브랜드',
      contactName: '오아름',
      contactEmail: 'ohareum222@gmail.com',
      industry: '뷰티',
      stage: 'LEAD',
    }).run();

    const result = db.select().from(clients).where(eq(clients.companyName, '오아름_뷰티브랜드')).get();
    expect(result).toBeDefined();
    expect(result!.companyName).toBe('오아름_뷰티브랜드');
    expect(result!.contactName).toBe('오아름');
    expect(result!.industry).toBe('뷰티');
  });

  it('should insert and retrieve a service by name', () => {
    db.insert(services).values({
      name: '인플루언서 마케팅',
      category: 'UGC',
      description: 'UGC 인플루언서 캠페인',
      basePrice: 1000000,
      priceUnit: '건당',
    }).run();

    const result = db.select().from(services).where(eq(services.name, '인플루언서 마케팅')).get();
    expect(result).toBeDefined();
    expect(result!.name).toBe('인플루언서 마케팅');
    expect(result!.basePrice).toBe(1000000);
  });

  it('should insert and retrieve service recommendations by tier', () => {
    db.insert(serviceRecommendations).values([
      { tier: 1, serviceName: '카페 침투 바이럴', priority: 1, recommendedQuantity: '30~40건', recommendedBudget: '195~260만원' },
      { tier: 1, serviceName: '블로그 체험단', priority: 2, recommendedQuantity: '10~15명', recommendedBudget: '300만원 이하' },
    ]).run();

    const results = db.select().from(serviceRecommendations).where(eq(serviceRecommendations.tier, 1)).all();
    expect(results.length).toBe(2);
    expect(results[0].serviceName).toBe('카페 침투 바이럴');
  });

  it('should have WAL mode active on file-based connection', () => {
    // In-memory databases report 'memory' for journal_mode.
    // WAL mode only works on file-based databases.
    // Test with a temp file-based DB to verify WAL pragma works.
    const { resolve } = require('path');
    const { mkdirSync, existsSync, unlinkSync } = require('fs');
    const os = require('os');
    const tmpPath = resolve(os.tmpdir(), `test-wal-${Date.now()}.db`);
    const fileSqlite = new Database(tmpPath);
    fileSqlite.pragma('journal_mode = WAL');
    const mode = fileSqlite.pragma('journal_mode');
    expect(mode[0].journal_mode).toBe('wal');
    fileSqlite.close();
    try { unlinkSync(tmpPath); } catch {}
    try { unlinkSync(tmpPath + '-wal'); } catch {}
    try { unlinkSync(tmpPath + '-shm'); } catch {}
  });
});
