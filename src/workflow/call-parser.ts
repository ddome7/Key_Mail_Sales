import { z } from 'zod';
import { normalizePhone } from './phone-normalizer.js';

/**
 * 익시오 슬랙 메시지 파서 — 순수 함수.
 *
 * 원칙:
 *  - AI 호출 없음, DB 접근 없음, 네트워크 없음
 *  - 입력 실패 시 throw하지 않고 `{success:false, reason}` 반환 (T-03-09, T-03-16)
 *  - 최종 출력은 zod ParsedCallSchema로 재검증 (방어 계층)
 *  - 전화번호는 반드시 `normalizePhone`을 경유 (Pitfall 1, T-03-12)
 */

export const ParsedCallSchema = z.object({
  source: z.literal('ixio'),
  shareType: z.enum(['대화', '통화']),
  occurredAt: z.string(),
  contact: z.object({
    phone: z.string().nullable(),
    companyName: z.string().nullable(),
    contactName: z.string().nullable(),
    contactTitle: z.string().nullable(),
  }),
  mainPoints: z.array(z.string()).nullable(),
  details: z.array(z.string()).nullable(),
  transcript: z
    .array(
      z.object({
        speaker: z.enum(['me', 'other']),
        text: z.string(),
      }),
    )
    .nullable(),
  rawText: z.string(),
});
export type ParsedCall = z.infer<typeof ParsedCallSchema>;

export type ParseResult =
  | { success: true; data: ParsedCall }
  | { success: false; reason: string };

// ─── 정규식 상수 ───────────────────────────────────────
const HEADER_RE = /^익시오에서 .+?님이 공유한 (대화|통화) 내용입니다\.$/m;
const DATE_RE =
  /(\d{4})\.\s*(\d{2})\.\s*(\d{2})\s*\([월화수목금토일]요일\)\s*(오전|오후)\s*(\d{1,2})시\s*(\d{1,2})분/;
const CONTACT_WITH_NAME_RE = /^연락처 (.+?)\((\d{9,11})\)님과의 (통화|대화)$/m;
const CONTACT_PHONE_ONLY_RE = /^연락처 (\d{9,11})님과의 (통화|대화)$/m;
const SECTION_HEADERS = ['[주요 내용]', '[상세 내용]', '[대화 내용]'] as const;
type SectionHeader = (typeof SECTION_HEADERS)[number];

// ─── 진입점 ─────────────────────────────────────────────
export function parseSlackCallMessage(text: string): ParseResult {
  const headerMatch = text.match(HEADER_RE);
  if (!headerMatch) {
    return { success: false, reason: 'not an ixio message' };
  }
  const shareType = headerMatch[1] as '대화' | '통화';

  const dateMatch = text.match(DATE_RE);
  if (!dateMatch) {
    return { success: false, reason: 'date format unrecognized' };
  }
  const occurredAt = buildIsoDate(dateMatch);

  const contact = parseContact(text);
  const sections = splitSections(text);

  const parsed: ParsedCall = {
    source: 'ixio',
    shareType,
    occurredAt,
    contact,
    mainPoints: sections['[주요 내용]'] ?? null,
    details: sections['[상세 내용]'] ?? null,
    transcript: sections['[대화 내용]']
      ? parseTranscript(sections['[대화 내용]'].join('\n'))
      : null,
    rawText: text,
  };

  // zod 최종 검증 — 스키마 불일치 시 throw (방어 계층)
  return { success: true, data: ParsedCallSchema.parse(parsed) };
}

// ─── 날짜/시간 ─────────────────────────────────────────
function buildIsoDate(m: RegExpMatchArray): string {
  const [, year, month, day, period, hourStr, minuteStr] = m;
  let hour = parseInt(hourStr, 10);
  const minute = minuteStr.padStart(2, '0');
  if (period === '오후' && hour < 12) hour += 12;
  if (period === '오전' && hour === 12) hour = 0;
  return `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${minute}:00+09:00`;
}

// ─── 연락처 ───────────────────────────────────────────
function parseContact(text: string): ParsedCall['contact'] {
  const named = text.match(CONTACT_WITH_NAME_RE);
  if (named) {
    // "퍼즐) 동반성장위원회 이의선 위원" 같은 형태.
    // ')'로 prefix("퍼즐") 제거 후, 공백 split으로 회사/이름/직함 분리.
    const raw = named[1];
    const afterParen = raw.includes(')')
      ? raw.split(')').slice(1).join(')').trim()
      : raw.trim();
    const words = afterParen.split(/\s+/).filter(Boolean);

    let companyName: string | null = null;
    let contactName: string | null = null;
    let contactTitle: string | null = null;

    if (words.length >= 3) {
      companyName = words[0];
      contactTitle = words[words.length - 1];
      contactName = words.slice(1, -1).join(' ');
    } else if (words.length === 2) {
      companyName = words[0];
      contactName = words[1];
    } else if (words.length === 1) {
      contactName = words[0];
    }

    return {
      phone: normalizePhone(named[2]),
      companyName,
      contactName,
      contactTitle,
    };
  }

  const phoneOnly = text.match(CONTACT_PHONE_ONLY_RE);
  if (phoneOnly) {
    return {
      phone: normalizePhone(phoneOnly[1]),
      companyName: null,
      contactName: null,
      contactTitle: null,
    };
  }

  return {
    phone: null,
    companyName: null,
    contactName: null,
    contactTitle: null,
  };
}

// ─── 섹션 분리 ────────────────────────────────────────
function splitSections(text: string): Partial<Record<SectionHeader, string[]>> {
  const result: Partial<Record<SectionHeader, string[]>> = {};
  for (const header of SECTION_HEADERS) {
    const idx = text.indexOf(header);
    if (idx === -1) continue;
    // 다음 섹션 헤더(있다면)까지 잘라낸다.
    const nextHeaderIdx =
      SECTION_HEADERS.filter((h) => h !== header)
        .map((h) => text.indexOf(h, idx + header.length))
        .filter((i) => i !== -1)
        .sort((a, b) => a - b)[0] ?? text.length;
    const block = text.slice(idx + header.length, nextHeaderIdx).trim();
    result[header] = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => (l.startsWith('- ') ? l.slice(2).trim() : l));
  }
  return result;
}

// ─── 대화 내용 파싱 ───────────────────────────────────
function parseTranscript(
  text: string,
): Array<{ speaker: 'me' | 'other'; text: string }> {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const turns: Array<{ speaker: 'me' | 'other'; text: string }> = [];
  for (const line of lines) {
    const match = line.match(/^(나|상대방):\s*(.*)$/);
    if (match) {
      turns.push({
        speaker: match[1] === '나' ? 'me' : 'other',
        text: match[2],
      });
    } else if (turns.length > 0) {
      // 다음 줄이 이어지는 발화인 경우
      turns[turns.length - 1].text += ' ' + line.trim();
    }
  }
  return turns;
}
