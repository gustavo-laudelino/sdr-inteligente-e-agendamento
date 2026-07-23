# SDR Inteligente com Agendamento Automatizado

Case técnico de automação de atendimento, qualificação de leads e agendamento integrado ao Google Calendar.

> Este repositório apresenta a arquitetura, as decisões técnicas e os principais códigos de uma solução real desenvolvida com n8n. O ambiente original não está mais ativo e dados sensíveis foram removidos.

---

## Visão geral

O projeto foi desenvolvido para automatizar o primeiro atendimento de leads recebidos por WhatsApp.

A solução era responsável por:

- receber e normalizar mensagens;
- identificar novos contatos;
- manter o contexto da conversa;
- qualificar o lead por meio de um agente de IA;
- interpretar solicitações de datas e horários;
- consultar a disponibilidade dos profissionais;
- criar compromissos no Google Calendar;
- registrar os agendamentos no Supabase;
- enviar respostas sequenciais pelo WhatsApp;
- registrar informações no CRM.

A IA era utilizada para interpretar a linguagem do usuário e conduzir o atendimento. Regras críticas de datas, disponibilidade e conflitos eram processadas por códigos determinísticos em JavaScript.

---

## Tecnologias

`n8n` · `JavaScript` · `OpenAI` · `Redis` · `Supabase` · `Google Calendar API` · `Z-API` · `ChatGuru`

---

## Arquitetura simplificada

```text
CRM / WhatsApp
      │
      ▼
Webhook e normalização
      │
      ▼
Controle de usuário e mensagens
      │
      ▼
Agente de IA
      │
      ├── Qualificação do lead
      ├── Consulta de disponibilidade
      ├── Criação de agendamento
      └── Atualização de contexto
      │
      ▼
Google Calendar + Supabase
      │
      ▼
Resposta pelo WhatsApp
```

---

# Fluxo principal

O fluxo principal centralizava a entrada das mensagens e a orquestração dos diferentes serviços.

![Visão geral do fluxo principal](docs/images/fluxo-principal/01-visao-geral.png)

## Entrada e normalização

As mensagens podiam chegar em diferentes formatos, como texto, áudio e imagem.

O fluxo identificava o tipo da mensagem e transformava o conteúdo em uma estrutura padronizada antes de continuar o processamento.

![Entrada e normalização](docs/images/fluxo-principal/02-entrada-e-normalizacao.png)

## Controle de usuário

O fluxo consultava o estado do contato e controlava situações como:

- primeiro atendimento;
- usuário já conhecido;
- retomada de conversa;
- reinicialização do contexto;
- bloqueio temporário de mensagens duplicadas.

![Controle de usuário](docs/images/fluxo-principal/03-controle-de-usuario-e-reset.png)

## Consolidação de mensagens

Mensagens enviadas em sequência eram armazenadas temporariamente no Redis.

Após um pequeno intervalo, o conteúdo era consolidado antes de ser enviado ao agente, evitando múltiplas respostas para mensagens fragmentadas.

![Consolidação de mensagens](docs/images/fluxo-principal/04-tratamento-e-consolidacao-de-mensagens.png)

## Identificação do primeiro contato

O sistema verificava se o lead estava iniciando uma nova conversa ou continuando um atendimento anterior.

Essa informação alterava o contexto e as instruções enviadas ao agente.

![Verificação do primeiro contato](docs/images/fluxo-principal/05-verificacao-e-primeiro-contato.png)

## Preparação do contexto

Antes da execução do agente, o fluxo reunia informações como:

- mensagem consolidada;
- dados do contato;
- resumo anterior;
- status do atendimento;
- histórico necessário;
- informações de qualificação.

![Preparação do contexto](docs/images/fluxo-principal/06-preparacao-de-contexto-do-agente.png)

## Orquestração do agente

O agente podia utilizar ferramentas internas para:

- consultar horários;
- criar agendamentos;
- atualizar o status do atendimento;
- atualizar o resumo da conversa;
- recuperar dados já conhecidos do lead.

![Orquestração do agente](docs/images/fluxo-principal/07-orquestracao-e-formatacao-do-agente.png)

## Envio da resposta

A resposta final era formatada e dividida em mensagens menores.

Os blocos eram enviados sequencialmente pelo WhatsApp para produzir uma conversa mais natural e evitar mensagens excessivamente longas.

![Envio e notificação](docs/images/fluxo-principal/08-envio-e-notificacao-interna.png)

---

# Consulta de horários

O subfluxo de consulta de horários recebia:

- serviço solicitado;
- profissional;
- mensagem do usuário;
- configurações da agenda.

## Interpretação e validação

A IA normalizava a solicitação do usuário, mas não decidia diretamente quais horários estavam disponíveis.

Um parser JavaScript transformava expressões como:

```text
terça-feira depois das 15h
```

Em uma estrutura semelhante a:

```json
{
  "data": "2026-07-28",
  "horaMin": "15:00"
}
```

Depois disso, o fluxo validava:

- serviço;
- profissional;
- duração;
- dias de funcionamento;
- período solicitado;
- limites de horário.

![Entrada, interpretação e validação](docs/images/consulta-horarios/01-entrada-interpretacao-e-validacao.png)

## Geração e filtragem

O fluxo gerava os horários possíveis de acordo com:

- duração do serviço;
- intervalo entre agendamentos;
- antecedência mínima;
- jornada de trabalho;
- limite de dias futuros.

Em seguida:

1. consultava os eventos existentes no Google Calendar;
2. removia os horários com conflito;
3. aplicava os filtros solicitados pelo usuário;
4. formatava as sugestões para o agente.

![Geração, consulta e filtragem](docs/images/consulta-horarios/02-geracao-consulta-e-filtragem.png)

### Decisão técnica

A IA era responsável por normalizar a linguagem natural.

As regras críticas de datas, períodos, duração e conflitos eram processadas por JavaScript determinístico.

Essa separação reduzia respostas imprevisíveis e evitava que o modelo inventasse horários.

---

# Criação do agendamento

O fluxo de criação recebia os dados selecionados durante o atendimento:

- cliente;
- telefone;
- serviço;
- profissional;
- data e hora.

![Validação, criação e persistência](docs/images/agendamento/01-validacao-criacao-e-persistencia.png)

## Revalidação da disponibilidade

Antes de criar o compromisso, o sistema consultava novamente o Google Calendar.

Essa verificação evitava que um horário apresentado anteriormente fosse reservado por outra pessoa antes da confirmação do usuário.

Caso houvesse conflito, o agendamento não era criado e o sistema retornava que o horário não estava mais disponível.

## Criação e persistência

Quando o horário continuava disponível, o fluxo:

1. selecionava o calendário do profissional;
2. buscava os dados do lead;
3. criava o evento no Google Calendar;
4. recuperava o identificador do evento;
5. registrava o agendamento no Supabase.

O registro armazenava informações como:

- início e término;
- cliente;
- telefone;
- serviço;
- profissional;
- identificador do evento;
- status do agendamento.

---

# Cancelamento de agendamentos

O fluxo de cancelamento foi desenvolvido e validado, mas não foi habilitado na jornada principal.

![Fluxo de cancelamento](docs/images/cancelamento/01-fluxo-cancelamento.png)

O subfluxo aceitava dois cenários.

## Cancelamento direto

Quando o identificador do evento estava disponível, o sistema:

1. excluía o compromisso no Google Calendar;
2. atualizava o status para `cancelado` no Supabase.

## Localização do agendamento

Quando o identificador não estava disponível, o fluxo:

1. consultava os próximos eventos do profissional;
2. localizava os compromissos relacionados ao cliente;
3. recuperava os dados necessários para o cancelamento.

## Limitação da jornada

O agente principal era encerrado após a confirmação do agendamento.

Para habilitar o cancelamento no atendimento principal seria necessário implementar uma estratégia de retomada da conversa ou um fluxo independente de pós-agendamento.

---

# Integração com CRM

O ChatGuru enviava os dados do lead por meio de um webhook.

O fluxo normalizava campos como:

- nome;
- telefone;
- mensagem;
- responsável;
- campanha;
- origem;
- identificador do chat;
- link do atendimento.

Os dados eram padronizados antes de serem persistidos ou enviados para as próximas etapas.

---

# Códigos selecionados

Os arquivos abaixo foram extraídos de nodes JavaScript utilizados no n8n.

Eles foram sanitizados e organizados para facilitar a leitura fora do canvas do workflow.

## Parser de agendamento

Responsável por interpretar:

- hoje;
- amanhã;
- depois de amanhã;
- dias da semana;
- datas numéricas;
- datas por extenso;
- manhã, tarde e noite;
- hora mínima;
- hora máxima;
- hora exata.

[Ver código do parser](docs/codigos/parser-de-agendamento.js)

### Exemplo

```text
Entrada:
sexta-feira depois das 15h
```

```json
{
  "data": "2026-07-24",
  "horaMin": "15:00"
}
```

---

## Disponibilidade e conflitos

Responsável por:

- gerar os slots possíveis;
- respeitar a duração do serviço;
- considerar a antecedência mínima;
- consultar eventos existentes;
- detectar sobreposição de horários;
- aplicar os filtros produzidos pelo parser.

[Ver código de disponibilidade](docs/codigos/disponibilidade-e-conflitos.js)

### Regra de conflito

Um horário era considerado ocupado quando:

```text
início do novo horário < fim do evento existente
e
fim do novo horário > início do evento existente
```

---

## Normalização do webhook

Responsável por limpar e padronizar os dados recebidos do CRM.

Entre os tratamentos realizados estavam:

- remoção de espaços duplicados;
- normalização de nomes;
- padronização de telefones;
- aplicação de valores alternativos;
- extração de metadados do lead.

[Ver código de normalização](docs/codigos/normalizacao-de-webhook.js)

---

# Principais decisões técnicas

## IA combinada com regras determinísticas

A IA era utilizada onde existia ambiguidade linguística.

JavaScript era utilizado nas regras que precisavam ser previsíveis, como:

- cálculo de datas;
- geração de horários;
- duração dos serviços;
- conflitos;
- limites de funcionamento;
- persistência de dados.

## Revalidação antes do agendamento

A disponibilidade era consultada novamente imediatamente antes da criação do evento.

Isso reduzia o risco de dois clientes reservarem o mesmo horário.

## Redis para consolidação de mensagens

O Redis permitia aguardar mensagens enviadas em sequência e agrupá-las antes do processamento.

Isso evitava que cada fragmento gerasse uma nova execução do agente.

## Persistência independente do calendário

O evento era criado no Google Calendar, mas também registrado no Supabase.

Essa separação permitia manter:

- histórico;
- status;
- dados do cliente;
- relacionamento com o identificador do evento.

## Fluxos separados por responsabilidade

Consulta, criação e cancelamento foram implementados como subfluxos independentes.

Isso reduzia o acoplamento do fluxo principal e facilitava a manutenção.

---

# O que este case demonstra

- automação de processos com n8n;
- integração com APIs externas;
- tratamento de webhooks;
- uso de Redis;
- persistência com Supabase;
- integração com Google Calendar;
- construção de agentes com ferramentas;
- processamento de linguagem natural;
- implementação de regras de negócio em JavaScript;
- prevenção de conflitos de agendamento;
- separação entre IA e lógica determinística;
- documentação de uma solução existente.

---

# Status do projeto

Este repositório é um case técnico documental.

O ambiente original dependia de contas, credenciais e serviços externos que não estão mais ativos. Por esse motivo, o projeto não é apresentado como uma aplicação pronta para execução.

Os materiais publicados foram selecionados para demonstrar:

- arquitetura;
- fluxo de dados;
- decisões técnicas;
- principais regras;
- códigos relevantes.

Dados de clientes, credenciais, identificadores e informações comerciais foram removidos.

---

# Possíveis evoluções

Em uma nova implementação, as principais melhorias seriam:

- mover as regras de negócio para um backend dedicado;
- utilizar o n8n principalmente como orquestrador;
- criar testes automatizados para datas e disponibilidade;
- centralizar configurações de profissionais e serviços;
- adicionar observabilidade e logs estruturados;
- implementar retomada de conversa após o agendamento;
- habilitar cancelamento e reagendamento na jornada principal;
- reduzir o acoplamento entre os nodes e suas estruturas internas.

---

## Autor

**Gustavo Laudelino**
