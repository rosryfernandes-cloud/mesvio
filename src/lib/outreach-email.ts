/**
 * Mensagens para enviar a um restaurante o link da pré-visualização da ementa dele: email (HTML,
 * para colar no Gmail com as imagens) e texto curto para WhatsApp ou Instagram. A pessoa da MESVIO
 * cola e envia ela própria, do seu email ou telemóvel.
 */
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function outreachSubject(restaurant: string): string {
  return `${restaurant}: a sua ementa digital em 5 línguas (já feita)`;
}

export function outreachShortText({ restaurant, url, sender }: { restaurant: string; url: string; sender: string }): string {
  return `Olá! Sou o ${sender}, da MESVIO. Peguei na ementa do restaurante ${restaurant} e fiz uma versão digital por QR Code, em 5 línguas e com alergénios. Veja no telemóvel: ${url}\nSe gostar, ativamos em poucos minutos. Posso passar aí 10 minutos esta semana?`;
}

export function outreachEmail({ restaurant, url, sender, baseUrl }: { restaurant: string; url: string; sender: string; baseUrl: string }): { subject: string; html: string; text: string } {
  const r = escapeHtml(restaurant);
  const s = escapeHtml(sender);
  const link = escapeHtml(url);
  const img = (file: string, alt: string) =>
    `<img src="${escapeHtml(baseUrl.replace(/\/+$/, ""))}/email/${file}" width="560" alt="${escapeHtml(alt)}" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:16px">`;
  const bullet = (icon: string, title: string, body: string) =>
    `<tr><td style="padding:6px 10px 6px 0;font-size:20px;vertical-align:top">${icon}</td><td style="padding:6px 0;font-size:15px;line-height:1.5"><strong>${title}</strong> ${body}</td></tr>`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#10211D;max-width:560px">
<p style="font-size:15px;line-height:1.6;margin:0 0 14px">Olá,</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 14px">Sou o ${s}, da MESVIO. Peguei na ementa do restaurante <strong>${r}</strong> e transformei-a numa ementa digital por QR Code. Pode vê-la aqui, no telemóvel:</p>
<p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;background:#062D25;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:999px;font-size:15px">Ver a ementa no telemóvel</a></p>
${img("linguas.png", "A ementa em português, inglês, espanhol, francês e alemão")}
<p style="font-size:15px;line-height:1.6;margin:22px 0 8px">O que já está feito:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 18px">
${bullet("🌍", "Em 5 línguas.", "Cada turista vê a ementa na língua do telemóvel.")}
${bullet("⚠️", "Alergénios.", "Os 14 alergénios sugeridos, para confirmar com a cozinha.")}
${bullet("🛒", "Pedidos pelo telemóvel.", "O cliente pede e chama o empregado; a cozinha recebe logo.")}
${bullet("📊", "Resumo da semana.", "O que vende, as horas de mais movimento e o que esgota.")}
</table>
${img("painel.png", "O painel: pedidos a chegar e resumo da semana")}
<p style="font-size:15px;line-height:1.6;margin:22px 0 14px">Mudar preços, fotos ou tirar um prato esgotado faz-se num minuto, no telemóvel. Se gostar, ativamos tudo em poucos minutos. Posso passar aí 10 minutos esta semana para lhe mostrar?</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 22px">Obrigado,<br><strong>${s}</strong><br>MESVIO · <a href="https://mesvio.pt" style="color:#0f7a5c">mesvio.pt</a></p>
<p style="font-size:12px;line-height:1.5;color:#5b6b66;margin:0">Se não quiser receber mais mensagens nossas, responda &ldquo;não&rdquo; e não voltamos a escrever.</p>
</div>`;

  const text = `Olá,

Sou o ${sender}, da MESVIO. Peguei na ementa do restaurante ${restaurant} e transformei-a numa ementa digital por QR Code. Pode vê-la aqui, no telemóvel: ${url}

O que já está feito:
• Em 5 línguas: cada turista vê a ementa na língua do telemóvel.
• Alergénios: os 14 alergénios sugeridos, para confirmar com a cozinha.
• Pedidos pelo telemóvel: o cliente pede e chama o empregado; a cozinha recebe logo.
• Resumo da semana: o que vende, as horas de mais movimento e o que esgota.

Mudar preços, fotos ou tirar um prato esgotado faz-se num minuto, no telemóvel. Se gostar, ativamos tudo em poucos minutos. Posso passar aí 10 minutos esta semana para lhe mostrar?

Obrigado,
${sender}
MESVIO · mesvio.pt

Se não quiser receber mais mensagens nossas, responda "não" e não voltamos a escrever.`;

  return { subject: outreachSubject(restaurant), html, text };
}
