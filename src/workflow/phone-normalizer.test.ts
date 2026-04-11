import { describe, it, expect } from 'vitest';
import { normalizePhone } from './phone-normalizer.js';

describe('normalizePhone', () => {
  it('이미 정규 형식인 숫자 11자리는 그대로 반환한다', () => {
    expect(normalizePhone('01036906867')).toBe('01036906867');
  });

  it('하이픈이 포함된 국내 번호를 정규화한다', () => {
    expect(normalizePhone('010-3690-6867')).toBe('01036906867');
  });

  it('공백이 포함된 국내 번호를 정규화한다', () => {
    expect(normalizePhone('010 3690 6867')).toBe('01036906867');
  });

  it('국가코드 +82가 붙은 번호를 정규화한다', () => {
    expect(normalizePhone('+821036906867')).toBe('01036906867');
  });

  it('국가코드 +82와 공백/하이픈이 섞인 번호를 정규화한다', () => {
    expect(normalizePhone('+82 10-3690-6867')).toBe('01036906867');
  });

  it('+ 없이 82로 시작하는 번호도 국가코드로 간주한다', () => {
    expect(normalizePhone('82-10-3690-6867')).toBe('01036906867');
  });

  it('서울 지역번호(02)는 10자리로 정규화한다', () => {
    expect(normalizePhone('02-1234-5678')).toBe('0212345678');
  });

  it('빈 문자열 입력은 빈 문자열을 반환한다 (throw 없음)', () => {
    expect(normalizePhone('')).toBe('');
  });

  it('괄호/기호가 포함된 입력도 숫자만 추출한다', () => {
    expect(normalizePhone('(010) 3690-6867')).toBe('01036906867');
  });
});
