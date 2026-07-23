/**
 * Normalização de dados recebidos por webhook.
 *
 * Origem:
 * - Código utilizado após o node Webhook do n8n.
 * - Revisado e sanitizado para documentação.
 *
 * Responsabilidades:
 * - Extrair o corpo da requisição.
 * - Normalizar nomes, espaços e identificadores.
 * - Aplicar fallbacks para o nome do lead.
 * - Padronizar os dados enviados às próximas etapas.
 */

"use strict";

function normalizarTexto(valor) {
  if (valor === null || valor === undefined) {
    return null;
  }

  const texto = String(valor)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return texto || null;
}

function normalizarEmail(email) {
  return normalizarTexto(email)?.toLowerCase() ?? null;
}

function normalizarNomeResponsavel(nome) {
  const nomeNormalizado = normalizarTexto(nome);

  if (!nomeNormalizado) {
    return null;
  }

  const correspondencia = nomeNormalizado.match(/^(dra?|dr)\.?\s*/i);

  if (!correspondencia) {
    return nomeNormalizado;
  }

  const restanteDoNome = nomeNormalizado
    .slice(correspondencia[0].length)
    .trim();
  const prefixo = /^dra/i.test(correspondencia[1]) ? "Dra" : "Dr";

  return restanteDoNome ? `${prefixo} ${restanteDoNome}` : prefixo;
}

function normalizarTelefone(telefone) {
  const telefoneNormalizado = normalizarTexto(telefone);

  if (!telefoneNormalizado) {
    return null;
  }

  const somenteNumeros = telefoneNormalizado.replace(/\D/g, "");
  return somenteNumeros || null;
}

function normalizarUrl(url) {
  const valor = normalizarTexto(url);

  if (!valor) {
    return null;
  }

  try {
    const urlNormalizada = new URL(valor);

    return ["http:", "https:"].includes(urlNormalizada.protocol)
      ? urlNormalizada.toString()
      : null;
  } catch {
    return null;
  }
}

function extrairDominio(url) {
  const urlNormalizada = normalizarUrl(url);

  if (!urlNormalizada) {
    return null;
  }

  return new URL(urlNormalizada).hostname;
}

function obterNomeDoLead(body) {
  return (
    normalizarTexto(body.nome) ??
    normalizarTexto(body.senderName) ??
    normalizarTexto(body.chatName) ??
    null
  );
}

function normalizarWebhook(entrada, dataRecebimento = new Date()) {
  const body = entrada?.body ?? entrada ?? {};
  const recebidoEm = new Date(dataRecebimento);

  if (Number.isNaN(recebidoEm.getTime())) {
    throw new Error("A data de recebimento é inválida.");
  }

  const linkChat = normalizarUrl(body.link_chat);

  return {
    ok: true,
    recebido_em: recebidoEm.toISOString(),
    lead_name: obterNomeDoLead(body),
    celular: normalizarTelefone(body.celular),
    texto_mensagem: normalizarTexto(body.texto_mensagem),
    tipo_mensagem: normalizarTexto(body.tipo_mensagem),
    link_chat: linkChat,
    base_instancia: extrairDominio(linkChat),
    responsavel_nome: normalizarNomeResponsavel(body.responsavel_nome),
    responsavel_email: normalizarEmail(body.responsavel_email),
    campanha_id: normalizarTexto(body.campanha_id),
    campanha_nome: normalizarTexto(body.campanha_nome),
    origem: normalizarTexto(body.origem),
    phone_id: normalizarTexto(body.phone_id),
    chat_id: normalizarTexto(body.chat_id),
  };
}

/*
 * Adaptação para o node Code do n8n:
 *
 * const resultado = normalizarWebhook($json);
 * return [{ json: resultado }];
 */
