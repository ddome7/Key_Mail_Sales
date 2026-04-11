import { z } from 'zod';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
} from 'fs';
import { resolve, dirname } from 'path';

/**
 * #세일즈_통화요약 채널 ID. 절대 다른 채널 접근 금지.
 *
 * CLAUDE.md / 슬랙 채널 규칙: "#세일즈_통화요약 채널만 읽기, 다른 채널 절대 조회 금지"
 * 환경변수로 빼지 않는 이유: 실수로 다른 채널을 지정하는 경로 자체를 차단.
 */
export const ALLOWED_CHANNEL_ID = 'C0AQYJ9GJHK';

/**
 * 슬랙 읽기 커서 스키마. version을 literal로 고정하여
 * 파일 포맷 breaking change를 zod parse 단계에서 감지한다 (T-03-02).
 */
export const SlackCursorSchema = z.object({
  version: z.literal(1),
  /** 마지막으로 처리한 슬랙 메시지의 ts ("1712548680.123456"). 초기값 "0" = 전체 조회. */
  lastReadTs: z.string(),
  /** 마지막 처리 시각 (사람이 읽는 로그 용도). */
  lastReadAt: z.string(),
  /** 커서가 추적 중인 채널 ID. ALLOWED_CHANNEL_ID와 반드시 일치해야 함. */
  channelId: z.string(),
});
export type SlackCursor = z.infer<typeof SlackCursorSchema>;

const DEFAULT_CURSOR_PATH = resolve(process.cwd(), 'state', 'slack-cursor.json');

/**
 * 슬랙 커서 로드. 파일이 없으면 기본값(전체 조회 = lastReadTs '0')을 반환.
 *
 * D-07: 마지막 읽은 타임스탬프 기반 새 메시지 필터 — 동일 메시지 중복 처리 방지.
 * T-03-02: zod 검증으로 손상된 파일은 parse 단계에서 throw.
 */
export function loadSlackCursor(filePath: string = DEFAULT_CURSOR_PATH): SlackCursor {
  if (!existsSync(filePath)) {
    return {
      version: 1,
      lastReadTs: '0',
      lastReadAt: new Date(0).toISOString(),
      channelId: ALLOWED_CHANNEL_ID,
    };
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  return SlackCursorSchema.parse(raw);
}

/**
 * 원자적 저장 (tmp → rename). pipeline.ts의 atomicWrite 패턴과 동일.
 *
 * Pitfall 2 방지: 중간 크래시에도 파일 손상 없음.
 * 디렉토리가 없으면 자동 생성.
 * 저장 전에도 zod 검증하여 잘못된 데이터가 디스크에 남지 않도록 한다.
 */
export function saveSlackCursor(
  cursor: SlackCursor,
  filePath: string = DEFAULT_CURSOR_PATH,
): void {
  SlackCursorSchema.parse(cursor);
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(cursor, null, 2), 'utf-8');
  renameSync(tmpPath, filePath);
}

/**
 * 슬랙 채널 화이트리스트 체크. Slack MCP 호출 직전에 반드시 호출해야 한다.
 *
 * T-03-03: #세일즈_통화요약 외 다른 채널 접근을 코드 레벨에서 차단.
 * Plan 05 오케스트레이터가 Slack MCP `conversations_history`를 호출하기 전에 의무 호출.
 */
export function assertAllowedChannel(channelId: string): void {
  if (channelId !== ALLOWED_CHANNEL_ID) {
    throw new Error(
      `금지된 채널 접근: ${channelId}. 허용된 채널: ${ALLOWED_CHANNEL_ID} (#세일즈_통화요약)`,
    );
  }
}
