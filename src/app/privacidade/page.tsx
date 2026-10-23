import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como a MESVIO trata os dados pessoais de quem pede uma demonstração, das equipas dos restaurantes e dos clientes que pedem pela ementa.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade">
      <section>
        <p>
          Esta política explica que dados pessoais a MESVIO trata, porquê, durante quanto tempo e que direitos tens. Aplica-se ao
          site da MESVIO, ao painel dos restaurantes e às ementas digitais abertas por QR Code ou NFC.
        </p>
      </section>

      <section>
        <h2>1. Quem somos</h2>
        <p>
          {LEGAL.company}, NIF {LEGAL.nif}, com sede em {LEGAL.address} (&ldquo;MESVIO&rdquo;). Para qualquer questão sobre
          privacidade: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
        </p>
      </section>

      <section>
        <h2>2. Pedidos de demonstração (formulário do site)</h2>
        <ul>
          <li>
            <strong>Dados:</strong> nome, nome do espaço, email, telefone (opcional), tipo de espaço, mensagem e um identificador
            técnico derivado do endereço IP (pseudonimizado, nunca guardado em claro), usado só para travar abusos.
          </li>
          <li>
            <strong>Finalidade:</strong> responder ao teu pedido e marcar a demonstração.
          </li>
          <li>
            <strong>Fundamento:</strong> diligências pré-contratuais a teu pedido (art. 6.º, n.º 1, al. b) do RGPD) e interesse
            legítimo na segurança do formulário (al. f)).
          </li>
          <li>
            <strong>Conservação:</strong> 12 meses após o pedido; depois, são apagados automaticamente. Se te tornares cliente, os dados de contacto passam a seguir as regras do ponto 3.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Equipas dos restaurantes (painel)</h2>
        <ul>
          <li>
            <strong>Dados:</strong> email, nome apresentado, perfil (dono, gerente ou staff), estabelecimento e registo das ações
            feitas no painel (por exemplo, aprovar ou cancelar um pedido).
          </li>
          <li>
            <strong>Finalidade:</strong> dar acesso ao painel, aplicar as permissões de cada perfil e manter um histórico de
            auditoria.
          </li>
          <li>
            <strong>Fundamento:</strong> execução do contrato com o estabelecimento (al. b)) e interesse legítimo na segurança e
            na resolução de litígios (al. f)).
          </li>
          <li>
            <strong>Conservação:</strong> enquanto a conta estiver ativa; o histórico de auditoria, pelo prazo necessário para
            obrigações legais e defesa de direitos.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Clientes que pedem pela ementa digital</h2>
        <p>
          Quando fazes um pedido num restaurante que usa a MESVIO, <strong>o responsável pelo tratamento é o restaurante</strong>.
          A MESVIO trata esses dados por conta dele, como subcontratante (art. 28.º do RGPD), apenas para que o pedido chegue à
          cozinha e à conta da mesa.
        </p>
        <ul>
          <li>
            <strong>Não pedimos nome, email nem telefone</strong> para fazer um pedido.
          </li>
          <li>
            <strong>Dados tratados:</strong> o que pediste, a mesa ou espreguiçadeira, a hora, as notas que escreveres, o estado
            do pagamento e um identificador pseudonimizado do IP, usado só para travar pedidos falsos ou em massa.
          </li>
          <li>
            <strong>Pagamentos no telemóvel</strong> (quando disponíveis) são processados por um prestador de pagamentos
            certificado; a MESVIO não recebe nem guarda os dados do teu cartão.
          </li>
          <li>
            <strong>No teu telemóvel</strong> guardamos o carrinho e a secção da ementa que estavas a ver (armazenamento local do
            navegador), para não os perderes se a página recarregar. Podes apagá-los nas definições do navegador.
          </li>
          <li>
            Para exercer direitos sobre estes dados, contacta o restaurante; nós ajudamo-lo a responder.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Cookies</h2>
        <p>
          Não usamos cookies de publicidade nem de análise, por isso não há aviso de cookies. Usamos apenas cookies estritamente
          necessários para manter a sessão de quem entra no painel do restaurante.
        </p>
      </section>

      <section>
        <h2>6. Prestadores que nos ajudam</h2>
        <p>Recorremos a prestadores que tratam dados por nossa conta, com contrato e garantias adequadas:</p>
        <ul>
          <li>Alojamento da aplicação (Vercel), com execução na União Europeia.</li>
          <li>Base de dados e autenticação (Supabase), alojadas na União Europeia.</li>
          <li>Envio de emails (por exemplo, Resend), para os códigos de entrada no painel e os avisos de pedidos de demonstração.</li>
          <li>Prestador de pagamentos, quando os pagamentos no telemóvel estiverem disponíveis.</li>
        </ul>
        <p>
          Alguns destes prestadores pertencem a grupos com sede fora da UE. Nesses casos, as transferências assentam em
          mecanismos previstos no RGPD, como o Quadro de Privacidade de Dados UE-EUA ou cláusulas contratuais-tipo.
        </p>
      </section>

      <section>
        <h2>7. Os teus direitos</h2>
        <p>
          Podes pedir o acesso, a retificação, o apagamento, a limitação ou a portabilidade dos teus dados, e opor-te ao seu
          tratamento, escrevendo para <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Respondemos no prazo de um mês. Tens
          também o direito de apresentar reclamação à Comissão Nacional de Proteção de Dados (
          <a href="https://www.cnpd.pt" rel="noopener noreferrer">
            www.cnpd.pt
          </a>
          ).
        </p>
      </section>

      <section>
        <h2>8. Segurança</h2>
        <p>
          Os dados de cada restaurante estão isolados dos restantes na base de dados, as ligações são cifradas e o acesso ao
          painel é feito por convite, com perfis e permissões. Não vendemos dados pessoais.
        </p>
      </section>

      <section>
        <h2>9. Alterações</h2>
        <p>
          Se esta política mudar, publicamos aqui a nova versão com a data de atualização. Ver também os{" "}
          <Link href="/termos">Termos de Utilização</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
