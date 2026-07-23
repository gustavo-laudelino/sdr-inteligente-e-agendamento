/**
 * Parser de solicitações de agendamento.
 *
 * Origem:
 * - Código utilizado em um node Code do n8n.
 * - Organizado para documentação e leitura fora do workflow.
 *
 * Responsabilidade:
 * Converter solicitações de datas, períodos e horários em slots estruturados.
 *
 * Exemplo de entrada:
 * "sexta-feira depois das 15h"
 *
 * Exemplo de saída:
 * [
 *   {
 *     data: "2026-07-24",
 *     horaMin: "15:00"
 *   }
 * ]
 */

"use strict";

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
  {
    termos: ["manha", "cedo"],
    valor: "manha",
  },
  {
    termos: ["tarde", "tardezinha"],
    valor: "tarde",
  },
  {
    termos: ["noite", "madrugada"],
    valor: "noite",
  },
];

const TODOS_OS_PERIODOS = ["manha", "tarde", "noite"];

function normalizarTexto(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatarDataISO(data) {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function criarDataUTC(ano, mes, dia) {
  const data = new Date(Date.UTC(ano, mes, dia));

  const dataValida =
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes &&
    data.getUTCDate() === dia;

  return dataValida ? data : null;
}

function formatarHora(hora, minuto = "00") {
  const horaNumerica = Number(hora);
  const minutoNumerico = Number(minuto || 0);

  const horaValida =
    Number.isInteger(horaNumerica) &&
    horaNumerica >= 0 &&
    horaNumerica <= 23;

  const minutoValido =
    Number.isInteger(minutoNumerico) &&
    minutoNumerico >= 0 &&
    minutoNumerico <= 59;

  if (!horaValida || !minutoValido) {
    return null;
  }

  return `${String(horaNumerica).padStart(2, "0")}:${String(
    minutoNumerico,
  ).padStart(2, "0")}`;
}

/**
 * Prioridade de interpretação:
 *
 * 1. Hora mínima:
 *    "depois das 15h"
 *    "após 15h"
 *    "a partir das 15h"
 *
 * 2. Hora máxima:
 *    "antes das 17h"
 *    "até 17h"
 *
 * 3. Hora exata:
 *    "às 15h"
 *    "15:30"
 *    "15h"
 */
function extrairRestricaoDeHorario(linha) {
  const horaMinima = linha.match(
    /(?:\b(?:apos|depois)\s+(?:as?|das?|de)?|\ba partir\s+d[ea]s?)\s*(\d{1,2})(?::|h)?(\d{0,2})?\b/,
  );

  if (horaMinima) {
    const hora = formatarHora(horaMinima[1], horaMinima[2]);

    if (hora) {
      return {
        horaMin: hora,
      };
    }
  }

  const horaMaxima = linha.match(
    /(?:\b(?:antes|ate)\s+(?:as?|das?|de)?)\s*(\d{1,2})(?::|h)?(\d{0,2})?\b/,
  );

  if (horaMaxima) {
    const hora = formatarHora(horaMaxima[1], horaMaxima[2]);

    if (hora) {
      return {
        horaMax: hora,
      };
    }
  }

  const dataComHora = linha.match(
    /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?:\s*(?:as)?\s*(\d{1,2})(?::|h)?(\d{0,2})?)?\b/,
  );

  if (dataComHora?.[4]) {
    const hora = formatarHora(dataComHora[4], dataComHora[5]);

    if (hora) {
      return {
        horaExata: hora,
      };
    }
  }

  const horaExata =
    linha.match(/\bas\s*(\d{1,2})(?::|h)?(\d{0,2})\b/) ||
    linha.match(/\b(\d{1,2}):(\d{2})\b/) ||
    linha.match(/\b(\d{1,2})h\b/) ||
    linha.match(/^\s*(\d{1,2})\s*$/);

  if (horaExata) {
    const hora = formatarHora(horaExata[1], horaExata[2]);

    if (hora) {
      return {
        horaExata: hora,
      };
    }
  }

  return undefined;
}

function extrairPeriodos(linha) {
  if (/qualquer horario|todos os horarios/.test(linha)) {
    return [...TODOS_OS_PERIODOS];
  }

  const periodosEncontrados = PERIODOS.filter(({ termos }) =>
    termos.some((termo) => linha.includes(termo)),
  ).map(({ valor }) => valor);

  return periodosEncontrados.length
    ? periodosEncontrados
    : undefined;
}

function indiceDoDiaDaSemana(texto) {
  const diaNormalizado = normalizarTexto(texto);

  return DIAS_SEMANA[diaNormalizado];
}

function dataDoDiaNaSemanaAtual(diaSemana, hoje) {
  const data = new Date(hoje);

  const deslocamento =
    (diaSemana - data.getUTCDay() + 7) % 7;

  data.setUTCDate(data.getUTCDate() + deslocamento);

  const proximoDomingo = new Date(hoje);

  proximoDomingo.setUTCDate(
    hoje.getUTCDate() + (7 - hoje.getUTCDay()),
  );

  return data <= proximoDomingo
    ? data
    : null;
}

function dataDoDiaNaProximaSemana(diaSemana, hoje) {
  const segundaDaProximaSemana = new Date(hoje);

  const diasAteSegunda =
    ((8 - hoje.getUTCDay()) % 7) || 7;

  segundaDaProximaSemana.setUTCDate(
    segundaDaProximaSemana.getUTCDate() +
      diasAteSegunda,
  );

  const deslocamento =
    (diaSemana + 6) % 7;

  segundaDaProximaSemana.setUTCDate(
    segundaDaProximaSemana.getUTCDate() +
      deslocamento,
  );

  return segundaDaProximaSemana;
}

function extrairDatas(linha, hoje) {
  /*
   * A expressão mais específica precisa ser verificada
   * antes de "amanhã".
   */
  if (/\bdepois de amanha\b/.test(linha)) {
    const data = new Date(hoje);

    data.setUTCDate(
      data.getUTCDate() + 2,
    );

    return [
      formatarDataISO(data),
    ];
  }

  if (/\bamanha\b/.test(linha)) {
    const data = new Date(hoje);

    data.setUTCDate(
      data.getUTCDate() + 1,
    );

    return [
      formatarDataISO(data),
    ];
  }

  if (/\bhoje\b/.test(linha)) {
    return [
      formatarDataISO(hoje),
    ];
  }

  const dataNumerica = linha.match(
    /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/,
  );

  if (dataNumerica) {
    const dia = Number(dataNumerica[1]);
    const mes = Number(dataNumerica[2]) - 1;

    let ano = dataNumerica[3]
      ? Number(dataNumerica[3])
      : hoje.getUTCFullYear();

    if (ano < 100) {
      ano += 2000;
    }

    const data = criarDataUTC(
      ano,
      mes,
      dia,
    );

    return data
      ? [formatarDataISO(data)]
      : [];
  }

  const dataPorExtenso = linha.match(
    /(\d{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de (\d{4}))?/,
  );

  if (dataPorExtenso) {
    const dia = Number(
      dataPorExtenso[1],
    );

    const mes =
      MESES[dataPorExtenso[2]];

    const ano = dataPorExtenso[3]
      ? Number(dataPorExtenso[3])
      : hoje.getUTCFullYear();

    const data = criarDataUTC(
      ano,
      mes,
      dia,
    );

    return data
      ? [formatarDataISO(data)]
      : [];
  }

  const diaDaProximaSemana = linha.match(
    /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b.*semana que vem/,
  );

  if (diaDaProximaSemana) {
    const indice = indiceDoDiaDaSemana(
      diaDaProximaSemana[1],
    );

    const data = dataDoDiaNaProximaSemana(
      indice,
      hoje,
    );

    return [
      formatarDataISO(data),
    ];
  }

  if (/^\s*semana que vem\s*$/.test(linha)) {
    return [1, 2, 3, 4, 5, 6, 0].map(
      (diaSemana) =>
        formatarDataISO(
          dataDoDiaNaProximaSemana(
            diaSemana,
            hoje,
          ),
        ),
    );
  }

  const diaDestaSemana = linha.match(
    /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b.*essa semana/,
  );

  if (diaDestaSemana) {
    const indice = indiceDoDiaDaSemana(
      diaDestaSemana[1],
    );

    const data = dataDoDiaNaSemanaAtual(
      indice,
      hoje,
    );

    return data
      ? [formatarDataISO(data)]
      : [];
  }

  if (/^\s*essa semana\s*$/.test(linha)) {
    const datas = [];

    for (
      let diaSemana = hoje.getUTCDay();
      diaSemana <= 6;
      diaSemana += 1
    ) {
      const data = dataDoDiaNaSemanaAtual(
        diaSemana,
        hoje,
      );

      if (data) {
        datas.push(
          formatarDataISO(data),
        );
      }
    }

    return datas;
  }

  const diaDaSemana = linha.match(
    /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b/,
  );

  if (diaDaSemana) {
    const indice = indiceDoDiaDaSemana(
      diaDaSemana[1],
    );

    const data = dataDoDiaNaSemanaAtual(
      indice,
      hoje,
    );

    return data
      ? [formatarDataISO(data)]
      : [];
  }

  return [];
}

function mesclarSlot(
  destino,
  periodos,
  horario,
) {
  if (periodos) {
    destino.periodos ??= [];

    for (const periodo of periodos) {
      const periodoJaExiste =
        destino.periodos.includes(periodo);

      if (!periodoJaExiste) {
        destino.periodos.push(periodo);
      }
    }
  }

  if (horario) {
    Object.assign(
      destino,
      horario,
    );
  }
}

function parseAgendamento(
  entrada,
  dataReferencia = new Date(),
) {
  const hoje = new Date(
    dataReferencia,
  );

  hoje.setUTCHours(
    0,
    0,
    0,
    0,
  );

  const linhas = String(
    entrada ?? "",
  )
    .split("\n")
    .map(normalizarTexto)
    .filter(Boolean);

  const slotsPorData =
    new Map();

  for (const linha of linhas) {
    const datas = extrairDatas(
      linha,
      hoje,
    );

    const periodos =
      extrairPeriodos(linha);

    const horario =
      extrairRestricaoDeHorario(linha);

    for (const data of datas) {
      const slot =
        slotsPorData.get(data) ?? {
          data,
        };

      mesclarSlot(
        slot,
        periodos,
        horario,
      );

      slotsPorData.set(
        data,
        slot,
      );
    }
  }

  return [
    ...slotsPorData.values(),
  ].sort((primeiro, segundo) =>
    primeiro.data.localeCompare(
      segundo.data,
    ),
  );
}

/*
 * Exemplo de adaptação para um node Code do n8n:
 *
 * const entrada =
 *   $json.message?.content || "";
 *
 * const slots =
 *   parseAgendamento(entrada);
 *
 * return [
 *   {
 *     json: {
 *       slots,
 *       excluirDias: [],
 *       excluirPeriodos: []
 *     }
 *   }
 * ];
 */
