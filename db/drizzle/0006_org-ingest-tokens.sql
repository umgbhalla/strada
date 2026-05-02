DROP TABLE `project_token`;
--> statement-breakpoint
CREATE TABLE `org_token` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`hashed_key` text NOT NULL,
	`scope` text DEFAULT 'ingest' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `org`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `org_token_org_id_idx` ON `org_token` (`org_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_token_hashed_key_unique` ON `org_token` (`hashed_key`);
