/**
 * Geração e filtragem de disponibilidade.
 *
 * Origem:
 * - Código extraído de nodes Code do n8n.
 * - Revisado para não depender do timezone configurado no servidor.
 *
 * Responsabilidades:
 * - Gerar horários possíveis conforme a configuração da agenda.
 * - Respeitar duração do serviço e antecedência mínima.
 * - Remover horários que conflitam com eventos existentes.
 * - Aplicar filtros de data, período e horário.
 */

"use strict";

const TIME_ZONE = "America/Sao_Paulo";

const CHAVES_DIA = [
  "domingo",
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
];

const ALIASES_DIA = {
  domingo: ["domingo"],
  segunda: ["segunda", "segunda-feira"],
  terca: ["terca", "terça", "terca-feira", "terça-feira"],
  quarta: ["quarta", "quarta-feira"],
  quinta: ["quinta", "quinta-feira"],
  sexta: ["sexta", "sexta-feira"],
  sabado: ["sabado", "sábado"],
};

const FORMATADOR_DATA = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FORMATADOR_HORA = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const FORMATADOR_PARTES = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partesFormatadas(formatador, valor) {
  return Object.fromEntries(
    formatador
      .formatToParts(valor)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
}

function formatarDataLocal(instante) {
  const partes = partesFormatadas(FORMATADOR_DATA, instante);
  return `${partes.year}-${partes.month}-${partes.day}`;
}

function formatarHoraLocal(instante) {
  const partes = partesFormatadas(FORMATADOR_HORA, instante);
  return `${partes.hour}:${partes.minute}`;
}

function validarDataISO(dataISO) {
  const correspondencia = String(dataISO).match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!correspondencia) {
    return false;
  }

  const [, ano, mes, dia] = correspondencia;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));

  return (
    data.getUTCFullYear() === Number(ano) &&
    data.getUTCMonth() === Number(mes) - 1 &&
    data.getUTCDate() === Number(dia)
  );
}

function adicionarDias(dataISO, quantidade) {
  if (!validarDataISO(dataISO)) {
    throw new Error(`Data inválida: ${dataISO}`);
  }

  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia + quantidade));

  return [
    data.getUTCFullYear(),
    String(data.getUTCMonth() + 1).padStart(2, "0"),
    String(data.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function diaDaSemana(dataISO) {
  if (!validarDataISO(dataISO)) {
    throw new Error(`Data inválida: ${dataISO}`);
  }

  const [ano, mes, dia] = dataISO.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

function normalizarHora(hora) {
  const correspondencia = String(hora ?? "").match(/^(\d{1,2}):(\d{2})$/);

  if (!correspondencia) {
    return null;
  }

  const horas = Number(correspondencia[1]);
  const minutos = Number(correspondencia[2]);

  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
    return null;
  }

  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}

function horaParaMinutos(hora) {
  const horaNormalizada = normalizarHora(hora);

  if (!horaNormalizada) {
    return null;
  }

  const [horas, minutos] = horaNormalizada.split(":").map(Number);
  return horas * 60 + minutos;
}

function obterOffsetDaZonaEmMs(instante) {
  const partes = partesFormatadas(FORMATADOR_PARTES, instante);

  const representacaoUTC = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second),
  );

  const instanteSemMilissegundos =
    Math.floor(instante.getTime() / 1000) * 1000;

  return representacaoUTC - instanteSemMilissegundos;
}

/**
 * Converte uma data e hora locais de São Paulo para um instante UTC,
 * sem depender do timezone do processo Node.js.
 */
function criarInstanteNaZona(dataISO, hora) {
  if (!validarDataISO(dataISO)) {
    throw new Error(`Data inválida: ${dataISO}`);
  }

  const horaNormalizada = normalizarHora(hora);

  if (!horaNormalizada) {
    throw new Error(`Hora inválida: ${hora}`);
  }

  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const [horas, minutos] = horaNormalizada.split(":").map(Number);
  const baseUTC = Date.UTC(ano, mes - 1, dia, horas, minutos);

  let timestamp = baseUTC;

  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    const offset = obterOffsetDaZonaEmMs(new Date(timestamp));
    const ajustado = baseUTC - offset;

    if (Math.abs(ajustado - timestamp) < 1000) {
      timestamp = ajustado;
      break;
    }

    timestamp = ajustado;
  }

  const resultado = new Date(timestamp);

  if (
    formatarDataLocal(resultado) !== dataISO ||
    formatarHoraLocal(resultado) !== horaNormalizada
  ) {
    throw new Error(
      `A data e hora ${dataISO} ${horaNormalizada} não existem no timezone ${TIME_ZONE}.`,
    );
  }

  return resultado;
}

function obterHorarioFuncionamento(config, chaveDia) {
  const configuracao = config.diasFuncionamento ?? {};

  for (const alias of ALIASES_DIA[chaveDia] ?? [chaveDia]) {
    if (configuracao[alias]) {
      return configuracao[alias];
    }
  }

  return null;
}

function obterPeriodo(hora) {
  const minutos = horaParaMinutos(hora);

  if (minutos === null) {
    return null;
  }

  if (minutos < 12 * 60) {
    return "manha";
  }

  if (minutos < 18 * 60) {
    return "tarde";
  }

  return "noite";
}

function encontrarProfissional(profissionais, nomeProfissional) {
  const nomeBuscado = String(nomeProfissional ?? "").toLowerCase().trim();

  return profissionais.find(
    ({ nome }) => String(nome ?? "").toLowerCase().trim() === nomeBuscado,
  );
}

function validarConfiguracao(config, servico, profissional) {
  const configuracaoServico = config.servicos?.[servico];

  if (!configuracaoServico?.duracaoMinutos) {
    throw new Error(`Serviço '${servico}' não possui duração configurada.`);
  }

  const profissionalEncontrado = encontrarProfissional(
    config.profissionais ?? [],
    profissional,
  );

  if (!profissionalEncontrado) {
    throw new Error(`Profissional '${profissional}' não encontrado.`);
  }

  return { configuracaoServico, profissionalEncontrado };
}

function gerarHorariosPossiveis({
  config,
  servico,
  profissional,
  dataReferencia = new Date(),
  antecedenciaMinutos,
}) {
  const { configuracaoServico, profissionalEncontrado } =
    validarConfiguracao(config, servico, profissional);

  const duracaoMinutos = Number(configuracaoServico.duracaoMinutos);
  const intervaloConfigurado = Number(
    config.intervaloMinimoEntreAgendamentosMin,
  );
  const intervaloMinutos =
    Number.isFinite(intervaloConfigurado) && intervaloConfigurado > 0
      ? intervaloConfigurado
      : 10;

  const limiteDiasFuturos = Math.max(
    0,
    Number(config.maxDiasAgendamento) || 7,
  );

  const antecedenciaConfigurada = Number(
    antecedenciaMinutos ?? config.antecedenciaMinimaMin ?? 20,
  );
  const antecedencia =
    Number.isFinite(antecedenciaConfigurada) && antecedenciaConfigurada >= 0
      ? antecedenciaConfigurada
      : 20;

  const agora = new Date(dataReferencia);

  if (Number.isNaN(agora.getTime())) {
    throw new Error("A data de referência é inválida.");
  }

  const hojeISO = formatarDataLocal(agora);
  const limiteAntecedencia = new Date(
    agora.getTime() + antecedencia * 60_000,
  );
  const horarios = [];

  for (
    let deslocamento = 0;
    deslocamento <= limiteDiasFuturos;
    deslocamento += 1
  ) {
    const dataISO = adicionarDias(hojeISO, deslocamento);
    const chaveDia = CHAVES_DIA[diaDaSemana(dataISO)];
    const funcionamento = obterHorarioFuncionamento(config, chaveDia);

    if (!funcionamento?.inicio || !funcionamento?.fim) {
      continue;
    }

    const inicioExpediente = criarInstanteNaZona(
      dataISO,
      funcionamento.inicio,
    );
    const fimExpediente = criarInstanteNaZona(dataISO, funcionamento.fim);

    if (fimExpediente <= inicioExpediente) {
      throw new Error(
        `O expediente de ${chaveDia} termina antes de começar.`,
      );
    }

    let inicioSlot = new Date(inicioExpediente);

    if (dataISO === hojeISO && inicioSlot < limiteAntecedencia) {
      const passo = intervaloMinutos * 60_000;
      const tempoDesdeInicio =
        limiteAntecedencia.getTime() - inicioExpediente.getTime();
      const quantidadePassos = Math.max(0, Math.ceil(tempoDesdeInicio / passo));

      inicioSlot = new Date(
        inicioExpediente.getTime() + quantidadePassos * passo,
      );
    }

    while (
      inicioSlot.getTime() + duracaoMinutos * 60_000 <=
      fimExpediente.getTime()
    ) {
      const fimSlot = new Date(
        inicioSlot.getTime() + duracaoMinutos * 60_000,
      );

      if (inicioSlot >= limiteAntecedencia) {
        horarios.push({
          servico,
          profissional,
          data: formatarDataLocal(inicioSlot),
          horaInicio: formatarHoraLocal(inicioSlot),
          horaFim: formatarHoraLocal(fimSlot),
          inicioISO: inicioSlot.toISOString(),
          fimISO: fimSlot.toISOString(),
          timeZone: TIME_ZONE,
          diaSemana: chaveDia,
        });
      }

      inicioSlot = new Date(
        inicioSlot.getTime() + intervaloMinutos * 60_000,
      );
    }
  }

  return {
    horarios,
    calendarId: profissionalEncontrado.calendarId,
    timeZone: TIME_ZONE,
  };
}

function obterIntervaloDoEvento(evento) {
  if (evento.start?.dateTime && evento.end?.dateTime) {
    const inicio = Date.parse(evento.start.dateTime);
    const fim = Date.parse(evento.end.dateTime);

    return Number.isFinite(inicio) && Number.isFinite(fim)
      ? { inicio, fim }
      : null;
  }

  if (evento.start?.date && evento.end?.date) {
    try {
      return {
        inicio: criarInstanteNaZona(evento.start.date, "00:00").getTime(),
        fim: criarInstanteNaZona(evento.end.date, "00:00").getTime(),
      };
    } catch {
      return null;
    }
  }

  return null;
}

function temConflito(horario, eventos) {
  const inicioSlot = Date.parse(horario.inicioISO);
  const fimSlot = Date.parse(horario.fimISO);

  if (!Number.isFinite(inicioSlot) || !Number.isFinite(fimSlot)) {
    return true;
  }

  return eventos.some((evento) => {
    const intervalo = obterIntervaloDoEvento(evento);

    return (
      intervalo &&
      inicioSlot < intervalo.fim &&
      fimSlot > intervalo.inicio
    );
  });
}

function removerConflitos(horarios, eventos) {
  return horarios.filter((horario) => !temConflito(horario, eventos));
}

function atendePeriodo(horario, periodos) {
  if (!Array.isArray(periodos) || periodos.length === 0) {
    return true;
  }

  return periodos.includes(obterPeriodo(horario.horaInicio));
}

function atendeLimiteDeHora(horario, limite, comparador) {
  if (!limite) {
    return true;
  }

  const minutosHorario = horaParaMinutos(horario.horaInicio);
  const minutosLimite = horaParaMinutos(limite);

  return (
    minutosHorario !== null &&
    minutosLimite !== null &&
    comparador(minutosHorario, minutosLimite)
  );
}

function atendeHoraExata(horario, horaExata, toleranciaMinutos = 0) {
  if (!horaExata) {
    return true;
  }

  const minutosHorario = horaParaMinutos(horario.horaInicio);
  const minutosSolicitados = horaParaMinutos(horaExata);

  if (minutosHorario === null || minutosSolicitados === null) {
    return false;
  }

  return (
    Math.abs(minutosHorario - minutosSolicitados) <= toleranciaMinutos
  );
}

function atendeSolicitacao(horario, slotSolicitado) {
  if (horario.data !== slotSolicitado.data) {
    return false;
  }

  return (
    atendePeriodo(horario, slotSolicitado.periodos) &&
    atendeLimiteDeHora(
      horario,
      slotSolicitado.horaMin,
      (horarioMin, limiteMin) => horarioMin >= limiteMin,
    ) &&
    atendeLimiteDeHora(
      horario,
      slotSolicitado.horaMax,
      (horarioMin, limiteMin) => horarioMin <= limiteMin,
    ) &&
    atendeHoraExata(horario, slotSolicitado.horaExata)
  );
}

function filtrarPorSolicitacao(horarios, slotsSolicitados) {
  if (!Array.isArray(slotsSolicitados) || slotsSolicitados.length === 0) {
    return horarios;
  }

  return horarios.filter((horario) =>
    slotsSolicitados.some((slot) => atendeSolicitacao(horario, slot)),
  );
}

function processarDisponibilidade({
  config,
  servico,
  profissional,
  slotsSolicitados,
  eventosGoogleCalendar = [],
  dataReferencia = new Date(),
}) {
  const { horarios, calendarId, timeZone } = gerarHorariosPossiveis({
    config,
    servico,
    profissional,
    dataReferencia,
  });

  const horariosSemConflito = removerConflitos(
    horarios,
    eventosGoogleCalendar,
  );
  const horariosDisponiveis = filtrarPorSolicitacao(
    horariosSemConflito,
    slotsSolicitados,
  );
  const possuiDisponibilidade = horariosDisponiveis.length > 0;

  return {
    status: possuiDisponibilidade ? "ok" : "sem_horario",
    calendarId,
    timeZone,
    horariosDisponiveis,
    mensagemUsuario: possuiDisponibilidade
      ? `Encontrei ${horariosDisponiveis.length} horário(s) disponível(is).`
      : "Não encontrei horários disponíveis no período solicitado.",
  };
}

/*
 * Adaptação para nodes Code do n8n:
 *
 * const config = $node["configAgenda"].json;
 * const eventos = $items("Get Many").map((item) => item.json);
 * const slotsSolicitados = $node["Parser"].json.slots;
 *
 * const resultado = processarDisponibilidade({
 *   config,
 *   servico: $json.servico,
 *   profissional: $json.profissional,
 *   slotsSolicitados,
 *   eventosGoogleCalendar: eventos,
 * });
 *
 * return [{ json: resultado }];
 */
