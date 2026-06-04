-- Move health check runtime state from ClickHouse to D1.
-- These columns replace the otel_health_checks_config ClickHouse table.

ALTER TABLE alert_rule ADD COLUMN check_last_checked_at INTEGER;
--> statement-breakpoint
ALTER TABLE alert_rule ADD COLUMN check_last_alert_status TEXT DEFAULT '';
--> statement-breakpoint
ALTER TABLE alert_rule ADD COLUMN check_first_failed_at INTEGER;
--> statement-breakpoint
ALTER TABLE alert_rule ADD COLUMN check_disabled_reason TEXT DEFAULT '';
