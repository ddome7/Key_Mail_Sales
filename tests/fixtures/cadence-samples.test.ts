/**
 * Phase 4 Plan 04-01: cadence-samples 픽스처 import/shape 검증.
 *
 * 이 테스트는 "픽스처가 선언한 인터페이스를 04-02~04-05 다운스트림이 신뢰하고
 * import할 수 있는가"만 확인한다. context_type 분류 정확도 자체는 04-02 플랜이
 * classifier 구현과 함께 검증한다.
 */

import { describe, it, expect } from 'vitest';
import {
  SAMPLE_OUTBOUND_PROPOSAL,
  SAMPLE_OUTBOUND_CONTRACT,
  SAMPLE_OUTBOUND_MEETING_QNA,
  SAMPLE_OUTBOUND_QUOTE_REVISION,
  SAMPLE_OUTBOUND_INFLUENCER,
  SAMPLE_OUTBOUND_GENERAL,
  THREAD_WITH_INBOUND,
  THREAD_NO_INBOUND,
} from './cadence-samples.js';

const ALL_SAMPLES = [
  SAMPLE_OUTBOUND_PROPOSAL,
  SAMPLE_OUTBOUND_CONTRACT,
  SAMPLE_OUTBOUND_MEETING_QNA,
  SAMPLE_OUTBOUND_QUOTE_REVISION,
  SAMPLE_OUTBOUND_INFLUENCER,
  SAMPLE_OUTBOUND_GENERAL,
] as const;

describe('cadence-samples fixtures', () => {
  describe('ThreadMessage shape', () => {
    it('6개 outbound 샘플 모두 ThreadMessage 필드를 가진다', () => {
      for (const sample of ALL_SAMPLES) {
        expect(typeof sample.messageId).toBe('string');
        expect(typeof sample.from).toBe('string');
        expect(typeof sample.to).toBe('string');
        expect(typeof sample.subject).toBe('string');
        expect(typeof sample.body).toBe('string');
        expect(typeof sample.internalDate).toBe('string');
        expect(sample.messageId.length).toBeGreaterThan(0);
      }
    });

    it('모든 outbound 샘플은 cyr@puzl.co.kr에서 발신된다', () => {
      for (const sample of ALL_SAMPLES) {
        expect(sample.from).toContain('cyr@puzl.co.kr');
      }
    });

    it('internalDate는 parseInt로 숫자로 변환 가능한 ms epoch 문자열이다', () => {
      for (const sample of ALL_SAMPLES) {
        const ms = Number(sample.internalDate);
        expect(Number.isFinite(ms)).toBe(true);
        expect(ms).toBeGreaterThan(0);
      }
    });
  });

  describe('context_type 분류용 키워드 매핑 (D-11 준비)', () => {
    it('proposal 샘플은 "제안서" OR "기획안" 키워드를 포함한다', () => {
      const text = SAMPLE_OUTBOUND_PROPOSAL.subject + SAMPLE_OUTBOUND_PROPOSAL.body;
      expect(text).toMatch(/제안서|기획안/);
    });

    it('contract 샘플은 "계약서" 키워드를 포함한다', () => {
      const text = SAMPLE_OUTBOUND_CONTRACT.subject + SAMPLE_OUTBOUND_CONTRACT.body;
      expect(text).toMatch(/계약서/);
    });

    it('meeting_qna 샘플은 "미팅" + "답변" 키워드를 포함한다', () => {
      const text = SAMPLE_OUTBOUND_MEETING_QNA.subject + SAMPLE_OUTBOUND_MEETING_QNA.body;
      expect(text).toMatch(/미팅/);
      expect(text).toMatch(/답변/);
    });

    it('quote_revision 샘플은 "견적" 키워드를 포함한다', () => {
      const text = SAMPLE_OUTBOUND_QUOTE_REVISION.subject + SAMPLE_OUTBOUND_QUOTE_REVISION.body;
      expect(text).toMatch(/견적/);
    });

    it('influencer_outreach 샘플은 "크리에이터" + "협업" 키워드를 포함한다', () => {
      const text = SAMPLE_OUTBOUND_INFLUENCER.subject + SAMPLE_OUTBOUND_INFLUENCER.body;
      expect(text).toMatch(/크리에이터/);
      expect(text).toMatch(/협업/);
    });

    it('general 샘플은 5개 카테고리 키워드와 모두 매칭되지 않는다 (AI fallback 경로)', () => {
      const text = SAMPLE_OUTBOUND_GENERAL.subject + SAMPLE_OUTBOUND_GENERAL.body;
      expect(text).not.toMatch(/제안서|기획안/);
      expect(text).not.toMatch(/계약서|법인인감/);
      expect(text).not.toMatch(/미팅 후|답변 드립니다/);
      expect(text).not.toMatch(/견적 수정|재견적/);
      expect(text).not.toMatch(/크리에이터|협업 제안/);
    });
  });

  describe('THREAD_WITH_INBOUND / THREAD_NO_INBOUND (D-03 준비)', () => {
    it('THREAD_WITH_INBOUND는 길이 2이고 마지막 메시지는 비-puzl 도메인에서 온다', () => {
      expect(THREAD_WITH_INBOUND).toHaveLength(2);
      const last = THREAD_WITH_INBOUND[1]!;
      expect(last.from).not.toContain('@puzl.co.kr');
    });

    it('THREAD_WITH_INBOUND inbound의 internalDate는 outbound보다 크다', () => {
      const outbound = THREAD_WITH_INBOUND[0]!;
      const inbound = THREAD_WITH_INBOUND[1]!;
      expect(Number(inbound.internalDate)).toBeGreaterThan(Number(outbound.internalDate));
    });

    it('THREAD_NO_INBOUND는 길이 1이고 유일 메시지는 cyr@puzl.co.kr 발신', () => {
      expect(THREAD_NO_INBOUND).toHaveLength(1);
      expect(THREAD_NO_INBOUND[0]!.from).toContain('cyr@puzl.co.kr');
    });
  });

  describe('export surface', () => {
    it('정확히 8개 심볼이 export된다 (6 샘플 + 2 스레드)', async () => {
      const mod = await import('./cadence-samples.js');
      const exportedKeys = Object.keys(mod).sort();
      expect(exportedKeys).toEqual(
        [
          'SAMPLE_OUTBOUND_CONTRACT',
          'SAMPLE_OUTBOUND_GENERAL',
          'SAMPLE_OUTBOUND_INFLUENCER',
          'SAMPLE_OUTBOUND_MEETING_QNA',
          'SAMPLE_OUTBOUND_PROPOSAL',
          'SAMPLE_OUTBOUND_QUOTE_REVISION',
          'THREAD_NO_INBOUND',
          'THREAD_WITH_INBOUND',
        ],
      );
    });
  });
});
