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
      followup_paused INTEGER DEFAULT 0 NOT NULL,
      followup_paused_reason TEXT,
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

// ─── Phase 4 Plan 04-01 확장: 팔로업 차단 + 활성 클라이언트 조회 ────
describe('setFollowupPause (Phase 4 D-20/D-21)', () => {
  let queries: ReturnType<typeof createClientQueries>;
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(() => {
    const setup = createTestDb();
    db = setup.db;
    queries = createClientQueries(db);
    db.insert(clients)
      .values({
        companyName: '동반성장위원회',
        stage: 'NEGOTIATING',
        lastContactDate: '2026-04-01T10:00:00+09:00',
      })
      .run();
  });

  it('paused=true + reason을 넘기면 플래그와 사유가 모두 저장된다', () => {
    queries.setFollowupPause('동반성장위원회', true, '대표님 요청');
    const c = queries.getClient('동반성장위원회');
    expect(c!.followupPaused).toBe(true);
    expect(c!.followupPausedReason).toBe('대표님 요청');
  });

  it('paused=false를 넘기면 플래그가 false가 되고 reason은 null로 초기화된다', () => {
    queries.setFollowupPause('동반성장위원회', true, '잠깐 중단');
    queries.setFollowupPause('동반성장위원회', false);
    const c = queries.getClient('동반성장위원회');
    expect(c!.followupPaused).toBe(false);
    expect(c!.followupPausedReason).toBeNull();
  });

  it('paused=true이지만 reason 생략 시 사유는 null로 저장된다', () => {
    queries.setFollowupPause('동반성장위원회', true);
    const c = queries.getClient('동반성장위원회');
    expect(c!.followupPaused).toBe(true);
    expect(c!.followupPausedReason).toBeNull();
  });

  it('존재하지 않는 companyName은 throw 없이 no-op으로 종료', () => {
    expect(() =>
      queries.setFollowupPause('존재하지않는회사', true, 'test'),
    ).not.toThrow();
    // 기존 레코드는 변경되지 않는다
    const c = queries.getClient('동반성장위원회');
    expect(c!.followupPaused).toBe(false);
  });

  it('빈 companyName은 no-op', () => {
    expect(() => queries.setFollowupPause('', true)).not.toThrow();
    const c = queries.getClient('동반성장위원회');
    expect(c!.followupPaused).toBe(false);
  });

  it('updatedAt이 setFollowupPause 호출 후 갱신된다', () => {
    const before = queries.getClient('동반성장위원회')!;
    // 시간이 다르게 기록되도록 최소 1ms 대기
    const original = before.updatedAt;
    queries.setFollowupPause('동반성장위원회', true, 'touch');
    const after = queries.getClient('동반성장위원회')!;
    expect(after.updatedAt).not.toBe(original);
    expect(new Date(after.updatedAt!).getTime()).toBeGreaterThanOrEqual(
      new Date(original!).getTime(),
    );
  });
});

describe('getActiveFollowupClients (Phase 4 D-20)', () => {
  let queries: ReturnType<typeof createClientQueries>;
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(() => {
    const setup = createTestDb();
    db = setup.db;
    queries = createClientQueries(db);
  });

  it('stage="DORMANT"인 클라이언트는 제외된다', () => {
    db.insert(clients)
      .values({
        companyName: '활성사',
        stage: 'NEGOTIATING',
        lastContactDate: '2026-04-01',
      })
      .run();
    db.insert(clients)
      .values({
        companyName: '휴면사',
        stage: 'DORMANT',
        lastContactDate: '2026-04-01',
      })
      .run();

    const result = queries.getActiveFollowupClients();
    expect(result.map((c) => c.companyName)).toEqual(['활성사']);
  });

  it('followupPaused=true인 클라이언트는 제외된다', () => {
    db.insert(clients)
      .values({
        companyName: '활성사',
        stage: 'NEGOTIATING',
        lastContactDate: '2026-04-01',
      })
      .run();
    db.insert(clients)
      .values({
        companyName: '차단사',
        stage: 'NEGOTIATING',
        lastContactDate: '2026-04-01',
      })
      .run();
    queries.setFollowupPause('차단사', true, '대표님 요청');

    const result = queries.getActiveFollowupClients();
    expect(result.map((c) => c.companyName)).toEqual(['활성사']);
  });

  it('lastContactDate 오름차순(오래된 순)으로 정렬되어 반환된다', () => {
    db.insert(clients)
      .values({ companyName: 'B_최근', stage: 'LEAD', lastContactDate: '2026-04-10' })
      .run();
    db.insert(clients)
      .values({ companyName: 'A_오래됨', stage: 'LEAD', lastContactDate: '2026-04-01' })
      .run();
    db.insert(clients)
      .values({ companyName: 'C_중간', stage: 'LEAD', lastContactDate: '2026-04-05' })
      .run();

    const result = queries.getActiveFollowupClients();
    expect(result.map((c) => c.companyName)).toEqual([
      'A_오래됨',
      'C_중간',
      'B_최근',
    ]);
  });

  it('lastContactDate가 null인 레코드는 SQLite 오름차순 정렬에서 가장 앞에 온다 (null-first)', () => {
    db.insert(clients)
      .values({ companyName: '날짜있음', stage: 'LEAD', lastContactDate: '2026-04-01' })
      .run();
    db.insert(clients)
      .values({ companyName: '날짜없음', stage: 'LEAD', lastContactDate: null })
      .run();

    const result = queries.getActiveFollowupClients();
    expect(result[0]!.companyName).toBe('날짜없음');
    expect(result[1]!.companyName).toBe('날짜있음');
  });

  it('DB에 활성 클라이언트가 없으면 빈 배열을 반환한다', () => {
    db.insert(clients)
      .values({ companyName: '휴면사', stage: 'DORMANT', lastContactDate: '2026-04-01' })
      .run();
    expect(queries.getActiveFollowupClients()).toEqual([]);
  });

  it('DORMANT가 아니면서 followupPaused=false인 모든 클라이언트를 반환한다 (통합)', () => {
    db.insert(clients)
      .values({ companyName: '활성1', stage: 'LEAD', lastContactDate: '2026-04-05' })
      .run();
    db.insert(clients)
      .values({ companyName: '활성2', stage: 'NEGOTIATING', lastContactDate: '2026-04-03' })
      .run();
    db.insert(clients)
      .values({ companyName: '휴면', stage: 'DORMANT', lastContactDate: '2026-04-01' })
      .run();
    db.insert(clients)
      .values({ companyName: '차단', stage: 'LEAD', lastContactDate: '2026-04-02' })
      .run();
    queries.setFollowupPause('차단', true, 'test');

    const result = queries.getActiveFollowupClients();
    expect(result.map((c) => c.companyName)).toEqual(['활성2', '활성1']);
  });
});
