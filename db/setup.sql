-- KartHub: full database setup in ONE command. Run from the REPOSITORY ROOT (the folder that contains db/):
--     psql -U postgres -d karthub -f db/setup.sql
-- WARNING: schema.sql drops and recreates the whole "karthub" schema, so all existing data is erased.
-- Order matters: tables -> extra integrity rules -> stored procedures -> data.
-- Data: bulk_test_data.sql (about 1,160 rows). To use the tiny dev data instead, replace that line with db/dev_seed.sql.
-- If Member 4's seed script is ready, replace the last line with it.
\set ON_ERROR_STOP on
\i db/schema.sql
\i db/integrity.sql
\i db/procedures.sql
\i db/bulk_test_data.sql
