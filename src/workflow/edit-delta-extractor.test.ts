/**
 * edit-delta-extractor 테스트
 *
 * Task 1: stripHtmlForComparison 유틸리티 테스트
 * Task 2: extractEditDeltas 배치 추출기 테스트
 */

import { describe, it, expect, vi } from 'vitest';
import { stripHtmlForComparison, extractEditDeltas } from './edit-delta-extractor.js';
import type { EditDeltaExtractorDeps, EditDeltaResult } from './edit-delta-extractor.js';
import type { Touchpoint } from '../db/schema.js';
import {
  THREAD_WITH_SENT_MODIFIED,
  THREAD_WITH_SENT_UNCHANGED,
} from '../../tests/fixtures/learning-samples.js';

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

// ─── Task 2: extractEditDeltas 배치 추출기 ─────────────────────

/** 테스트용 touchpoint 팩토리 */
function makeTouchpoint(overrides: Partial<Touchpoint> & { id: number; sourceId: string }): Touchpoint {
  return {
    clientId: 1,
    type: 'email_sent',
    summary: 'test email',
    metadata: null,
    occurredAt: '2026-04-01T10:00:00+09:00',
    createdAt: '2026-04-01T10:00:00+09:00',
    ...overrides,
  };
}

/** 원본 HTML body (봇이 생성한 드래프트) */
const ORIGINAL_BODY = '<p>안녕하세요, 퍼즐코퍼레이션입니다. 건의 제안서를 보내드립니다. 검토 후 회신 부탁드립니다.</p>';

/** 수정된 final body (대표님이 수정한 최종본) */
const MODIFIED_BODY = '<p>안녕하세요! 퍼즐코퍼레이션 최영록입니다 :) 요청 주신 건 제안서 바로 보내드려요. 편하게 검토하시고 궁금하신 점 있으면 말씀 주세요!</p>';

/** 기본 deps 생성 헬퍼 */
function makeDeps(overrides: Partial<EditDeltaExtractorDeps> = {}): EditDeltaExtractorDeps {
  return {
    getTimelineByClient: vi.fn().mockReturnValue([]),
    editDeltaQueries: {
      create: vi.fn().mockReturnValue({ id: 1 }),
      getByTouchpointId: vi.fn().mockReturnValue(undefined),
    },
    loadThread: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('extractEditDeltas', () => {
  it('Test 1: original === final → diffCategory=none, diffSummary=수정 없음 (양성 신호) (D-09)', async () => {
    const tp = makeTouchpoint({
      id: 100,
      sourceId: 'thread-001',
      metadata: { originalBody: ORIGINAL_BODY },
    });

    const deps = makeDeps({
      getTimelineByClient: vi.fn().mockReturnValue([tp]),
      loadThread: vi.fn().mockResolvedValue(THREAD_WITH_SENT_UNCHANGED),
    });

    const result = await extractEditDeltas(1, deps);

    expect(result.unchanged).toBe(1);
    expect(result.modified).toBe(0);
    expect(deps.editDeltaQueries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        diffCategory: 'none',
        diffSummary: '수정 없음 (양성 신호)',
      }),
    );
  });

  it('Test 2: original !== final + AI DI 주입 → AI가 반환한 summary/category 저장', async () => {
    const tp = makeTouchpoint({
      id: 101,
      sourceId: 'thread-002',
      metadata: { originalBody: ORIGINAL_BODY },
    });

    const mockAI = vi.fn().mockResolvedValue({
      summary: '톤을 더 친근하게 변경',
      category: 'tone' as const,
    });

    const deps = makeDeps({
      getTimelineByClient: vi.fn().mockReturnValue([tp]),
      loadThread: vi.fn().mockResolvedValue(THREAD_WITH_SENT_MODIFIED),
      summarizeDiff: mockAI,
    });

    const result = await extractEditDeltas(1, deps);

    expect(result.modified).toBe(1);
    expect(mockAI).toHaveBeenCalled();
    expect(deps.editDeltaQueries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        diffSummary: '톤을 더 친근하게 변경',
        diffCategory: 'tone',
      }),
    );
  });

  it('Test 3: original !== final + AI DI 미주입 → deterministic fallback', async () => {
    const tp = makeTouchpoint({
      id: 102,
      sourceId: 'thread-003',
      metadata: { originalBody: ORIGINAL_BODY },
    });

    const deps = makeDeps({
      getTimelineByClient: vi.fn().mockReturnValue([tp]),
      loadThread: vi.fn().mockResolvedValue(THREAD_WITH_SENT_MODIFIED),
      // summarizeDiff 미주입
    });
    delete deps.summarizeDiff;

    const result = await extractEditDeltas(1, deps);

    expect(result.modified).toBe(1);
    expect(deps.editDeltaQueries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        diffSummary: '(AI 미사용 — 수동 확인 필요)',
        diffCategory: 'content',
      }),
    );
  });

  it('Test 4: metadata.originalBody 없는 touchpoint → skip + warning', async () => {
    const tp = makeTouchpoint({
      id: 103,
      sourceId: 'thread-004',
      type: 'email_sent',
      metadata: { draftId: 'draft-123' }, // originalBody 없음
    });

    const deps = makeDeps({
      getTimelineByClient: vi.fn().mockReturnValue([tp]),
    });

    const result = await extractEditDeltas(1, deps);

    // originalBody 없는 touchpoint는 필터 단계에서 제외됨
    expect(result.processed).toBe(0);
    expect(deps.editDeltaQueries.create).not.toHaveBeenCalled();
  });

  it('Test 5: 이미 edit_deltas에 기록된 touchpointId → skip (중복 방지)', async () => {
    const tp = makeTouchpoint({
      id: 104,
      sourceId: 'thread-005',
      metadata: { originalBody: ORIGINAL_BODY },
    });

    const deps = makeDeps({
      getTimelineByClient: vi.fn().mockReturnValue([tp]),
      editDeltaQueries: {
        create: vi.fn(),
        getByTouchpointId: vi.fn().mockReturnValue({ id: 1, touchpointId: 104 }), // 이미 존재
      },
    });

    const result = await extractEditDeltas(1, deps);

    expect(result.skipped).toBe(1);
    expect(deps.editDeltaQueries.create).not.toHaveBeenCalled();
  });

  it('Test 6: Gmail 스레드에 자사 발신 메시지 없음 → skip + warning', async () => {
    const tp = makeTouchpoint({
      id: 105,
      sourceId: 'thread-006',
      metadata: { originalBody: ORIGINAL_BODY },
    });

    // 외부 발신 메시지만 있는 스레드
    const externalThread = [
      {
        messageId: 'msg-external',
        from: 'external@other.com',
        to: 'cyr@puzl.co.kr',
        subject: 'Re: 제안서',
        body: '<p>검토하겠습니다.</p>',
        internalDate: '1711940400000',
      },
    ];

    const deps = makeDeps({
      getTimelineByClient: vi.fn().mockReturnValue([tp]),
      loadThread: vi.fn().mockResolvedValue(externalThread),
    });

    const result = await extractEditDeltas(1, deps);

    expect(result.skipped).toBe(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('자사 발신 메시지 없음')]),
    );
  });

  it('Test 7: gmailReadThreadTool DI 미주입 → 빈 스레드 반환, 전체 skip', async () => {
    const tp = makeTouchpoint({
      id: 106,
      sourceId: 'thread-007',
      metadata: { originalBody: ORIGINAL_BODY },
    });

    const deps = makeDeps({
      getTimelineByClient: vi.fn().mockReturnValue([tp]),
    });
    delete deps.loadThread; // loadThread DI 미주입

    const result = await extractEditDeltas(1, deps);

    expect(result.skipped).toBe(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('loadThread 미주입')]),
    );
  });

  it('Test 8: 여러 touchpoint 배치 처리 — 2건 중 1건 성공, 1건 skip', async () => {
    const tp1 = makeTouchpoint({
      id: 107,
      sourceId: 'thread-008',
      metadata: { originalBody: ORIGINAL_BODY },
    });
    const tp2 = makeTouchpoint({
      id: 108,
      sourceId: 'thread-009',
      metadata: { originalBody: ORIGINAL_BODY },
    });

    const deps = makeDeps({
      getTimelineByClient: vi.fn().mockReturnValue([tp1, tp2]),
      loadThread: vi
        .fn()
        .mockResolvedValueOnce(THREAD_WITH_SENT_UNCHANGED) // tp1: 성공
        .mockResolvedValueOnce([]), // tp2: 빈 스레드 → skip
      editDeltaQueries: {
        create: vi.fn().mockReturnValue({ id: 1 }),
        getByTouchpointId: vi.fn().mockReturnValue(undefined),
      },
    });

    const result = await extractEditDeltas(1, deps);

    expect(result.processed).toBe(2);
    expect(result.unchanged).toBe(1); // tp1 성공 (수정 없음)
    expect(result.skipped).toBe(1); // tp2 스킵
    expect(deps.editDeltaQueries.create).toHaveBeenCalledTimes(1);
  });
});
