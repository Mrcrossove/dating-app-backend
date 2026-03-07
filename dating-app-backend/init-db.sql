-- Dating App Backend (PostgreSQL) bootstrap
--
-- This project uses Sequelize `sync()` on startup to create tables.
-- You DO NOT need to run a full schema SQL file before starting the API.
--
-- Optional usage:
--   sudo -u postgres psql -d dating_app -f init-db.sql

\c dating_app;

-- Optional extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

SELECT 'bootstrap ok' AS status;
