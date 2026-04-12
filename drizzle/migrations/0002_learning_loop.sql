CREATE TABLE `competitor_intel` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`competitor_name` text NOT NULL,
	`intel_type` text NOT NULL,
	`detail` text NOT NULL,
	`source` text NOT NULL,
	`confidence` text NOT NULL,
	`discovered_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competitor_intel_client_idx` ON `competitor_intel` (`client_id`);--> statement-breakpoint
CREATE INDEX `competitor_intel_name_type_idx` ON `competitor_intel` (`client_id`,`competitor_name`,`intel_type`);--> statement-breakpoint
CREATE TABLE `edit_deltas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`touchpoint_id` integer,
	`original_body` text,
	`final_body` text,
	`diff_summary` text,
	`diff_category` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`touchpoint_id`) REFERENCES `touchpoints`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `edit_deltas_client_idx` ON `edit_deltas` (`client_id`);--> statement-breakpoint
CREATE INDEX `edit_deltas_touchpoint_idx` ON `edit_deltas` (`touchpoint_id`);--> statement-breakpoint
CREATE TABLE `email_patterns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`touchpoint_id` integer,
	`strategy_used` text,
	`tone_level` integer,
	`context_type` text,
	`subject_line` text,
	`body_preview` text,
	`sent_at` text,
	`reply_received_at` text,
	`outcome` text DEFAULT 'pending' NOT NULL,
	`days_to_reply` integer,
	`industry` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`touchpoint_id`) REFERENCES `touchpoints`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `email_patterns_client_idx` ON `email_patterns` (`client_id`);--> statement-breakpoint
CREATE INDEX `email_patterns_industry_strategy_idx` ON `email_patterns` (`industry`,`strategy_used`);--> statement-breakpoint
CREATE INDEX `email_patterns_outcome_idx` ON `email_patterns` (`outcome`);--> statement-breakpoint
CREATE INDEX `email_patterns_touchpoint_idx` ON `email_patterns` (`touchpoint_id`);