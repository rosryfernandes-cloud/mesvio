"use client";

import { useCallback, useEffect, useState } from "react";
import { ORDER_LIMITS } from "@/lib/order-pricing";

export interface CartLine {
  /** Produto + opções + observações: linhas iguais somam quantidades. */
  key: string;
  productRef: string;
  quantity: number;
  modifierRefs: string[];
  notes?: string;
}

interface CartState {
  lines: CartLine[];
  /**
   * Chave de idempotência do envio atual. Muda sempre que o carrinho muda; se o envio
   * falhar a meio (rede), o novo toque reenvia com a mesma chave e o servidor não duplica.
   */
  idempotencyKey: string;
}

/** UUID v4 também em contextos não seguros (http na rede local), onde `crypto.randomUUID` não existe. */
export function uuidV4(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const clampQty = (q: number) => Math.min(q, ORDER_LIMITS.maxQuantityPerLine);

const lineKey = (productRef: string, modifierRefs: string[], notes?: string) =>
  JSON.stringify([productRef, [...modifierRefs].sort(), notes ?? ""]);

function read(storageKey: string): CartState | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CartState;
    return Array.isArray(parsed.lines) && typeof parsed.idempotencyKey === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Carrinho por mesa, guardado no telemóvel para sobreviver a recarregamentos. */
export function useCart(tableToken: string) {
  const storageKey = `mesa-digital:carrinho:${tableToken}`;
  const [state, setState] = useState<CartState>({ lines: [], idempotencyKey: "" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setState(read(storageKey) ?? { lines: [], idempotencyKey: uuidV4() });
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Navegação privada / armazenamento cheio: o carrinho continua a funcionar em memória.
    }
  }, [loaded, state, storageKey]);

  const mutate = useCallback((fn: (lines: CartLine[]) => CartLine[]) => {
    setState((s) => ({ lines: fn(s.lines), idempotencyKey: uuidV4() }));
  }, []);

  const add = useCallback(
    (productRef: string, quantity: number, modifierRefs: string[], notes?: string) => {
      const key = lineKey(productRef, modifierRefs, notes);
      mutate((lines) =>
        lines.some((l) => l.key === key)
          ? lines.map((l) => (l.key === key ? { ...l, quantity: clampQty(l.quantity + quantity) } : l))
          : [...lines, { key, productRef, quantity: clampQty(quantity), modifierRefs, notes }],
      );
    },
    [mutate],
  );

  const setQuantity = useCallback(
    (key: string, quantity: number) =>
      mutate((lines) => (quantity <= 0 ? lines.filter((l) => l.key !== key) : lines.map((l) => (l.key === key ? { ...l, quantity: clampQty(quantity) } : l)))),
    [mutate],
  );

  const clear = useCallback(() => mutate(() => []), [mutate]);

  return { lines: state.lines, idempotencyKey: state.idempotencyKey, loaded, add, setQuantity, clear };
}
