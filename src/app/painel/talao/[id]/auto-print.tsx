"use client";

import { useEffect } from "react";

/** Imprime assim que o talão abre (impressão automática do painel). */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
