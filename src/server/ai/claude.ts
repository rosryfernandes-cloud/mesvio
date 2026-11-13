import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * Chamadas à Claude com resposta em JSON validada por nós. Os registos nunca levam a chave, as
 * fotos nem o conteúdo da ementa: só o motivo da falha.
 */
export const AI_MODEL = "claude-opus-5-5";
/**
 * Modelo mais barato para tarefas de texto simples (traduções, descrições, ajuda, respostas a
 * avaliações). A leitura da ementa (fotos, PDF, sites) e os alergénios ficam no modelo principal.
 */
export const AI_MODEL_LIGHT = "claude-sonnet-5-5";

/** Tira a chave do valor da variável, mesmo que venha com espaços, aspas ou o comando de exemplo à volta. */
export function extractApiKey(value: string | undefined): string | null {
  return value?.match(/sk-ant-[A-Za-z0-9_-]{20,}/)?.[0] ?? null;
}

/** Descreve o valor sem o mostrar: serve para o registo dizer porque não há chave. */
export function describeKeyValue(value: string) {
  return {
    length: value.length,
    startsWithSkAnt: value.trim().startsWith("sk-ant-"),
    hasSpaces: /\s/.test(value),
    hasQuotes: /["']/.test(value),
    looksLikeCommand: /curl|https?:/i.test(value),
  };
}

/** A chave pronta a usar, ou null (com o motivo no registo) se a variável não trouxer nenhuma. */
export function aiApiKey(tag: string): string | null {
  const raw = process.env.ANTHROPIC_API_KEY;
  const key = extractApiKey(raw);
  if (!key && raw) console.error(`[${tag}] ANTHROPIC_API_KEY sem chave válida`, describeKeyValue(raw));
  return key;
}

/** O motivo de uma falha, sem nada que possa trazer a chave. */
export function describeAiError(error: unknown): string {
  if (error instanceof Anthropic.APIError) return `${error.status} ${error.name}`;
  // A mensagem de um erro de cabeçalho traz o valor da chave: nesse caso só se diz que está mal colada.
  if (error instanceof Error && /header/i.test(error.message)) return `${error.name}: ANTHROPIC_API_KEY mal formatada (deve ser só a chave, sk-ant-…)`;
  if (error instanceof Error) return `${error.name}: ${error.message.slice(0, 120)}`;
  return "erro desconhecido";
}

/** Texto da resposta → dados validados; null (com o motivo no registo) se não vier no formato pedido. */
export function parseJson<T>(schema: z.ZodType<T>, text: string, stopReason: string | null, tag: string): T | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    console.error(`[${tag}] resposta sem JSON válido`, { stopReason, length: text.length });
    return null;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.error(`[${tag}] resposta fora do formato`, { stopReason, issue: parsed.error.issues[0]?.message, path: parsed.error.issues[0]?.path?.join(".") });
    return null;
  }
  return parsed.data;
}

export type AskOutput<T> = { stopReason: string | null; data: T | null };

type Content = Anthropic.Beta.BetaContentBlockParam[];

/** Uma pergunta à Claude com a resposta no formato do `schema`. Lança se a API falhar. */
export async function askClaudeJson<T>(
  schema: z.ZodType<T>,
  opts: { tag: string; system: string; content: Content; maxTokens: number; effort: "low" | "medium" | "high"; timeoutMs?: number; model?: string },
): Promise<AskOutput<T>> {
  const { type, schema: jsonSchema } = betaZodOutputFormat(schema);
  const client = new Anthropic({ apiKey: aiApiKey(opts.tag), timeout: opts.timeoutMs ?? 110_000, maxRetries: 1 });
  const message = await client.beta.messages.create({
    model: opts.model ?? AI_MODEL,
    max_tokens: opts.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: opts.effort, format: { type, schema: jsonSchema } },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  });
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  if (message.stop_reason === "max_tokens") return { stopReason: message.stop_reason, data: null };
  if (!text) {
    console.error(`[${opts.tag}] resposta sem texto`, { stopReason: message.stop_reason, blocks: message.content.map((b) => b.type) });
    return { stopReason: message.stop_reason, data: null };
  }
  return { stopReason: message.stop_reason, data: parseJson(schema, text, message.stop_reason, opts.tag) };
}
