import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Termos de Utilização",
  description: "Condições de utilização da plataforma MESVIO pelos estabelecimentos e pelos clientes que pedem pela ementa digital.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Utilização">
      <section>
        <p>
          Estes termos regulam a utilização da MESVIO, uma plataforma de pedidos digitais por QR Code e NFC disponibilizada por{" "}
          {LEGAL.company}, NIF {LEGAL.nif}, com sede em {LEGAL.address} (&ldquo;MESVIO&rdquo;). A parte A aplica-se aos
          estabelecimentos que usam a plataforma; a parte B, a quem faz pedidos pela ementa digital.
        </p>
      </section>

      <section>
        <h2>A. Estabelecimentos</h2>

        <h3 className="mt-6 font-bold">1. O serviço</h3>
        <p>
          A MESVIO disponibiliza ao estabelecimento uma ementa digital por mesa ou lugar, o envio dos pedidos para o seu sistema
          de ponto de venda (POS) compatível, a conta da mesa e um painel para a equipa. As funcionalidades disponíveis para cada
          estabelecimento, incluindo integrações com POS e pagamentos no telemóvel, são as indicadas no acordo comercial.
        </p>

        <h3 className="mt-6 font-bold">2. Conta e equipa</h3>
        <p>
          O acesso ao painel é feito por convite. O estabelecimento é responsável por quem convida, pelos perfis que atribui e
          por manter os acessos atualizados, removendo quem deixe de fazer parte da equipa.
        </p>

        <h3 className="mt-6 font-bold">3. Preço</h3>
        <p>
          Salvo acordo diferente, a MESVIO cobra uma comissão de <strong>1% sobre o valor elegível, sem IVA, dos pedidos
          originados na plataforma</strong>, sem mensalidade obrigatória. O valor elegível, a periodicidade da faturação e
          outras condições constam do acordo comercial com cada estabelecimento, que prevalece sobre estes termos.
        </p>

        <h3 className="mt-6 font-bold">4. Responsabilidades do estabelecimento</h3>
        <ul>
          <li>
            A ementa, os preços, o IVA, os alergénios e a disponibilidade dos artigos, incluindo o que vem do seu POS e o que
            marca como esgotado no painel.
          </li>
          <li>A preparação e entrega dos pedidos, a faturação ao cliente final e o cumprimento das obrigações fiscais.</li>
          <li>Confirmar no painel os pedidos que a plataforma assinale como precisando de atenção.</li>
          <li>A informação aos seus clientes sobre o tratamento de dados, enquanto responsável por esse tratamento.</li>
        </ul>

        <h3 className="mt-6 font-bold">5. Disponibilidade</h3>
        <p>
          A MESVIO esforça-se por manter a plataforma disponível e por recuperar rapidamente de falhas, mas não garante
          funcionamento ininterrupto. A plataforma depende de serviços de terceiros (rede móvel do cliente, POS, alojamento,
          prestadores de pagamento) fora do seu controlo. O estabelecimento deve manter um meio alternativo de receber pedidos,
          como o atendimento habitual.
        </p>

        <h3 className="mt-6 font-bold">6. Resultados</h3>
        <p>
          A MESVIO pode ajudar a reduzir o tempo dedicado à recolha de pedidos e a simplificar o serviço, mas não garante
          resultados concretos, como aumento de vendas ou redução de custos com pessoal.
        </p>

        <h3 className="mt-6 font-bold">7. Proteção de dados</h3>
        <p>
          Nos dados dos clientes finais, o estabelecimento é o responsável pelo tratamento e a MESVIO é subcontratante, nos
          termos de um acordo de tratamento de dados (art. 28.º do RGPD) que faz parte do acordo comercial. Mais detalhes na{" "}
          <Link href="/privacidade">Política de Privacidade</Link>.
        </p>

        <h3 className="mt-6 font-bold">8. Responsabilidade</h3>
        <p>
          Na medida permitida por lei, a responsabilidade da MESVIO limita-se aos danos diretos causados por incumprimento
          culposo, até ao valor das comissões pagas pelo estabelecimento nos 12 meses anteriores ao facto. Esta limitação não se
          aplica em caso de dolo ou culpa grave.
        </p>

        <h3 className="mt-6 font-bold">9. Suspensão e cessação</h3>
        <p>
          Qualquer das partes pode terminar a utilização nos termos do acordo comercial. A MESVIO pode suspender o acesso em caso
          de utilização abusiva, falta de pagamento ou risco para a segurança da plataforma, informando o estabelecimento.
        </p>
      </section>

      <section>
        <h2>B. Clientes que pedem pela ementa digital</h2>
        <ul>
          <li>
            O pedido é feito <strong>ao estabelecimento</strong>, que é quem o prepara, entrega, fatura e responde por ele. A
            MESVIO é apenas a plataforma tecnológica que o transmite.
          </li>
          <li>
            Os preços apresentados incluem IVA. Em caso de alergia ou intolerância, confirma sempre com um funcionário antes de
            consumir.
          </li>
          <li>
            Um pedido fica confirmado quando a página o indicar. Em lugares onde se paga ao pedir, o pedido só segue para a
            cozinha depois de o pagamento ser confirmado.
          </li>
          <li>Não é permitido fazer pedidos falsos, em massa ou de fora do estabelecimento.</li>
          <li>Reclamações sobre o pedido devem ser apresentadas ao estabelecimento, incluindo no seu Livro de Reclamações.</li>
        </ul>
      </section>

      <section>
        <h2>Lei aplicável</h2>
        <p>
          Estes termos regem-se pela lei portuguesa. Os consumidores mantêm todos os direitos que a lei lhes confere e podem
          recorrer a meios de resolução alternativa de litígios. Contacto:{" "}
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
