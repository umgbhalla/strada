-- Add optional project scope to alert rules.
-- NULL project_id means the rule applies to all projects in the org.
-- When set, only errors from that specific project trigger the rule.

ALTER TABLE `alert_rule` ADD COLUMN `project_id` text REFERENCES `project`(`id`) ON DELETE CASCADE;
