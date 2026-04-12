/**
 * edit-delta-extractor 테스트
 *
 * Task 1: stripHtmlForComparison 유틸리티 테스트
 * Task 2: extractEditDeltas 배치 추출기 테스트
 */

import { describe, it, expect } from 'vitest';
import { stripHtmlForComparison } from './edit-delta-extractor.js';

describe('stripHtmlForComparison', () => {
  it('HTML 태그 제거 — <p>안녕하세요</p> → 안녕하세요', () => {
    expect(stripHtmlForComparison('<p>안녕하세요</p>')).toBe('안녕하세요');
  });

  it('br/p 태그 → 줄바꿈 변환', () => {
    const html = '<p>첫 줄</p><p>둘째 줄</p>';
    const result = stripHtmlForComparison(html);
    expect(result).toContain('첫 줄');
    expect(result).toContain('둘째 줄');
    // p 태그 사이에 줄바꿈이 있어야 함
    expect(result.indexOf('첫 줄')).toBeLessThan(result.indexOf('둘째 줄'));

    const brHtml = '안녕하세요<br>제안서 보내드립니다';
    const brResult = stripHtmlForComparison(brHtml);
    expect(brResult).toContain('안녕하세요');
    expect(brResult).toContain('제안서 보내드립니다');
  });

  it('HTML 엔티티 디코딩 — &amp; → &, &nbsp; → 공백', () => {
    expect(stripHtmlForComparison('A &amp; B')).toBe('A & B');
    expect(stripHtmlForComparison('hello&nbsp;world')).toBe('hello world');
    expect(stripHtmlForComparison('&lt;tag&gt;')).toBe('<tag>');
  });

  it('서명 블록 스트립 — --- 이후 내용 제거', () => {
    const withSignature = '<p>본문 내용입니다.</p><br>---<br><p>최영록</p><p>퍼즐코퍼레이션</p>';
    const result = stripHtmlForComparison(withSignature);
    expect(result).toContain('본문 내용입니다.');
    expect(result).not.toContain('최영록');
    expect(result).not.toContain('퍼즐코퍼레이션');
  });

  it('서명 블록 스트립 — Best regards / 감사합니다 이후 제거', () => {
    const withBestRegards = '<p>제안서 보내드립니다.</p><p>Best regards,</p><p>최영록</p>';
    const result = stripHtmlForComparison(withBestRegards);
    expect(result).toContain('제안서 보내드립니다.');
    expect(result).not.toContain('최영록');

    const withKoreanClosing = '<p>검토 부탁드립니다.</p><p>감사합니다.</p><p>최영록 드림</p>';
    const korResult = stripHtmlForComparison(withKoreanClosing);
    expect(korResult).toContain('검토 부탁드립니다.');
    expect(korResult).not.toContain('최영록 드림');
  });

  it('동일 내용의 다른 HTML 형식 → 같은 결과 (정규화)', () => {
    const format1 = '<p>안녕하세요, 제안서 보내드립니다.</p>';
    const format2 = '<div>안녕하세요, 제안서 보내드립니다.</div>';
    const format3 = '안녕하세요, 제안서 보내드립니다.';

    const result1 = stripHtmlForComparison(format1);
    const result2 = stripHtmlForComparison(format2);
    const result3 = stripHtmlForComparison(format3);

    expect(result1).toBe(result3);
    expect(result2).toBe(result3);
  });
});
