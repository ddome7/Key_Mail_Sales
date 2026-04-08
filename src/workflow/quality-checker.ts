/**
 * SECTION 20 Quality Checklist + Email Subject Generator + Fixed HTML Blocks.
 *
 * Per D-07, D-09, D-11, EMAIL-05, EMAIL-06, EMAIL-07, EMAIL-10, EMAIL-11, APPR-03.
 *
 * Quality checklist validates 11 items before email dispatch.
 * Fixed HTML blocks (signature, intro links, CC) are constants — NOT AI-generated.
 * This prevents T-02-06 (tampering) by keeping critical content immutable.
 */

import type { Strategy } from '../types/classification.js';
import type { ClassificationResult } from '../types/classification.js';
import type { QualityCheckResult } from '../types/email.js';
import { extractPricesFromText } from '../safety/price-validator.js';
import { UNSAFE_CHAR_MAP, SAFE_CHARS } from '../safety/gmail-sanitizer.js';

// ─── Fixed HTML Blocks (T-02-06: immutable, not AI-generated) ────

/**
 * Email signature HTML block.
 * Per SECTION 6 and 페르소나_분석.md signature format.
 */
export const EMAIL_SIGNATURE_HTML = `<br><p>감사합니다.</p><br><p>퍼즐코퍼레이션</p><p>최 영 록</p><p>드림.</p>`;

/**
 * Introduction links HTML block.
 * Per SECTION 6 소개 자료 링크 (3 documents).
 */
export const INTRO_LINKS_HTML = `
<p>● <a href="https://featpaper.com/v/VfX2kIoM">회사 소개서</a></p>
<p>● <a href="https://featpaper.com/v/4H1Jxn">UGC/바이럴 마케팅 소개서</a></p>
<p>● <a href="https://featpaper.com/v/j0XXxA0n">콘텐츠팀 소개서</a></p>
`;

/**
 * Mandatory CC recipients for all emails (per D-06).
 */
export const MANDATORY_CC: string[] = ['PM@puzl.co.kr', 'leader@puzl.co.kr'];

// ─── Subject Generator (SECTION 8) ──────────────────────

/**
 * Generate email subject in SECTION 8 format:
 * [퍼즐/최영록] {companyName} _ {contentSummary} _ {YYMMDD}
 *
 * @param strategy - Classification strategy (for hint selection)
 * @param companyName - Target company name
 * @param contentSummary - Brief content description
 * @param date - Date for YYMMDD format (defaults to now)
 */
export function generateSubject(
  strategy: Strategy,
  companyName: string,
  contentSummary: string,
  date?: Date,
): string {
  const d = date ?? new Date();
  const yy = d.getFullYear().toString().slice(2);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  const yymmdd = `${yy}${mm}${dd}`;

  return `[퍼즐/최영록] ${companyName} _ ${contentSummary} _ ${yymmdd}`;
}

// ─── Quality Checklist (SECTION 20) ──────────────────────

/** Signature regex pattern: 감사합니다 ... 퍼즐코퍼레이션 ... 최 영 록 ... 드림. */
const SIGNATURE_PATTERN = /감사합니다[\s\S]*퍼즐코퍼레이션[\s\S]*최\s*영\s*록[\s\S]*드림\./;

/** Action keywords indicating clear next step */
const ACTION_KEYWORDS = [
  '문의주시면', '전달해주세요', '확인해주시면', '미팅', '통화',
  '안내 도와드리겠습니다', '답변드리겠습니다', '연락드리겠습니다',
  '회신', '전달드리겠습니다', '보내드리겠습니다',
];

/** Greeting keywords */
const GREETING_KEYWORDS = ['안녕하세요', '안녕하십니까', 'Hello', 'Hi', 'Dear'];

/** Thanks/opening keywords */
const THANKS_KEYWORDS = ['감사합니다', '감사드립니다', 'Thank you', '감사', '반갑습니다'];

/**
 * Validate email quality using SECTION 20's 11-item checklist.
 *
 * Failures = mandatory items that block sending.
 * Warnings = recommended items (advisory only).
 *
 * @param htmlBody - Email HTML body to validate
 * @param subject - Email subject line
 * @param classification - Classification result for context-aware checks
 */
export function validateQualityChecklist(
  htmlBody: string,
  subject: string,
  classification: ClassificationResult,
): QualityCheckResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  // 1. 인사 2줄 고정 체크 (인사말 포함)
  const hasGreeting = GREETING_KEYWORDS.some((kw) => htmlBody.includes(kw));
  if (!hasGreeting) {
    failures.push('[체크 1] 인사말 누락: 인사 표현(안녕하세요 등)이 없습니다.');
  }

  // 2. 오프닝 감사 인사 포함
  const hasThanks = THANKS_KEYWORDS.some((kw) => htmlBody.includes(kw));
  if (!hasThanks) {
    warnings.push('[체크 2] 오프닝 감사 인사 누락: 감사 표현을 추가하세요.');
  }

  // 3. 서명 패턴 매칭
  if (!SIGNATURE_PATTERN.test(htmlBody)) {
    failures.push('[체크 3] 서명 누락: 감사합니다/퍼즐코퍼레이션/최 영 록/드림. 패턴이 없습니다.');
  }

  // 4. 다음 액션 명확
  const hasAction = ACTION_KEYWORDS.some((kw) => htmlBody.includes(kw));
  if (!hasAction) {
    warnings.push('[체크 4] 다음 액션 불명확: 문의주시면/확인해주시면 등 액션 키워드를 포함하세요.');
  }

  // 5. 위험 문자 미포함 (└, →, ─, │ 등)
  const unsafeChars = Object.keys(UNSAFE_CHAR_MAP);
  const foundUnsafe = unsafeChars.filter((ch) => htmlBody.includes(ch));
  if (foundUnsafe.length > 0) {
    failures.push(`[체크 5] 위험 문자 감지: ${foundUnsafe.map((c) => `'${c}'`).join(', ')} — Gmail 렌더링 문제 발생 가능`);
  }

  // 6. 안전 기호만 사용 (■●◎※★ 등)
  // Check for unicode symbols that are NOT in SAFE_CHARS and NOT in UNSAFE_CHAR_MAP
  // This is advisory only
  const symbolPattern = /[\u2500-\u257F\u2190-\u21FF\u2600-\u26FF\u2700-\u27BF]/g;
  const symbols = htmlBody.match(symbolPattern) || [];
  const unknownSymbols = symbols.filter(
    (s) => !SAFE_CHARS.includes(s) && !(s in UNSAFE_CHAR_MAP)
  );
  if (unknownSymbols.length > 0) {
    warnings.push(`[체크 6] 확인 필요 기호: ${[...new Set(unknownSymbols)].join(', ')} — 안전 기호(■●◎※★) 외 기호 사용`);
  }

  // 7. 제목 형식 체크 ([퍼즐/최영록] 프리픽스)
  if (!subject.startsWith('[퍼즐/최영록]')) {
    failures.push('[체크 7] 제목 형식 오류: [퍼즐/최영록] 프리픽스가 없습니다.');
  }

  // 8. CC 포함 안내 (draft-creator에서 처리하므로 warning만)
  warnings.push('[체크 8] CC 확인: PM@puzl.co.kr, leader@puzl.co.kr CC 포함 확인 필요');

  // 9. 소개 자료 링크 포함 확인 (strategy A일 때)
  if (classification.strategy === 'A') {
    const hasIntroLinks = htmlBody.includes('featpaper.com');
    if (!hasIntroLinks) {
      warnings.push('[체크 9] 소개 자료 링크 누락: 신규 문의(전략 A)에는 소개 자료 링크를 포함하세요.');
    }
  }

  // 10. 금액 포함 시 HIGH 리스크 경고 (APPR-03)
  if (classification.hasPricing) {
    const prices = extractPricesFromText(htmlBody);
    if (prices.length > 0) {
      warnings.push(
        `[체크 10] ⚠️ 금액 포함 — HIGH 리스크: ${prices.map((p) => p.originalText).join(', ')} 감지. 반드시 확인해주세요.`
      );
    } else {
      warnings.push('[체크 10] 금액 키워드 감지됨. 이메일 본문의 금액을 확인해주세요.');
    }
  }

  // 11. HTML 형식 확인 (<p> 또는 <br> 태그 존재)
  const hasHtmlTags = /<p[\s>]|<br[\s>/]/i.test(htmlBody);
  if (!hasHtmlTags) {
    failures.push('[체크 11] HTML 형식 오류: <p> 또는 <br> 태그가 없습니다. text/html 형식이어야 합니다.');
  }

  return {
    passed: failures.length === 0,
    failures,
    warnings,
  };
}
