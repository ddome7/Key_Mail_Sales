import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { clients } from '../db/schema.js';
import { createBriefingQueries } from './briefings.js';

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

describe('createBriefingQueries', () => {
  let setup: ReturnType<typeof setupDb>;
  let queries: ReturnType<typeof createBriefingQueries>;
  let clientId: number;

  beforeEach(() => {
    setup = setupDb();
    queries = createBriefingQueries(setup.db);
    const inserted = setup.db
      .insert(clients)
      .values({ companyName: '동반성장위원회' })
      .returning()
      .get();
    clientId = inserted!.id;
  });

  it('saveBriefing 기본 동작: 저장 후 getBriefingBySlackTs로 조회 가능', () => {
    const saved = queries.saveBriefing({
      clientId,
      slackTs: '1712548680.123456',
      slackChannelId: 'C0AQYJ9GJHK',
      occurredAt: '2026-04-08T16:18:00+09:00',
      source: 'ixio',
      summary: '콘텐츠 제작 건 상담',
      actionItems: [
        { who: '대표님', what: '견적서 전달', dueDate: '2026-04-15' },
      ],
      sentiment: {
        tone: 'positive',
        temperature: 'warm',
        rationale: '수의계약 의지 확인',
      },
      rawTranscript: '안녕하세요...',
    });

    expect(saved).toBeDefined();
    expect(saved!.summary).toBe('콘텐츠 제작 건 상담');

    const fetched = queries.getBriefingBySlackTs('1712548680.123456');
    expect(fetched).toBeDefined();
    expect(fetched!.clientId).toBe(clientId);
    expect(fetched!.actionItems).toEqual([
      { who: '대표님', what: '견적서 전달', dueDate: '2026-04-15' },
    ]);
    expect(fetched!.sentiment).toEqual({
      tone: 'positive',
      temperature: 'warm',
      rationale: '수의계약 의지 확인',
    });
  });

  it('slackTs UNIQUE 중복 저장 시 조용히 skip (onConflictDoNothing)', () => {
    const base = {
      clientId,
      slackTs: '1712548680.000001',
      slackChannelId: 'C0AQYJ9GJHK',
      occurredAt: '2026-04-08T16:18:00+09:00',
      source: 'ixio',
      summary: '첫번째 저장',
    };

    const first = queries.saveBriefing(base);
    expect(first).toBeDefined();

    // 두 번째 저장은 throw 하지 않고 기존 레코드를 반환해야 함
    expect(() =>
      queries.saveBriefing({ ...base, summary: '두번째 저장 시도' }),
    ).not.toThrow();

    const second = queries.saveBriefing({
      ...base,
      summary: '세번째 저장 시도',
    });
    // 기존 레코드(첫번째)가 보존되어야 함
    expect(second).toBeDefined();
    expect(second!.summary).toBe('첫번째 저장');

    // 실제 DB row 개수 1개
    const all = queries.getBriefingsByClient(clientId);
    expect(all.length).toBe(1);
  });

  it('getBriefingsByClient: occurredAt 내림차순 정렬', () => {
    const rows = [
      { slackTs: 'ts.001', occurredAt: '2026-04-01T10:00:00+09:00', summary: '오래된 통화' },
      { slackTs: 'ts.002', occurredAt: '2026-04-10T10:00:00+09:00', summary: '최근 통화' },
      { slackTs: 'ts.003', occurredAt: '2026-04-05T10:00:00+09:00', summary: '중간 통화' },
    ];
    for (const r of rows) {
      queries.saveBriefing({
        clientId,
        slackChannelId: 'C0AQYJ9GJHK',
        source: 'ixio',
        ...r,
      });
    }

    const result = queries.getBriefingsByClient(clientId);
    expect(result.map((b) => b.summary)).toEqual([
      '최근 통화',
      '중간 통화',
      '오래된 통화',
    ]);
  });

  it('D-04: 전역 조회 함수(getAllBriefings, listBriefings)가 존재하지 않음', () => {
    const keys = Object.keys(queries);
    expect(keys).not.toContain('getAllBriefings');
    expect(keys).not.toContain('listBriefings');
    expect(keys).not.toContain('getAll');
    expect(keys).not.toContain('listAll');
    // 제공되는 키가 정확히 허용된 3개인지 보장
    expect(keys.sort()).toEqual(
      ['getBriefingBySlackTs', 'getBriefingsByClient', 'saveBriefing'].sort(),
    );
  });

  it('타 clientId 격리: 한 클라이언트 조회가 다른 클라이언트 데이터를 포함하지 않음', () => {
    const otherClientId = setup.db
      .insert(clients)
      .values({ companyName: '타사' })
      .returning()
      .get()!.id;

    queries.saveBriefing({
      clientId,
      slackTs: 'ts.mine.001',
      slackChannelId: 'C0AQYJ9GJHK',
      occurredAt: '2026-04-08T16:18:00+09:00',
      source: 'ixio',
      summary: '우리 통화',
    });
    queries.saveBriefing({
      clientId: otherClientId,
      slackTs: 'ts.other.001',
      slackChannelId: 'C0AQYJ9GJHK',
      occurredAt: '2026-04-08T16:20:00+09:00',
      source: 'ixio',
      summary: '타사 통화',
    });

    const mine = queries.getBriefingsByClient(clientId);
    expect(mine.length).toBe(1);
    expect(mine[0].summary).toBe('우리 통화');
  });
});
