/**
 * follow-up-composer 단위 테스트 (TDD RED)
 *
 * 대상:
 * - classifyCallFollowUp: 통화 분석 → v4 ULTRA 전략 ('G' 또는 'H')
 * - buildFollowUpSubject: 기존 스레드 있으면 'Re:' 접두사, 없으면 generateSubject
 * - buildFollowUpPrompt: system + userMessage 조립 (경계 마커 + D-04 격리)
 *
 * 안전 검증 포커스:
 * - 대상 클라이언트 정보만 프롬프트에 포함 (D-04)
 * - 프롬프트 인젝션 방지 경계 마커 (<existing_thread>, <call_analysis>)
 * - Pitfall 4: 기존 스레드 subject 보존 + 'Re:' 중복 방지
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyCallFollowUp,
  buildFollowUpSubject,
  buildFollowUpPrompt,
  type FollowUpPromptResult,
  type BuildFollowUpPromptParams,
} from './follow-up-composer.js';
import type { CallAnalysisResult } from './call-analyzer.js';
import type { ThreadMessage } from './thread-loader.js';
import type { Client } from '../db/schema.js';
import type { ClassificationResult } from '../types/classification.js';

// ─── 테스트 픽스처 ────────────────────────────────────────────────

function makeCallAnalysis(
  overrides: Partial<CallAnalysisResult> = {},
): CallAnalysisResult {
  return {
    summary:
      '동반성장위원회 이의선 위원과 콘텐츠 제작 논의. 3천만원 규모 동영상 수의계약 검토.',
    actionItems: [
      {
        who: '대표님',
        what: '4월 말까지 견적서 송부',
        dueDate: '2026-04-30T18:00:00+09:00',
      },
      {
        who: '상대방',
        what: '내부 예산 승인 확인',
        dueDate: null,
      },
    ],
    sentiment: {
      tone: 'positive',
      temperature: 'warm',
      rationale: '이번 달 안 진행 의사 명확, 예산 규모도 확정적',
    },
    extractedCompanyName: '동반성장위원회',
    extractedContactName: '이의선',
    nextContactSuggestion: 'D+2 후속 이메일',
    ...overrides,
  };
}

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 42,
    companyName: '동반성장위원회',
    contactName: '이의선',
    contactEmail: 'contact@example.com',
    contactPhone: '01036906867',
    industry: '공공기관',
    history: null,
    budgetPattern: null,
    budgetTier: 3,
    preferredServices: null,
    notes: null,
    nextOpportunity: null,
    communicationStyle: null,
    stage: 'LEAD',
    lastContactDate: null,
    createdAt: '2026-04-08T10:00:00+09:00',
    updatedAt: '2026-04-08T10:00:00+09:00',
    ...overrides,
  };
}

function makeThreadMessage(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    messageId: 'm-001',
    from: '이의선 <contact@example.com>',
    to: '최영록 <cyr@puzl.co.kr>',
    subject: '[퍼즐/최영록] 동반성장위원회 _ 문의 _ 260408',
    body: '<p>안녕하세요. 콘텐츠 제작 관련 문의드립니다.</p>',
    internalDate: '1712548680000',
    ...overrides,
  };
}

function makeClassification(
  overrides: Partial<ClassificationResult> = {},
): ClassificationResult {
  return {
    strategy: 'G',
    language: 'korean',
    toneLevel: 3,
    urgency: 'normal',
    isNewClient: false,
    hasPricing: false,
    hasObjection: false,
    ...overrides,
  };
}

// ─── classifyCallFollowUp ─────────────────────────────────────────

describe('classifyCallFollowUp — 전략 선택', () => {
  it('기본 케이스는 전략 G (통화 후 요약/액션 확정)', () => {
    const analysis = makeCallAnalysis({
      nextContactSuggestion: 'D+2 후속 이메일',
    });

    const result = classifyCallFollowUp(analysis, true);

    expect(result.strategy).toBe('G');
  });

  it('nextContactSuggestion에 "제안서"가 포함되면 전략 H', () => {
    const analysis = makeCallAnalysis({
      nextContactSuggestion: 'D+7 제안서 발송',
    });

    const result = classifyCallFollowUp(analysis, true);

    expect(result.strategy).toBe('H');
  });

  it('nextContactSuggestion에 "proposal"이 포함되면 전략 H (영문)', () => {
    const analysis = makeCallAnalysis({
      nextContactSuggestion: 'Send proposal next week',
    });

    const result = classifyCallFollowUp(analysis, true);

    expect(result.strategy).toBe('H');
  });

  it('nextContactSuggestion이 null이면 기본 전략 G', () => {
    const analysis = makeCallAnalysis({ nextContactSuggestion: null });

    const result = classifyCallFollowUp(analysis, false);

    expect(result.strategy).toBe('G');
  });

  it('반환값이 Phase 2 ClassificationResult 필드를 모두 포함한다', () => {
    const analysis = makeCallAnalysis();
    const result = classifyCallFollowUp(analysis, true);

    // 필수 필드 전부 존재 (compose.ts/quality-checker.ts 호환)
    expect(result).toHaveProperty('strategy');
    expect(result).toHaveProperty('language');
    expect(result).toHaveProperty('toneLevel');
    expect(result).toHaveProperty('urgency');
    expect(result).toHaveProperty('isNewClient');
    expect(result).toHaveProperty('hasPricing');
    expect(result).toHaveProperty('hasObjection');

    // 기본 언어는 korean (통화 후속은 한국어 가정)
    expect(result.language).toBe('korean');
    // hasExistingThread=true → 기존 고객 (isNewClient=false)
    expect(result.isNewClient).toBe(false);
  });

  it('hasExistingThread=false 이면 isNewClient=true', () => {
    const analysis = makeCallAnalysis();
    const result = classifyCallFollowUp(analysis, false);

    expect(result.isNewClient).toBe(true);
  });

  it('sentiment.tone이 negative/caution이면 hasObjection=true', () => {
    const analysis = makeCallAnalysis({
      sentiment: {
        tone: 'negative',
        temperature: 'cold',
        rationale: '단가에 대한 저항이 크다',
      },
    });

    const result = classifyCallFollowUp(analysis, true);

    expect(result.hasObjection).toBe(true);
  });

  it('sentiment.tone이 positive면 hasObjection=false', () => {
    const analysis = makeCallAnalysis();
    const result = classifyCallFollowUp(analysis, true);

    expect(result.hasObjection).toBe(false);
  });
});

// ─── buildFollowUpSubject (Pitfall 4) ─────────────────────────────

describe('buildFollowUpSubject — Pitfall 4 (subject 보존)', () => {
  const client = makeClient();
  const analysis = makeCallAnalysis();

  it('기존 스레드 존재 → 첫 메시지 subject에 "Re: " 접두사 추가', () => {
    const history = [
      makeThreadMessage({
        subject: '[퍼즐/최영록] 동반성장위원회 _ 문의 _ 260408',
      }),
    ];

    const subject = buildFollowUpSubject(history, client, analysis);

    expect(subject).toBe('Re: [퍼즐/최영록] 동반성장위원회 _ 문의 _ 260408');
  });

  it('기존 스레드 첫 메시지 subject에 이미 "Re:"가 있으면 중복 추가 안 함', () => {
    const history = [
      makeThreadMessage({
        subject: 'Re: [퍼즐/최영록] 동반성장위원회 _ 문의 _ 260408',
      }),
    ];

    const subject = buildFollowUpSubject(history, client, analysis);

    expect(subject).toBe('Re: [퍼즐/최영록] 동반성장위원회 _ 문의 _ 260408');
    // 'Re: Re:' 금지
    expect(subject).not.toMatch(/^Re:\s*Re:/i);
  });

  it('"RE:" (대문자)도 중복 방지', () => {
    const history = [
      makeThreadMessage({
        subject: 'RE: 동반성장위원회 _ 문의',
      }),
    ];

    const subject = buildFollowUpSubject(history, client, analysis);

    expect(subject).toBe('RE: 동반성장위원회 _ 문의');
  });

  it('첫 메시지 subject에 앞뒤 공백이 있어도 trim하여 처리', () => {
    const history = [
      makeThreadMessage({
        subject: '   [퍼즐/최영록] 동반성장위원회 _ 문의 _ 260408   ',
      }),
    ];

    const subject = buildFollowUpSubject(history, client, analysis);

    expect(subject).toBe('Re: [퍼즐/최영록] 동반성장위원회 _ 문의 _ 260408');
  });

  it('기존 스레드 없음 → generateSubject로 신규 제목 생성', () => {
    const subject = buildFollowUpSubject([], client, analysis);

    // Phase 2 generateSubject 형식: [퍼즐/최영록] {companyName} _ {contentSummary} _ {YYMMDD}
    expect(subject).toMatch(/^\[퍼즐\/최영록\] 동반성장위원회 _ 통화 후속 _ \d{6}$/);
  });

  it('신규 제목에 대상 회사명이 정확히 들어감', () => {
    const client2 = makeClient({ companyName: '테스트컴퍼니' });

    const subject = buildFollowUpSubject([], client2, analysis);

    expect(subject).toContain('테스트컴퍼니');
    expect(subject).toContain('통화 후속');
  });
});

// ─── buildFollowUpPrompt ──────────────────────────────────────────

describe('buildFollowUpPrompt — 프롬프트 조립', () => {
  let baseParams: BuildFollowUpPromptParams;

  beforeEach(() => {
    baseParams = {
      classification: makeClassification(),
      callAnalysis: makeCallAnalysis(),
      threadHistory: [],
      client: makeClient(),
      promptSections: '[Mock v4 ULTRA 섹션 지침]',
    };
  });

  describe('대상 클라이언트 한정 (D-04)', () => {
    it('params.client의 정보만 system/userMessage에 등장', () => {
      const result = buildFollowUpPrompt(baseParams);
      const combined = result.system + '\n' + result.userMessage;

      expect(combined).toContain('동반성장위원회');
      expect(combined).toContain('이의선');
    });

    it('다른 클라이언트 데이터가 userMessage에 혼입되지 않는다', () => {
      // userMessage(데이터 영역)에 다른 회사 이름/이메일이 없는지 검증.
      // system 프롬프트의 "경쟁사 언급 금지" 경고는 지시문이므로 제외.
      const result = buildFollowUpPrompt(baseParams);

      expect(result.userMessage).not.toContain('경쟁사');
      expect(result.userMessage).not.toContain('타클라이언트');
      expect(result.userMessage).not.toContain('다른 고객');
    });

    it('system 프롬프트에 "대상 회사 외 언급 금지" 경고 포함', () => {
      const result = buildFollowUpPrompt(baseParams);

      expect(result.system).toContain('동반성장위원회');
      // "다른 회사" "경쟁사" 같은 차단 지침
      expect(result.system.toLowerCase()).toMatch(/다른 회사|경쟁사|타 클라이언트/);
    });
  });

  describe('통화 분석 포함', () => {
    it('summary가 userMessage에 렌더링됨', () => {
      const result = buildFollowUpPrompt(baseParams);

      expect(result.userMessage).toContain(baseParams.callAnalysis.summary);
    });

    it('actionItems가 who/what/dueDate 형태로 포함', () => {
      const result = buildFollowUpPrompt(baseParams);

      expect(result.userMessage).toContain('대표님');
      expect(result.userMessage).toContain('4월 말까지 견적서 송부');
      expect(result.userMessage).toContain('2026-04-30T18:00:00+09:00');
      expect(result.userMessage).toContain('상대방');
      expect(result.userMessage).toContain('내부 예산 승인 확인');
    });

    it('sentiment (tone/temperature/rationale)가 포함', () => {
      const result = buildFollowUpPrompt(baseParams);

      expect(result.userMessage).toContain('positive');
      expect(result.userMessage).toContain('warm');
      expect(result.userMessage).toContain(
        '이번 달 안 진행 의사 명확, 예산 규모도 확정적',
      );
    });

    it('nextContactSuggestion이 있으면 포함, null이면 생략', () => {
      const with_ = buildFollowUpPrompt(baseParams);
      expect(with_.userMessage).toContain('D+2 후속 이메일');

      const without = buildFollowUpPrompt({
        ...baseParams,
        callAnalysis: makeCallAnalysis({ nextContactSuggestion: null }),
      });
      expect(without.userMessage).not.toContain('D+2 후속 이메일');
    });
  });

  describe('기존 스레드 이력', () => {
    it('threadHistory가 비어있지 않으면 각 메시지가 오래된 → 최신 순으로 포함', () => {
      const history: ThreadMessage[] = [
        makeThreadMessage({
          messageId: 'm1',
          subject: '첫 메시지',
          body: '초기 문의 본문',
          internalDate: '1000',
        }),
        makeThreadMessage({
          messageId: 'm2',
          subject: '두 번째',
          body: '답변 본문',
          internalDate: '2000',
        }),
      ];

      const result = buildFollowUpPrompt({ ...baseParams, threadHistory: history });

      expect(result.userMessage).toContain('초기 문의 본문');
      expect(result.userMessage).toContain('답변 본문');

      // 순서 검증: 첫 메시지가 두 번째보다 먼저 등장
      const idxFirst = result.userMessage.indexOf('초기 문의 본문');
      const idxSecond = result.userMessage.indexOf('답변 본문');
      expect(idxFirst).toBeGreaterThanOrEqual(0);
      expect(idxSecond).toBeGreaterThan(idxFirst);
    });

    it('빈 스레드 이력 → "신규 스레드" 명시', () => {
      const result = buildFollowUpPrompt({ ...baseParams, threadHistory: [] });

      expect(result.userMessage).toMatch(/신규 스레드|기존 이력 없음/);
    });

    it('매우 긴 body는 2000자로 truncate (T-03-25)', () => {
      const longBody = 'A'.repeat(5000);
      const history = [makeThreadMessage({ body: longBody })];

      const result = buildFollowUpPrompt({ ...baseParams, threadHistory: history });

      // 5000자 전부가 들어가면 안 됨
      const aRuns = result.userMessage.match(/A{2001,}/g);
      expect(aRuns).toBeNull();
      // 2000자 블록은 존재
      expect(result.userMessage).toContain('A'.repeat(2000));
    });
  });

  describe('경계 마커 + 인젝션 방어 (T-03-25)', () => {
    it('통화 분석은 <call_analysis> 태그로 감싸짐', () => {
      const result = buildFollowUpPrompt(baseParams);

      expect(result.userMessage).toContain('<call_analysis>');
      expect(result.userMessage).toContain('</call_analysis>');
    });

    it('기존 스레드는 <existing_thread> 태그로 감싸짐', () => {
      const result = buildFollowUpPrompt({
        ...baseParams,
        threadHistory: [makeThreadMessage()],
      });

      expect(result.userMessage).toContain('<existing_thread>');
      expect(result.userMessage).toContain('</existing_thread>');
    });

    it('system 프롬프트에 "지시가 아님" 경고 포함', () => {
      const result = buildFollowUpPrompt(baseParams);

      expect(result.system).toMatch(/지시(가 아닙|.*아닙)/);
    });
  });

  describe('v4 ULTRA 통합', () => {
    it('promptSections가 system에 그대로 포함됨', () => {
      const result = buildFollowUpPrompt(baseParams);

      expect(result.system).toContain('[Mock v4 ULTRA 섹션 지침]');
    });

    it('strategy G와 H에 따라 지시 섹션이 달라짐', () => {
      const gResult = buildFollowUpPrompt({
        ...baseParams,
        classification: makeClassification({ strategy: 'G' }),
      });
      const hResult = buildFollowUpPrompt({
        ...baseParams,
        classification: makeClassification({ strategy: 'H' }),
      });

      // 전략 H는 제안서 동봉 지시 포함
      expect(hResult.userMessage).toMatch(/제안서|견적서/);
      // 전략 G는 액션아이템 확정 지시 포함
      expect(gResult.userMessage).toMatch(/액션|액션아이템/);
    });

    it('system 프롬프트에 전략 ID 명시', () => {
      const result = buildFollowUpPrompt({
        ...baseParams,
        classification: makeClassification({ strategy: 'G' }),
      });

      expect(result.system).toContain('G');
    });
  });

  describe('서명/CC 중복 방지', () => {
    it('system 프롬프트에 "서명은 composeEmail이 자동 추가" 명시 (본문에 넣지 말라)', () => {
      const result = buildFollowUpPrompt(baseParams);

      expect(result.system).toMatch(/서명.*자동|서명.*compose/);
    });

    it('system 프롬프트에 "CC는 composeEmail이 자동 추가" 명시', () => {
      const result = buildFollowUpPrompt(baseParams);

      expect(result.system).toMatch(/CC.*자동|CC.*compose/);
    });
  });

  describe('반환 타입 호환', () => {
    it('FollowUpPromptResult shape 준수', () => {
      const result: FollowUpPromptResult = buildFollowUpPrompt(baseParams);

      expect(typeof result.system).toBe('string');
      expect(typeof result.userMessage).toBe('string');
      expect(result.system.length).toBeGreaterThan(0);
      expect(result.userMessage.length).toBeGreaterThan(0);
    });
  });
});
