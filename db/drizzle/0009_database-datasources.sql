-- Store the deployed Tinybird datasource list on the database row (org-level).
-- Set during database create and database upgrade. Used by JWT creation so
-- new projects don't fall back to the code's TINYBIRD_DATASOURCES list, which
-- may reference tables not yet deployed to the Tinybird workspace.

ALTER TABLE `database` ADD COLUMN `tinybird_datasources` text;
