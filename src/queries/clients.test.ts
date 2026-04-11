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

// ─── Plan 03-02 확장: 전화번호/이메일 단건 조회 + 학습 + 회사명 목록 ────
describe('Client Queries — Phase 3 Plan 02 확장', () => {
  let queries: ReturnType<typeof createClientQueries>;
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(() => {
    const setup = createTestDb();
    db = setup.db;
    queries = createClientQueries(db);
  });

  describe('getClientByPhone', () => {
    it('저장된 전화번호를 하이픈 포함 입력으로 조회할 수 있다 (내부 normalize)', () => {
      db.insert(clients)
        .values({
          companyName: '동반성장위원회',
          contactPhone: '01036906867',
        })
        .run();
      const result = queries.getClientByPhone('010-3690-6867');
      expect(result).toBeDefined();
      expect(result!.companyName).toBe('동반성장위원회');
    });

    it('+82 국제표기 입력도 동일 레코드를 찾는다', () => {
      db.insert(clients)
        .values({ companyName: '동반성장위원회', contactPhone: '01036906867' })
        .run();
      const result = queries.getClientByPhone('+82 10-3690-6867');
      expect(result).toBeDefined();
      expect(result!.companyName).toBe('동반성장위원회');
    });

    it('존재하지 않는 번호는 undefined를 반환한다', () => {
      db.insert(clients)
        .values({ companyName: '동반성장위원회', contactPhone: '01036906867' })
        .run();
      expect(queries.getClientByPhone('010-0000-0000')).toBeUndefined();
    });

    it('contactPhone이 null인 client는 결과에 포함되지 않는다', () => {
      db.insert(clients)
        .values({ companyName: '번호없음회사', contactPhone: null })
        .run();
      expect(queries.getClientByPhone('010-3690-6867')).toBeUndefined();
    });

    it('빈 문자열 입력은 throw 없이 undefined 반환', () => {
      expect(queries.getClientByPhone('')).toBeUndefined();
    });
  });

  describe('getClientByEmail', () => {
    it('저장된 이메일을 정확히 매칭한다', () => {
      db.insert(clients)
        .values({ companyName: 'FOO사', contactEmail: 'foo@bar.com' })
        .run();
      const result = queries.getClientByEmail('foo@bar.com');
      expect(result).toBeDefined();
      expect(result!.companyName).toBe('FOO사');
    });

    it('대문자 입력도 case-insensitive로 매칭한다 (SQLite lower())', () => {
      db.insert(clients)
        .values({ companyName: 'FOO사', contactEmail: 'foo@bar.com' })
        .run();
      const result = queries.getClientByEmail('FOO@BAR.COM');
      expect(result).toBeDefined();
      expect(result!.companyName).toBe('FOO사');
    });

    it('저장 시 대문자/공백 포함이어도 lowercase 조회 시 매칭한다', () => {
      db.insert(clients)
        .values({ companyName: 'BAR사', contactEmail: 'Hello@Puzl.co.kr' })
        .run();
      const result = queries.getClientByEmail('  hello@puzl.co.kr  ');
      expect(result).toBeDefined();
      expect(result!.companyName).toBe('BAR사');
    });

    it('존재하지 않는 이메일은 undefined', () => {
      expect(queries.getClientByEmail('none@nowhere.com')).toBeUndefined();
    });

    it('빈 문자열은 throw 없이 undefined', () => {
      expect(queries.getClientByEmail('')).toBeUndefined();
    });
  });

  describe('savePhoneLearning (D-03)', () => {
    it('기존 client의 전화번호를 정규화된 형식으로 업데이트한다', () => {
      db.insert(clients)
        .values({ companyName: '동반성장위원회', contactPhone: null })
        .run();
      queries.savePhoneLearning('동반성장위원회', '010-1234-5678');
      const c = queries.getClient('동반성장위원회');
      expect(c!.contactPhone).toBe('01012345678');
    });

    it('+82 포맷 입력도 국내 11자리로 저장된다', () => {
      db.insert(clients)
        .values({ companyName: '동반성장위원회', contactPhone: null })
        .run();
      queries.savePhoneLearning('동반성장위원회', '+82 10-1234-5678');
      const c = queries.getClient('동반성장위원회');
      expect(c!.contactPhone).toBe('01012345678');
    });

    it('존재하지 않는 회사명에 대해 호출해도 throw하지 않고 no-op', () => {
      expect(() =>
        queries.savePhoneLearning('존재하지않는회사', '010-1234-5678'),
      ).not.toThrow();
    });

    it('빈 phone이나 빈 회사명은 no-op이며 기존 레코드를 건드리지 않는다', () => {
      db.insert(clients)
        .values({ companyName: '동반성장위원회', contactPhone: '01011112222' })
        .run();
      queries.savePhoneLearning('동반성장위원회', '');
      queries.savePhoneLearning('', '010-1234-5678');
      const c = queries.getClient('동반성장위원회');
      expect(c!.contactPhone).toBe('01011112222');
    });
  });

  describe('getAllCompanyNames', () => {
    it('DB의 모든 회사명을 문자열 배열로만 반환한다 (Client 객체 아님)', () => {
      db.insert(clients).values({ companyName: '동반성장위원회' }).run();
      db.insert(clients).values({ companyName: '오아름_뷰티브랜드' }).run();
      db.insert(clients).values({ companyName: '퍼즐코퍼레이션' }).run();

      const names = queries.getAllCompanyNames();
      expect(names).toHaveLength(3);
      expect(names).toEqual(
        expect.arrayContaining([
          '동반성장위원회',
          '오아름_뷰티브랜드',
          '퍼즐코퍼레이션',
        ]),
      );

      // D-04: 각 원소는 string이어야 하며 Client 객체가 아니다
      for (const n of names) {
        expect(typeof n).toBe('string');
      }
    });

    it('DB가 비어 있으면 빈 배열을 반환한다', () => {
      expect(queries.getAllCompanyNames()).toEqual([]);
    });
  });
});
