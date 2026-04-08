import { describe, it, expect } from 'vitest';
import {
  EMAIL_SIGNATURE_HTML,
  INTRO_LINKS_HTML,
  MANDATORY_CC,
  validateQualityChecklist,
  generateSubject,
} from './quality-checker.js';
import type { ClassificationResult } from '../types/classification.js';

// ─── Fixed HTML Blocks ───────────────────────────────────

describe('EMAIL_SIGNATURE_HTML', () => {
  it('contains 감사합니다 and 퍼즐코퍼레이션 and 최 영 록 and 드림.', () => {
    expect(EMAIL_SIGNATURE_HTML).toContain('감사합니다');
    expect(EMAIL_SIGNATURE_HTML).toContain('퍼즐코퍼레이션');
    expect(EMAIL_SIGNATURE_HTML).toContain('최 영 록');
    expect(EMAIL_SIGNATURE_HTML).toContain('드림.');
  });
});

describe('INTRO_LINKS_HTML', () => {
  it('contains 3 href links with featpaper.com URLs', () => {
    const hrefMatches = INTRO_LINKS_HTML.match(/href="https:\/\/featpaper\.com[^"]*"/g);
    expect(hrefMatches).not.toBeNull();
    expect(hrefMatches!.length).toBe(3);
  });
});

describe('MANDATORY_CC', () => {
  it('equals PM@puzl.co.kr and leader@puzl.co.kr', () => {
    expect(MANDATORY_CC).toEqual(['PM@puzl.co.kr', 'leader@puzl.co.kr']);
  });
});

// ─── validateQualityChecklist ────────────────────────────

function makeClassification(overrides?: Partial<ClassificationResult>): ClassificationResult {
  return {
    strategy: 'A',
    language: 'korean',
    toneLevel: 2,
    urgency: 'normal',
    isNewClient: true,
    hasPricing: false,
    hasObjection: false,
    ...overrides,
  };
}

describe('validateQualityChecklist', () => {
  const wellFormedHtml = `
    <p>안녕하세요, 좋은 하루 보내고 계신가요?</p>
    <p>문의 주셔서 감사합니다.</p>
    <p>저희 퍼즐코퍼레이션에서 마케팅 대행 서비스를 제안드립니다.</p>
    <p>궁금하신 점이 있으시면 편하게 문의주시면 안내 도와드리겠습니다.</p>
    <br><p>감사합니다.</p><br><p>퍼즐코퍼레이션</p><p>최 영 록</p><p>드림.</p>
    <p>● <a href="https://featpaper.com/v/VfX2kIoM">회사 소개서</a></p>
    <p>● <a href="https://featpaper.com/v/4H1Jxn">UGC/바이럴 마케팅 소개서</a></p>
    <p>● <a href="https://featpaper.com/v/j0XXxA0n">콘텐츠팀 소개서</a></p>
  `;

  it('fails when signature is missing from htmlBody', () => {
    const noSignature = '<p>안녕하세요, 문의 감사합니다.</p><p>문의주시면 답변드리겠습니다.</p>';
    const result = validateQualityChecklist(noSignature, '[퍼즐/최영록] 테스트 _ 소개 _ 260408', makeClassification());
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes('서명'))).toBe(true);
  });

  it('fails when dangerous chars (└, →) are present', () => {
    const dangerousHtml = `
      <p>안녕하세요, 감사합니다.</p>
      <p>└ 항목 1</p>
      <p>→ 항목 2</p>
      <p>문의주시면 안내드리겠습니다.</p>
      <br><p>감사합니다.</p><br><p>퍼즐코퍼레이션</p><p>최 영 록</p><p>드림.</p>
    `;
    const result = validateQualityChecklist(dangerousHtml, '[퍼즐/최영록] 테스트 _ 소개 _ 260408', makeClassification());
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes('위험 문자'))).toBe(true);
  });

  it('warns when pricing is detected', () => {
    const pricingHtml = `
      <p>안녕하세요, 감사합니다.</p>
      <p>예산은 300만원입니다.</p>
      <p>문의주시면 안내드리겠습니다.</p>
      <br><p>감사합니다.</p><br><p>퍼즐코퍼레이션</p><p>최 영 록</p><p>드림.</p>
    `;
    const result = validateQualityChecklist(
      pricingHtml,
      '[퍼즐/최영록] 테스트 _ 견적 _ 260408',
      makeClassification({ hasPricing: true })
    );
    expect(result.warnings.some((w) => w.includes('금액'))).toBe(true);
  });

  it('passes for well-formed email with signature + action keywords', () => {
    const result = validateQualityChecklist(
      wellFormedHtml,
      '[퍼즐/최영록] 테스트컴퍼니 _ 소개 _ 260408',
      makeClassification()
    );
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });
});

// ─── generateSubject ─────────────────────────────────────

describe('generateSubject', () => {
  it('generates [퍼즐/최영록] format for strategy A', () => {
    const subject = generateSubject('A', '테스트컴퍼니', '소개');
    expect(subject).toMatch(/^\[퍼즐\/최영록\] 테스트컴퍼니 _ 소개 _ \d{6}$/);
  });

  it('includes correct date format YYMMDD', () => {
    const fixedDate = new Date(2026, 3, 8); // 2026-04-08
    const subject = generateSubject('A', '테스트컴퍼니', '인사', fixedDate);
    expect(subject).toBe('[퍼즐/최영록] 테스트컴퍼니 _ 인사 _ 260408');
  });
});
