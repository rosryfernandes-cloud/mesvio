ALTER TABLE "establishments" ADD COLUMN "extras" jsonb DEFAULT '{"enabled":[]}'::jsonb NOT NULL;--> statement-breakpoint
-- TV e site do restaurante: o link secreto é a única forma de chegar ao restaurante (só devolve ids, e só com o extra ligado).
CREATE OR REPLACE FUNCTION app.resolve_extra_link(p_kind text, p_token text)
RETURNS TABLE (organization_id uuid, establishment_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT e.organization_id, e.id FROM establishments e
   WHERE p_kind IN ('tv', 'site')
     AND e.extras ->> (p_kind || 'Token') = p_token
     AND (e.extras -> 'enabled') ? p_kind
   LIMIT 1 $$
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.resolve_extra_link(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.resolve_extra_link(text, text) TO app_user;
