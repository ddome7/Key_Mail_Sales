import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { clients } from '../db/schema.js';
import { createClientQueries } from '../queries/clients.js';
import { loadClientContext, validateNoContamination } from './cross-contamination.js';

describe('Cross-Contamination Guard', () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: InstanceType<typeof Database>;
  let clientQueries: ReturnType<typeof createClientQueries>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE clients (
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
    `);
    db = drizzle(sqlite);
    clientQueries = createClientQueries(db);

    // Seed A사 and B사
    clientQueries.upsertClient({
      companyName: 'A사',
      contactName: '김철수',
      contactEmail: 'kim@a-company.com',
      industry: 'IT',
      budgetTier: 3,
    });
    clientQueries.upsertClient({
      companyName: 'B사',
      contactName: '이영희',
      contactEmail: 'lee@b-company.com',
      industry: '뷰티',
      budgetTier: 2,
    });
  });

  describe('loadClientContext', () => {
    it('should load only the target client data', () => {
      const context = loadClientContext('A사', clientQueries);
      expect(context).not.toBeNull();
      expect(context!.companyName).toBe('A사');
      expect(context!.contactName).toBe('김철수');
    });

    it('should not include B사 data when loading A사', () => {
      const context = loadClientContext('A사', clientQueries);
      expect(context).not.toBeNull();
      // The returned context should only contain A사 data
      expect(JSON.stringify(context)).not.toContain('B사');
      expect(JSON.stringify(context)).not.toContain('이영희');
    });

    it('should return null for non-existent client', () => {
      const context = loadClientContext('없는회사', clientQueries);
      expect(context).toBeNull();
    });
  });

  describe('validateNoContamination', () => {
    it('should detect contamination when email contains other company name', () => {
      const emailText = '안녕하세요 A사 담당자님, B사에서 진행한 캠페인 결과를 참고하시면...';
      const result = validateNoContamination(emailText, 'A사', ['A사', 'B사', 'C사']);
      expect(result.safe).toBe(false);
      expect(result.contaminations).toContain('B사');
    });

    it('should pass when email only contains target company info', () => {
      const emailText = '안녕하세요 A사 담당자님, 요청하신 서비스 견적을 보내드립니다.';
      const result = validateNoContamination(emailText, 'A사', ['A사', 'B사', 'C사']);
      expect(result.safe).toBe(true);
      expect(result.contaminations).toHaveLength(0);
    });

    it('should detect multiple contaminations', () => {
      const emailText = 'A사 견적서입니다. B사 단가 참고, C사 레퍼런스 포함합니다.';
      const result = validateNoContamination(emailText, 'A사', ['A사', 'B사', 'C사']);
      expect(result.safe).toBe(false);
      expect(result.contaminations).toContain('B사');
      expect(result.contaminations).toContain('C사');
    });
  });
});
