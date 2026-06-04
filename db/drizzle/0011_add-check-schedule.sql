-- Replace interval-based scheduling with cron expressions.
-- check_schedule is a standard cron string evaluated statelessly each tick.
-- check_last_checked_at and check_interval_minutes become dead columns
-- (SQLite cannot DROP COLUMN in older versions; they are ignored in code).

ALTER TABLE alert_rule ADD COLUMN check_schedule TEXT DEFAULT '*/5 * * * *';
