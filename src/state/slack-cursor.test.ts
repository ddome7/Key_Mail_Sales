import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { rmSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import {
  loadSlackCursor,
  saveSlackCursor,
  assertAllowedChannel,
  ALLOWED_CHANNEL_ID,
  SlackCursorSchema,
} from './slack-cursor.js';

describe('slack-cursor', () => {
  let tmpDir: string;
  let cursorPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `slack-cursor-test-${randomUUID()}`);
    cursorPath = join(tmpDir, 'slack-cursor.json');
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('loadSlackCursor: 파일이 없으면 기본 커서(version=1, lastReadTs="0") 반환', () => {
    const cursor = loadSlackCursor(cursorPath);
    expect(cursor.version).toBe(1);
    expect(cursor.lastReadTs).toBe('0');
    expect(cursor.channelId).toBe('C0AQYJ9GJHK');
    expect(cursor.channelId).toBe(ALLOWED_CHANNEL_ID);
    // lastReadAt은 epoch 0에 해당하는 ISO 문자열
    expect(typeof cursor.lastReadAt).toBe('string');
  });

  it('saveSlackCursor → loadSlackCursor 왕복: 값 일치', () => {
    const cursor = {
      version: 1 as const,
      lastReadTs: '1712548680.123456',
      lastReadAt: '2026-04-08T16:18:00.000Z',
      channelId: ALLOWED_CHANNEL_ID,
    };

    saveSlackCursor(cursor, cursorPath);
    const loaded = loadSlackCursor(cursorPath);
    expect(loaded).toEqual(cursor);
  });

  it('saveSlackCursor: atomic write 후 .tmp 파일이 남지 않음', () => {
    saveSlackCursor(
      {
        version: 1,
        lastReadTs: '1712548680.000001',
        lastReadAt: '2026-04-08T16:18:00.000Z',
        channelId: ALLOWED_CHANNEL_ID,
      },
      cursorPath,
    );

    expect(existsSync(cursorPath)).toBe(true);
    expect(existsSync(cursorPath + '.tmp')).toBe(false);

    // 디렉토리에 정확히 1개 파일만 존재해야 함
    const files = readdirSync(tmpDir);
    expect(files).toEqual(['slack-cursor.json']);
  });

  it('saveSlackCursor: 디렉토리가 없어도 자동 생성', () => {
    const deepPath = join(tmpDir, 'nested', 'deep', 'slack-cursor.json');
    expect(existsSync(tmpDir)).toBe(false);

    saveSlackCursor(
      {
        version: 1,
        lastReadTs: '1712548680.000002',
        lastReadAt: '2026-04-08T16:18:00.000Z',
        channelId: ALLOWED_CHANNEL_ID,
      },
      deepPath,
    );

    expect(existsSync(deepPath)).toBe(true);
  });

  it('loadSlackCursor: 손상된 JSON(타입 불일치) 로드 시 zod throw', () => {
    mkdirSync(tmpDir, { recursive: true });
    // lastReadTs가 숫자(스키마는 string 요구)
    writeFileSync(
      cursorPath,
      JSON.stringify({
        version: 1,
        lastReadTs: 123,
        lastReadAt: '2026-04-08T16:18:00.000Z',
        channelId: ALLOWED_CHANNEL_ID,
      }),
      'utf-8',
    );

    expect(() => loadSlackCursor(cursorPath)).toThrow();
  });

  it('loadSlackCursor: version 불일치(스키마는 literal(1)) 로드 시 throw', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      cursorPath,
      JSON.stringify({
        version: 2,
        lastReadTs: '0',
        lastReadAt: '2026-04-08T16:18:00.000Z',
        channelId: ALLOWED_CHANNEL_ID,
      }),
      'utf-8',
    );

    expect(() => loadSlackCursor(cursorPath)).toThrow();
  });

  it('assertAllowedChannel: 허용 채널(C0AQYJ9GJHK)은 통과', () => {
    expect(() => assertAllowedChannel(ALLOWED_CHANNEL_ID)).not.toThrow();
    expect(() => assertAllowedChannel('C0AQYJ9GJHK')).not.toThrow();
  });

  it('assertAllowedChannel: 다른 채널은 "금지된 채널" 에러 throw', () => {
    expect(() => assertAllowedChannel('C12345')).toThrow(/금지된 채널/);
    expect(() => assertAllowedChannel('')).toThrow(/금지된 채널/);
    expect(() => assertAllowedChannel('C0AQYJ9GJHX')).toThrow(/금지된 채널/);
  });

  it('SlackCursorSchema: 정상 입력 parse 성공', () => {
    const valid = {
      version: 1,
      lastReadTs: '1712548680.123456',
      lastReadAt: '2026-04-08T16:18:00.000Z',
      channelId: ALLOWED_CHANNEL_ID,
    };
    expect(() => SlackCursorSchema.parse(valid)).not.toThrow();
  });
});
