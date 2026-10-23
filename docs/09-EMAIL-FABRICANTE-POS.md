# Email ao fabricante do POS — pedido de acesso à API

Rascunho baseado nas perguntas de [04-INTEGRACAO-POS.md §5](04-INTEGRACAO-POS.md). Escrito para a ZoneSoft (ZSRest); para outro fabricante, trocar o nome do produto.
Preencher os campos entre [parênteses retos] antes de enviar.

**Para:** [email de parcerias / comercial do fabricante]
**Assunto:** Pedido de acesso à API do ZSRest — integração de pedidos à mesa por QR Code/NFC

---

Bom dia,

O meu nome é [Nome] e sou responsável pela [Nome da empresa], que está a desenvolver a MESVIO: uma plataforma em que o cliente do restaurante lê um QR Code ou uma etiqueta NFC na mesa, consulta a ementa no telemóvel e faz o pedido diretamente, sem descarregar nenhuma app. O pagamento continua a ser feito no restaurante, através do POS.

Queremos que esses pedidos entrem diretamente no ZSRest, na mesa certa, e sigam para as impressoras da cozinha e do bar como se tivessem sido lançados por um empregado. Assim o restaurante não tem de lançar nada à mão, e o ZSRest continua a ser o único sistema de faturação. [Temos já restaurantes interessados que usam o ZSRest, entre eles o [nome do restaurante], que autoriza esta integração.] / [Estamos a preparar um piloto com restaurantes que usam o ZSRest.]

Gostaríamos de saber se é possível integrar com o ZSRest e em que condições. Em concreto:

**Acesso e condições**
1. Existe uma API oficial (ou um programa de parceiros) para o ZSRest? Qual é o processo de adesão e quais são os termos comerciais, tanto para nós como para o restaurante?
2. O ZSRest dos vossos clientes corre localmente, na cloud, ou em ambos os modos? No caso de uma instalação local, como é que uma integração externa lhe chega?
3. Existe um ambiente de testes (sandbox), documentação técnica e limites de utilização da API?

**Pedidos**

4. É possível criar um pedido numa mesa aberta, com extras, variantes e observações, e que esse pedido siga para as impressoras da cozinha e do bar?
5. É possível ler o catálogo (artigos, preços, IVA, famílias, extras), as mesas e os artigos esgotados, para que a ementa digital esteja sempre igual ao POS?
6. Aceitam um identificador externo no pedido, e garantem que um pedido enviado duas vezes com o mesmo identificador não é duplicado?
7. Quando recebem um pedido, devolvem uma confirmação imediata? Existem webhooks (ou outro mecanismo) para estados posteriores, como em preparação ou servido?

**Vendas e reconciliação**

8. É possível obter os documentos de venda e relacionar as linhas com o pedido que originámos?
9. Como são reportadas as anulações, as devoluções e as notas de crédito?

Do nosso lado, só enviamos ao POS os artigos, as quantidades e as escolhas do cliente, com os preços sempre validados contra o vosso catálogo. As credenciais de cada restaurante ficam encriptadas e só são usadas com autorização expressa do restaurante.

Teríamos todo o gosto em marcar uma chamada curta para apresentar a plataforma e perceber qual é o melhor caminho. Se este não for o contacto certo, agradeço que me indiquem a pessoa ou o departamento a quem me devo dirigir.

Com os melhores cumprimentos,

[Nome]
[Cargo] — [Nome da empresa]
[Telefone] · [Email] · [Site]
