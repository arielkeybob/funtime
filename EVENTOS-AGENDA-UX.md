# Eventos — agenda e revisão de UX para a linha 2.1.x

Proposta de 09/09/2026. Complementa EVENTOS-PLANEJAMENTO.md. Implementação local autorizada em seguida pelo usuário e concluída para avaliação. Estado e escolhas adotadas em DEVELOPMENT.md, seção Implementação local — agenda e automações. O texto abaixo preserva o planejamento. O usuário publicou manualmente 3bcfff7 com o recurso inicial; a identificação interna está sendo alinhada localmente para 2.1.0.

## 1. Diagnóstico da tela atual

Cada evento ocupa um card grande com quatro ações permanentes. O problema não é a quantidade de eventos, mas repetir controles de detalhes na lista. Com oito eventos, a rolagem já exige localizar repetidamente nome, período e ações de exclusão. Há pouca distinção entre encontrar um evento e editá-lo. Excluir é uma ação excepcional com destaque excessivo.

Proposta: a aba Evento vira uma agenda compacta; cada linha abre uma tela de detalhes. Evitar calendário mensal como padrão: ele desperdiça espaço para quem usa aos fins de semana e comporta mal festas atravessando meia-noite.

## 2. Estrutura visual proposta

Topo: título “Eventos” e ação “+ Novo”. Menu inferior continua fixo: Home, Histórico, Evento, Configurações.

Um único bloco compacto fixo no começo do conteúdo destaca o evento em andamento, quando existir: nome, início, quantidade de registros e “Abrir”. O destaque não ocupa uma tela inteira. Não repetir esse item na lista.

Abaixo, duas abas locais com rótulos: **Próximos** e **Anteriores**. No primeiro acesso, Próximos se houver agendamentos, caso contrário Anteriores; sem itens, estado vazio com Criar evento. Manter a seleção durante a navegação atual, sem mudar de aba sozinho.

| Linha de evento | Conteúdo |
| --- | --- |
| Agendado | Nome; data e hora; início manual/automático; seta para detalhes |
| Horário de início chegou, modo manual | Nome; “Aguardando início”; ação Iniciar nos detalhes |
| Encerrado | Nome; data/período; número de registros; seta para detalhes |
| Encerrado automaticamente | Mesma linha, com indicação discreta “Automático” |
| Agendamento expirado/cancelado | Identificação explícita, sem misturar com evento frequentado |

Agrupar listas por mês/ano, próximos em ordem crescente e anteriores em ordem decrescente. Linhas de aproximadamente 76–92 px, nome com até duas linhas; truncamento visual não altera o nome salvo. Busca por nome e filtro de mês recolhíveis; não mostrar vários campos vazios em listas pequenas. Carregar blocos de 20 itens com “Mostrar mais”, mantendo filtro e posição ao voltar dos detalhes. Não depender só de cor para o status.

Detalhes: nome, status, período, origem do encerramento e registros resumidos por bebida. Ação principal varia por estado. Menu “Mais opções” contém editar, reabrir, cancelar agendamento/excluir agrupamento. Exclusão não aparece em vermelho em cada linha. “Ver registros” leva ao Histórico filtrado; Voltar restaura evento/filtro/posição. Histórico continua sendo a linha do tempo das doses; Eventos é o índice das ocasiões, sem duplicar toda a interface.

## 3. Cadastro e estados

Separar intenção de início efetivo:

- **Iniciar agora:** nome e confirmação do início; fim opcional.
- **Agendar:** data/hora futura, opção “Iniciar automaticamente” e fim opcional. Padrão recomendado: início manual, para não atribuir intenção de participação sem escolha.
- Evento agendado não neutraliza cards, não recebe doses e não ocupa a vaga do evento ativo.
- Chegar à data, no modo manual, não inicia: passa a Aguardando início. Iniciar pode ocorrer antes ou depois do agendado, com confirmação do horário efetivo e prévia de registros sem evento que serão abrangidos.
- Permitir vários agendamentos e no máximo um evento efetivamente em andamento.
- Alterar uma agenda não é corrigir o passado. Preservar horário planejado separadamente do início real.
- Reabrir deve ser explícito, respeitar conflitos e cancelar o marcador de encerramento anterior; manter a razão anterior no registro de transições se esse histórico de alterações for adotado.

Fim opcional: usar rótulo “Encerrar automaticamente em”, com explicação. Um simples campo chamado “Final previsto” não deve silenciosamente funcionar como automação. A forma recomendada é um toggle de encerramento programado que revela data/hora, preservando intenção clara.

## 4. Aviso na Home

Para evento manual, mostrar um banner interno ao entrar na Home quando faltar até 1h, com nome, horário e “Iniciar agora” / “Agora não”. Exemplo: “Aniversário do João começa às 20h. Deseja iniciar agora?”. “É hoje” sozinho também abrangeria um evento ainda distante; o horário elimina a ambiguidade.

Não iniciar ao tocar no banner por engano: abrir a confirmação. Dispensar vale para aquele agendamento/horário e não ressurge a cada renderização. Uma alteração relevante no horário pode permitir novo aviso. Se há vários, exibir o mais próximo e acesso à agenda. Se outro está ativo, oferecer revisar os eventos; não substituir ou encerrar automaticamente o atual.

Depois do horário manual, o evento continua Aguardando início. Não repetir o convite de uma festa já passada há dias. Hipótese para validar: janela do banner até 1h depois; fora disso, o item fica na agenda sem pop-up. Não transformar “hoje” em prova de comparecimento.

São avisos dentro do app, sem push nem pedido de permissão do sistema nesta fase.

## 5. Execução automática e app fechado

No FunTime atual não há backend ou processo garantido para executar uma ação no horário enquanto o app está fechado. O relógio da página também pode ser suspenso em segundo plano. Portanto, automações precisam ser baseadas em timestamps e reconciliadas ao abrir/retornar ao app e antes de salvar uma dose; não em um setTimeout longo.

Quando o início automático venceu e o período ainda é aplicável, processar o início com o horário programado, sob o lock de escrita, após desbloqueio. Não mudar dados privados na página de instalação nem ignorar PIN para fazê-lo. Quando o fim programado venceu, encerrar com aquele horário, preservando contagens de doses que ainda estejam ativas.

Pegadinha: abrir dias depois de início e fim programados sem nenhum uso do app. Recomendação para discussão: marcar o agendamento como Expirado, sem fingir que houve um evento iniciado/frequentado. Alternativa é materializar um período automático vazio; se escolhida, rotular claramente “Sem registros”, sem inferir presença. Esta decisão deve preceder implementação.

Processar transições vencidas em ordem temporal, uma vez só. Uma nova dose deve entrar no contexto reconciliado, não no evento que estava aberto antes de atualizar. Falha de gravação mantém estado anterior e bloqueia apenas a ação dependente, com erro visível; não anunciar início/fim que não foi salvo.

## 6. Regra de recuperação após 48h

A regra proposta é útil, com ajustes. Os 48h são o momento de verificar um possível esquecimento, não a duração presumida da festa e nem o horário de encerramento a gravar.

Aplicar quando: evento está aberto, não tem encerramento programado aplicável e já passaram 48h desde o início efetivo. Um evento com fim programado para três dias depois deve respeitar esse fim, sem ser cortado pelas 48h.

Para evento com doses, calcular:

```text
fimInferido = maior término de contagem entre todas as doses vinculadas
fimNormalDaDose = consumedAt + intervalMinutesDoSnapshot × 60.000
```

Usar os intervalos dos snapshots, nunca a configuração atual da bebida. Respeitar countingStoppedAt nos registros legados que possuam encerramento explícito de contagem; doses excluídas não participam. Cálculos devem permanecer coerentes com os usados nos cards.

No exemplo do usuário: início dia 1 às 00h, última contagem terminando dia 1 às 19h. Ao verificar depois de dia 3 às 00h, encerrar retroativamente em dia 1 às 19h e registrar que foi uma inferência automática.

Pegadinhas:

1. A última dose registrada pode ter intervalo curto, enquanto uma bebida anterior ainda conta por mais tempo. Usar o maior término de todas as doses, não apenas o consumo com timestamp mais recente.
2. Se alguma contagem vinculada ainda está em andamento na verificação, não encerrar agora. Reavaliar quando terminar. Isso pode ocorrer em um evento que realmente durou mais de 48h.
3. Evento sem doses não tem último término. Recomendação: encerrar administrativamente como “Sem registros” no marco das 48h, com motivo específico; não inventar horário de última dose. Outra opção é exigir revisão manual, mas isso deixa a agenda permanentemente aberta.
4. Um festival de vários dias pode ter uma pausa longa e ultrapassar 48h. Avisar que a recuperação foi aplicada, permitir revisar/reabrir e orientar definir um fim programado para eventos longos. Não prometer que 48h identifica corretamente toda festa.
5. Se o usuário anota consumo retroativo depois do encerramento, não reabrir nem mudar o fim em silêncio. Oferecer revisar o período e os vínculos. Toda nova associação deve preservar as doses de outros eventos.
6. Mudança do relógio/fuso pode disparar verificações indevidas. Armazenar instantes e fuso do agendamento, explicar mudança de horário local e evitar usar diferença de datas civis como horas decorridas.
7. Encerrar um evento não cancela/removerá doses e não declara segurança. Contagens globais continuam visíveis se houver.

Guardar **endedAt** (fim efetivo/inferido) separado de **closedAt** (quando o app aplicou o encerramento) e **endReason** (manual, programado, recuperação48h, vazio). Exemplo: endedAt dia 1 19h; closedAt dia 3 09h. Mostrar “Encerrado automaticamente; revisar” nos detalhes, com explicação do critério.

Depois de encerrar automaticamente, não recalcular o fim a cada renderização ou edição silenciosa de dose. A inferência fica registrada e pode ser revisada explicitamente. Isso evita o histórico mudar de duração sem ação perceptível.

## 7. Conflitos e vínculos

- Sobreposição de agendamentos pode ser permitida com aviso; dois eventos ativos, não. Início automático em conflito fica Aguardando revisão, sem apagar, encerrar ou substituir o outro.
- Iniciar cedo manualmente mantém horário agendado para referência e grava início efetivo escolhido. Mostrar a prévia das doses avulsas afetadas.
- Expandir período de evento existente já inclui doses sem evento no código atual, conforme correção solicitada. Preservar essa regra e informar quantidade incluída; nunca roubar vínculos de outro evento.
- Reduzir período com doses fora dele exige resolver as referências antes de salvar. Não descartar doses para encaixar.
- Excluir um evento mantém as doses, como hoje. Cancelar um agendamento sem doses é uma ação distinta, para não sugerir que um evento aconteceu.
- Falha do armazenamento, Voltar, bloqueio, duas janelas e confirmações antigas não podem duplicar transições nem produzir aplicação parcial.

## 8. Modelo e implantação

O schema atual não comporta agendamento diretamente: endedAt null hoje significa evento aberto. Não colocar um horário futuro em startedAt e reutilizar essa regra, pois a Home o consideraria ativo antes da hora.

Proposta de evolução por migração explícita:

```text
scheduledStartAt: timestamp ou null
scheduledEndAt: timestamp ou null
autoStart: boolean
startedAt: timestamp ou null
endedAt: timestamp ou null
closedAt: timestamp ou null
endReason: motivo ou null
cancelledAt: timestamp ou null
timeZone: fuso do agendamento
```

Derivar o estado a partir desses campos e do relógio em uma função pura, evitando múltiplas flags contraditórias. Eventos existentes preservam startedAt/endedAt e não recebem agendamentos inventados. Criar testes de migração, backup, restauração, conflitos e simulação do relógio antes de habilitar automações.

Sequência recomendada: (1) corrigir identificadores para 2.1.0; (2) desenhar e validar agenda compacta + detalhes com 0, 8 e 100 eventos; (3) adicionar agendamentos manuais e fim opcional explícito; (4) implementar reconciliação automática e regra de recuperação, depois de fechar as decisões acima. Releases seguintes permanecem na linha 2.1.x conforme compatibilidade.

Ainda não decidido: expirar versus materializar eventos totalmente transcorridos com app fechado; tratar evento vazio nas 48h; janela para repetição de aviso; possibilidade de desativar recuperação para ocasiões longas. Não implementar esses pontos por inferência silenciosa.
