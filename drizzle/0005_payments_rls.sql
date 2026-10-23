-- Pagamentos: mesmo isolamento por restaurante que as restantes tabelas (ver 0003_rls.sql).
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON payments TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON payments TO app_user;
--> statement-breakpoint
-- Tabelas criadas no futuro pelo dono das migrações ficam logo acessíveis a app_user (sempre com RLS).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
