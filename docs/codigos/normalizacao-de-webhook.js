/**
 * Normalização de dados recebidos por webhook.
 *
 * Origem:
 * - Código utilizado após o node Webhook do n8n.
 * - Organizado e sanitizado para documentação.
 *
 * Responsabilidades:
 * - Extrair o corpo da requisição.
 * - Normalizar nomes e espaços.
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

function normalizarNomeResponsavel(nome) {
  const nomeNormalizado =
    normalizarTexto(nome);

  if (!nomeNormalizado) {
    return null;
  }

  const correspondencia =
    nomeNormalizado.match(
      /^(dra?|dr)\.?\s*/i,
    );

  if (!correspondencia) {
    return nomeNormalizado;
  }

  const restanteDoNome =
    nomeNormalizado
      .slice(correspondencia[0].length)
      .trim();

  const prefixo =
    /^dra/i.test(correspondencia[1])
      ? "Dra"
      : "Dr";

  return restanteDoNome
    ? `${prefixo} ${restanteDoNome}`
    : prefixo;
}

function normalizarTelefone(telefone) {
  const telefoneNormalizado =
    normalizarTexto(telefone);

  if (!telefoneNormalizado) {
    return null;
  }

  const somenteNumeros =
    telefoneNormalizado.replace(/\D/g, "");

  return somenteNumeros || null;
}

function extrairDominio(url) {
  const urlNormalizada =
    normalizarTexto(url);

  if (!urlNormalizada) {
    return null;
  }

  try {
    return new URL(urlNormalizada).hostname;
  } catch {
    return null;
  }
}

function obterNomeDoLead(body) {
  return (
    normalizarTexto(body.nome) ??
    normalizarTexto(body.senderName) ??
    normalizarTexto(body.chatName) ??
    null
  );
}

function normalizarWebhook(
  entrada,
  dataRecebimento = new Date(),
) {
  const body =
    entrada?.body ?? entrada ?? {};

  return {
    ok: true,

    recebido_em:
      dataRecebimento.toISOString(),

    lead_name:
      obterNomeDoLead(body),

    celular:
      normalizarTelefone(body.celular),

    texto_mensagem:
      normalizarTexto(
        body.texto_mensagem,
      ),

    tipo_mensagem:
      normalizarTexto(
        body.tipo_mensagem,
      ),

    link_chat:
      normalizarTexto(body.link_chat),

    base_instancia:
      extrairDominio(body.link_chat),

    responsavel_nome:
      normalizarNomeResponsavel(
        body.responsavel_nome,
      ),

    responsavel_email:
      normalizarTexto(
        body.responsavel_email,
      ),

    campanha_id:
      normalizarTexto(
        body.campanha_id,
      ),

    campanha_nome:
      normalizarTexto(
        body.campanha_nome,
      ),

    origem:
      normalizarTexto(body.origem),

    phone_id:
      normalizarTexto(body.phone_id),

    chat_id:
      normalizarTexto(body.chat_id),
  };
}

/*
 * Exemplo de adaptação para o node Code do n8n:
 *
 * const resultado =
 *   normalizarWebhook($json);
 *
 * return [
 *   {
 *     json: resultado,
 *   },
 * ];
 */
