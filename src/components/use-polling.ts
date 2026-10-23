"use client";

import { useEffect, useRef } from "react";

/**
 * Pergunta periodicamente ao servidor, com três regras para aguentar dias cheios:
 * - pausa enquanto o separador está escondido (ecrã bloqueado, outra app) e atualiza logo ao voltar;
 * - o intervalo depende do tempo decorrido (`intervalFor`), para espaçar quando nada muda;
 * - `intervalFor` devolve null para parar de vez.
 * Antes, cada telemóvel com a página aberta perguntava a cada 3 s para sempre (teste de carga).
 */
export function usePolling(
  fn: () => Promise<unknown> | unknown,
  { enabled, intervalFor }: { enabled: boolean; intervalFor: (elapsedMs: number) => number | null },
): void {
  const fnRef = useRef(fn);
  const intervalRef = useRef(intervalFor);
  fnRef.current = fn;
  intervalRef.current = intervalFor;

  useEffect(() => {
    if (!enabled) return;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      const delay = intervalRef.current(Date.now() - startedAt);
      if (delay === null) return;
      timer = setTimeout(tick, delay);
    };
    const tick = async () => {
      if (document.visibilityState === "hidden") return; // retoma no visibilitychange
      try {
        await fnRef.current();
      } finally {
        schedule();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void tick();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}

/** Intervalos que vão espaçando: [até ms, intervalo ms]…; depois do último, para (null) ou `then`. */
export const backoffSchedule =
  (steps: [untilMs: number, everyMs: number][], then: number | null = null) =>
  (elapsedMs: number) =>
    steps.find(([until]) => elapsedMs < until)?.[1] ?? then;
