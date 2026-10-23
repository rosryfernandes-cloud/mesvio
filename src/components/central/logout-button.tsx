"use client";

import { useRouter } from "next/navigation";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await fetch("/api/painel/sessao", { method: "DELETE" }).catch(() => null);
        router.replace("/central/entrar");
        router.refresh();
      }}
    >
      Sair
    </button>
  );
}
