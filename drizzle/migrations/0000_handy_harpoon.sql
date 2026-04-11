CREATE TABLE `briefings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`slack_ts` text NOT NULL,
	`slack_channel_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`source` text NOT NULL,
	`summary` text NOT NULL,
	`action_items` text,
	`sentiment` text,
	`raw_transcript` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `briefings_slack_ts_unique` ON `briefings` (`slack_ts`);--> statement-breakpoint
CREATE INDEX `briefings_client_idx` ON `briefings` (`client_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_name` text NOT NULL,
	`contact_name` text,
	`contact_email` text,
	`contact_phone` text,
	`industry` text,
	`history` text,
	`budget_pattern` text,
	`budget_tier` integer,
	`preferred_services` text,
	`notes` text,
	`next_opportunity` text,
	`communication_style` text,
	`stage` text DEFAULT 'PROSPECT',
	`last_contact_date` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `service_recommendations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tier` integer NOT NULL,
	`industry` text,
	`service_name` text NOT NULL,
	`priority` integer,
	`recommended_quantity` text,
	`recommended_budget` text,
	`sales_ment` text
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`description` text,
	`base_price` integer,
	`price_unit` text,
	`price_note` text,
	`process_steps` text,
	`as_policy` text
);
--> statement-breakpoint
CREATE TABLE `touchpoints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`type` text NOT NULL,
	`source_id` text NOT NULL,
	`summary` text NOT NULL,
	`metadata` text,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `touchpoints_client_idx` ON `touchpoints` (`client_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `touchpoints_type_idx` ON `touchpoints` (`client_id`,`type`);