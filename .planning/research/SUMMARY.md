# Project Research Summary

**Project:** PUZL Sales AI Bot (CEO Sales Assistant)
**Domain:** AI Sales Email Automation — Single-user CEO ghostwriting system
**Researched:** 2026-04-07
**Confidence:** MEDIUM-HIGH

## Executive Summary

PUZL Sales AI Bot은 퍼즐코퍼레이션 CEO 최영록의 세일즈 이메일을 대필하는 단일 사용자 AI 어시스턴트. 멀티테넌트 SaaS 플랫폼(Outreach, Apollo)과 달리, Claude Code + MCP(Gmail, Slack) 기반으로 동작하며 v4 ULTRA 프롬프트(508개 이메일 분석, 22개 섹션)로 깊이 있는 개인화를 제공.

## Recommended Stack

- **Node.js 22 LTS + TypeScript 5.7+**: 런타임 및 언어
- **@anthropic-ai/sdk**: Claude API (AI 백본)
- **SQLite + Drizzle ORM**: 단일 사용자용 제로 인프라 DB
- **BullMQ + Redis**: 팔로업 케이던스 스케줄링 (Phase 4)
- **Playwright + Cheerio**: 2-tier 웹 스크래핑 (시장조사)
- **Zod**: 스키마 검증
- **Pino**: 구조화 로깅

## Key Features (Priority)

**P1 (Must Have):**
- 문의 회사 시장조사 자동화
- 맞춤 1차 이메일 작성 (Workflow A)
- 통화 녹음 → 액션아이템 추출
- 후속 이메일 작성 (Workflow B)
- CEO 승인 플로우
- 클라이언트 DB 자동 업데이트

**P2 (Should Have):**
- 팔로업 케이던스 자동화 (Workflow C)
- 이메일 패턴 학습 루프
- 크로스셀/업셀 트리거 감지

**Defer (v2+):**
- 자료 허브, 자동 견적, 자율 발송, 선제적 제안

## Architecture

4-layer 구조:
1. **Human Interface** — CEO ↔ 챗 인터페이스
2. **Orchestration** — 워크플로우 라우터 + 이메일 컴포저 + 승인 게이트
3. **Integration** — MCP 서버 (Gmail, Slack)
4. **Persistence** — SQLite + 파일 기반 지식베이스

6개 핵심 컴포넌트: Workflow Router, Research Engine, Email Composer, Approval Gate, Task Scheduler, Learning Loop

## Critical Pitfalls

1. **클라이언트 데이터 교차 오염** — A사 단가가 B사 이메일에 노출. 한 번이면 신뢰 파괴.
2. **가격/숫자 환각** — 17종 서비스 × 5단계 티어의 복잡한 단가 체계에서 AI가 가격 조작.
3. **톤 불쾌한 골짜기** — `:D`, `!!` 등 스타일 마커의 기계적 적용이 오히려 부자연스러움.
4. **Gmail HTML 인코딩 깨짐** — `└` → 깨진 문자. 이미 프로덕션에서 발견됨.
5. **팔로업 오작동** — 한국 비즈니스 문화의 간접 거절 신호 감지 실패.
6. **승인 플로우 병목** — CEO 미팅 중이면 속도 장점 상실.
7. **스레드 컨텍스트 유실** — 긴 이메일 체인에서 초기 합의 내용 누락.

## Proposed Phase Structure

| Phase | Name | Delivers | Key Risk Addressed |
|-------|------|----------|-------------------|
| 1 | Foundation | DB 스키마, 상태 인프라, 안전 장치 | 교차 오염, 가격 환각 |
| 2 | Workflow A | 문의 → 시장조사 → 1차 이메일 | 컨텍스트 로딩, 승인 플로우 |
| 3 | Workflow B | 통화 → 액션아이템 → 후속 이메일 | 톤 캘리브레이션, 스레드 컨텍스트 |
| 4 | Workflow C | 팔로업 케이던스 자동화 | 문화적 거절 신호, 스케줄링 |
| 5 | Learning Loop | 패턴 학습, 크로스셀 감지 | 자동 프롬프트 수정 방지 |
| 6 | Advanced | 자료 생성, 자율성 단계적 확대 | 조기 자율화 방지 |

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | npm 검증 완료. Redis 인프라 복잡도 주의 |
| Features | HIGH | 10+ 경쟁 플랫폼 비교, v4 ULTRA 매핑 완료 |
| Architecture | HIGH | 단일 사용자 MCP 시스템에 최적화 |
| Pitfalls | HIGH | 7개 핵심 위험 + 예방 전략 구체화 |

---
*Synthesized: 2026-04-07*
