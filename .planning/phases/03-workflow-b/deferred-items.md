# Deferred Items — Phase 03 Workflow B

Plan 01 실행 중 발견했지만 **스코프 경계 원칙**에 따라 이번 플랜에서 처리하지 않고 기록만 남기는 항목.

## 2026-04-11 (Plan 01 실행 중 발견)

### 워크트리 환경 이슈: `system/v4_ULTRA_SYSTEM_PROMPT.md` 누락

- **파일:** `src/workflow/prompt-loader.test.ts`
- **증상:** 2건 테스트 실패 — `ENOENT: no such file or directory, open '.../system/v4_ULTRA_SYSTEM_PROMPT.md'`
- **원인:** 병렬 실행 워크트리(agent-a78318dd)에 `system/` 디렉토리가 복사되지 않았다. 메인 리포에는 파일이 존재.
- **Plan 01과의 관계:** 완전히 무관. 내가 수정/추가한 어떤 파일도 prompt-loader에 영향을 주지 않는다.
- **조치:** 스코프 밖으로 스킵. 메인 리포에서 전체 테스트가 통과하는지 verifier 단계에서 확인할 것.
- **재현:**
  ```bash
  # worktree 안에서:
  npx vitest run src/workflow/prompt-loader.test.ts
  # → ENOENT
  # main repo:
  ls system/v4_ULTRA_SYSTEM_PROMPT.md  # 존재함
  ```
- **근본 해결 방안(향후):** 워크트리 생성 스크립트가 `system/` 디렉토리를 공유하도록 심볼릭 링크 또는 공유 경로 설정 필요.
