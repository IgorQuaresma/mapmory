-- Least-privilege roles (plan §8.1): the app and renderer cannot run DDL; migrations use the owner role.
CREATE ROLE mapmory_app LOGIN PASSWORD 'mapmory_app_dev_password';
CREATE ROLE mapmory_renderer LOGIN PASSWORD 'mapmory_renderer_dev_password';
GRANT CONNECT ON DATABASE mapmory TO mapmory_app, mapmory_renderer;
GRANT USAGE ON SCHEMA public TO mapmory_app, mapmory_renderer;
ALTER DEFAULT PRIVILEGES FOR ROLE mapmory IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mapmory_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mapmory IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO mapmory_app;
-- The renderer only reads designs and updates export jobs; table-level grants are applied by migrations.
