import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { clients } from '../db/schema.js';
import { createTouchpointQueries } from './touchpoints.js';

function setupDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const drizzleDir = resolve(process.cwd(), 'drizzle', 'migrations');
  const sqlFiles = readdirSync(drizzleDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of sqlFiles) {
    const sql = readFileSync(join(drizzleDir, f), 'utf-8');
    sql.split('--> statement-breakpoint').forEach((stmt) => {
      const trimmed = stmt.trim();
      if (trimmed) sqlite.exec(trimmed);
    });
  }
  const db = drizzle(sqlite);
  return { db, sqlite };
}

describe('createTouchpointQueries', () => {
  let setup: ReturnType<typeof setupDb>;
  let queries: ReturnType<typeof createTouchpointQueries>;
  let clientId: number;
  let otherClientId: number;

  beforeEach(() => {
    setup = setupDb();
    queries = createTouchpointQueries(setup.db);
    clientId = setup.db
      .insert(clients)
      .values({ companyName: '동반성장위원회' })
      .returning()
      .get()!.id;
    otherClientId = setup.db
      .insert(clients)
      .values({ companyName: '타사' })
      .returning()
      .get()!.id;
  });

  it('createTouchpoint 기본: 저장 후 id/clientId 확인', () => {
    const tp = queries.createTouchpoint({
      clientId,
      type: 'call',
      sourceId: '1712548680.123456',
      summary: '통화 브리핑 생성됨',
      occurredAt: '2026-04-08T16:18:00+09:00',
    });

    expect(tp.id).toBeGreaterThan(0);
    expect(tp.clientId).toBe(clientId);
    expect(tp.type).toBe('call');
    expect(tp.summary).toBe('통화 브리핑 생성됨');
  });

  it('getTimelineByClient: occurredAt 내림차순 + limit 준수', () => {
    const rows = [
      { sourceId: 't1', summary: '첫번째', occurredAt: '2026-04-01T10:00:00+09:00' },
      { sourceId: 't2', summary: '두번째', occurredAt: '2026-04-10T10:00:00+09:00' },
      { sourceId: 't3', summary: '세번째', occurredAt: '2026-04-05T10:00:00+09:00' },
    ];
    for (const r of rows) {
      queries.createTouchpoint({
        clientId,
        type: 'email',
        ...r,
      });
    }

    const all = queries.getTimelineByClient(clientId);
    expect(all.map((t) => t.summary)).toEqual(['두번째', '세번째', '첫번째']);

    const limited = queries.getTimelineByClient(clientId, 2);
    expect(limited.length).toBe(2);
    expect(limited.map((t) => t.summary)).toEqual(['두번째', '세번째']);
  });

  it('D-04 격리: 타 clientId 데이터가 포함되지 않음', () => {
    queries.createTouchpoint({
      clientId,
      type: 'call',
      sourceId: 'mine-1',
      summary: '우리 통화 1',
      occurredAt: '2026-04-08T10:00:00+09:00',
    });
    queries.createTouchpoint({
      clientId,
      type: 'email',
      sourceId: 'mine-2',
      summary: '우리 이메일',
      occurredAt: '2026-04-09T10:00:00+09:00',
    });
    queries.createTouchpoint({
      clientId: otherClientId,
      type: 'call',
      sourceId: 'other-1',
      summary: '타사 통화',
      occurredAt: '2026-04-10T10:00:00+09:00',
    });

    const mine = queries.getTimelineByClient(clientId);
    expect(mine.length).toBe(2);
    expect(mine.every((t) => t.clientId === clientId)).toBe(true);
    expect(mine.some((t) => t.summary === '타사 통화')).toBe(false);
  });

  it('FK 제약: 존재하지 않는 clientId로 createTouchpoint 시 에러', () => {
    expect(() =>
      queries.createTouchpoint({
        clientId: 99999,
        type: 'call',
        sourceId: 'ghost',
        summary: '유령 클라이언트',
        occurredAt: '2026-04-08T10:00:00+09:00',
      }),
    ).toThrow();
  });

  it('D-04: 전역 조회 함수가 존재하지 않음', () => {
    const keys = Object.keys(queries);
    expect(keys).not.toContain('getAllTouchpoints');
    expect(keys).not.toContain('listTouchpoints');
    expect(keys).not.toContain('getAll');
    expect(keys).not.toContain('listAll');
    expect(keys.sort()).toEqual(
      ['createTouchpoint', 'getTimelineByClient'].sort(),
    );
  });
});
