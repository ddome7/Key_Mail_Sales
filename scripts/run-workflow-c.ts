#!/usr/bin/env npx tsx
/**
 * Phase 4 Plan 06 Task 2 — Workflow C (팔로업 자동화) CLI 진입점.
 *
 * 대표님이 Claude Code 세션에서 호출하는 on-demand 명령.
 *
 * 실행 모드: on-demand only (D-01).
 * - 이 스크립트는 호출자가 명시적으로 실행할 때만 동작합니다.
 * - 자동 트리거(타이머/스케줄러)는 일절 사용하지 않습니다.
 * - 백그라운드 잡 큐(Bull+MQ 등 — 금지 단어 회피 표기)도 사용하지 않습니다.
 * - 정적 grep 회귀 테스트(workflow-c.test.ts T-27)로 검증됩니다.
 *
 * ─ 플래그 ────────────────────────────────────────────────
 *   --company <이름>         모드 B (단건). 특정 회사 1건만 분석/드래프트.
 *   --max <N>                전수 스캔(모드 A) 처리 상한 (기본 10).
 *   --confirm-dormant        휴면 전환 대화형 확인 활성화 (readline y/n).
 *   --help, -h               이 도움말.
 *
 * ─ 사용 예 ───────────────────────────────────────────────
 *   npx tsx scripts/run-workflow-c.ts
 *   npx tsx scripts/run-workflow-c.ts --company 동반성장위원회
 *   npx tsx scripts/run-workflow-c.ts --max 5 --confirm-dormant
 *
 * ─ 주의: 단독 실행 시의 한계 ──────────────────────────────
 *   tsx 스크립트로 단독 실행될 때는 Claude Code 세션의 Gmail MCP 도구에
 *   접근할 수 없으므로 Gmail 호출(스레드 조회 / 드래프트 생성)은 stub으로
 *   주입됩니다. 실제 Gmail 드래프트 생성은 04-07 UAT 스크립트가 Claude Code
 *   세션 컨텍스트 내에서 호출될 때만 동작합니다. 이 CLI는 "로직 파이프라인
 *   smoke test"용으로 사용하세요.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { createClientQueries } from '../src/queries/clients.js';
import { createTouchpointQueries } from '../src/queries/touchpoints.js';
import { createBriefingQueries } from '../src/queries/briefings.js';
import { createServiceQueries } from '../src/queries/services.js';
import {
  runWorkflowC,
  type WorkflowCDependencies,
  type WorkflowCBatchResult,
  type WorkflowCResult,
} from '../src/workflow/workflow-c.js';
import {
  renderCadenceReport,
  renderSingleResult,
} from '../src/workflow/cadence-report.js';
import type { GmailToolFn, GmailDraftResult } from '../src/workflow/draft-creator.js';
import type { GmailReadThreadFn, ThreadMessage } from '../src/workflow/thread-loader.js';

// ─── 플래그 파싱 ────────────────────────────────────────────

interface CliFlags {
  company?: string;
  max: number;
  confirmDormant: boolean;
  help: boolean;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { max: 10, confirmDormant: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--company') {
      flags.company = argv[++i];
    } else if (a === '--max') {
      const n = parseInt(argv[++i] ?? '', 10);
      flags.max = Number.isNaN(n) ? 10 : n;
    } else if (a === '--confirm-dormant') {
      flags.confirmDormant = true;
    } else if (a === '--help' || a === '-h') {
      flags.help = true;
    }
  }
  return flags;
}

function printHelp(): void {
  console.log(
    `
Workflow C — 팔로업 자동화 (Phase 4)

대표님이 Claude Code 세션에서 호출하는 on-demand 명령입니다.
백그라운드 자동 실행은 일절 없으며, 이 명령을 직접 입력했을 때만 동작합니다.

사용법:
  npx tsx scripts/run-workflow-c.ts [옵션]

옵션:
  --company <이름>        특정 클라이언트 1건만 처리 (모드 B)
  --max <N>               전수 스캔 시 처리 상한 (기본 10)
  --confirm-dormant       휴면 전환 대화형 확인 활성화 (y/n 입력)
  --help, -h              이 도움말 출력

실행 예:
  npx tsx scripts/run-workflow-c.ts
  npx tsx scripts/run-workflow-c.ts --company 동반성장위원회
  npx tsx scripts/run-workflow-c.ts --max 5 --confirm-dormant

⚠️  단독 실행 시 제약:
  이 CLI는 Gmail MCP 도구에 접근할 수 없어 스레드 조회/드래프트 생성을
  stub으로 처리합니다. 로직 파이프라인 smoke test 용도로만 사용하세요.
  실제 Gmail 드래프트 생성은 04-07 UAT 스크립트(Claude Code 세션 내)에서만
  동작합니다.
`.trim(),
  );
}

// ─── DB 경로 해결 (cwd 의존성 제거) ────────────────────────

function resolveDbPath(): string {
  // ESM에서 __dirname 대체. import.meta.url 기반 절대 경로.
  const here = dirname(fileURLToPath(import.meta.url));
  // scripts/run-workflow-c.ts 기준 → 프로젝트 루트의 data/sales.db
  return resolve(here, '..', 'data', 'sales.db');
}

// ─── Gmail stub 도구 ────────────────────────────────────────
//
// tsx 단독 실행 시 Claude Code 세션의 Gmail MCP 도구에 접근할 수 없으므로
// stub을 주입한다. workflow-c는 이 stub의 반환값을 그대로 createDraft 내부로
// 전달받아 draftId='stub-draft-...' 로 기록한다.
//
// 04-07 UAT 스크립트는 Claude Code 세션 내부에서 실제 MCP 도구를 주입한다.

let stubCounter = 0;

const gmailDraftStub: GmailToolFn = async (_params): Promise<GmailDraftResult> => {
  stubCounter++;
  return {
    id: `stub-draft-${stubCounter}`,
    threadId: undefined,
  };
};

const gmailReadThreadStub: GmailReadThreadFn = async (_args): Promise<ThreadMessage[]> => {
  // 빈 배열 → workflow-c는 "스레드 없음 / inbound 없음 / context=general" 경로로 진행.
  return [];
};

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
      `\n❌ DB 파일을 찾을 수 없습니다: ${dbPath}\n` +
        '   먼저 npm run db:push 또는 npm run db:migrate 로 스키마를 생성하고\n' +
        '   npm run db:seed 로 시드 데이터를 채워주세요.\n',
    );
    process.exit(1);
  }

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);

  const clientQueries = createClientQueries(db);
  const touchpointQueries = createTouchpointQueries(db);
  const briefingQueries = createBriefingQueries(db);
  const serviceQueries = createServiceQueries(db);

  // ─ readline 기반 askCeoDormantConfirmation (opt-in) ─
  let rl: readline.Interface | undefined;
  let askCeoDormantConfirmation:
    | WorkflowCDependencies['askCeoDormantConfirmation']
    | undefined;

  if (flags.confirmDormant) {
    rl = readline.createInterface({ input: stdin, output: stdout });
    askCeoDormantConfirmation = async (client, draftId) => {
      console.log(`\n🌙 ${client.companyName} 휴면 전환 확인`);
      console.log(`   마지막 드래프트: ${draftId}`);
      const ans = (await rl!.question('   전환하시겠어요? [y/n]: ')).trim().toLowerCase();
      return ans === 'y' || ans === 'yes' ? 'confirm' : 'keep_active';
    };
  }

  // ─ DI 번들 ─
  // generateCadenceFollowUpBody / classifyContextWithAI 는 미주입 →
  // workflow-c가 placeholder body + deterministic classifier로 동작 (Claude Code 모드).
  const deps: WorkflowCDependencies = {
    clientQueries,
    serviceQueries,
    touchpointQueries,
    briefingQueries,
    gmailTool: gmailDraftStub,
    gmailReadThreadTool: gmailReadThreadStub,
    getAllCompanyNames: () => clientQueries.getAllCompanyNames(),
    askCeoDormantConfirmation,
  };

  try {
    const result = await runWorkflowC(deps, {
      maxDrafts: flags.max,
      companyName: flags.company,
    });

    if ('rows' in result) {
      // batch 모드
      const batchResult = result as WorkflowCBatchResult;
      console.log('\n' + renderCadenceReport(batchResult, { maxDrafts: flags.max }) + '\n');
    } else {
      // primitive 모드
      const singleResult = result as WorkflowCResult;
      console.log('\n' + renderSingleResult(singleResult) + '\n');
    }
  } finally {
    rl?.close();
    sqlite.close();
  }
}

main().catch((err) => {
  console.error('\n❌ Workflow C 실행 실패:', err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
