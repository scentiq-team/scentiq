-- DEVELOPMENT ONLY. Runs once, when the Docker volume is first created, inside the
-- POSTGRES_DB database (scentiq_dev).
ALTER DATABASE scentiq_dev OWNER TO scentiq_owner;
