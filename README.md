# SDR Inteligente e Agendamento

Case técnico de uma automação de atendimento via WhatsApp, responsável por receber leads, qualificar contatos, consultar disponibilidade e realizar agendamentos.

> Este repositório documenta um sistema desenvolvido para uma operação real. Credenciais, dados pessoais e informações do cliente foram removidos.

## Visão geral

A solução foi construída em n8n e integra:

- WhatsApp
- CRM
- OpenAI
- Redis
- Supabase
- Google Calendar

O agente conduz o atendimento, coleta informações do lead e utiliza ferramentas específicas para consultar e criar agendamentos.

![Visão geral do workflow](docs/images/fluxo-principal/01-visao-geral.png)

## Fluxo principal

### 1. Entrada e normalização

O fluxo recebe eventos da API do WhatsApp, ignora mensagens de grupos, normaliza o payload e verifica se houve intervenção humana.

![Entrada e normalização](docs/images/fluxo-principal/02-entrada-e-normalizacao.png)

### 2. Controle de usuário

O sistema identifica usuários existentes, cadastra novos contatos e possui uma rotina auxiliar para redefinição de contexto durante testes.

![Controle de usuário](docs/images/fluxo-principal/03-controle-de-usuario-e-reset.png)

### 3. Tratamento e consolidação das mensagens

Mensagens de texto, áudio e imagem são transformadas em uma entrada padronizada. O Redis é utilizado como buffer para agrupar mensagens enviadas em sequência.

![Tratamento e consolidação](docs/images/fluxo-principal/04-tratamento-e-consolidacao-de-mensagens.png)

### 4. Identificação de primeiro contato

O fluxo verifica se o usuário já existe, identifica mensagens provenientes de campanhas e controla o status atual do atendimento.

![Verificação e primeiro contato](docs/images/fluxo-principal/05-verificacao-e-primeiro-contato.png)

### 5. Preparação de contexto

Antes da execução do agente, o sistema carrega horário de funcionamento, data atual e variações de perguntas utilizadas na conversa.

![Preparação de contexto](docs/images/fluxo-principal/06-preparacao-de-contexto-do-agente.png)

### 6. Orquestração do agente

O agente utiliza um modelo da OpenAI, memória no Redis e ferramentas especializadas para consultar horários, criar agendamentos e atualizar informações no banco.

![Orquestração e formatação](docs/images/fluxo-principal/07-orquestracao-e-formatacao-do-agente.png)

### 7. Envio e notificações

A resposta é dividida em mensagens menores e enviada sequencialmente. Após o agendamento, o sistema também pode notificar responsáveis internos.

![Envio e notificações](docs/images/fluxo-principal/08-envio-e-notificacao-interna.png)

## Principais decisões técnicas

- Separação do sistema em workflows e subfluxos especializados.
- Uso da IA para interpretação e condução da conversa.
- Uso de código determinístico para regras de agenda e conflitos.
- Redis para memória e agrupamento de mensagens.
- Revalidação do horário antes da criação do evento.
- Persistência dos leads e agendamentos no Supabase.
- Integração com sistemas externos por APIs e webhooks.

## Tecnologias

`n8n` `JavaScript` `OpenAI` `Redis` `Supabase` `Google Calendar API` `Z-API` `ChatGuru`

## Status

O ambiente original dependia de serviços e credenciais de terceiros que não estão mais ativos. O projeto está sendo preservado como case técnico documental.
