/**
 * Geração e filtragem de disponibilidade.
 *
 * Origem:
 * - Código extraído de nodes Code do n8n.
 * - Organizado para documentação e leitura fora do workflow.
 *
 * Responsabilidades:
 * - Gerar horários possíveis conforme a configuração da agenda.
 * - Respeitar duração do serviço e antecedência mínima.
 * - Remover horários que conflitam com eventos existentes.
 * - Aplicar filtros de data, período e horário.
 */

"use strict";

const TIME_ZONE = "America/Sao_Paulo";

const DIAS_SEMANA = {
  domingo: "domingo",
  "segunda-feira": "segunda",
  segunda: "segunda",
  "terça-feira": "terca",
  terça: "terca",
  "terca-feira": "terca",
  terca: "terca",
  "quarta-feira": "quarta",
  quarta: "quarta",
  "quinta-feira": "quinta",
  quinta: "quinta",
  "sexta-feira": "sexta",
  sexta: "sexta",
  sábado: "sabado",
  sabado: "sabado",
};

function horaParaMinutos(hora) {
  if (!hora) {
    return null;
  }

  const [horas, minutos = 0] = String(hora)
    .split(":")
    .map(Number);

  if (
    !Number.isInteger(horas) ||
    !Number.isInteger(minutos)
  ) {
    return null;
  }

  return horas * 60 + minutos;
}

function formatarDataLocal(data) {
  return data
    .toLocaleDateString("pt-BR", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .split("/")
    .reverse()
    .join("-");
}

function formatarHoraLocal(data) {
  return data
    .toLocaleTimeString("pt-BR", {
      timeZone: TIME_ZONE,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    })
    .slice(0, 5);
}

function obterDiaDaSemana(data) {
  const nomeDia = data
    .toLocaleDateString("pt-BR", {
      timeZone: TIME_ZONE,
      weekday: "long",
    })
    .toLowerCase();

  return DIAS_SEMANA[nomeDia];
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

function encontrarProfissional(
  profissionais,
  nomeProfissional,
) {
  return profissionais.find(
    (profissional) =>
      String(profissional.nome)
        .toLowerCase()
        .trim() ===
      String(nomeProfissional)
        .toLowerCase()
        .trim(),
  );
}

function validarConfiguracao(
  config,
  servico,
  profissional,
) {
  const configuracaoServico =
    config.servicos?.[servico];

  if (
    !configuracaoServico ||
    !configuracaoServico.duracaoMinutos
  ) {
    throw new Error(
      `Serviço '${servico}' não possui duração configurada.`,
    );
  }

  const profissionalEncontrado =
    encontrarProfissional(
      config.profissionais ?? [],
      profissional,
    );

  if (!profissionalEncontrado) {
    throw new Error(
      `Profissional '${profissional}' não encontrado.`,
    );
  }

  return {
    configuracaoServico,
    profissionalEncontrado,
  };
}

/**
 * Gera os slots possíveis antes de consultar
 * os eventos existentes no Google Calendar.
 */
function gerarHorariosPossiveis({
  config,
  servico,
  profissional,
  dataReferencia = new Date(),
  antecedenciaMinutos = 20,
}) {
  const {
    configuracaoServico,
    profissionalEncontrado,
  } = validarConfiguracao(
    config,
    servico,
    profissional,
  );

  const duracaoMinutos = Number(
    configuracaoServico.duracaoMinutos,
  );

  let intervaloMinutos = Number(
    config.intervaloMinimoEntreAgendamentosMin,
  );

  if (
    !Number.isFinite(intervaloMinutos) ||
    intervaloMinutos <= 0
  ) {
    intervaloMinutos = 10;
  }

  const maxDiasAgendamento =
    Number(config.maxDiasAgendamento) || 7;

  const agora = new Date(dataReferencia);

  const limiteAntecedencia = new Date(
    agora.getTime() +
      antecedenciaMinutos * 60_000,
  );

  const horarios = [];

  for (
    let deslocamento = 0;
    deslocamento <= maxDiasAgendamento;
    deslocamento += 1
  ) {
    const dataAtual = new Date(agora);

    dataAtual.setDate(
      dataAtual.getDate() + deslocamento,
    );

    const diaSemana =
      obterDiaDaSemana(dataAtual);

    const horarioFuncionamento =
      config.diasFuncionamento?.[diaSemana];

    if (
      !horarioFuncionamento?.inicio ||
      !horarioFuncionamento?.fim
    ) {
      continue;
    }

    const [
      horaInicio,
      minutoInicio,
    ] = horarioFuncionamento.inicio
      .split(":")
      .map(Number);

    const [
      horaFim,
      minutoFim,
    ] = horarioFuncionamento.fim
      .split(":")
      .map(Number);

    const inicioExpediente =
      new Date(dataAtual);

    inicioExpediente.setHours(
      horaInicio,
      minutoInicio,
      0,
      0,
    );

    const fimExpediente =
      new Date(dataAtual);

    fimExpediente.setHours(
      horaFim,
      minutoFim,
      0,
      0,
    );

    let inicioSlot =
      new Date(inicioExpediente);

    const hoje = deslocamento === 0;

    if (
      hoje &&
      inicioSlot < limiteAntecedencia
    ) {
      const passoEmMilissegundos =
        intervaloMinutos * 60_000;

      const horarioAlinhado = Math.ceil(
        limiteAntecedencia.getTime() /
          passoEmMilissegundos,
      ) * passoEmMilissegundos;

      inicioSlot =
        new Date(horarioAlinhado);
    }

    while (
      inicioSlot.getTime() +
        duracaoMinutos * 60_000 <=
      fimExpediente.getTime()
    ) {
      const fimSlot = new Date(
        inicioSlot.getTime() +
          duracaoMinutos * 60_000,
      );

      const respeitaAntecedencia =
        !hoje ||
        inicioSlot >= limiteAntecedencia;

      if (respeitaAntecedencia) {
        horarios.push({
          servico,
          profissional,

          data:
            formatarDataLocal(inicioSlot),

          horaInicio:
            formatarHoraLocal(inicioSlot),

          horaFim:
            formatarHoraLocal(fimSlot),

          inicioISO:
            inicioSlot.toISOString(),

          fimISO:
            fimSlot.toISOString(),

          diaSemana,
        });
      }

      inicioSlot = new Date(
        inicioSlot.getTime() +
          intervaloMinutos * 60_000,
      );
    }
  }

  return {
    horarios,
    calendarId:
      profissionalEncontrado.calendarId,
  };
}

/**
 * Existe conflito quando:
 *
 * inicioSlot < fimEvento
 * e
 * fimSlot > inicioEvento
 */
function temConflito(
  horario,
  eventos,
) {
  const inicioSlot = Date.parse(
    horario.inicioISO,
  );

  const fimSlot = Date.parse(
    horario.fimISO,
  );

  return eventos.some((evento) => {
    const inicioEvento =
      evento.start?.dateTime;

    const fimEvento =
      evento.end?.dateTime;

    if (
      !inicioEvento ||
      !fimEvento
    ) {
      return false;
    }

    const inicioEventoMs =
      Date.parse(inicioEvento);

    const fimEventoMs =
      Date.parse(fimEvento);

    return (
      inicioSlot < fimEventoMs &&
      fimSlot > inicioEventoMs
    );
  });
}

function removerConflitos(
  horarios,
  eventos,
) {
  return horarios.filter(
    (horario) =>
      !temConflito(
        horario,
        eventos,
      ),
  );
}

function atendePeriodo(
  horario,
  periodos,
) {
  if (
    !periodos ||
    periodos.length === 0
  ) {
    return true;
  }

  const periodoHorario =
    obterPeriodo(horario.horaInicio);

  return periodos.includes(
    periodoHorario,
  );
}

function atendeHoraMinima(
  horario,
  horaMinima,
) {
  if (!horaMinima) {
    return true;
  }

  return (
    horaParaMinutos(
      horario.horaInicio,
    ) >=
    horaParaMinutos(horaMinima)
  );
}

function atendeHoraMaxima(
  horario,
  horaMaxima,
) {
  if (!horaMaxima) {
    return true;
  }

  return (
    horaParaMinutos(
      horario.horaInicio,
    ) <=
    horaParaMinutos(horaMaxima)
  );
}

function atendeHoraExata(
  horario,
  horaExata,
  toleranciaMinutos = 5,
) {
  if (!horaExata) {
    return true;
  }

  const minutosHorario =
    horaParaMinutos(
      horario.horaInicio,
    );

  const minutosSolicitados =
    horaParaMinutos(horaExata);

  if (
    minutosHorario === null ||
    minutosSolicitados === null
  ) {
    return false;
  }

  return (
    Math.abs(
      minutosHorario -
        minutosSolicitados,
    ) <= toleranciaMinutos
  );
}

function atendeSolicitacao(
  horario,
  slotSolicitado,
) {
  if (
    horario.data !==
    slotSolicitado.data
  ) {
    return false;
  }

  const periodoValido =
    atendePeriodo(
      horario,
      slotSolicitado.periodos,
    );

  const horaMinimaValida =
    atendeHoraMinima(
      horario,
      slotSolicitado.horaMin,
    );

  const horaMaximaValida =
    atendeHoraMaxima(
      horario,
      slotSolicitado.horaMax,
    );

  const horaExataValida =
    atendeHoraExata(
      horario,
      slotSolicitado.horaExata,
    );

  return (
    periodoValido &&
    horaMinimaValida &&
    horaMaximaValida &&
    horaExataValida
  );
}

/**
 * Aplica aos horários disponíveis os slots
 * gerados pelo parser de agendamento.
 *
 * Exemplo de slot:
 *
 * {
 *   data: "2026-07-24",
 *   periodos: ["tarde"],
 *   horaMin: "15:00"
 * }
 */
function filtrarPorSolicitacao(
  horarios,
  slotsSolicitados,
) {
  if (
    !Array.isArray(slotsSolicitados) ||
    slotsSolicitados.length === 0
  ) {
    return horarios;
  }

  return horarios.filter(
    (horario) =>
      slotsSolicitados.some(
        (slotSolicitado) =>
          atendeSolicitacao(
            horario,
            slotSolicitado,
          ),
      ),
  );
}

function processarDisponibilidade({
  config,
  servico,
  profissional,
  slotsSolicitados,
  eventosGoogleCalendar,
  dataReferencia = new Date(),
}) {
  const {
    horarios,
    calendarId,
  } = gerarHorariosPossiveis({
    config,
    servico,
    profissional,
    dataReferencia,
  });

  const horariosSemConflito =
    removerConflitos(
      horarios,
      eventosGoogleCalendar ?? [],
    );

  const horariosDisponiveis =
    filtrarPorSolicitacao(
      horariosSemConflito,
      slotsSolicitados,
    );

  const possuiDisponibilidade =
    horariosDisponiveis.length > 0;

  return {
    status: possuiDisponibilidade
      ? "ok"
      : "sem_horario",

    calendarId,

    horariosDisponiveis,

    mensagemUsuario:
      possuiDisponibilidade
        ? `Encontrei ${horariosDisponiveis.length} horário(s) disponível(is).`
        : "Não encontrei horários disponíveis no período solicitado.",
  };
}

/*
 * Exemplo de adaptação para nodes Code do n8n:
 *
 * const config =
 *   $node["configAgenda"].json;
 *
 * const eventos =
 *   $items("Get Many")
 *     .map((item) => item.json);
 *
 * const slotsSolicitados =
 *   $node["Parser"].json.slots;
 *
 * const resultado =
 *   processarDisponibilidade({
 *     config,
 *     servico: $json.servico,
 *     profissional: $json.profissional,
 *     slotsSolicitados,
 *     eventosGoogleCalendar: eventos,
 *   });
 *
 * return [
 *   {
 *     json: resultado,
 *   },
 * ];
 */
