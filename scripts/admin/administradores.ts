// Administradores do painel central (equipa MESVIO).
//
//   npm run admin:criar -- --email=voce@mesvio.pt --nome="O seu nome" --confirmar
//     Dá acesso ao painel central a um utilizador que JÁ existe na Supabase Auth
//     (convide-o antes em Authentication → Users → Invite). Mostra um CÓDIGO DE ATIVAÇÃO (48 h, uso
//     único) que é pedido para configurar o 2FA: entregue-o por outro canal que não o email.
//
//   npm run admin:repor-2fa -- --email=voce@mesvio.pt --confirmar
//     Telemóvel perdido: apaga o 2FA dessa pessoa e gera um código de ativação novo.
//
//   npm run admin:remover -- --email=voce@mesvio.pt --confirmar
//
// Lê DIRECT_DATABASE_URL (ou DATABASE_URL) de .env.production.local ou do ambiente.
import postgres from "postgres";
import { ACTIVATION_TTL_MS, generateActivationCode, hashActivationCode } from "../../src/server/platform/activation";

try {
  process.loadEnvFile(".env.production.local");
} catch {
  // sem ficheiro: usar as variáveis do ambiente
}

const [action, ...args] = process.argv.slice(2);
const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3).trim();
const email = arg("email")?.toLowerCase();
const name = arg("nome");
const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!["criar", "repor-2fa", "remover"].includes(action ?? "") || !email) {
  console.error("Uso: npm run admin:criar|admin:repor-2fa|admin:remover -- --email=… [--nome=…] --confirmar");
  process.exit(1);
}
if (!url) {
  console.error("✗ Falta DIRECT_DATABASE_URL (em .env.production.local ou no ambiente).");
  process.exit(1);
}
if (!args.includes("--confirmar")) {
  console.log(`Vai executar "${action}" para ${email} em ${new URL(url).hostname}. Repita com --confirmar.`);
  process.exit(0);
}

function printActivation(code: string, expires: Date) {
  console.log(`\n  Código de ativação do 2FA: ${code}`);
  console.log(`  Válido até ${expires.toLocaleString("pt-PT")}, uso único. Entregue-o por telefone ou pessoalmente,`);
  console.log("  NUNCA por email. Entrada: /central/entrar → código por email → este código → Face ID (ou app).\n");
}

const sql = postgres(url, { prepare: false, max: 1 });
try {
  if (action === "criar") {
    const [user] = await sql<{ id: string }[]>`select id from auth.users where lower(email) = ${email} limit 1`;
    if (!user) throw new Error(`Não existe ${email} na Supabase Auth. Convide-o primeiro (Authentication → Users → Invite).`);
    const activation = generateActivationCode();
    const expires = new Date(Date.now() + ACTIVATION_TTL_MS);
    const [row] = await sql<{ enrolled: boolean }[]>`insert into platform_admins (user_id, email, display_name, enrollment_code_hash, enrollment_code_expires_at)
              values (${user.id}, ${email}, ${name ?? null}, ${hashActivationCode(activation)}, ${expires})
              on conflict (user_id) do update set email = excluded.email,
                display_name = coalesce(excluded.display_name, platform_admins.display_name),
                enrollment_code_hash = case when platform_admins.totp_secret_ciphertext is null then excluded.enrollment_code_hash else null end,
                enrollment_code_expires_at = case when platform_admins.totp_secret_ciphertext is null then excluded.enrollment_code_expires_at else null end
              returning totp_secret_ciphertext is not null as enrolled`;
    await sql`insert into audit_logs (actor_type, actor_id, action, entity_type, entity_id) values ('system', 'script', 'platform.admin_created', 'platform_admin', ${user.id})`;
    console.log(`✓ ${email} é administrador do painel central.`);
    if (row.enrolled) console.log("  O 2FA já estava configurado; nada mais a fazer.");
    else printActivation(activation, expires);
  } else {
    const rows = await sql<{ user_id: string }[]>`select user_id from platform_admins where lower(email) = ${email}`;
    if (rows.length === 0) throw new Error(`${email} não é administrador.`);
    if (action === "repor-2fa") {
      const activation = generateActivationCode();
      const expires = new Date(Date.now() + ACTIVATION_TTL_MS);
      await sql`update platform_admins set totp_secret_ciphertext = null, totp_pending_ciphertext = null, totp_enabled_at = null, totp_last_step = null,
                  enrollment_code_hash = ${hashActivationCode(activation)}, enrollment_code_expires_at = ${expires}
                where lower(email) = ${email}`;
      // As chaves de acesso (Face ID) e os códigos de recuperação também deixam de servir.
      await sql`delete from platform_passkeys where user_id = ${rows[0].user_id}`;
      await sql`delete from platform_recovery_codes where user_id = ${rows[0].user_id}`;
      console.log(`✓ 2FA de ${email} reposto (app, Face ID e códigos de recuperação).`);
      printActivation(activation, expires);
    } else {
      await sql`delete from platform_admins where lower(email) = ${email}`;
      console.log(`✓ ${email} deixou de ter acesso ao painel central.`);
    }
    await sql`insert into audit_logs (actor_type, actor_id, action, entity_type, entity_id) values ('system', 'script', ${`platform.admin_${action}`}, 'platform_admin', ${rows[0].user_id})`;
  }
} catch (err) {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
