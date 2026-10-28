import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { ensureApplePayDomain } from "./stripe-connect";

type Domain = { id: string; domain_name: string; enabled: boolean; apple_pay: { status: string } };

/** Stripe de mentira: só os métodos de paymentMethodDomains, e regista as chamadas. */
function fakeStripe(initial: Domain[], { validateTo = "active" } = {}) {
  const domains = [...initial];
  const calls: string[] = [];
  const stripe = {
    paymentMethodDomains: {
      async list(params: { domain_name: string }, opts: { stripeAccount: string }) {
        calls.push(`list:${opts.stripeAccount}`);
        return { data: domains.filter((d) => d.domain_name === params.domain_name) };
      },
      async create(params: { domain_name: string }) {
        calls.push("create");
        const d = { id: "pmd_new", domain_name: params.domain_name, enabled: true, apple_pay: { status: "active" } };
        domains.push(d);
        return d;
      },
      async update(id: string, params: { enabled: boolean }) {
        calls.push("update");
        const d = domains.find((x) => x.id === id)!;
        d.enabled = params.enabled;
        return d;
      },
      async validate(id: string) {
        calls.push("validate");
        const d = domains.find((x) => x.id === id)!;
        d.apple_pay.status = validateTo;
        return d;
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, calls };
}

describe("domínio do Apple Pay na conta do restaurante", () => {
  it("regista o domínio quando falta (na conta ligada)", async () => {
    const { stripe, calls } = fakeStripe([]);
    expect(await ensureApplePayDomain(stripe, "acct_1", "mesvio.vercel.app")).toBe("active");
    expect(calls).toEqual(["list:acct_1", "create"]);
  });

  it("já registado e ativo: não mexe", async () => {
    const { stripe, calls } = fakeStripe([{ id: "pmd_1", domain_name: "mesvio.vercel.app", enabled: true, apple_pay: { status: "active" } }]);
    expect(await ensureApplePayDomain(stripe, "acct_1", "mesvio.vercel.app")).toBe("active");
    expect(calls).toEqual(["list:acct_1"]);
  });

  it("desligado ou recusado: liga e pede nova validação", async () => {
    const { stripe, calls } = fakeStripe([{ id: "pmd_1", domain_name: "mesvio.vercel.app", enabled: false, apple_pay: { status: "inactive" } }], { validateTo: "inactive" });
    expect(await ensureApplePayDomain(stripe, "acct_1", "mesvio.vercel.app")).toBe("inactive");
    expect(calls).toEqual(["list:acct_1", "update", "validate"]);
  });

  it("em localhost não faz nada (a Apple não valida endereços locais)", async () => {
    const { stripe, calls } = fakeStripe([]);
    expect(await ensureApplePayDomain(stripe, "acct_1", "localhost")).toBe("local");
    expect(calls).toEqual([]);
  });
});
