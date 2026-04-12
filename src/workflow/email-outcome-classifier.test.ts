/**
 * email-outcome-classifier.test.ts — TDD tests for outcome classification.
 *
 * D-04 기준:
 * - replied: hasReply=true (답장 왔음)
 * - no_reply: hasReply=false + daysElapsed>30 (30일 초과 미응답)
 * - pending: hasReply=false + daysElapsed<=30 (30일 이하 미응답)
 * - positive/negative: AI 세분화 (DI 주입 시)
 */

import { describe, it, expect } from 'vitest';
import {
  classifyOutcomeDeterministic,
  classifyOutcomeWithAI,
  type OutcomeType,
} from './email-outcome-classifier.js';

describe('classifyOutcomeDeterministic', () => {
  it('returns "pending" when no reply and daysElapsed < 30', () => {
    const result = classifyOutcomeDeterministic(false, 10);
    expect(result).toBe('pending');
  });

  it('returns "pending" when no reply and daysElapsed = 0', () => {
    const result = classifyOutcomeDeterministic(false, 0);
    expect(result).toBe('pending');
  });

  it('returns "pending" when no reply and daysElapsed = 30 (boundary)', () => {
    const result = classifyOutcomeDeterministic(false, 30);
    expect(result).toBe('pending');
  });

  it('returns "no_reply" when no reply and daysElapsed > 30', () => {
    const result = classifyOutcomeDeterministic(false, 35);
    expect(result).toBe('no_reply');
  });

  it('returns "no_reply" when no reply and daysElapsed = 31 (boundary)', () => {
    const result = classifyOutcomeDeterministic(false, 31);
    expect(result).toBe('no_reply');
  });

  it('returns "replied" when hasReply=true regardless of days (short)', () => {
    const result = classifyOutcomeDeterministic(true, 5);
    expect(result).toBe('replied');
  });

  it('returns "replied" when hasReply=true regardless of days (long)', () => {
    const result = classifyOutcomeDeterministic(true, 20);
    expect(result).toBe('replied');
  });

  it('returns "replied" even when daysElapsed > 30 if hasReply', () => {
    const result = classifyOutcomeDeterministic(true, 60);
    expect(result).toBe('replied');
  });
});

describe('classifyOutcomeWithAI', () => {
  it('returns deterministic outcome when not "replied"', async () => {
    const result = await classifyOutcomeWithAI('pending', null);
    expect(result).toBe('pending');
  });

  it('returns deterministic outcome for no_reply', async () => {
    const result = await classifyOutcomeWithAI('no_reply', null);
    expect(result).toBe('no_reply');
  });

  it('returns "replied" when no classifyFn is injected (DI absent)', async () => {
    const result = await classifyOutcomeWithAI('replied', 'Some reply body');
    expect(result).toBe('replied');
  });

  it('returns "replied" when replied but replyBody is null', async () => {
    const result = await classifyOutcomeWithAI('replied', null, async () => 'positive');
    expect(result).toBe('replied');
  });

  it('returns "positive" when AI classifies reply as positive', async () => {
    const mockClassify = async (_body: string): Promise<'positive' | 'negative'> => 'positive';
    const result = await classifyOutcomeWithAI('replied', '미팅 잡고 싶습니다', mockClassify);
    expect(result).toBe('positive');
  });

  it('returns "negative" when AI classifies reply as negative', async () => {
    const mockClassify = async (_body: string): Promise<'positive' | 'negative'> => 'negative';
    const result = await classifyOutcomeWithAI('replied', '지금은 어렵습니다', mockClassify);
    expect(result).toBe('negative');
  });

  it('passes the replyBody to classifyFn', async () => {
    let receivedBody = '';
    const mockClassify = async (body: string): Promise<'positive' | 'negative'> => {
      receivedBody = body;
      return 'positive';
    };
    await classifyOutcomeWithAI('replied', '테스트 본문입니다', mockClassify);
    expect(receivedBody).toBe('테스트 본문입니다');
  });
});
