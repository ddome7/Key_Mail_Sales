#!/usr/bin/env npx tsx
/**
 * Phase 5 Plan 06 Task 2 — Learning Loop (학습 루프) CLI 진입점.
 *
 * 대표님이 Claude Code 세션에서 "학습 돌려줘" 요청 시 호출하는 on-demand 명령.
 *
 * 실행 모드: on-demand only (D-01).
 * - 이 스크립트는 호출자가 명시적으로 실행할 때만 동작합니다.
 * - 자동 트리거(타이머/스케줄러)는 일절 사용하지 않습니다.
 * - 백그라운드 잡 큐도 사용하지 않습니다.
 *
 * ─ 플래그 ────────────────────────────────────────────────
 *   --company <이름>         단건 모드. 특정 회사 1건만 학습 분석.
 *   (플래그 없음)            전수 모드. 활성 클라이언트 전체 학습.
 *   --help, -h               이 도움말.
 *
 * ─ 사용 예 ───────────────────────────────────────────────
 *   npx tsx scripts/run-learning-loop.ts
 *   npx tsx scripts/run-learning-loop.ts --company 동반성장위원회
 *
 * ─ 주의: 단독 실행 시의 한계 ──────────────────────────────
 *   tsx 스크립트로 단독 실행될 때는 Claude Code 세션의 Gmail MCP 도구에
 *   접근할 수 없으므로 Gmail 스레드 조회는 stub으로 주입됩니다.
 *   AI DI(outcome 분류, diff 요약, 경쟁사 추출)도 미주입 → deterministic 모드.
 *   실제 AI 연동 학습은 Claude Code 세션 내에서 deps에 AI 함수를 주입하여 실행합니다.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { createClientQueries } from '../src/queries/clients.js';
import { createTouchpointQueries } from '../src/queries/touchpoints.js';
import { createEmailPatternQueries } from '../src/queries/email-patterns.js';
import { createEditDeltaQueries } from '../src/queries/edit-deltas.js';
import { createCompetitorIntelQueries } from '../src/queries/competitor-intel.js';
import {
  runLearningLoop,
  runLearnForClient,
  type LearningLoopDependencies,
} from '../src/workflow/learning-loop.js';
import { renderLearningReport } from '../src/workflow/learning-report.js';

// ─── 플래그 파싱 ────────────────────────────────────────────

interface CliFlags {
  company?: string;
  help: boolean;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--company') {
      flags.company = argv[++i];
    } else if (a === '--help' || a === '-h') {
      flags.help = true;
    }
  }
  return flags;
}

function printHelp(): void {
  console.log(
    `
학습 루프 — Phase 5 학습 분석 (on-demand)

대표님이 Claude Code 세션에서 "학습 돌려줘" 요청 시 호출하는 명령입니다.
백그라운드 자동 실행은 일절 없으며, 이 명령을 직접 입력했을 때만 동작합니다.

사용법:
  npx tsx scripts/run-learning-loop.ts [옵션]

옵션:
  --company <이름>        특정 클라이언트 1건만 학습 분석 (단건 모드)
  (옵션 없음)             활성 클라이언트 전체 학습 (전수 모드)
  --help, -h              이 도움말 출력

실행 예:
  npx tsx scripts/run-learning-loop.ts
  npx tsx scripts/run-learning-loop.ts --company 동반성장위원회

단독 실행 시 제약:
  이 CLI는 Gmail MCP 도구와 AI에 접근할 수 없어 스레드 조회는 stub,
  AI 분류는 deterministic 모드로 동작합니다. 로직 파이프라인 smoke test
  용도로만 사용하세요.
`.trim(),
  );
}

// ─── DB 경로 해결 (cwd 의존성 제거) ────────────────────────

function resolveDbPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', 'data', 'sales.db');
}

// ─── main ───────────────────────────────────────────────────

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    return;
  }

  // ─ DB 연결 (없으면 친절한 안내 후 종료) ─
  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) {
    console.error(
      `\nDB 파일을 찾을 수 없습니다: ${dbPath}\n` +
        '   먼저 npm run db:push 또는 npm run db:migrate 로 스키마를 생성하고\n' +
        '   npm run db:seed 로 시드 데이터를 채워주세요.\n',
    );
    process.exit(1);
  }

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);

  const deps: LearningLoopDependencies = {
    clientQueries: createClientQueries(db),
    touchpointQueries: createTouchpointQueries(db),
    emailPatternQueries: createEmailPatternQueries(db),
    editDeltaQueries: createEditDeltaQueries(db),
    competitorIntelQueries: createCompetitorIntelQueries(db),
    // Gmail MCP stub — Claude Code 세션 외 환경에서는 빈 스레드 반환
    loadThread: async (_threadId: string) => {
      console.warn('[학습 루프] Gmail MCP 미연결 — 스레드 로드 생략');
      return [];
    },
    // AI DI는 미주입 — CLI 단독 실행 시 deterministic 모드
    // Claude Code 세션에서는 AI 함수를 직접 주입하여 full mode 호출
  };

  try {
    if (flags.company) {
      // ─ 단건 모드: 특정 클라이언트 1건만 학습 ─
      const client = deps.clientQueries.getActiveFollowupClients()
        .find((c) => c.companyName === flags.company);

      if (!client) {
        console.error(`\n클라이언트를 찾을 수 없습니다: ${flags.company}\n`);
        process.exit(1);
      }

      console.log(`학습 루프 실행 중 (단건: ${flags.company})...\n`);
      const result = await runLearnForClient(client.id, deps);
      const report = renderLearningReport(result);
      console.log(report);
    } else {
      // ─ 전수 모드: 활성 클라이언트 전체 학습 ─
      console.log('학습 루프 실행 중 (전수 모드)...\n');
      const result = await runLearningLoop(deps);
      const report = renderLearningReport(result);
      console.log(report);
    }
  } finally {
    sqlite.close();
  }
}

main().catch((err) => {
  console.error('\n학습 루프 실행 실패:', err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
