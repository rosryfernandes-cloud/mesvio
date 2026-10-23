-- Isolamento entre restaurantes (RLS). Ver docs/03-BASE-DE-DADOS.md e docs/07 D21.
-- A app executa cada pedido como `app_user` (sem BYPASSRLS) com `app.current_org` definido na
-- transação (withTenant). Só o worker, o seed e as migrações correm como o dono das tabelas.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
END $$
--> statement-breakpoint
-- O utilizador da ligação (postgres na Supabase) tem de poder fazer SET ROLE app_user.
DO $$ BEGIN
  EXECUTE format('GRANT app_user TO %I', current_user);
EXCEPTION WHEN others THEN NULL; -- superutilizador (dev/PGlite) já pode
END $$
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app
--> statement-breakpoint
GRANT USAGE ON SCHEMA public, app TO app_user
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user
--> statement-breakpoint
-- Contexto do pedido atual (definido por withTenant). Vazio = sem acesso a dados de restaurantes.
CREATE OR REPLACE FUNCTION app.current_org() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.current_org', true), '')::uuid $$
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.current_user', true), '')::uuid $$
--> statement-breakpoint
-- Rotas públicas (QR/NFC): o token da mesa é a única forma de chegar ao restaurante.
-- SECURITY DEFINER: lê dining_tables antes de haver contexto, e só devolve ids.
CREATE OR REPLACE FUNCTION app.resolve_table(p_token text)
RETURNS TABLE (organization_id uuid, establishment_id uuid, table_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT t.organization_id, t.establishment_id, t.id FROM dining_tables t WHERE t.public_token = p_token AND t.active LIMIT 1 $$
--> statement-breakpoint
-- Painel: a que restaurantes tem acesso um utilizador (antes de escolher o contexto).
-- Uma associação sem estabelecimento dá acesso a todos os estabelecimentos da organização.
CREATE OR REPLACE FUNCTION app.user_memberships(p_user uuid)
RETURNS TABLE (organization_id uuid, establishment_id uuid, establishment_name text, role member_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT m.organization_id, e.id, e.name, m.role
   FROM memberships m
   JOIN establishments e ON e.organization_id = m.organization_id
     AND (m.establishment_id IS NULL OR m.establishment_id = e.id)
   WHERE m.user_id = p_user
   ORDER BY e.name $$
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_user
--> statement-breakpoint
ALTER TABLE establishments ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON establishments TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE dining_tables ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON dining_tables TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON table_sessions TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE pos_integrations ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON pos_integrations TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE categories ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON categories TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE products ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON products TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON modifier_groups TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE modifiers ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON modifiers TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE orders ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON orders TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON order_items TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON order_events TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE product_availability_overrides ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON product_availability_overrides TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON outbox TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON pos_sales TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON commission_rules TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE commission_ledger ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON commission_ledger TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE billing_statements ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON billing_statements TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_logs TO app_user USING (organization_id = app.current_org()) WITH CHECK (organization_id = app.current_org())
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organizations TO app_user USING (id = app.current_org()) WITH CHECK (id = app.current_org())
--> statement-breakpoint
ALTER TABLE product_modifier_groups ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY tenant_isolation ON product_modifier_groups TO app_user USING (EXISTS (SELECT 1 FROM products p WHERE p.id = product_id)) WITH CHECK (EXISTS (SELECT 1 FROM products p WHERE p.id = product_id))
--> statement-breakpoint
-- Perfis: o próprio utilizador e os colegas da organização atual.
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY own_or_colleague ON staff_profiles TO app_user
USING (user_id = app.current_user_id() OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = staff_profiles.user_id))
WITH CHECK (user_id = app.current_user_id() OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = staff_profiles.user_id))
--> statement-breakpoint
-- Sem políticas = sem acesso para app_user (e para os roles anon/authenticated da Supabase).
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
-- rate_limit_buckets não tem dados de restaurantes: sem RLS, mas também fora do alcance da API pública.
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY
--> statement-breakpoint
CREATE POLICY app_only ON rate_limit_buckets TO app_user USING (true) WITH CHECK (true)
