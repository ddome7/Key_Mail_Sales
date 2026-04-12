/**
 * Edit Delta Extractor (LRNG-02)
 *
 * 대표님이 봇의 드래프트를 수정한 내용을 감지하고,
 * AI로 수정 내용을 요약/분류하여 edit_deltas 테이블에 저장한다.
 *
 * 핵심 흐름:
 * 1. touchpoints에서 metadata.originalBody가 있는 email_sent 건을 조회
 * 2. 해당 touchpoint의 sourceId(threadId)로 Gmail 스레드를 로드
 * 3. 스레드에서 자사 발신(isOwnMessage) 메시지의 body를 final_body로 확보
 * 4. original_body vs final_body 비교 (서명 스트립 후)
 * 5. 동일 → "수정 없음" 양성 신호 / 다름 → AI diff 요약
 * 6. edit_deltas 테이블에 저장
 *
 * @module workflow/edit-delta-extractor
 */

import type { ThreadMessage } from './thread-loader.js';
import type { Touchpoint } from '../db/schema.js';
import type { EditDeltaInput } from '../queries/edit-deltas.js';
import { isOwnMessage } from './inbound-detector.js';

// ─── Types ───────────────────────────────────────────────────────

/** AI diff 요약 DI 함수의 반환 타입 */
export interface DiffSummaryResult {
  summary: string;
  category: 'tone' | 'content' | 'structure' | 'pricing' | 'greeting' | 'closing';
}

/** extractEditDeltas에 주입되는 의존성 인터페이스 */
export interface EditDeltaExtractorDeps {
  /** touchpoints 타임라인 조회 (getTimelineByClient) */
  getTimelineByClient: (clientId: number, limit?: number) => Touchpoint[];
  /** edit_deltas 쿼리 팩토리 */
  editDeltaQueries: {
    create: (data: EditDeltaInput) => any;
    getByTouchpointId: (touchpointId: number) => any | undefined;
  };
  /** Gmail 스레드 로드 DI — 미주입 시 빈 스레드 반환 */
  loadThread?: (threadId: string) => Promise<ThreadMessage[]>;
  /** AI diff 요약 DI — 미주입 시 deterministic fallback */
  summarizeDiff?: (original: string, final: string) => Promise<DiffSummaryResult>;
}

/** extractEditDeltas 결과 집계 */
export interface EditDeltaResult {
  /** 처리 시도한 touchpoint 수 */
  processed: number;
  /** D-09: "수정 없음" 양성 신호 카운트 */
  unchanged: number;
  /** 수정된 건 카운트 */
  modified: number;
  /** 스킵한 건 카운트 (중복, 메타데이터 없음, 스레드 없음 등) */
  skipped: number;
  /** 경고 메시지 목록 */
  warnings: string[];
}

// ─── stripHtmlForComparison ──────────────────────────────────────

/**
 * HTML 이메일 본문을 비교 가능한 플레인 텍스트로 정규화한다.
 *
 * 1. br/p 태그 → 줄바꿈 변환
 * 2. 모든 HTML 태그 제거
 * 3. HTML 엔티티 디코딩
 * 4. 서명 블록 스트립 (RESEARCH Pitfall 2: 서명 차이로 인한 false positive 방지)
 * 5. 공백 정규화 + trim
 *
 * @param html - HTML 이메일 본문
 * @returns 비교용 플레인 텍스트
 */
export function stripHtmlForComparison(html: string): string {
  return (
    html
      // br 태그 → 줄바꿈
      .replace(/<br\s*\/?>/gi, '\n')
      // </p> → 줄바꿈 두 번 (문단 구분)
      .replace(/<\/p>/gi, '\n\n')
      // 나머지 HTML 태그 모두 제거
      .replace(/<[^>]*>/g, '')
      // HTML 엔티티 디코딩
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // 서명 블록 스트립 (RESEARCH Pitfall 2)
      // "---" 구분선 이후 모든 내용 제거
      .replace(/\n\s*---[\s\S]*$/m, '')
      // "Best regards" 이후 모든 내용 제거
      .replace(/\n\s*Best regards[\s\S]*$/im, '')
      // "감사합니다" 이후 모든 내용 제거
      .replace(/\n\s*감사합니다[\s\S]*$/m, '')
      // 연속 줄바꿈 정규화
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

// ─── extractEditDeltas ───────────────────────────────────────────

/**
 * 클라이언트별 edit delta를 배치 추출한다.
 *
 * touchpoints에서 email_sent + metadata.originalBody가 있는 건을 찾아,
 * Gmail SENT 메시지(final_body)와 비교하고, AI 또는 deterministic으로
 * diff를 요약하여 edit_deltas 테이블에 저장한다.
 *
 * @param clientId - 대상 클라이언트 ID
 * @param deps - 의존성 (DI 패턴)
 * @returns 처리 결과 집계
 */
export async function extractEditDeltas(
  clientId: number,
  deps: EditDeltaExtractorDeps,
): Promise<EditDeltaResult> {
  const result: EditDeltaResult = {
    processed: 0,
    unchanged: 0,
    modified: 0,
    skipped: 0,
    warnings: [],
  };

  // 1. 타임라인 전체 조회
  const timeline = deps.getTimelineByClient(clientId);

  // 2. email_sent + metadata.originalBody 필터
  const emailSentWithOriginal = timeline.filter((tp) => {
    if (tp.type !== 'email_sent') return false;
    const meta = tp.metadata as Record<string, unknown> | null;
    return meta && typeof meta === 'object' && 'originalBody' in meta;
  });

  for (const tp of emailSentWithOriginal) {
    result.processed++;

    // 3a. 중복 방지: 이미 edit_deltas에 기록된 touchpointId 스킵
    const existing = deps.editDeltaQueries.getByTouchpointId(tp.id);
    if (existing) {
      result.skipped++;
      continue;
    }

    // 3b. metadata에서 originalBody 추출
    const meta = tp.metadata as Record<string, unknown>;
    const originalBody = meta.originalBody as string;
    if (!originalBody) {
      result.skipped++;
      result.warnings.push(`touchpoint ${tp.id}: metadata.originalBody가 비어있음`);
      continue;
    }

    // 3c. Gmail 스레드 로드 (DI 미주입 시 빈 스레드)
    let threadMessages: ThreadMessage[] = [];
    if (deps.loadThread) {
      try {
        threadMessages = await deps.loadThread(tp.sourceId);
      } catch (err) {
        result.skipped++;
        result.warnings.push(`touchpoint ${tp.id}: 스레드 로드 실패 — ${String(err)}`);
        continue;
      }
    }

    // loadThread DI 미주입 → 빈 스레드 → 전체 스킵
    if (threadMessages.length === 0) {
      result.skipped++;
      result.warnings.push(`touchpoint ${tp.id}: Gmail 스레드가 비어있거나 loadThread 미주입`);
      continue;
    }

    // 3d. 자사 발신 메시지 필터 → 가장 최근 것의 body가 final_body
    const ownMessages = threadMessages.filter(isOwnMessage);
    if (ownMessages.length === 0) {
      result.skipped++;
      result.warnings.push(`touchpoint ${tp.id}: 스레드에 자사 발신 메시지 없음`);
      continue;
    }

    // 시간순 정렬 후 가장 최근 (마지막) 메시지의 body
    const latestOwn = ownMessages[ownMessages.length - 1];
    const finalBody = latestOwn.body;

    // 3e. 서명 스트립 후 비교
    const strippedOriginal = stripHtmlForComparison(originalBody);
    const strippedFinal = stripHtmlForComparison(finalBody);

    let diffSummary: string;
    let diffCategory: string;

    if (strippedOriginal === strippedFinal) {
      // D-09: 수정 없음 = 양성 신호
      diffSummary = '수정 없음 (양성 신호)';
      diffCategory = 'none';
      result.unchanged++;
    } else if (deps.summarizeDiff) {
      // AI DI 주입 → AI 요약
      try {
        const aiResult = await deps.summarizeDiff(originalBody, finalBody);
        diffSummary = aiResult.summary;
        diffCategory = aiResult.category;
      } catch {
        // AI 호출 실패 시 deterministic fallback
        diffSummary = '(AI 미사용 — 수동 확인 필요)';
        diffCategory = 'content';
      }
      result.modified++;
    } else {
      // AI DI 미주입 → deterministic fallback
      diffSummary = '(AI 미사용 — 수동 확인 필요)';
      diffCategory = 'content';
      result.modified++;
    }

    // 3g. edit_deltas 테이블에 저장
    deps.editDeltaQueries.create({
      clientId,
      touchpointId: tp.id,
      originalBody,
      finalBody,
      diffSummary,
      diffCategory,
    });
  }

  return result;
}
