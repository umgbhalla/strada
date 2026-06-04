-- Add health check fields to alert_rule table.
-- These columns are null when type != 'health_check'.
-- Check results and mutable state live in ClickHouse, not D1.

ALTER TABLE alert_rule ADD COLUMN check_url TEXT;
--> statement-breakpoint
ALTER TABLE alert_rule ADD COLUMN check_method TEXT DEFAULT 'GET';
--> statement-breakpoint
ALTER TABLE alert_rule ADD COLUMN check_interval_minutes INTEGER DEFAULT 5;
--> statement-breakpoint
ALTER TABLE alert_rule ADD COLUMN check_expected_status_min INTEGER DEFAULT 200;
--> statement-breakpoint
ALTER TABLE alert_rule ADD COLUMN check_expected_status_max INTEGER DEFAULT 299;
--> statement-breakpoint
ALTER TABLE alert_rule ADD COLUMN check_timeout_ms INTEGER DEFAULT 10000;
--> statement-breakpoint
ALTER TABLE alert_rule ADD COLUMN check_failure_threshold INTEGER DEFAULT 2;
--> statement-breakpoint
ALTER TABLE alert_rule ADD COLUMN check_auto_disable_after_hours INTEGER DEFAULT 24;
