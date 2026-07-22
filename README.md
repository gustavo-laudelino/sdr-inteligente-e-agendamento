# SDR Inteligente e Agendamento

Case técnico de uma automação de SDR desenvolvida para receber leads via WhatsApp, conduzir a qualificação do contato, consultar a disponibilidade de profissionais e realizar agendamentos.

> Este repositório documenta uma solução desenvolvida para uma operação real. Credenciais, dados pessoais e informações específicas do cliente foram removidos.

## Visão geral

A solução utiliza um agente de IA para conduzir o atendimento, coletar informações do lead e acionar ferramentas especializadas conforme o andamento da conversa.

O fluxo integra:

- WhatsApp;
- CRM;
- OpenAI;
- Redis;
- Supabase;
- Google Calendar;
- APIs e webhooks;
- códigos JavaScript para regras de negócio.

### Arquitetura simplificada

```text
WhatsApp / CRM
      ↓
Webhook e normalização
      ↓
Tratamento e agrupamento das mensagens
      ↓
Agente de atendimento com IA
      ↓
Qualificação do lead
      ↓
Consulta de disponibilidade
      ↓
Criação do agendamento
      ↓
Persistência e notificações internas
```

## Tecnologias utilizadas

`n8n` `JavaScript` `OpenAI` `Redis` `Supabase` `Google Calendar API` `Z-API` `ChatGuru`

---

# Workflow principal

O workflow principal concentra a recepção das mensagens, o controle dos usuários, o tratamento de diferentes formatos de entrada e a orquestração do agente de atendimento.

## Visão geral do workflow

A automação foi dividida em módulos com responsabilidades específicas, facilitando a manutenção e a compreensão do fluxo.

![Visão geral do workflow](docs/images/fluxo-principal/01-visao-geral.png)

## 1. Entrada e normalização

O fluxo recebe eventos da API do WhatsApp e realiza o processamento inicial da mensagem.

Nesta etapa, o sistema:

- recebe o webhook;
- ignora mensagens provenientes de grupos;
- normaliza o payload recebido;
- consulta informações complementares no CRM;
- converte os dados para variáveis padronizadas;
- verifica se houve intervenção humana no atendimento.

![Entrada e normalização](docs/images/fluxo-principal/02-entrada-e-normalizacao.png)

## 2. Controle e cadastro do usuário

O sistema consulta o banco de dados pelo número de telefone para identificar se o contato já existe.

Dependendo do resultado, o fluxo:

- atualiza o status de um usuário existente;
- cadastra um novo usuário;
- mantém uma rotina auxiliar para redefinir o contexto durante testes.

![Controle de usuário](docs/images/fluxo-principal/03-controle-de-usuario-e-reset.png)

## 3. Tratamento e consolidação das mensagens

A automação aceita diferentes tipos de mensagem:

- texto;
- áudio;
- imagem;
- formatos não suportados.

Áudios são baixados e transcritos, imagens são analisadas e todos os formatos são transformados em uma estrutura textual padronizada.

O Redis é utilizado como buffer temporário para agrupar mensagens enviadas em sequência antes que o agente processe o conteúdo.

![Tratamento e consolidação](docs/images/fluxo-principal/04-tratamento-e-consolidacao-de-mensagens.png)

## 4. Verificação e identificação de primeiro contato

Antes de iniciar o atendimento automatizado, o fluxo verifica:

- se o usuário já está cadastrado;
- se a mensagem representa um primeiro contato;
- se um novo lead deve ser criado;
- se o atendimento já está agendado ou sendo conduzido por uma pessoa.

Essa verificação evita que o agente reinicie conversas que já foram concluídas ou transferidas para atendimento humano.

![Verificação e primeiro contato](docs/images/fluxo-principal/05-verificacao-e-primeiro-contato.png)

## 5. Preparação de contexto para o agente

Antes da execução do agente, o sistema prepara informações necessárias para a conversa.

Entre os dados carregados estão:

- horário de funcionamento;
- data e hora atuais;
- variações de perguntas utilizadas na qualificação.

![Preparação de contexto](docs/images/fluxo-principal/06-preparacao-de-contexto-do-agente.png)

## 6. Orquestração e formatação da resposta

O agente utiliza:

- modelo de linguagem da OpenAI;
- memória de conversa no Redis;
- ferramentas para consultar e atualizar dados;
- ferramentas de consulta e criação de agendamentos;
- atualização do status e do resumo do atendimento.

A resposta gerada passa por uma etapa adicional de validação estrutural. Caso o formato esteja incorreto, o sistema tenta corrigir a saída antes do envio.

![Orquestração e formatação](docs/images/fluxo-principal/07-orquestracao-e-formatacao-do-agente.png)

## 7. Envio e notificações internas

A resposta do agente é dividida em mensagens menores e enviada sequencialmente pelo WhatsApp.

O intervalo entre os envios torna a conversa mais natural e evita disparos simultâneos.

Após a conclusão de um agendamento, o sistema também pode:

- buscar o resumo do atendimento;
- notificar o profissional responsável;
- enviar informações para um grupo interno.

![Envio e notificações](docs/images/fluxo-principal/08-envio-e-notificacao-interna.png)

---

# Consulta inteligente de horários

O agente principal delega a busca por disponibilidade para um subfluxo especializado.

Esse módulo interpreta a solicitação do usuário, aplica as regras de funcionamento da agenda, consulta os eventos existentes e retorna sugestões compatíveis.

## 1. Entrada, interpretação e validação

O subfluxo recebe:

- serviço solicitado;
- profissional;
- mensagem do usuário;
- configurações da agenda.

A IA é utilizada para normalizar expressões em linguagem natural. Em seguida, um parser em JavaScript converte datas, períodos e limites de horário para uma estrutura determinística.

Exemplo de solicitação:

```text
terça-feira depois das 15h
```

Exemplo de estrutura gerada:

```json
{
  "data": "2026-07-28",
  "horaMin": "15:00"
}
```

A separação entre IA e código determinístico foi utilizada para evitar que regras críticas de agenda dependessem exclusivamente da resposta do modelo.

![Entrada, interpretação e validação](docs/images/consulta-horarios/01-entrada-interpretacao-e-validacao.png)

## 2. Geração, consulta e filtragem

Após interpretar a solicitação, o sistema:

1. valida o serviço e o profissional;
2. gera os horários possíveis conforme expediente e duração do serviço;
3. normaliza a janela de consulta;
4. valida o identificador do calendário;
5. consulta os eventos no Google Calendar;
6. remove slots que apresentam conflito;
7. filtra os horários conforme a preferência informada;
8. formata as sugestões finais.

![Geração, consulta e filtragem](docs/images/consulta-horarios/02-geracao-consulta-e-filtragem.png)

### Exemplo de funcionamento

```text
Solicitação:
"Tenho disponibilidade amanhã à tarde, depois das 14h."

Processamento:
- converte "amanhã" para uma data absoluta;
- identifica o período da tarde;
- define 14:00 como horário mínimo;
- gera os slots possíveis;
- consulta os compromissos existentes;
- remove conflitos;
- retorna apenas horários compatíveis.
```

---

# Principais decisões técnicas

## Uso combinado de IA e regras determinísticas

A IA foi utilizada para interpretar e normalizar a linguagem do usuário.

As regras críticas foram implementadas em JavaScript, incluindo:

- cálculo de datas;
- definição de períodos;
- limites mínimos e máximos de horário;
- geração dos slots;
- validação do expediente;
- detecção de conflitos;
- seleção das sugestões.

## Buffer de mensagens com Redis

Mensagens enviadas em sequência são agrupadas antes do processamento.

Isso evita que frases como:

```text
Olá
Queria marcar uma reunião
Pode ser amanhã à tarde
```

sejam processadas como três solicitações isoladas.

## Revalidação antes do agendamento

O horário é consultado novamente antes da criação do evento.

Essa etapa reduz o risco de conflito quando duas pessoas tentam selecionar um mesmo horário em um intervalo curto.

## Separação em subfluxos

As responsabilidades foram divididas entre:

- atendimento principal;
- consulta de disponibilidade;
- criação do agendamento;
- persistência;
- notificações;
- cancelamento em fase de protótipo.

## Persistência de dados

O Supabase foi utilizado para armazenar:

- leads;
- status do atendimento;
- identificadores dos eventos;
- profissionais;
- serviços;
- datas e horários;
- resumos das conversas.

---

# O que este case demonstra

Este projeto envolveu:

- levantamento de regras de negócio;
- integração com APIs externas;
- tratamento de webhooks;
- manipulação de JSON;
- desenvolvimento em JavaScript;
- tratamento de datas e fusos horários;
- persistência de dados;
- controle de estado da conversa;
- uso de Redis como memória e buffer;
- integração com Google Calendar;
- uso de IA com ferramentas especializadas;
- prevenção de conflitos de agenda;
- modularização de workflows.

---

# Status do projeto

O ambiente original dependia de serviços, números de WhatsApp e credenciais de terceiros que não estão mais ativos.

Por esse motivo, o projeto está sendo preservado como um **case técnico documental**, contendo:

- arquitetura;
- workflows organizados;
- decisões técnicas;
- imagens dos módulos;
- exemplos de entrada e saída;
- trechos de código sanitizados.

O objetivo deste repositório não é disponibilizar uma aplicação pronta para execução, mas documentar a solução construída e os problemas técnicos resolvidos.

---

# Próximas etapas da documentação

- [x] Documentar o workflow principal
- [x] Documentar a consulta de horários
- [ ] Documentar a criação do agendamento
- [ ] Documentar a integração com o CRM
- [ ] Documentar o protótipo de cancelamento
- [ ] Adicionar trechos sanitizados de JavaScript
- [ ] Adicionar workflow sanitizado para consulta
- [ ] Adicionar diagrama geral da arquitetura
