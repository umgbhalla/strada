CREATE TABLE `alert_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`threshold` integer DEFAULT 1 NOT NULL,
	`window_minutes` integer DEFAULT 5 NOT NULL,
	`cooldown_minutes` integer DEFAULT 60 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `org`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_rule_org_id_unique` ON `alert_rule` (`org_id`);
--> statement-breakpoint
CREATE TABLE `alert_destination` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`channel` text NOT NULL,
	`destination` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `alert_rule`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alert_destination_rule_id_idx` ON `alert_destination` (`rule_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_destination_unique` ON `alert_destination` (`rule_id`, `channel`, `destination`);
