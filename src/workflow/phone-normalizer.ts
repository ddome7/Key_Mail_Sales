/**
 * 전화번호를 단일 정규 형식(숫자만)으로 통일.
 *
 * 변환 규칙:
 *  - 모든 비숫자 문자 제거 (공백/하이픈/괄호/+ 등)
 *  - '82'로 시작하면 국가코드로 간주하여 '0' + 나머지로 치환
 *
 * 예:
 *  '010-3690-6867'    → '01036906867'
 *  '+82 10-3690-6867' → '01036906867'
 *  '+821036906867'    → '01036906867'
 *  '02-1234-5678'     → '0212345678'
 *  '82-10-3690-6867'  → '01036906867'
 *
 * 단일 유틸 원칙 (Pitfall 1 방지):
 *   DB 저장 / DB 검색 / 파서 출력 / 매처 모두 이 함수만 경유해야 한다.
 *   다른 파일에서 `replace(/\D/g, ...)` 재정의 금지.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('82')) return '0' + digits.slice(2);
  return digits;
}
