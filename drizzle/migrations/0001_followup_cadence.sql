-- Phase 4 Workflow C: 팔로업 케이던스 인프라 (Plan 04-01)
--
-- D-20/D-21: clients 테이블에 수동 차단 플래그 2개 컬럼 추가
--   - followup_paused: 대표님이 "이 딜은 팔로업 더 안 해"라고 지시한 경우 1
--   - followup_paused_reason: 차단 사유 (자유 텍스트, nullable)
--
-- D-04: touchpoints.type enum 확장 ('email_sent'/'email_received'/'manual_pause')은
--       SQLite text 컬럼에 CHECK constraint 없이 동작하므로 DDL 변경이 필요 없다.
--       schema.ts의 enum 배열 수정만으로 TypeScript 타입이 반영된다.
--       기존 'email' 레거시 레코드는 그대로 보존 (Phase 3 운영 DB 손실 0).
--
-- 마이그레이션 전 백업 의무: `cp data/sales.db data/sales.db.backup-phase4-<YYYYMMDD>`
-- 마이그레이션 후 검증: `sqlite3 data/sales.db "PRAGMA table_info(clients);" | grep followup`

ALTER TABLE `clients` ADD `followup_paused` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `followup_paused_reason` text;--> statement-breakpoint
CREATE INDEX `idx_clients_followup_paused` ON `clients` (`followup_paused`,`stage`);
