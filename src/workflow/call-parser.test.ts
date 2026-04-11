import { describe, it, expect } from 'vitest';
import {
  parseSlackCallMessage,
  ParsedCallSchema,
} from './call-parser.js';
import {
  IXIO_SAMPLE_PATTERN_1,
  IXIO_SAMPLE_PATTERN_2,
} from '../../tests/fixtures/ixio-samples.js';

describe('parseSlackCallMessage — 패턴 1 (연락처 저장됨)', () => {
  const result = parseSlackCallMessage(IXIO_SAMPLE_PATTERN_1);

  it('성공 결과를 반환한다', () => {
    expect(result.success).toBe(true);
  });

  it('shareType을 "대화"로 추출한다', () => {
    if (!result.success) throw new Error('parse failed');
    expect(result.data.shareType).toBe('대화');
  });

  it('occurredAt을 Asia/Seoul ISO 8601로 변환한다 (오후 4시 18분 = 16:18)', () => {
    if (!result.success) throw new Error('parse failed');
    expect(result.data.occurredAt).toBe('2026-04-08T16:18:00+09:00');
  });

  it('전화번호를 정규화된 형식으로 추출한다', () => {
    if (!result.success) throw new Error('parse failed');
    expect(result.data.contact.phone).toBe('01036906867');
  });

  it('회사명/이름/직함을 "퍼즐) " 접두사를 제거하고 분리한다', () => {
    if (!result.success) throw new Error('parse failed');
    expect(result.data.contact.companyName).toBe('동반성장위원회');
    expect(result.data.contact.contactName).toBe('이의선');
    expect(result.data.contact.contactTitle).toBe('위원');
  });

  it('transcript를 화자별로 분리하고 첫 턴은 me/최영록 인사이다', () => {
    if (!result.success) throw new Error('parse failed');
    expect(result.data.transcript).not.toBeNull();
    expect(result.data.transcript!.length).toBe(4);
    expect(result.data.transcript![0]).toEqual({
      speaker: 'me',
      text: '안녕하세요, 최영록입니다.',
    });
  });

  it('mainPoints/details 섹션은 패턴 1에서 존재하지 않으므로 null이다', () => {
    if (!result.success) throw new Error('parse failed');
    expect(result.data.mainPoints).toBeNull();
    expect(result.data.details).toBeNull();
  });
});

describe('parseSlackCallMessage — 패턴 2 (전화번호만)', () => {
  const result = parseSlackCallMessage(IXIO_SAMPLE_PATTERN_2);

  it('성공 결과를 반환한다', () => {
    expect(result.success).toBe(true);
  });

  it('shareType을 "통화"로 추출한다', () => {
    if (!result.success) throw new Error('parse failed');
    expect(result.data.shareType).toBe('통화');
  });

  it('occurredAt을 Asia/Seoul ISO 8601로 변환한다 (오후 6시 04분 = 18:04)', () => {
    if (!result.success) throw new Error('parse failed');
    expect(result.data.occurredAt).toBe('2026-04-06T18:04:00+09:00');
  });

  it('연락처에서 회사명/이름은 null이고 전화번호만 존재한다', () => {
    if (!result.success) throw new Error('parse failed');
    expect(result.data.contact.companyName).toBeNull();
    expect(result.data.contact.contactName).toBeNull();
    expect(result.data.contact.contactTitle).toBeNull();
    expect(result.data.contact.phone).toBe('01036906867');
  });

  it('mainPoints/details/transcript 세 섹션을 각각 분리한다', () => {
    if (!result.success) throw new Error('parse failed');
    expect(result.data.mainPoints).not.toBeNull();
    expect(result.data.mainPoints!.length).toBeGreaterThanOrEqual(1);
    expect(result.data.details).not.toBeNull();
    expect(result.data.details!.length).toBeGreaterThanOrEqual(2);
    expect(result.data.transcript).not.toBeNull();
    expect(result.data.transcript!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('parseSlackCallMessage — 엣지 케이스', () => {
  it('익시오 헤더가 없으면 success:false + reason 반환 (throw 없음)', () => {
    const result = parseSlackCallMessage('안녕하세요');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toMatch(/ixio/i);
    }
  });

  it('헤더는 있지만 날짜 포맷이 이상하면 reason:"date format unrecognized"', () => {
    const bad = `익시오에서 최영록님이 공유한 대화 내용입니다.
2026/04/08 오후 4시 18분
연락처 01036906867님과의 통화`;
    const result = parseSlackCallMessage(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('date format unrecognized');
    }
  });

  it('[대화 내용] 섹션이 없으면 transcript는 null, 그러나 success:true', () => {
    const noTranscript = `익시오에서 최영록님이 공유한 통화 내용입니다.
2026. 04. 06 (월요일) 오후 6시 04분
연락처 01036906867님과의 통화

[주요 내용]
- 뭔가`;
    const result = parseSlackCallMessage(noTranscript);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.transcript).toBeNull();
    expect(result.data.mainPoints).not.toBeNull();
  });

  it('반환된 data는 ParsedCallSchema로 재검증해도 throw하지 않는다', () => {
    const result = parseSlackCallMessage(IXIO_SAMPLE_PATTERN_1);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(() => ParsedCallSchema.parse(result.data)).not.toThrow();
  });

  it('오전 12시는 00시로, 오후 12시는 12시로 변환한다', () => {
    const midnight = `익시오에서 최영록님이 공유한 통화 내용입니다.
2026. 04. 06 (월요일) 오전 12시 30분
연락처 01036906867님과의 통화`;
    const r1 = parseSlackCallMessage(midnight);
    expect(r1.success).toBe(true);
    if (r1.success) expect(r1.data.occurredAt).toBe('2026-04-06T00:30:00+09:00');

    const noon = `익시오에서 최영록님이 공유한 통화 내용입니다.
2026. 04. 06 (월요일) 오후 12시 30분
연락처 01036906867님과의 통화`;
    const r2 = parseSlackCallMessage(noon);
    expect(r2.success).toBe(true);
    if (r2.success) expect(r2.data.occurredAt).toBe('2026-04-06T12:30:00+09:00');
  });
});
