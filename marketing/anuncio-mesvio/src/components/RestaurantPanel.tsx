import { C, fontFamily } from "../brand";
import { TEXT } from "../script";

/**
 * O "sistema do restaurante": o painel MESVIO num tablet, com o pedido novo a entrar. `arrive`
 * (0–1) faz o cartão do pedido #014 descer para o topo da lista com um brilho menta.
 */
export function RestaurantPanel({ width, arrive }: { width: number; arrive: number }) {
  const s = width / 760;
  const old = [
    ["#013", "Mesa 4", "2× Imperial · 1× Tosta mista", "11,50 €"],
    ["#012", "Cama 3", "1× Bowl de açaí", "9,50 €"],
    ["#011", "Mesa 7", "3× Limonada · 1× Couvert", "20,50 €"],
  ];
  return (
    <div style={{ width, height: width * 0.66, borderRadius: 34 * s, background: C.deep, padding: 16 * s, boxShadow: `0 ${40 * s}px ${90 * s}px rgba(0,0,0,0.35)` }}>
      <div style={{ width: "100%", height: "100%", borderRadius: 22 * s, background: C.cream, overflow: "hidden", fontFamily, color: C.ink }}>
        <div style={{ width: 728, transform: `scale(${s})`, transformOrigin: "top left", padding: "22px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: C.forest, display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 20 }}>
              m<span style={{ color: C.mint }}>.</span>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.inkSoft }}>PAINEL</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{TEXT.restaurant}</div>
            </div>
            <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#166534", background: "#ecfdf3", padding: "6px 12px", borderRadius: 999 }}>● POS ligado</div>
          </div>
          <div style={{ marginTop: 18, fontSize: 15, fontWeight: 800 }}>
            Confirmados <span style={{ background: "#166534", color: "#fff", borderRadius: 999, padding: "2px 9px", fontSize: 12 }}>{arrive > 0.5 ? 4 : 3}</span>
          </div>
          <div style={{ marginTop: 12, display: "grid", gap: 10, position: "relative" }}>
            <div
              style={{
                height: 92 * arrive,
                opacity: arrive,
                transform: `translateY(${(1 - arrive) * -40}px)`,
                background: "#fff",
                borderRadius: 18,
                border: `2px solid ${C.mint}`,
                boxShadow: `0 0 ${30 * arrive}px rgba(145,233,195,0.9)`,
                padding: arrive > 0.2 ? "14px 18px" : 0,
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 19, fontWeight: 800 }}>
                <span>
                  #014 <span style={{ fontWeight: 600, fontSize: 16 }}>{TEXT.table}</span>
                </span>
                <span style={{ fontSize: 13, color: "#166534", background: "#ecfdf3", borderRadius: 999, padding: "4px 10px" }}>Novo · confirmado</span>
              </div>
              <div style={{ fontSize: 15, marginTop: 6, color: C.inkSoft }}>1× Hambúrguer da casa · 1× Mojito de maracujá · 23,50 €</div>
            </div>
            {old.map(([n, t, items, total]) => (
              <div key={n} style={{ background: "#fff", borderRadius: 18, border: "1px solid #dfe5df", padding: "14px 18px", opacity: 0.75 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800 }}>
                  <span>
                    {n} <span style={{ fontWeight: 600, fontSize: 15 }}>{t}</span>
                  </span>
                  <span style={{ fontSize: 15 }}>{total}</span>
                </div>
                <div style={{ fontSize: 14, marginTop: 4, color: C.inkSoft }}>{items}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
