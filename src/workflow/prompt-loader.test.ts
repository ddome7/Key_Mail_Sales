import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, unlinkSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadSections, getSectionsForClassification, SECTION_MAP } from './prompt-loader.js';
import type { ClassificationResult } from '../types/classification.js';

describe('prompt-loader', () => {
  describe('loadSections', () => {
    it('loads persona and email-rules-kr sections with correct content', () => {
      const result = loadSections(['persona', 'email-rules-kr']);

      // SECTION 1 content
      expect(result).toContain('SECTION 1');
      expect(result).toContain('나는 최영록이다');

      // SECTION 6 content
      expect(result).toContain('SECTION 6');
      expect(result).toContain('이메일 작성 규칙');

      // Sections joined by separator
      expect(result).toContain('---');
    });

    it('silently skips invalid section IDs', () => {
      const result = loadSections(['persona', 'nonexistent-section', 'email-rules-kr']);

      // Should still have persona and email-rules-kr content
      expect(result).toContain('SECTION 1');
      expect(result).toContain('SECTION 6');

      // Should not throw or include error text
      expect(result).not.toContain('nonexistent');
    });
  });

  describe('getSectionsForClassification', () => {
    const baseClassification: ClassificationResult = {
      strategy: 'A',
      language: 'korean',
      toneLevel: 3,
      urgency: 'normal',
      isNewClient: true,
      hasPricing: false,
      hasObjection: false,
    };

    it('includes strategy-A section for strategy A', () => {
      const sections = getSectionsForClassification({ ...baseClassification, strategy: 'A' });
      expect(sections).toContain('strategy-A');
    });

    it('includes service-recommendation when hasPricing is true', () => {
      const sections = getSectionsForClassification({ ...baseClassification, hasPricing: true });
      expect(sections).toContain('service-recommendation');
    });

    it('includes email-rules-en when language is english', () => {
      const sections = getSectionsForClassification({ ...baseClassification, language: 'english' });
      expect(sections).toContain('email-rules-en');
    });

    it('includes industry-beauty when industry is beauty', () => {
      const sections = getSectionsForClassification({ ...baseClassification, industry: 'beauty' });
      expect(sections).toContain('industry-beauty');
    });

    it('always includes base sections: persona, email-rules-kr, subject-format, tone-calibration, quality-checklist', () => {
      const sections = getSectionsForClassification(baseClassification);
      expect(sections).toContain('persona');
      expect(sections).toContain('email-rules-kr');
      expect(sections).toContain('subject-format');
      expect(sections).toContain('tone-calibration');
      expect(sections).toContain('quality-checklist');
    });

    it('includes objection-handling when hasObjection is true', () => {
      const sections = getSectionsForClassification({ ...baseClassification, hasObjection: true });
      expect(sections).toContain('objection-handling');
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// Phase 4: followup-cadence section (v4 ULTRA §15) — Plan 04-03
//
// 이 describe 블록은 SECTION_MAP의 followup-cadence 엔트리가
// 등록되어 있고, loadSections가 해당 범위를 올바르게 잘라내는지
// 검증한다. 워크트리에는 실제 v4 ULTRA 파일이 없을 수 있으므로,
// 섹션 15 구조를 그대로 재현한 임시 mock 파일을 생성해서 테스트한다.
// ══════════════════════════════════════════════════════════════════

describe('Phase 4: followup-cadence section (v4 ULTRA §15)', () => {
  let tempDir: string;
  let mockPath: string;

  // v4 ULTRA 파일 L841~887 영역을 최소 재현.
  // SECTION_MAP['followup-cadence'] = { start: 841, end: 886 } 와 일치.
  // 1-indexed line numbers → 배열 index는 0-indexed이므로 840~885 slice.
  function buildMockV4(): string {
    const lines: string[] = [];
    // L1 ~ L840: 더미 filler
    for (let i = 1; i <= 840; i++) {
      if (i === 754) {
        lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      } else if (i === 755) {
        lines.push('🛑 SECTION 14 — 반론/거절 대응');
      } else if (i === 800) {
        lines.push('SECTION14_UNIQUE_KEYWORD_반론대응샘플문구');
      } else {
        lines.push(`(filler L${i})`);
      }
    }
    // L841 구분선
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    // L842 헤더
    lines.push('⏰ SECTION 15 — 팔로업 케이던스 시스템 [v4 신규]');
    // L843 구분선
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(''); // L844
    lines.push('미응답 시 팔로업 타이밍과 방법을 체계화한다.'); // L845
    lines.push(''); // L846
    lines.push('[기본 케이던스]'); // L847
    lines.push(''); // L848
    lines.push('■ Day 0: 최초 이메일 발송'); // L849
    lines.push('■ Day 3: 1차 팔로업 (소프트)'); // L850
    lines.push('  "혹시 확인이 안 되셨을까봐 한번 더 공유드립니다"'); // L851
    lines.push('  └ 원본 이메일 내용 간단히 요약'); // L852
    lines.push('  └ 추가 자료나 질문 있으면 편하게 말씀 달라는 멘트'); // L853
    lines.push(''); // L854
    lines.push('■ Day 7: 2차 팔로업 (가치 추가)'); // L855
    lines.push('  "추가로 참고가 되실 만한 자료를 함께 공유드립니다"'); // L856
    lines.push('  └ 관련 업종 케이스 스터디 또는 레퍼런스 첨부'); // L857
    lines.push('  └ 새로운 정보를 줘서 답장할 이유를 만든다'); // L858
    lines.push(''); // L859
    lines.push('■ Day 14: 3차 팔로업 (대안 제시)'); // L860
    lines.push('  "혹시 다른 방향의 캠페인이 더 적합하실 수도"'); // L861
    lines.push('  └ 다른 시나리오 or 더 작은 규모의 제안'); // L862
    lines.push('  └ "부담 없이 작은 규모로 먼저 시작해보시는 것도"'); // L863
    lines.push(''); // L864
    lines.push('■ Day 30: 마지막 터치 (관계 유지 전환)'); // L865
    lines.push('  "바쁘신 가운데 여러 번 연락드려 죄송합니다"'); // L866
    lines.push('  └ 압박 제로 톤'); // L867
    lines.push('  └ "향후에 필요하실 때 편하게 연락주시면 감사하겠습니다"'); // L868
    lines.push('  └ STAGE 5 (Dormant) 관리로 전환'); // L869
    lines.push(''); // L870
    lines.push('[상황별 팔로업 변형]'); // L871
    lines.push(''); // L872
    lines.push('● 제안서 발송 후: Day 3 → Day 7 → Day 14 (표준)'); // L873
    lines.push('● 계약서 발송 후: Day 2 → Day 5'); // L874
    lines.push('● 미팅 후 QnA 발송 후: Day 2 → Day 5'); // L875
    lines.push('● 견적 수정안 발송 후: Day 3 → Day 7'); // L876
    lines.push('● 인플루언서 아웃리치: Day 2 → Day 5 → Day 10'); // L877
    lines.push('● Dormant 리마인드: 분기 1회 (90일 주기)'); // L878
    lines.push(''); // L879
    lines.push('[팔로업 톤 규칙]'); // L880
    lines.push('- 1차: 확인 여부만 물어보기 (가볍게)'); // L881
    lines.push('- 2차: 새로운 가치 추가 (답장할 이유 제공)'); // L882
    lines.push('- 3차: 대안 제시 (문이 닫히기 전에)'); // L883
    lines.push('- 마지막: 관계 유지 전환 (미련 없이, 하지만 따뜻하게)'); // L884
    lines.push('- 절대 하지 않는 것: "답장 안 주시면 제안을 철회하겠습니다" 식의 압박'); // L885
    lines.push(''); // L886 빈 줄 (end 포함)
    // L887: SECTION 16 구분선 (범위 밖)
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('🎚️ SECTION 16 — 톤 캘리브레이션 시스템 [v4 신규]'); // L888
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'); // L889
    lines.push(''); // L890
    lines.push('모든 이메일은 아래 5단계 톤 레벨 중 하나로 작성한다.'); // L891
    for (let i = 892; i <= 930; i++) {
      if (i === 895) {
        lines.push('SECTION16_UNIQUE_KEYWORD_톤캘리브레이션샘플');
      } else {
        lines.push(`(filler L${i})`);
      }
    }
    return lines.join('\n');
  }

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'prompt-loader-test-'));
    mockPath = join(tempDir, 'v4_ULTRA_SYSTEM_PROMPT.md');
    writeFileSync(mockPath, buildMockV4(), 'utf-8');
  });

  afterAll(() => {
    try {
      unlinkSync(mockPath);
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('SECTION_MAP entry', () => {
    it('followup-cadence 키가 SECTION_MAP에 등록되어 있다', () => {
      expect(SECTION_MAP).toHaveProperty('followup-cadence');
    });

    it('followup-cadence 범위는 { start: 841, end: 886 } (v4 ULTRA §15)', () => {
      expect(SECTION_MAP['followup-cadence']).toEqual({ start: 841, end: 886 });
    });

    it('tone-calibration 엔트리는 기존과 동일하게 유지 (888-930)', () => {
      expect(SECTION_MAP['tone-calibration']).toEqual({ start: 888, end: 930 });
    });

    it('objection-handling 엔트리는 기존과 동일하게 유지 (754-841)', () => {
      expect(SECTION_MAP['objection-handling']).toEqual({ start: 754, end: 841 });
    });
  });

  describe('loadSections for followup-cadence', () => {
    it('§15 헤더("SECTION 15") + 섹션명("팔로업 케이던스")을 포함', () => {
      const result = loadSections(['followup-cadence'], mockPath);
      expect(result).toContain('SECTION 15');
      expect(result).toContain('팔로업 케이던스');
    });

    it('§15 마지막 실제 내용("절대 하지 않는 것")을 포함', () => {
      const result = loadSections(['followup-cadence'], mockPath);
      expect(result).toContain('절대 하지 않는 것');
    });

    it('[상황별 팔로업 변형] 표 내용을 포함 (제안서/계약서/견적/인플루언서)', () => {
      const result = loadSections(['followup-cadence'], mockPath);
      expect(result).toContain('제안서 발송 후');
      expect(result).toContain('계약서 발송 후');
      expect(result).toContain('견적 수정안');
      expect(result).toContain('인플루언서 아웃리치');
    });

    it('[팔로업 톤 규칙] 4단계 문구를 포함', () => {
      const result = loadSections(['followup-cadence'], mockPath);
      expect(result).toContain('확인 여부만 물어보기');
      expect(result).toContain('새로운 가치 추가');
      expect(result).toContain('대안 제시');
      expect(result).toContain('관계 유지 전환');
    });

    it('SECTION 14 고유 키워드가 새어나오지 않음 (상단 경계)', () => {
      const result = loadSections(['followup-cadence'], mockPath);
      expect(result).not.toContain('SECTION14_UNIQUE_KEYWORD');
      expect(result).not.toContain('SECTION 14');
    });

    it('SECTION 16 고유 키워드가 새어나오지 않음 (하단 경계)', () => {
      const result = loadSections(['followup-cadence'], mockPath);
      expect(result).not.toContain('SECTION16_UNIQUE_KEYWORD');
      expect(result).not.toContain('SECTION 16');
      expect(result).not.toContain('톤 캘리브레이션');
    });
  });

  describe('tone-calibration regression (Phase 2/3 경로 불변)', () => {
    it('tone-calibration 섹션 로드가 여전히 정상 동작', () => {
      const result = loadSections(['tone-calibration'], mockPath);
      expect(result).toContain('SECTION 16');
      expect(result).toContain('톤 캘리브레이션');
      expect(result).toContain('SECTION16_UNIQUE_KEYWORD');
    });

    it('tone-calibration은 §15 내용을 포함하지 않음 (경계 분리)', () => {
      const result = loadSections(['tone-calibration'], mockPath);
      expect(result).not.toContain('팔로업 케이던스');
      expect(result).not.toContain('SECTION 15');
    });
  });

  describe('getSectionsForClassification 불변 (Phase 2/3 regression 방지)', () => {
    const baseClassification: ClassificationResult = {
      strategy: 'A',
      language: 'korean',
      toneLevel: 3,
      urgency: 'normal',
      isNewClient: true,
      hasPricing: false,
      hasObjection: false,
    };

    it('반환 배열에 followup-cadence가 포함되지 않음 (Phase 4 전용 경로)', () => {
      const sections = getSectionsForClassification(baseClassification);
      expect(sections).not.toContain('followup-cadence');
    });

    it('모든 strategy에 대해 followup-cadence 미포함', () => {
      const strategies: Array<ClassificationResult['strategy']> = [
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
      ];
      for (const s of strategies) {
        const sections = getSectionsForClassification({ ...baseClassification, strategy: s });
        expect(sections).not.toContain('followup-cadence');
      }
    });

    it('hasObjection=true / hasPricing=true / industry 조합에서도 followup-cadence 미포함', () => {
      const sections = getSectionsForClassification({
        ...baseClassification,
        hasObjection: true,
        hasPricing: true,
        industry: 'beauty',
      });
      expect(sections).not.toContain('followup-cadence');
      // 기존 기능 유지 확인
      expect(sections).toContain('objection-handling');
      expect(sections).toContain('service-recommendation');
      expect(sections).toContain('industry-beauty');
    });

    it('base sections는 여전히 5개 (persona, email-rules-kr, subject-format, tone-calibration, quality-checklist)', () => {
      const sections = getSectionsForClassification(baseClassification);
      expect(sections).toContain('persona');
      expect(sections).toContain('email-rules-kr');
      expect(sections).toContain('subject-format');
      expect(sections).toContain('tone-calibration');
      expect(sections).toContain('quality-checklist');
    });
  });

  describe('SECTION_MAP 확장 확인', () => {
    it('followup-cadence 추가 이후에도 필수 엔트리들이 모두 존재', () => {
      const requiredKeys = [
        'persona',
        'email-rules-kr',
        'subject-format',
        'strategy-A',
        'strategy-E',
        'strategy-I',
        'tone-calibration',
        'objection-handling',
        'quality-checklist',
        'followup-cadence',
      ];
      for (const key of requiredKeys) {
        expect(SECTION_MAP).toHaveProperty(key);
      }
    });
  });
});
