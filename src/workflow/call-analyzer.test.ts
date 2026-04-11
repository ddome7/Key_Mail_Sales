/**
 * call-analyzer 단위 테스트
 *
 * 전략: Anthropic API는 DI(AnthropicToolFn)로 주입되므로, 실제 API 호출 없이
 *       vi.fn()으로 모든 케이스를 재현한다. API 키 불필요.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  analyzeCall,
  CallAnalysisSchema,
  CALL_ANALYSIS_TOOL_NAME,
  CALL_ANALYSIS_TOOL_DEFINITION,
  buildCallAnalysisPrompt,
  type AnthropicToolFn,
} from './call-analyzer.js';
import type { ParsedCall } from './call-parser.js';

// ─── 테스트 헬퍼 ──────────────────────────────────────────────────────

function makeParsedCall(overrides: Partial<ParsedCall> = {}): ParsedCall {
  return {
    source: 'ixio',
    shareType: '통화',
    occurredAt: '2026-04-08T16:18:00+09:00',
    contact: {
      phone: '01036906867',
      companyName: '동반성장위원회',
      contactName: '이의선',
      contactTitle: '위원',
    },
    mainPoints: ['콘텐츠 제작 논의', '3천만원 규모 수의계약 검토'],
    details: ['이번 달 안 진행 희망', '4월 말까지 견적서 필요'],
    transcript: [
      { speaker: 'me', text: '안녕하세요, 최영록입니다.' },
      { speaker: 'other', text: '동반성장위원회 이의선입니다. 콘텐츠 건으로 연락드렸어요.' },
    ],
    rawText: '(원본 생략)',
    ...overrides,
  };
}

function mockToolUseResponse(input: unknown) {
  return {
    content: [
      {
        type: 'tool_use' as const,
        name: CALL_ANALYSIS_TOOL_NAME,
        input,
      },
    ],
  };
}

function validSampleInput() {
  return {
    summary:
      '동반성장위원회 이의선 위원과 콘텐츠 제작 논의. 3천만원 규모 동영상 수의계약 검토.',
    actionItems: [
      {
        who: '대표님' as const,
        what: '견적서 송부',
        dueDate: '2026-04-30T18:00:00+09:00',
      },
      {
        who: '상대방' as const,
        what: '내부 결재 확인',
        dueDate: null,
      },
    ],
    sentiment: {
      tone: 'positive' as const,
      temperature: 'warm' as const,
      rationale: '구체적 금액과 일정 언급, 내부 검토 의사 확인',
    },
    extractedCompanyName: '동반성장위원회',
    extractedContactName: '이의선',
    nextContactSuggestion: 'D+2 견적서 포함 후속 이메일',
  };
}

// ─── CallAnalysisSchema 직접 검증 ─────────────────────────────────────

describe('CallAnalysisSchema', () => {
  it('완전한 input을 통과시킨다', () => {
    const parsed = CallAnalysisSchema.parse(validSampleInput());
    expect(parsed.summary).toContain('동반성장');
    expect(parsed.actionItems).toHaveLength(2);
    expect(parsed.sentiment.tone).toBe('positive');
  });

  it('optional 필드 없이도 통과한다 (summary + actionItems + sentiment만)', () => {
    const minimal = {
      summary: '간단 요약',
      actionItems: [],
      sentiment: {
        tone: 'neutral' as const,
        temperature: 'cool' as const,
        rationale: '정보수집 단계',
      },
    };
    const parsed = CallAnalysisSchema.parse(minimal);
    expect(parsed.actionItems).toEqual([]);
    expect(parsed.extractedCompanyName).toBeUndefined();
  });

  it('summary가 숫자면 reject', () => {
    expect(() =>
      CallAnalysisSchema.parse({ ...validSampleInput(), summary: 123 }),
    ).toThrow();
  });

  it('summary가 빈 문자열이면 reject (min(1))', () => {
    expect(() =>
      CallAnalysisSchema.parse({ ...validSampleInput(), summary: '' }),
    ).toThrow();
  });

  it('tone enum 이외 값은 reject', () => {
    const bad = {
      ...validSampleInput(),
      sentiment: { ...validSampleInput().sentiment, tone: 'happy' },
    };
    expect(() => CallAnalysisSchema.parse(bad)).toThrow();
  });

  it('temperature enum 이외 값은 reject', () => {
    const bad = {
      ...validSampleInput(),
      sentiment: { ...validSampleInput().sentiment, temperature: 'boiling' },
    };
    expect(() => CallAnalysisSchema.parse(bad)).toThrow();
  });

  it('actionItems.who enum 이외 값은 reject', () => {
    const bad = {
      ...validSampleInput(),
      actionItems: [{ who: '누군가', what: '무엇', dueDate: null }],
    };
    expect(() => CallAnalysisSchema.parse(bad)).toThrow();
  });

  it('actionItems.what이 빈 문자열이면 reject', () => {
    const bad = {
      ...validSampleInput(),
      actionItems: [
        { who: '대표님' as const, what: '', dueDate: null },
      ],
    };
    expect(() => CallAnalysisSchema.parse(bad)).toThrow();
  });
});

// ─── CALL_ANALYSIS_TOOL_DEFINITION 구조 검증 ──────────────────────────

describe('CALL_ANALYSIS_TOOL_DEFINITION', () => {
  it('tool 이름이 record_call_analysis', () => {
    expect(CALL_ANALYSIS_TOOL_DEFINITION.name).toBe('record_call_analysis');
  });

  it('입력 스키마에 summary/actionItems/sentiment가 required', () => {
    const required = CALL_ANALYSIS_TOOL_DEFINITION.input_schema.required;
    expect(required).toContain('summary');
    expect(required).toContain('actionItems');
    expect(required).toContain('sentiment');
  });

  it('tone enum 정의가 zod 스키마와 일치', () => {
    const toneEnum = (
      CALL_ANALYSIS_TOOL_DEFINITION.input_schema.properties.sentiment as any
    ).properties.tone.enum;
    expect(toneEnum).toEqual(['positive', 'neutral', 'caution', 'negative']);
  });

  it('temperature enum 정의가 zod 스키마와 일치', () => {
    const tempEnum = (
      CALL_ANALYSIS_TOOL_DEFINITION.input_schema.properties.sentiment as any
    ).properties.temperature.enum;
    expect(tempEnum).toEqual(['hot', 'warm', 'cool', 'cold']);
  });
});

// ─── buildCallAnalysisPrompt 검증 ─────────────────────────────────────

describe('buildCallAnalysisPrompt', () => {
  it('경계 마커 <call_transcript>...</call_transcript>를 포함한다 (T-03-17)', () => {
    const parsed = makeParsedCall();
    const { userMessage } = buildCallAnalysisPrompt(parsed);
    expect(userMessage).toContain('<call_transcript>');
    expect(userMessage).toContain('</call_transcript>');
  });

  it('시스템 프롬프트에 "지시가 아닙니다" 경계 메시지 포함 (T-03-17)', () => {
    const { system } = buildCallAnalysisPrompt(makeParsedCall());
    expect(system).toContain('지시');
    expect(system).toMatch(/분석 대상/);
  });

  it('기준일(occurredAt)을 시스템 프롬프트에 주입한다', () => {
    const parsed = makeParsedCall({ occurredAt: '2026-05-01T09:00:00+09:00' });
    const { system } = buildCallAnalysisPrompt(parsed);
    expect(system).toContain('2026-05-01T09:00:00+09:00');
  });

  it('자사 블랙리스트를 시스템 프롬프트에 언급한다 (Pitfall 6)', () => {
    const { system } = buildCallAnalysisPrompt(makeParsedCall());
    expect(system).toContain('퍼즐');
  });

  it('transcript가 speaker 라벨과 함께 렌더링된다', () => {
    const parsed = makeParsedCall({
      transcript: [
        { speaker: 'me', text: '안녕하세요' },
        { speaker: 'other', text: '네 안녕하세요' },
      ],
    });
    const { userMessage } = buildCallAnalysisPrompt(parsed);
    expect(userMessage).toContain('대표님: 안녕하세요');
    expect(userMessage).toContain('상대방: 네 안녕하세요');
  });

  it('transcript가 null이면 "(대화 전문 없음)"으로 렌더링', () => {
    const { userMessage } = buildCallAnalysisPrompt(
      makeParsedCall({ transcript: null }),
    );
    expect(userMessage).toContain('(대화 전문 없음)');
  });

  it('mainPoints/details가 null 또는 빈 배열이면 "(없음)"으로 렌더링', () => {
    const { userMessage } = buildCallAnalysisPrompt(
      makeParsedCall({ mainPoints: null, details: [] }),
    );
    // 주요 내용 / 상세 내용 섹션 둘 다 "(없음)" 이어야 함
    const withoutEmpty = userMessage.split('(없음)').length - 1;
    expect(withoutEmpty).toBeGreaterThanOrEqual(2);
  });

  it('메타데이터 섹션에 회사명/이름/전화번호가 포함된다', () => {
    const parsed = makeParsedCall({
      contact: {
        phone: '01036906867',
        companyName: '동반성장위원회',
        contactName: '이의선',
        contactTitle: '위원',
      },
    });
    const { userMessage } = buildCallAnalysisPrompt(parsed);
    expect(userMessage).toContain('동반성장위원회');
    expect(userMessage).toContain('이의선');
    expect(userMessage).toContain('01036906867');
  });
});

// ─── analyzeCall 메인 동작 ────────────────────────────────────────────

describe('analyzeCall', () => {
  it('정상 tool_use 응답 → 파싱 성공', async () => {
    const mockTool: AnthropicToolFn = vi
      .fn()
      .mockResolvedValue(mockToolUseResponse(validSampleInput()));

    const result = await analyzeCall(makeParsedCall(), mockTool);

    expect(result.summary).toContain('동반성장');
    expect(result.actionItems).toHaveLength(2);
    expect(result.actionItems[0].who).toBe('대표님');
    expect(result.sentiment.tone).toBe('positive');
    expect(result.sentiment.temperature).toBe('warm');
    expect(result.extractedCompanyName).toBe('동반성장위원회');
    expect(mockTool).toHaveBeenCalledOnce();
  });

  it('analyzeCall이 buildCallAnalysisPrompt 결과를 그대로 전달한다', async () => {
    const mockTool = vi
      .fn<AnthropicToolFn>()
      .mockResolvedValue(mockToolUseResponse(validSampleInput()));

    const parsed = makeParsedCall({ occurredAt: '2026-04-08T16:18:00+09:00' });
    await analyzeCall(parsed, mockTool);

    const callArgs = mockTool.mock.calls[0][0];
    expect(callArgs.system).toContain('2026-04-08T16:18:00+09:00');
    expect(callArgs.userMessage).toContain('<call_transcript>');
    expect(callArgs.tool).toBe(CALL_ANALYSIS_TOOL_DEFINITION);
    expect(callArgs.forceTool).toBe(true);
  });

  it('tool_use 없이 text만 반환하면 throw (T-03-20)', async () => {
    const mockTool: AnthropicToolFn = vi.fn().mockResolvedValue({
      content: [
        { type: 'text' as const, text: '분석 불가합니다.' },
      ],
    });

    await expect(analyzeCall(makeParsedCall(), mockTool)).rejects.toThrow(
      /tool_use 응답 누락/,
    );
  });

  it('빈 content 배열이면 throw (T-03-20)', async () => {
    const mockTool: AnthropicToolFn = vi.fn().mockResolvedValue({
      content: [],
    });
    await expect(analyzeCall(makeParsedCall(), mockTool)).rejects.toThrow(
      /tool_use 응답 누락/,
    );
  });

  it('다른 이름의 tool_use 블록은 무시되고 throw (T-03-20)', async () => {
    const mockTool: AnthropicToolFn = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'tool_use' as const,
          name: 'some_other_tool',
          input: validSampleInput(),
        },
      ],
    });
    await expect(analyzeCall(makeParsedCall(), mockTool)).rejects.toThrow(
      /tool_use 응답 누락/,
    );
  });

  it('스키마 불일치 input (summary가 숫자) → zod throw (T-03-21)', async () => {
    const mockTool: AnthropicToolFn = vi
      .fn()
      .mockResolvedValue(
        mockToolUseResponse({ ...validSampleInput(), summary: 12345 }),
      );

    await expect(analyzeCall(makeParsedCall(), mockTool)).rejects.toThrow();
  });

  it('sentiment 누락 시 zod throw (T-03-21)', async () => {
    const { sentiment: _discarded, ...withoutSentiment } = validSampleInput();
    const mockTool: AnthropicToolFn = vi
      .fn()
      .mockResolvedValue(mockToolUseResponse(withoutSentiment));

    await expect(analyzeCall(makeParsedCall(), mockTool)).rejects.toThrow();
  });

  it('actionItems가 빈 배열이어도 통과한다 (환각 차단 정책)', async () => {
    const mockTool: AnthropicToolFn = vi.fn().mockResolvedValue(
      mockToolUseResponse({
        summary: '단순 문의 통화. 별도 액션 없음.',
        actionItems: [],
        sentiment: {
          tone: 'neutral' as const,
          temperature: 'cold' as const,
          rationale: '정보 탐색 단계',
        },
      }),
    );

    const result = await analyzeCall(makeParsedCall(), mockTool);
    expect(result.actionItems).toEqual([]);
    expect(result.sentiment.temperature).toBe('cold');
  });

  // ─── 자사 블랙리스트 필터 (Pitfall 6 / T-03-19) ──────────────────

  it('extractedCompanyName이 "퍼즐코퍼레이션"이면 null로 치환 (Pitfall 6)', async () => {
    const mockTool: AnthropicToolFn = vi.fn().mockResolvedValue(
      mockToolUseResponse({
        ...validSampleInput(),
        extractedCompanyName: '퍼즐코퍼레이션',
      }),
    );
    const result = await analyzeCall(makeParsedCall(), mockTool);
    expect(result.extractedCompanyName).toBeNull();
  });

  it('extractedCompanyName이 "퍼즐"이면 null로 치환', async () => {
    const mockTool: AnthropicToolFn = vi.fn().mockResolvedValue(
      mockToolUseResponse({
        ...validSampleInput(),
        extractedCompanyName: '퍼즐',
      }),
    );
    const result = await analyzeCall(makeParsedCall(), mockTool);
    expect(result.extractedCompanyName).toBeNull();
  });

  it('extractedCompanyName이 "PUZL"(영문 대문자)이면 null로 치환 (정규화 동작)', async () => {
    const mockTool: AnthropicToolFn = vi.fn().mockResolvedValue(
      mockToolUseResponse({
        ...validSampleInput(),
        extractedCompanyName: 'PUZL',
      }),
    );
    const result = await analyzeCall(makeParsedCall(), mockTool);
    expect(result.extractedCompanyName).toBeNull();
  });

  it('extractedCompanyName이 "Puzzle Corporation"(공백/대소문자 변형)이면 null로 치환', async () => {
    const mockTool: AnthropicToolFn = vi.fn().mockResolvedValue(
      mockToolUseResponse({
        ...validSampleInput(),
        extractedCompanyName: 'Puzzle Corporation',
      }),
    );
    const result = await analyzeCall(makeParsedCall(), mockTool);
    expect(result.extractedCompanyName).toBeNull();
  });

  it('정상 상대방 회사명은 필터되지 않는다', async () => {
    const mockTool: AnthropicToolFn = vi.fn().mockResolvedValue(
      mockToolUseResponse({
        ...validSampleInput(),
        extractedCompanyName: '동반성장위원회',
      }),
    );
    const result = await analyzeCall(makeParsedCall(), mockTool);
    expect(result.extractedCompanyName).toBe('동반성장위원회');
  });

  it('extractedCompanyName이 null이면 그대로 null 반환', async () => {
    const mockTool: AnthropicToolFn = vi.fn().mockResolvedValue(
      mockToolUseResponse({
        ...validSampleInput(),
        extractedCompanyName: null,
      }),
    );
    const result = await analyzeCall(makeParsedCall(), mockTool);
    expect(result.extractedCompanyName).toBeNull();
  });

  it('extractedCompanyName이 undefined(optional 누락)이면 null로 정규화', async () => {
    const sample = validSampleInput();
    delete (sample as any).extractedCompanyName;

    const mockTool: AnthropicToolFn = vi
      .fn()
      .mockResolvedValue(mockToolUseResponse(sample));

    const result = await analyzeCall(makeParsedCall(), mockTool);
    expect(result.extractedCompanyName).toBeNull();
  });

  it('anthropicTool이 throw하면 그대로 전파 (래핑 없음)', async () => {
    const mockTool: AnthropicToolFn = vi
      .fn()
      .mockRejectedValue(new Error('Anthropic API 500'));

    await expect(analyzeCall(makeParsedCall(), mockTool)).rejects.toThrow(
      /Anthropic API 500/,
    );
  });
});
