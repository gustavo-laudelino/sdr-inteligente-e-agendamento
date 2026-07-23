/**
 * Parser de solicitações de agendamento.
 *
 * Origem:
 * - Código utilizado em um node Code do n8n.
 * - Revisado para documentação e leitura fora do workflow.
 *
 * Responsabilidade:
 * Converter solicitações de datas, períodos e horários em slots estruturados.
 */

"use strict";

const TIME_ZONE = "America/Sao_Paulo";

const DIAS_SEMANA = {
  domingo: 0,
  segunda: 1,
  "segunda-feira": 1,
  terca: 2,
  "terca-feira": 2,
  quarta: 3,
  "quarta-feira": 3,
  quinta: 4,
  "quinta-feira": 4,
  sexta: 5,
  "sexta-feira": 5,
  sabado: 6,
};

const MESES = {
  janeiro: 0,
  fevereiro: 1,
  marco: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11,
};

const PERIODOS = [
  { termos: ["manha", "cedo"], valor: "manha" },
  { termos: ["tarde", "tardezinha"], valor: "tarde" },
  { termos: ["noite", "madrugada"], valor: "noite" },
];

const TODOS_OS_PERIODOS = ["manha", "tarde", "noite"];

const FORMATADOR_DATA = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function normalizarTexto(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function partesFormatadas(formatador, valor) {
  return Object.fromEntries(
    formatador
      .formatToParts(valor)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
}

function obterDataLocalISO(instante) {
  const partes = partesFormatadas(FORMATADOR_DATA, instante);
  return `${partes.year}-${partes.month}-${partes.day}`;
}

function criarDataCalendario(dataISO) {
  const correspondencia = String(dataISO).match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!correspondencia) {
    return null;
  }

  const [, ano, mes, dia] = correspondencia;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));

  const dataValida =
    data.getUTCFullYear() === Number(ano) &&
    data.getUTCMonth() === Number(mes) - 1 &&
    data.getUTCDate() === Number(dia);

  return dataValida ? data : null;
}

function formatarDataISO(data) {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function adicionarDias(dataISO, quantidade) {
  const data = criarDataCalendario(dataISO);

  if (!data) {
    throw new Error(`Data inválida: ${dataISO}`);
  }

  data.setUTCDate(data.getUTCDate() + quantidade);
  return formatarDataISO(data);
}

function compararDatas(dataA, dataB) {
  return String(dataA).localeCompare(String(dataB));
}

function diaDaSemana(dataISO) {
  const data = criarDataCalendario(dataISO);
  return data?.getUTCDay();
}

function formatarHora(hora, minuto = "00") {
  const horas = Number(hora);
  const minutos = Number(minuto || 0);

  const horaValida = Number.isInteger(horas) && horas >= 0 && horas <= 23;
  const minutoValido = Number.isInteger(minutos) && minutos >= 0 && minutos <= 59;

  if (!horaValida || !minutoValido) {
    return null;
  }

  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}

function extrairRestricaoDeHorario(linha) {
  const horaMinima = linha.match(
    /(?:\b(?:apos|depois)\s+(?:as?|das?|de)?|\ba partir\s+d[ea]s?)\s*(\d{1,2})(?::|h)?(\d{0,2})?\b/,
  );

  if (horaMinima) {
    const hora = formatarHora(horaMinima[1], horaMinima[2]);
    return hora ? { horaMin: hora } : undefined;
  }

  const horaMaxima = linha.match(
    /(?:\b(?:antes|ate)\s+(?:as?|das?|de)?)\s*(\d{1,2})(?::|h)?(\d{0,2})?\b/,
  );

  if (horaMaxima) {
    const hora = formatarHora(horaMaxima[1], horaMaxima[2]);
    return hora ? { horaMax: hora } : undefined;
  }

  const dataComHora = linha.match(
    /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?:\s*(?:as)?\s*(\d{1,2})(?::|h)?(\d{0,2})?)?\b/,
  );

  if (dataComHora?.[4]) {
    const hora = formatarHora(dataComHora[4], dataComHora[5]);
    return hora ? { horaExata: hora } : undefined;
  }

  const horaExata =
    linha.match(/\bas\s*(\d{1,2})(?::|h)?(\d{0,2})\b/) ||
    linha.match(/\b(\d{1,2}):(\d{2})\b/) ||
    linha.match(/\b(\d{1,2})h(\d{0,2})?\b/) ||
    linha.match(/^\s*(\d{1,2})\s*$/);

  if (!horaExata) {
    return undefined;
  }

  const hora = formatarHora(horaExata[1], horaExata[2]);
  return hora ? { horaExata: hora } : undefined;
}

function extrairPeriodos(linha) {
  if (/qualquer horario|todos os horarios/.test(linha)) {
    return [...TODOS_OS_PERIODOS];
  }

  const encontrados = PERIODOS.filter(({ termos }) =>
    termos.some((termo) => linha.includes(termo)),
  ).map(({ valor }) => valor);

  return encontrados.length ? encontrados : undefined;
}

function indiceDoDiaDaSemana(texto) {
  return DIAS_SEMANA[normalizarTexto(texto)];
}

function proximaOcorrenciaDoDia(diaDesejado, hojeISO) {
  const diaAtual = diaDaSemana(hojeISO);
  const deslocamento = (diaDesejado - diaAtual + 7) % 7;

  return adicionarDias(hojeISO, deslocamento);
}

function diaNestaSemana(diaDesejado, hojeISO) {
  const diaAtual = diaDaSemana(hojeISO);
  const deslocamento = diaDesejado - diaAtual;

  return deslocamento >= 0 ? adicionarDias(hojeISO, deslocamento) : null;
}

function segundaDaProximaSemana(hojeISO) {
  const diaAtual = diaDaSemana(hojeISO);
  const diasAteSegunda = diaAtual === 0 ? 1 : 8 - diaAtual;

  return adicionarDias(hojeISO, diasAteSegunda);
}

function diaNaProximaSemana(diaDesejado, hojeISO) {
  const segunda = segundaDaProximaSemana(hojeISO);
  const deslocamento = (diaDesejado + 6) % 7;

  return adicionarDias(segunda, deslocamento);
}

function datasDaProximaSemana(hojeISO) {
  const segunda = segundaDaProximaSemana(hojeISO);
  return Array.from({ length: 7 }, (_, indice) => adicionarDias(segunda, indice));
}

function datasRestantesDaSemana(hojeISO) {
  const diaAtual = diaDaSemana(hojeISO);

  // No domingo, "essa semana" é interpretada como a semana que começa no dia seguinte.
  if (diaAtual === 0) {
    return datasDaProximaSemana(hojeISO);
  }

  return Array.from({ length: 8 - diaAtual }, (_, indice) =>
    adicionarDias(hojeISO, indice),
  );
}

function criarDataExplicita(ano, mes, dia) {
  const data = new Date(Date.UTC(ano, mes, dia));

  const valida =
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes &&
    data.getUTCDate() === dia;

  return valida ? formatarDataISO(data) : null;
}

function extrairDatas(linha, hojeISO) {
  if (/\bdepois de amanha\b/.test(linha)) {
    return [adicionarDias(hojeISO, 2)];
  }

  if (/\bamanha\b/.test(linha)) {
    return [adicionarDias(hojeISO, 1)];
  }

  if (/\bhoje\b/.test(linha)) {
    return [hojeISO];
  }

  const dataNumerica = linha.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);

  if (dataNumerica) {
    const dia = Number(dataNumerica[1]);
    const mes = Number(dataNumerica[2]) - 1;
    let ano = dataNumerica[3]
      ? Number(dataNumerica[3])
      : Number(hojeISO.slice(0, 4));

    if (ano < 100) {
      ano += 2000;
    }

    const data = criarDataExplicita(ano, mes, dia);
    return data ? [data] : [];
  }

  const dataPorExtenso = linha.match(
    /(\d{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de (\d{4}))?/,
  );

  if (dataPorExtenso) {
    const dia = Number(dataPorExtenso[1]);
    const mes = MESES[dataPorExtenso[2]];
    const ano = dataPorExtenso[3]
      ? Number(dataPorExtenso[3])
      : Number(hojeISO.slice(0, 4));

    const data = criarDataExplicita(ano, mes, dia);
    return data ? [data] : [];
  }

  const diaDaProximaSemana = linha.match(
    /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b.*\bsemana que vem\b/,
  );

  if (diaDaProximaSemana) {
    const indice = indiceDoDiaDaSemana(diaDaProximaSemana[1]);
    return [diaNaProximaSemana(indice, hojeISO)];
  }

  if (/\bsemana que vem\b/.test(linha)) {
    return datasDaProximaSemana(hojeISO);
  }

  const diaDestaSemana = linha.match(
    /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b.*\bessa semana\b/,
  );

  if (diaDestaSemana) {
    const indice = indiceDoDiaDaSemana(diaDestaSemana[1]);
    const data = diaNestaSemana(indice, hojeISO);

    return data ? [data] : [];
  }

  if (/\bessa semana\b/.test(linha)) {
    return datasRestantesDaSemana(hojeISO);
  }

  const diaInformado = linha.match(
    /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b/,
  );

  if (diaInformado) {
    const indice = indiceDoDiaDaSemana(diaInformado[1]);
    return [proximaOcorrenciaDoDia(indice, hojeISO)];
  }

  return [];
}

function mesclarSlot(destino, periodos, horario) {
  if (periodos) {
    destino.periodos ??= [];

    for (const periodo of periodos) {
      if (!destino.periodos.includes(periodo)) {
        destino.periodos.push(periodo);
      }
    }
  }

  if (horario) {
    Object.assign(destino, horario);
  }
}

function parseAgendamento(entrada, dataReferencia = new Date()) {
  const hojeISO = obterDataLocalISO(new Date(dataReferencia));

  const linhas = String(entrada ?? "")
    .split("\n")
    .map(normalizarTexto)
    .filter(Boolean);

  const slotsPorData = new Map();

  for (const linha of linhas) {
    let datas = extrairDatas(linha, hojeISO);
    const periodos = extrairPeriodos(linha);
    const horario = extrairRestricaoDeHorario(linha);

    // Uma preferência isolada, como "de manhã" ou "depois das 15h",
    // é aplicada aos dias restantes da semana.
    if (datas.length === 0 && (periodos || horario)) {
      datas = datasRestantesDaSemana(hojeISO);
    }

    for (const data of datas) {
      const slot = slotsPorData.get(data) ?? { data };
      mesclarSlot(slot, periodos, horario);
      slotsPorData.set(data, slot);
    }
  }

  return [...slotsPorData.values()].sort((a, b) => compararDatas(a.data, b.data));
}

/*
 * Adaptação para um node Code do n8n:
 *
 * const entrada = $json.message?.content || "";
 * const slots = parseAgendamento(entrada);
 *
 * return [{
 *   json: {
 *     slots,
 *     excluirDias: [],
 *     excluirPeriodos: []
 *   }
 * }];
 */
