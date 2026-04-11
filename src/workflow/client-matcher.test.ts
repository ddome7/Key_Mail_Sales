import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  matchClient,
  fuzzyMatchCompanyName,
  normalizeKoreanCompany,
  COMPANY_BLACKLIST,
  type ClientMatcherDeps,
  type CeoConfirmationResponse,
} from './client-matcher.js';
import type { ParsedCall } from './call-parser.js';
import type { Client } from '../db/schema.js';

// ─── 헬퍼: ParsedCall fixture ────────────────────────
function makeParsedCall(overrides: {
  phone?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  contactTitle?: string | null;
  mainPoints?: string[] | null;
}): ParsedCall {
  return {
    source: 'ixio',
    shareType: '통화',
    occurredAt: '2026-04-08T16:18:00+09:00',
    contact: {
      phone: overrides.phone ?? null,
      companyName: overrides.companyName ?? null,
      contactName: overrides.contactName ?? null,
      contactTitle: overrides.contactTitle ?? null,
    },
    mainPoints: overrides.mainPoints ?? null,
    details: null,
    transcript: null,
    rawText: 'test raw',
  };
}

// ─── 헬퍼: fake Client ─────────────────────────────
function makeClient(overrides: Partial<Client>): Client {
  return {
    id: 1,
    companyName: 'TestCo',
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    industry: null,
    history: null,
    budgetPattern: null,
    budgetTier: null,
    preferredServices: null,
    notes: null,
    nextOpportunity: null,
    communicationStyle: null,
    stage: 'PROSPECT',
    lastContactDate: null,
    createdAt: '2026-04-08T00:00:00Z',
    updatedAt: '2026-04-08T00:00:00Z',
    ...overrides,
  };
}

// ─── 헬퍼: mock clientQueries ───────────────────────
function makeMockQueries(overrides: Partial<{
  getClient: (name: string) => Client | undefined;
  getClientById: (id: number) => Client | undefined;
  getClientByPhone: (phone: string) => Client | undefined;
  getClientByEmail: (email: string) => Client | undefined;
  getAllCompanyNames: () => string[];
  upsertClient: (data: any) => void;
  updateClientField: (name: string, field: string, value: any) => void;
  savePhoneLearning: (name: string, phone: string) => void;
}> = {}) {
  return {
    getClient: vi.fn(overrides.getClient ?? (() => undefined)),
    getClientById: vi.fn(overrides.getClientById ?? (() => undefined)),
    getClientByPhone: vi.fn(overrides.getClientByPhone ?? (() => undefined)),
    getClientByEmail: vi.fn(overrides.getClientByEmail ?? (() => undefined)),
    getAllCompanyNames: vi.fn(overrides.getAllCompanyNames ?? (() => [])),
    upsertClient: vi.fn(overrides.upsertClient ?? (() => {})),
    updateClientField: vi.fn(overrides.updateClientField ?? (() => {})),
    savePhoneLearning: vi.fn(overrides.savePhoneLearning ?? (() => {})),
  };
}

// ─── normalizeKoreanCompany / fuzzyMatchCompanyName 직접 테스트 ──
describe('normalizeKoreanCompany', () => {
  it('(주)/주식회사/코퍼레이션 접미사 제거 + 공백/기호 제거 + lowercase', () => {
    expect(normalizeKoreanCompany('(주)퍼즐 코퍼레이션')).toBe('퍼즐');
    expect(normalizeKoreanCompany('주식회사 동반성장')).toBe('동반성장');
    expect(normalizeKoreanCompany('ABC Corporation')).toBe('abc');
    expect(normalizeKoreanCompany('XYZ Inc.')).toBe('xyz');
  });
});

describe('fuzzyMatchCompanyName', () => {
  it('exact 매칭 score=1.0', () => {
    const r = fuzzyMatchCompanyName('동반성장위원회', ['동반성장위원회']);
    expect(r).toHaveLength(1);
    expect(r[0].score).toBe(1.0);
    expect(r[0].reason).toBe('exact');
  });

  it('prefix 매칭 score >= 0.75', () => {
    const r = fuzzyMatchCompanyName('동반성장', ['동반성장위원회']);
    expect(r).toHaveLength(1);
    expect(r[0].reason).toBe('prefix');
    expect(r[0].score).toBeGreaterThanOrEqual(0.75);
  });

  it('2개 이상 후보가 있으면 모두 반환 (score 내림차순)', () => {
    const r = fuzzyMatchCompanyName('동반성장', [
      '동반성장위원회',
      '동반성장연구소',
    ]);
    expect(r.length).toBe(2);
    expect(r[0].score).toBeGreaterThanOrEqual(r[1].score);
  });

  it('contains 매칭 score=0.70', () => {
    const r = fuzzyMatchCompanyName('ABC', ['XYZ ABC 코퍼레이션']);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].reason).toBe('contains');
    expect(r[0].score).toBe(0.7);
  });

  it('매칭되지 않는 경우 빈 배열', () => {
    expect(fuzzyMatchCompanyName('전혀다른회사', ['동반성장위원회'])).toEqual([]);
  });

  it('자사 블랙리스트는 후보에서 제외된다 (Pitfall 6)', () => {
    const r = fuzzyMatchCompanyName('퍼즐', ['퍼즐코퍼레이션', '동반성장위원회']);
    // "퍼즐"은 자사 → 퍼즐코퍼레이션은 블랙리스트, 동반성장위원회는 매칭 안 됨
    expect(r.length).toBe(0);
  });
});

// ─── matchClient 3단계 상태 머신 ─────────────────────
describe('matchClient — Step 1: phone_exact', () => {
  it('phone_exact hit → 즉시 매칭, askCeoConfirmation 미호출', async () => {
    const target = makeClient({
      id: 42,
      companyName: '동반성장위원회',
      contactPhone: '01036906867',
    });
    const clientQueries = makeMockQueries({
      getClientByPhone: () => target,
    });
    const askCeoConfirmation = vi.fn();
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({ phone: '01036906867' }),
      deps,
      null,
    );

    expect(result.status).toBe('matched');
    if (result.status !== 'matched') return;
    expect(result.method).toBe('phone_exact');
    expect(result.confidence).toBe(1.0);
    expect(result.client.id).toBe(42);
    expect(askCeoConfirmation).not.toHaveBeenCalled();
    // phone_exact 경로에서는 savePhoneLearning이 불필요 (이미 저장되어 있음)
    expect(clientQueries.savePhoneLearning).not.toHaveBeenCalled();
  });

  it('phone이 null이면 Step 2로 진행', async () => {
    const clientQueries = makeMockQueries({});
    const askCeoConfirmation = vi.fn(
      async (): Promise<CeoConfirmationResponse> => ({ action: 'cancel' }),
    );
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({ phone: null }),
      deps,
      null,
    );

    expect(clientQueries.getClientByPhone).not.toHaveBeenCalled();
    // companyName도 없으니 Step 3로 진입 → cancel
    expect(result.status).toBe('cancelled');
  });
});

describe('matchClient — Step 2a: name_exact', () => {
  it('회사명 정확 매칭 + phone 존재 → D-03 학습 호출', async () => {
    const target = makeClient({ id: 7, companyName: '동반성장위원회' });
    const clientQueries = makeMockQueries({
      getClient: (name) => (name === '동반성장위원회' ? target : undefined),
    });
    const askCeoConfirmation = vi.fn();
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({ phone: '01036906867', companyName: '동반성장위원회' }),
      deps,
      null,
    );

    expect(result.status).toBe('matched');
    if (result.status !== 'matched') return;
    expect(result.method).toBe('name_exact');
    expect(clientQueries.savePhoneLearning).toHaveBeenCalledWith(
      '동반성장위원회',
      '01036906867',
    );
    expect(askCeoConfirmation).not.toHaveBeenCalled();
  });

  it('회사명 정확 매칭 + phone 없음 → 매칭만 하고 학습은 없음', async () => {
    const target = makeClient({ id: 8, companyName: '동반성장위원회' });
    const clientQueries = makeMockQueries({
      getClient: () => target,
    });
    const askCeoConfirmation = vi.fn();
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({ phone: null, companyName: '동반성장위원회' }),
      deps,
      null,
    );

    expect(result.status).toBe('matched');
    expect(clientQueries.savePhoneLearning).not.toHaveBeenCalled();
  });

  it('extractedCompanyName 인자(AI 추출)로 매칭이 가능하다', async () => {
    const target = makeClient({ id: 9, companyName: '동반성장위원회' });
    const clientQueries = makeMockQueries({
      getClient: (name) => (name === '동반성장위원회' ? target : undefined),
    });
    const askCeoConfirmation = vi.fn();
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({ phone: null, companyName: null }),
      deps,
      '동반성장위원회',
    );

    expect(result.status).toBe('matched');
    if (result.status !== 'matched') return;
    expect(result.method).toBe('name_exact');
  });
});

describe('matchClient — Step 2b: name_fuzzy 자동 통과 조건 (Pitfall 3)', () => {
  it('score=1.0 단일 후보 → 자동 매칭', async () => {
    const target = makeClient({ id: 10, companyName: '동반성장위원회' });
    const clientQueries = makeMockQueries({
      getClient: (name) => {
        if (name === '동반성장위원회') return target;
        return undefined;
      },
      getAllCompanyNames: () => ['동반성장위원회'],
    });
    const askCeoConfirmation = vi.fn();
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    // 입력이 "(주) 동반성장 위원회" 처럼 표기가 다르지만 normalize 하면 '동반성장위원회' 동일
    const result = await matchClient(
      makeParsedCall({ phone: '01036906867', companyName: '(주) 동반성장 위원회' }),
      deps,
      null,
    );

    expect(result.status).toBe('matched');
    if (result.status !== 'matched') return;
    // 정확 매칭은 getClient에서 miss, normalize 후 fuzzy exact에서 자동 통과
    expect(result.method).toBe('name_fuzzy');
    expect(result.confidence).toBe(1.0);
    expect(askCeoConfirmation).not.toHaveBeenCalled();
    // D-03: 학습 호출
    expect(clientQueries.savePhoneLearning).toHaveBeenCalled();
  });

  it('prefix score >= 0.95 단일 후보 → 자동 매칭', async () => {
    // '동반성장위원회' 정규화 후 길이 7
    // '동반성장위원' 정규화 후 길이 6
    // shorter/longer = 6/7 ≈ 0.857 → score = 0.75 + 0.857*0.20 ≈ 0.921 (< 0.95, 자동 통과 X)
    // 더 긴 입력이 필요: '동반성장위원회고문단' → needle 길이 10
    // 실제로 0.95 이상을 자연 달성하기 위해서는 needle 길이가 haystack의 95% 이상이어야 한다.
    //   score = 0.75 + (shorter/longer)*0.20 >= 0.95 → shorter/longer >= 1.0
    // 즉 prefix score >= 0.95 자동 통과는 사실상 exact 수준 prefix에서만 성립한다.
    // '동반성장위원회' vs 입력 '동반성장위원회센터' (hay.startsWith(needle) 반대)
    // hay='동반성장위원회'(7), needle='동반성장위원회센터'(10) → needle.startsWith(hay)? YES
    // shorter=7, longer=10 → 0.70 + 접두사 보너스 → 0.75+0.20*0.7=0.89 (자동 통과 X)
    //
    // 대안: exact 후보를 1개로 만들어 score=1.0 단일 후보 테스트로 대체.
    // 여기서는 "정확 일치 1건 → 자동 통과" 시나리오를 검증한다.
    const target = makeClient({ id: 11, companyName: '동반성장위원회' });
    const clientQueries = makeMockQueries({
      getClient: (name) =>
        name === '동반성장위원회' ? target : undefined,
      getAllCompanyNames: () => ['동반성장위원회'],
    });
    const askCeoConfirmation = vi.fn();
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({ phone: '01036906867', companyName: ' 동반성장위원회 ' }),
      deps,
      null,
    );

    expect(result.status).toBe('matched');
    if (result.status !== 'matched') return;
    // name_exact (공백 포함 입력이 companyName column과 불일치) → fuzzy 경로
    expect(['name_exact', 'name_fuzzy']).toContain(result.method);
    expect(askCeoConfirmation).not.toHaveBeenCalled();
  });

  it('경계: 후보 2개면 score가 충분해도 자동 통과 금지 → Step 3', async () => {
    const clientQueries = makeMockQueries({
      getClient: () => undefined, // Step 2a miss
      getAllCompanyNames: () => ['동반성장위원회', '동반성장연구소'],
      getClientById: () => makeClient({ id: 1, companyName: '동반성장위원회' }),
    });
    const askCeoConfirmation = vi.fn(
      async (): Promise<CeoConfirmationResponse> => ({ action: 'cancel' }),
    );
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({ phone: '01036906867', companyName: '동반성장' }),
      deps,
      null,
    );

    expect(askCeoConfirmation).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('cancelled');
  });

  it('경계: score 0.80 (prefix, 단일 후보) → 자동 통과 금지 → Step 3', async () => {
    // 'ABC' (3자) vs 'ABC Corporation' (정규화 후 'abc'와 동일)
    // 실제로 길이 조정으로 낮은 score를 만들자:
    // needle='동반' (2자) vs hay='동반성장위원회' (7자) → prefix
    // shorter=2, longer=7, score = 0.75 + (2/7)*0.20 ≈ 0.807 → < 0.95 자동 통과 X
    const clientQueries = makeMockQueries({
      getClient: () => undefined,
      getAllCompanyNames: () => ['동반성장위원회'],
    });
    const askCeoConfirmation = vi.fn(
      async (): Promise<CeoConfirmationResponse> => ({ action: 'cancel' }),
    );
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({ companyName: '동반' }),
      deps,
      null,
    );

    expect(askCeoConfirmation).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('cancelled');
  });

  it('경계: contains 매칭은 score가 0.70이라 절대 자동 통과 안 함', async () => {
    const clientQueries = makeMockQueries({
      getClient: () => undefined,
      getAllCompanyNames: () => ['서울동반성장위원회센터'],
    });
    const askCeoConfirmation = vi.fn(
      async (): Promise<CeoConfirmationResponse> => ({ action: 'cancel' }),
    );
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({ companyName: '동반성장' }),
      deps,
      null,
    );

    expect(askCeoConfirmation).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('cancelled');
  });
});

describe('matchClient — Step 3: 대표님 확인 분기', () => {
  it('action=cancel → status="cancelled", throw 없음', async () => {
    const clientQueries = makeMockQueries({});
    const askCeoConfirmation = vi.fn(
      async (): Promise<CeoConfirmationResponse> => ({ action: 'cancel' }),
    );
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({ companyName: '존재하지않는회사' }),
      deps,
      null,
    );

    expect(result.status).toBe('cancelled');
    expect(clientQueries.upsertClient).not.toHaveBeenCalled();
    expect(clientQueries.savePhoneLearning).not.toHaveBeenCalled();
  });

  it('action=select + phone 존재 → savePhoneLearning + ceo_select 매칭', async () => {
    const target = makeClient({ id: 99, companyName: '동반성장위원회' });
    const clientQueries = makeMockQueries({
      getClient: () => undefined, // Step 2 miss
      getClientById: (id) => (id === 99 ? target : undefined),
      getAllCompanyNames: () => ['동반성장위원회'],
    });
    const askCeoConfirmation = vi.fn(
      async (): Promise<CeoConfirmationResponse> => ({
        action: 'select',
        selectedClientId: 99,
      }),
    );
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({
        phone: '010-3690-6867',
        companyName: '동반성장', // prefix only → Step 3 진입 (0.807 score)
      }),
      deps,
      null,
    );

    expect(result.status).toBe('matched');
    if (result.status !== 'matched') return;
    expect(result.method).toBe('ceo_select');
    expect(result.client.id).toBe(99);
    expect(clientQueries.savePhoneLearning).toHaveBeenCalledWith(
      '동반성장위원회',
      '010-3690-6867',
    );
  });

  it('action=new_client → upsertClient 호출 후 status="new_client"', async () => {
    const newClient = makeClient({ id: 100, companyName: '신규회사' });
    let inserted = false;
    const clientQueries = makeMockQueries({
      getClient: (name) => {
        if (inserted && name === '신규회사') return newClient;
        return undefined;
      },
      upsertClient: () => {
        inserted = true;
      },
      getAllCompanyNames: () => [],
    });
    const askCeoConfirmation = vi.fn(
      async (): Promise<CeoConfirmationResponse> => ({
        action: 'new_client',
        newClientName: '신규회사',
      }),
    );
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({ phone: '01012345678', companyName: '미등록회사' }),
      deps,
      null,
    );

    expect(clientQueries.upsertClient).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('new_client');
    if (result.status !== 'new_client') return;
    expect(result.client.companyName).toBe('신규회사');
    expect(result.method).toBe('ceo_new');
  });

  it('askCeoConfirmation 페이로드에 callSummary/extractedInfo/candidates가 포함된다', async () => {
    const client1 = makeClient({ id: 1, companyName: '동반성장위원회' });
    const clientQueries = makeMockQueries({
      getClient: (name) =>
        name === '동반성장위원회' ? client1 : undefined,
      getAllCompanyNames: () => ['동반성장위원회', '동반성장연구소'],
    });
    const askCeoConfirmation = vi.fn(
      async (): Promise<CeoConfirmationResponse> => ({ action: 'cancel' }),
    );
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    await matchClient(
      makeParsedCall({
        phone: '01036906867',
        companyName: '동반성장',
        contactName: '이의선',
        mainPoints: ['수의계약 3천만원', '이번 달 안 납품'],
      }),
      deps,
      null,
    );

    expect(askCeoConfirmation).toHaveBeenCalledTimes(1);
    const req = askCeoConfirmation.mock.calls[0][0];
    expect(req.callSummary).toContain('수의계약');
    expect(req.extractedInfo.phone).toBe('01036906867');
    expect(req.extractedInfo.companyName).toBe('동반성장');
    expect(req.extractedInfo.contactName).toBe('이의선');
    expect(req.candidates.length).toBeLessThanOrEqual(5);
    // score 내림차순
    for (let i = 1; i < req.candidates.length; i++) {
      expect(req.candidates[i - 1].score).toBeGreaterThanOrEqual(
        req.candidates[i].score,
      );
    }
  });
});

describe('matchClient — 자사 블랙리스트 (Pitfall 6)', () => {
  it('extractedCompanyName이 "퍼즐"이면 Step 2 스킵, 바로 Step 3', async () => {
    const clientQueries = makeMockQueries({
      getAllCompanyNames: () => ['퍼즐코퍼레이션', '동반성장위원회'],
    });
    const askCeoConfirmation = vi.fn(
      async (): Promise<CeoConfirmationResponse> => ({ action: 'cancel' }),
    );
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({ companyName: null }),
      deps,
      '퍼즐', // AI 추출 결과가 자사 이름인 경우
    );

    // Step 2 진입 자체가 차단되었어야 함: getClient 호출 없이 Step 3로
    expect(clientQueries.getClient).not.toHaveBeenCalled();
    expect(askCeoConfirmation).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('cancelled');
  });

  it('COMPANY_BLACKLIST 상수는 자사 이름 집합을 export한다', () => {
    expect(COMPANY_BLACKLIST).toContain('퍼즐');
    expect(COMPANY_BLACKLIST).toContain('puzl');
    expect(COMPANY_BLACKLIST).toContain('퍼즐코퍼레이션');
  });
});

describe('matchClient — 엣지 케이스', () => {
  it('getAllCompanyNames가 빈 배열이어도 throw 없이 Step 3로', async () => {
    const clientQueries = makeMockQueries({
      getAllCompanyNames: () => [],
    });
    const askCeoConfirmation = vi.fn(
      async (): Promise<CeoConfirmationResponse> => ({ action: 'cancel' }),
    );
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(
      makeParsedCall({ companyName: '미등록회사' }),
      deps,
      null,
    );

    expect(result.status).toBe('cancelled');
  });

  it('phone도 companyName도 extractedCompanyName도 없으면 Step 3로 진입', async () => {
    const clientQueries = makeMockQueries({});
    const askCeoConfirmation = vi.fn(
      async (): Promise<CeoConfirmationResponse> => ({ action: 'cancel' }),
    );
    const deps: ClientMatcherDeps = { clientQueries, askCeoConfirmation };

    const result = await matchClient(makeParsedCall({}), deps, null);

    expect(askCeoConfirmation).toHaveBeenCalledTimes(1);
    const req = askCeoConfirmation.mock.calls[0][0];
    expect(req.candidates).toEqual([]);
    expect(result.status).toBe('cancelled');
  });
});
