import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { clients } from '../db/schema.js';
import { createClientQueries } from './clients.js';

function createTestDb() {
  const sqlite = new Database(':memory:');
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const db = drizzle(sqlite, { schema: { clients } });
  return { db, sqlite };
}

describe('Client Queries', () => {
  let queries: ReturnType<typeof createClientQueries>;

  beforeEach(() => {
    const { db } = createTestDb();
    queries = createClientQueries(db);

    // Insert test data
    db.insert(clients).values({
      companyName: '오아름_뷰티브랜드',
      contactName: '오아름',
      contactEmail: 'ohareum222@gmail.com',
      contactPhone: '010-9942-5308',
      industry: '뷰티',
      stage: 'LEAD',
      budgetTier: 2,
      notes: '회사/모회사 정보는 대외비',
    }).run();
  });

  it('should get a client by companyName', () => {
    const result = queries.getClient('오아름_뷰티브랜드');
    expect(result).toBeDefined();
    expect(result!.companyName).toBe('오아름_뷰티브랜드');
    expect(result!.contactName).toBe('오아름');
    expect(result!.industry).toBe('뷰티');
  });

  it('should return undefined for non-existent client', () => {
    const result = queries.getClient('존재하지않는회사');
    expect(result).toBeUndefined();
  });

  it('should upsert a new client (create)', () => {
    queries.upsertClient({
      companyName: '새로운_회사',
      contactName: '김철수',
      industry: 'IT',
      stage: 'PROSPECT',
    });

    const result = queries.getClient('새로운_회사');
    expect(result).toBeDefined();
    expect(result!.contactName).toBe('김철수');
    expect(result!.industry).toBe('IT');
  });

  it('should upsert an existing client (update)', () => {
    queries.upsertClient({
      companyName: '오아름_뷰티브랜드',
      contactName: '오아름',
      industry: '뷰티',
      stage: 'CLIENT',
      budgetTier: 3,
    });

    const result = queries.getClient('오아름_뷰티브랜드');
    expect(result).toBeDefined();
    expect(result!.stage).toBe('CLIENT');
    expect(result!.budgetTier).toBe(3);
  });

  it('should update a specific client field', () => {
    queries.updateClientField('오아름_뷰티브랜드', 'stage', 'DORMANT');
    const result = queries.getClient('오아름_뷰티브랜드');
    expect(result).toBeDefined();
    expect(result!.stage).toBe('DORMANT');
  });

  it('should NOT export getAllClients (cross-contamination prevention D-04)', async () => {
    const clientsModule = await import('./clients.js');
    expect('getAllClients' in clientsModule).toBe(false);
    expect('listClients' in clientsModule).toBe(false);
  });
});
