import { C, fontFamily, TEXT_STYLE } from "./menu-style";
import { Acai, Burger, Mojito } from "./Food";
import { orderLines, usePlace } from "./place";

const ITEMS = [
  { id: "burger", name: "Hambúrguer da casa", desc: "Pão brioche, novilho, cheddar", price: "14,00 €", Img: Burger },
  { id: "mojito", name: "Mojito de maracujá", desc: "Rum, lima, hortelã, maracujá", price: "9,50 €", Img: Mojito },
  { id: "acai", name: "Bowl de açaí", desc: "Fruta, granola e mel", price: "9,50 €", Img: Acai },
] as const;

export interface MenuState {
  qty: { burger: number; mojito: number };
  /** 0–1: barra "Ver pedido" a subir. */
  bar: number;
  /** 0–1: folha "O seu pedido" a abrir. */
  sheet: number;
  /** Botão "Enviar" a ser carregado. */
  pressed: boolean;
  /** Dedo (coordenadas do ecrã 390×844). */
  finger?: { x: number; y: number; opacity: number; press: number };
}

const Badge = ({ n }: { n: number }) => (
  <div style={{ position: "absolute", top: -9, right: -9, width: 30, height: 30, borderRadius: 999, background: C.forest, color: "#fff", fontWeight: 800, fontSize: 15, display: "grid", placeItems: "center" }}>{n}</div>
);

/** A ementa MESVIO (igual à da app): cabeçalho, separadores, cartões, barra do pedido e folha. */
export function MenuScreen({ s }: { s: MenuState }) {
  const place = usePlace();
  const count = s.qty.burger + s.qty.mojito;
  const { lines, total: totalText } = orderLines(s.qty);
  return (
    <div style={{ ...TEXT_STYLE, width: 390, height: 844, background: C.cream, position: "relative", overflow: "hidden" }}>
      <div style={{ padding: "62px 22px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.forest }}>{place.table} · {place.area}</span>
          <span style={{ fontSize: 12, fontWeight: 600, border: `1px solid #dfe5df`, background: "#fff", borderRadius: 999, padding: "6px 12px" }}>Conta da mesa</span>
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 6 }}>{place.restaurant}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
          {["Comida", "Bebidas", "Bar"].map((t, i) => (
            <span key={t} style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 700, padding: "11px 0", borderRadius: 14, background: i === 0 ? C.forest : "#fff", color: i === 0 ? "#fff" : C.ink }}>
              {t}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 24, marginBottom: 12 }}>Mais pedidos</div>
        <div style={{ display: "grid", gap: 12 }}>
          {ITEMS.map((it) => {
            const q = it.id === "acai" ? 0 : s.qty[it.id];
            return (
              <div key={it.id} style={{ position: "relative", display: "flex", gap: 14, alignItems: "center", background: "#fff", borderRadius: 20, padding: 14, border: `2px solid ${q ? C.forest : "#dfe5df"}` }}>
                {q > 0 && <Badge n={q} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{it.name}</div>
                  <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 3 }}>{it.desc}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>{it.price}</div>
                </div>
                <div style={{ width: 84, height: 84, borderRadius: 16, background: C.soft, display: "grid", placeItems: "center" }}>
                  <it.Img size={70} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Barra "Ver pedido" */}
      <div style={{ position: "absolute", left: 16, right: 16, bottom: 30, transform: `translateY(${(1 - s.bar) * 120}px)`, background: C.forest, color: "#fff", borderRadius: 20, padding: "18px 20px", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 17 }}>
        <span>
          <span style={{ display: "inline-grid", placeItems: "center", width: 28, height: 28, borderRadius: 999, background: "rgba(255,255,255,0.2)", marginRight: 10, fontSize: 14 }}>{count}</span>
          Ver pedido
        </span>
        <span>{totalText}</span>
      </div>

      {/* Folha "O seu pedido" */}
      <div style={{ position: "absolute", inset: 0, background: `rgba(16,33,29,${0.45 * s.sheet})`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 470, transform: `translateY(${(1 - s.sheet) * 480}px)`, background: C.cream, borderRadius: "28px 28px 0 0", padding: "26px 22px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.forest }}>{place.table}</div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>O seu pedido</div>
        {lines.map(([a, b]) => (
          <div key={a} style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 600, padding: "16px 0", borderBottom: "1px solid #dfe5df" }}>
            <span>{a}</span>
            <span>{b}</span>
          </div>
        ))}
        <div style={{ marginTop: 26, background: C.forest, color: "#fff", borderRadius: 20, padding: "20px", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 17, transform: `scale(${s.pressed ? 0.96 : 1})`, filter: s.pressed ? "brightness(1.25)" : "none" }}>
          <span>Enviar pedido para a cozinha</span>
          <span>{totalText}</span>
        </div>
        <div style={{ textAlign: "center", fontSize: 12, color: C.inkSoft, marginTop: 10 }}>O pagamento é feito no restaurante, no fim da refeição.</div>
      </div>

      {s.finger && <Finger {...s.finger} />}
    </div>
  );
}

/** O dedo: círculo menta translúcido que encolhe ao tocar. */
export function Finger({ x, y, opacity, press }: { x: number; y: number; opacity: number; press: number }) {
  const r = 30 - press * 8;
  return (
    <div
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: 999,
        background: "rgba(145,233,195,0.55)",
        border: "3px solid rgba(255,255,255,0.9)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
        opacity,
      }}
    />
  );
}

/** Ecrã de estado: "✓ Confirmado". `check` (0–1) desenha o visto. */
export function StatusScreen({ check, qty = { burger: 1, mojito: 1 } }: { check: number; qty?: { burger: number; mojito: number } }) {
  const place = usePlace();
  const { lines, total } = orderLines(qty);
  return (
    <div style={{ ...TEXT_STYLE, width: 390, height: 844, background: C.cream, padding: "70px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, color: C.forest }}>
        <span>{place.table}</span>
        <span>Pedido nº 014</span>
      </div>
      <div style={{ marginTop: 14, background: "#ecfdf3", color: "#166534", borderRadius: 22, padding: "24px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 34, fontWeight: 800 }}>
          <svg viewBox="0 0 24 24" width={36} height={36}>
            <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="#166534" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - check} />
          </svg>
          Confirmado
        </div>
        <div style={{ fontSize: 16, marginTop: 6 }}>O pedido chegou à cozinha. Bom apetite!</div>
      </div>
      <div style={{ marginTop: 26, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: C.inkSoft }}>RESUMO</div>
      <div style={{ marginTop: 8, background: "#fff", borderRadius: 18, padding: "4px 18px", border: "1px solid #dfe5df" }}>
        {[...lines, ["Total", total]].map(([a, b], i, all) => (
          <div key={a} style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: i === all.length - 1 ? 800 : 500, padding: "14px 0", borderTop: i ? "1px solid #dfe5df" : "none" }}>
            <span>{a}</span>
            <span>{b}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { fontFamily };
