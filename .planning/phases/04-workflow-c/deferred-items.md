# Phase 4 Deferred Items

out-of-scope 이슈들을 추적합니다. 본 플랜에서 고치지 않고 후속 orchestrator merge 시점 또는 별도 cleanup 플랜에서 처리합니다.

## 04-05 execution에서 감지된 out-of-scope 이슈

### 1. `src/safety/cross-contamination.test.ts` — followup_paused 컬럼 누락

**발견 일시:** 2026-04-11 (04-05 execution 중 전수 회귀 실행 시)

**현상:** 6개 케이스 `SqliteError: no such column: "followup_paused"` 로 실패.

**원인:** 04-01 (Wave 0)에서 `clients` 테이블에 `followup_paused` + `followup_paused_reason` 두 컬럼을 추가하는 마이그레이션(0001)을 만들고, `src/queries/clients.test.ts`의 수동 CREATE TABLE에는 컬럼을 추가했지만, 같은 패턴을 사용하는 `src/safety/cross-contamination.test.ts`의 수동 CREATE TABLE(또는 유사 setup)은 업데이트되지 않았음.

**증거:**
- parent 커밋(`8ede6da`)에서도 동일하게 6개 실패 — 본 04-05 플랜의 신규 결함 아님.
- 04-01 SUMMARY.md 의 "Task 1 Deviation [Rule 2]"에 clients.test.ts 수정만 기록되어 있고 cross-contamination.test.ts 언급 없음.

**해결책 (out-of-scope):**
`src/safety/cross-contamination.test.ts`의 수동 `CREATE TABLE clients` SQL에 다음 2줄을 추가:
```sql
followup_paused INTEGER DEFAULT 0 NOT NULL,
followup_paused_reason TEXT,
```

**왜 이 플랜에서 고치지 않는가:**
- 04-05 PLAN의 `files_modified`는 `src/workflow/workflow-c.ts` + `src/workflow/workflow-c.test.ts`만 허용.
- `src/safety/cross-contamination.test.ts` 수정은 04-01의 잔여 작업.
- Scope boundary rule에 따라 "직접 원인이 아닌 pre-existing failure"는 deferred-items에 기록 후 계속 진행.

**액션 아이템:** 04-04 (Wave 1 파일럿 CLI/UAT 플랜) 또는 Phase 4 orchestrator merge 직전에 1줄 패치 + 회귀 재실행.

---

### 2. `src/workflow/prompt-loader.test.ts` — v4 ULTRA 파일 누락

**발견 일시:** 2026-04-11

**현상:** 2개 케이스 `ENOENT: no such file or directory, open 'system/v4_ULTRA_SYSTEM_PROMPT.md'` 로 실패.

**원인:** `system/v4_ULTRA_SYSTEM_PROMPT.md`는 main 저장소에서 untracked 상태. worktree 생성 시 복사되지 않음. 04-03 SUMMARY와 Phase 3 UAT 문서에도 동일 현상 기록.

**왜 고치지 않는가:**
- known environment issue — 운영 본체는 영향 없음.
- 04-05 프롬프트의 "known_environment_issue" 섹션에 이미 명시되어 있음.
- workflow-c.test.ts는 `ultraPath: undefined` + `safeLoadSections` 패턴으로 이 이슈 회피.

**액션 아이템:** main merge 직전 orchestrator가 `system/v4_ULTRA_SYSTEM_PROMPT.md`를 worktree에 복사하거나, 해당 테스트를 skip 처리하는 방식을 검토.
