-- Least-privilege grants (plan §8.1). Roles are created by infrastructure (infra/postgres/init.sql in dev,
-- provisioning in production); grants are only applied when the roles exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mapmory_app') THEN
    GRANT USAGE ON SCHEMA public TO mapmory_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mapmory_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mapmory_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mapmory_renderer') THEN
    GRANT USAGE ON SCHEMA public TO mapmory_renderer;
    -- The renderer reads frozen designs and updates job status; it cannot see accounts or memory text.
    GRANT SELECT ON design_revisions TO mapmory_renderer;
    GRANT SELECT (id, title) ON projects TO mapmory_renderer;
    GRANT SELECT ON export_jobs TO mapmory_renderer;
    GRANT UPDATE (status, progress, error_code, object_key, bytes, started_at, finished_at, expires_at) ON export_jobs TO mapmory_renderer;
  END IF;
END $$;
