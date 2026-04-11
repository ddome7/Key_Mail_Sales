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
    // Phase 4 Plan 04-01에서 getLastOutboundByClient/getLastInboundByClient 2개 추가.
    // 모든 조회 메서드는 여전히 clientId를 강제한다 — D-04 격리 원칙 유지.
    expect(keys.sort()).toEqual(
      [
        'createTouchpoint',
        'getTimelineByClient',
        'getLastOutboundByClient',
        'getLastInboundByClient',
      ].sort(),
    );
  });
});

// ─── Phase 4 Plan 04-01 확장: getLastOutbound / getLastInbound ─────
describe('getLastOutboundByClient (Phase 4 D-02/D-04)', () => {
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

  it('type="email_sent" 단독 기록을 조회한다', () => {
    queries.createTouchpoint({
      clientId,
      type: 'email_sent',
      sourceId: 'thread-1',
      summary: '제안서 발송',
      occurredAt: '2026-04-01T10:00:00+09:00',
    });
    const result = queries.getLastOutboundByClient(clientId);
    expect(result).toBeDefined();
    expect(result!.type).toBe('email_sent');
    expect(result!.summary).toBe('제안서 발송');
  });

  it('type="call" 단독 기록도 outbound로 간주한다', () => {
    queries.createTouchpoint({
      clientId,
      type: 'call',
      sourceId: '1712548680.123456',
      summary: '통화 브리핑',
      occurredAt: '2026-04-02T14:00:00+09:00',
    });
    const result = queries.getLastOutboundByClient(clientId);
    expect(result).toBeDefined();
    expect(result!.type).toBe('call');
  });

  it('D-04 후방 호환: legacy type="email" 레코드도 outbound로 조회된다', () => {
    queries.createTouchpoint({
      clientId,
      type: 'email',
      sourceId: 'thread-legacy',
      summary: 'Phase 3 레거시 이메일',
      occurredAt: '2026-03-15T09:00:00+09:00',
    });
    const result = queries.getLastOutboundByClient(clientId);
    expect(result).toBeDefined();
    expect(result!.type).toBe('email');
    expect(result!.summary).toBe('Phase 3 레거시 이메일');
  });

  it('type="email_received"는 outbound로 간주하지 않는다', () => {
    queries.createTouchpoint({
      clientId,
      type: 'email_received',
      sourceId: 'thread-1',
      summary: '클라이언트 답장',
      occurredAt: '2026-04-03T08:00:00+09:00',
    });
    const result = queries.getLastOutboundByClient(clientId);
    expect(result).toBeUndefined();
  });

  it('여러 outbound 기록 중 occurredAt이 가장 최근인 것 1건을 반환한다', () => {
    queries.createTouchpoint({
      clientId,
      type: 'email_sent',
      sourceId: 't1',
      summary: '첫번째',
      occurredAt: '2026-04-01T10:00:00+09:00',
    });
    queries.createTouchpoint({
      clientId,
      type: 'call',
      sourceId: 't2',
      summary: '최근 통화',
      occurredAt: '2026-04-05T10:00:00+09:00',
    });
    queries.createTouchpoint({
      clientId,
      type: 'email',
      sourceId: 't3',
      summary: '중간 legacy email',
      occurredAt: '2026-04-03T10:00:00+09:00',
    });
    const result = queries.getLastOutboundByClient(clientId);
    expect(result!.summary).toBe('최근 통화');
  });

  it('매칭 레코드가 없으면 undefined 반환', () => {
    expect(queries.getLastOutboundByClient(clientId)).toBeUndefined();
  });

  it('D-04 격리: 타 clientId의 outbound는 반환하지 않는다', () => {
    queries.createTouchpoint({
      clientId: otherClientId,
      type: 'email_sent',
      sourceId: 'other',
      summary: '타사 발송',
      occurredAt: '2026-04-05T10:00:00+09:00',
    });
    expect(queries.getLastOutboundByClient(clientId)).toBeUndefined();
  });

  it('stage_change는 outbound 판정에서 제외된다', () => {
    queries.createTouchpoint({
      clientId,
      type: 'stage_change',
      sourceId: 'deal-1',
      summary: 'LEAD → NEGOTIATING',
      occurredAt: '2026-04-01T10:00:00+09:00',
    });
    expect(queries.getLastOutboundByClient(clientId)).toBeUndefined();
  });
});

describe('getLastInboundByClient (Phase 4 D-02)', () => {
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

  it('sinceIso 이후의 email_received 레코드를 반환한다', () => {
    queries.createTouchpoint({
      clientId,
      type: 'email_received',
      sourceId: 'thread-1',
      summary: '클라이언트 답장',
      occurredAt: '2026-04-03T08:00:00+09:00',
    });
    const result = queries.getLastInboundByClient(
      clientId,
      '2026-04-01T00:00:00+09:00',
    );
    expect(result).toBeDefined();
    expect(result!.type).toBe('email_received');
    expect(result!.summary).toBe('클라이언트 답장');
  });

  it('sinceIso보다 이전의 inbound는 제외된다', () => {
    queries.createTouchpoint({
      clientId,
      type: 'email_received',
      sourceId: 'thread-1',
      summary: '오래된 답장',
      occurredAt: '2026-03-01T10:00:00+09:00',
    });
    const result = queries.getLastInboundByClient(
      clientId,
      '2026-04-01T00:00:00+09:00',
    );
    expect(result).toBeUndefined();
  });

  it('type="email_sent"는 inbound로 간주하지 않는다', () => {
    queries.createTouchpoint({
      clientId,
      type: 'email_sent',
      sourceId: 'thread-1',
      summary: '대표님이 보낸 메일',
      occurredAt: '2026-04-05T10:00:00+09:00',
    });
    const result = queries.getLastInboundByClient(
      clientId,
      '2026-04-01T00:00:00+09:00',
    );
    expect(result).toBeUndefined();
  });

  it('여러 inbound 중 가장 최근 1건만 반환한다', () => {
    queries.createTouchpoint({
      clientId,
      type: 'email_received',
      sourceId: 'thread-1',
      summary: '첫번째 답장',
      occurredAt: '2026-04-02T10:00:00+09:00',
    });
    queries.createTouchpoint({
      clientId,
      type: 'email_received',
      sourceId: 'thread-1',
      summary: '두번째 답장',
      occurredAt: '2026-04-05T10:00:00+09:00',
    });
    const result = queries.getLastInboundByClient(
      clientId,
      '2026-04-01T00:00:00+09:00',
    );
    expect(result!.summary).toBe('두번째 답장');
  });

  it('매칭 레코드 없으면 undefined', () => {
    expect(
      queries.getLastInboundByClient(clientId, '2026-04-01T00:00:00+09:00'),
    ).toBeUndefined();
  });

  it('D-04 격리: 타 clientId의 inbound는 반환하지 않는다', () => {
    queries.createTouchpoint({
      clientId: otherClientId,
      type: 'email_received',
      sourceId: 'other-thread',
      summary: '타사 답장',
      occurredAt: '2026-04-05T10:00:00+09:00',
    });
    expect(
      queries.getLastInboundByClient(clientId, '2026-04-01T00:00:00+09:00'),
    ).toBeUndefined();
  });
});
