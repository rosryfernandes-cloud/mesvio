/** Arranque do servidor Next: inicia o worker da fila de envio ao POS no runtime Node. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // Em serverless (ex.: Vercel) usar OUTBOX_WORKER=off e o cron /api/cron/outbox.
  if (process.env.OUTBOX_WORKER === "off") return;
  const [{ getDb }, { startOutboxPoller }] = await Promise.all([
    import("./server/db/client"),
    import("./server/orders/outbox-worker"),
  ]);
  startOutboxPoller(getDb);
}
