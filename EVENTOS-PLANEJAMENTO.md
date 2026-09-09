# Eventos no FunTime — proposta para discussão

Data: 09/09/2026. Base conferida: v2.0.12, DATA_VERSION 9. Planejamento original preservado abaixo. O usuário autorizou depois o desenvolvimento de eventos e menu inferior; implementação local em avaliação, sem commit ou publicação. Escopo atual e diferenças: DEVELOPMENT.md, seção Desenvolvimento local — eventos e navegação inferior. Propostas restantes não equivalem a recursos implementados.

## Problema e objetivo

getDrinkActivity, em app.js, consulta todos os registros da bebida e mantém o estado completed indefinidamente após o último intervalo. renderDrinks apresenta “Intervalo concluído” e “Anotar nova dose”. Isso é coerente com o último registro, mas não informa se houve consumo na ocasião atual. getSortedDrinks também usa o último consumo de toda a vida da bebida.

Objetivo: distinguir “já consumida nesta ocasião” de “possui histórico”, permitir organizar ocasiões nomeadas e preservar os cálculos entre doses, inclusive entre ocasiões diferentes. Criar um evento não equivale a zerar contagens nem apagar registros. O app acompanha intervalos configurados, sem determinar segurança para consumo.

## Alternativas

| Abordagem | Benefício | Limitação |
| --- | --- | --- |
| Apenas neutralizar cards após um período | Menor mudança; resolve boa parte da confusão | Limiar arbitrário; não organiza aniversários ou viagens |
| Agrupar por dia civil | Nenhum início/encerramento manual | Meia-noite divide festas; mesmo dia pode ter duas ocasiões |
| Criar eventos automaticamente por inatividade | Poucos toques | Pode unir ocasiões diferentes ou dividir uma festa longa; atribuições seriam inferidas |
| Eventos explícitos obrigatórios | Todo consumo pertence a um contexto | Obriga uma etapa extra mesmo para uma anotação isolada |
| Eventos explícitos opcionais | Nome e controle quando úteis; preserva anotação rápida | Exige um estado claro para registros sem evento |

Recomendação provisória: eventos opcionais, um em andamento por vez. “Evento” é o nome de interface; “dia” continua sendo agrupamento do histórico. Não usar virada de data como encerramento. Nome opcional, sugestão “Evento de 16/09/26”, sem antecipar celebração ou local. A preferência entre opcional e obrigatório foi perguntada ao usuário e está pendente.

Uma melhoria independente pode preceder eventos: fora de um evento e sem contagem ativa, apresentar o card neutro com “Último registro: 06/09/26” e ação “Anotar dose”, removendo o verde persistente. Não exige inventar um evento para o histórico antigo. Avaliar essa melhoria primeiro: talvez resolva o incômodo, enquanto eventos acrescentam organização de fato.

## Duas informações independentes

1. Contexto: existe evento aberto? Esta bebida tem registros nele?
2. Intervalo: qual a última dose real da bebida, em todo o histórico, e o intervalo de seu snapshot?

O contexto nunca filtra a entrada dos cálculos de intervalo, sobreposição ou alertas. Encerrar, renomear, mover uma dose entre eventos e começar outro não alteram timestamps ou intervalos. As regras existentes para registros legados, inclusive countingStoppedAt, permanecem.

| Situação | Card e ação propostos |
| --- | --- |
| Sem evento e sem contagem ativa | Neutro; “Último registro: …” se existir; “Anotar dose” |
| Evento aberto, bebida sem registro nele e sem contagem ativa | Neutro; “Sem registro neste evento”; “Anotar dose” |
| Evento aberto, bebida sem registro nele, mas intervalo anterior ativo | Contador/alerta predominante; “Registro anterior ao evento”; contexto “Sem registro neste evento” secundário |
| Bebida consumida no evento, intervalo ativo | Contador e alertas atuais; indicação do horário da dose |
| Bebida consumida no evento, intervalo concluído | “Intervalo concluído”; “Anotar nova dose”; avaliar manter verde ou usar destaque neutro no protótipo |
| Evento encerrado, intervalo ainda ativo | Início preserva contador/alerta; contexto “Evento encerrado” |
| Evento encerrado, sem intervalo ativo | Início neutro, último registro discreto; resumo acessível pelo Histórico |

Nunca dizer “não consumiu”: o app só sabe que não há registro. Não ocultar contadores, erros ou disclaimer no modo compacto. Ordenação proposta: contagens ativas primeiro; depois bebidas registradas no evento atual; demais em ordem alfabética. Não herdar prioridade visual de consumo da semana passada. Validar mudança de ordenação separadamente e preservar foco/animação.

## Fluxo proposto

**Sem evento:** faixa compacta “Nenhum evento em andamento” com “Iniciar evento”; doses avulsas continuam possíveis na opção recomendada. Histórico sempre acessível.

**Iniciar:** formulário com nome opcional e início sugerido “Agora”, editável. A ação Salvar/Iniciar aparece após uma escolha efetiva; tocar em Iniciar evento já representa intenção, mas o protótipo deve tornar explícita a confirmação do início sugerido sem exigir nome artificialmente. Não criar registro persistido antes da conclusão. Não adicionar doses antigas automaticamente. Se houver outro aberto, oferecer continuar nele ou encerrá-lo antes de iniciar outro, sem fechamento silencioso. Mostrar contagens existentes como informação essencial.

**Durante:** faixa com nome e “Em andamento”; tocar abre detalhes. “Encerrar evento” fica nos detalhes, fora da área de toque dos cards. Não exibir duração/contagem de doses no topo se isso poluir a tela compacta.

**Encerrar:** confirmação “Encerrar Aniversário do João?” com fim sugerido agora. Informar que registros ficam no histórico e contagens em andamento continuam. Confirmar grava o fim e volta ao Início. Botão distinto de “Cancelar contagem atual”, que hoje remove uma dose; nunca reutilizar essa função para encerrar evento.

**Esqueceu de encerrar:** não encerrar por tempo, meia-noite, bloqueio ou fechamento do app. Ao retornar após inatividade longa, mostrar uma faixa dispensável “Este evento ainda está em andamento”, com Continuar e Revisar encerramento. Hipótese inicial de UX: sugerir após 12h sem registro, uma vez por abertura; validar em protótipo, sem tratar 12h como verdade sobre a duração da festa. Não bloquear anotação nem gerar notificações em segundo plano. Se encerrar depois, pedir confirmação do horário; nunca alegar que “agora” foi o fim real nem gravar automaticamente o horário da última dose como fim.

**Evento vazio:** pode ser encerrado e mantido como “Sem registros”. Oferecer descartar nos detalhes, com confirmação. Não registrar encerramento como dose.

## Histórico, edição e casos de borda

Histórico mantém a visão cronológica atual e ganha filtro por evento: Todos, nome do evento e Sem evento. Visão opcional de lista de eventos mostra nome, período e quantidade de registros. Detalhes mostram bebidas e registros por bebida, doses inteiras/meias quando informadas. Não somar bebidas diferentes em uma medida de álcool, não apresentar ranking ou pontuação. “5 registros” não significa 5 doses inteiras. Início/fim declarados e primeira/última anotação são informações distintas.

- Evento cruza meia-noite: permanece único; a lista de doses ainda pode ter separadores por dia.
- Dois eventos no mesmo dia: IDs distintos, nomes podem repetir. Um evento de vários dias é permitido.
- Anotação retroativa: sugerir evento aberto apenas se o horário estiver em seu período. Fora dele, pedir seleção explícita de evento compatível ou Sem evento; não mover silenciosamente e não criar outro evento automático.
- Esqueceu de iniciar: permitir criar evento com início anterior e associar registros existentes por seleção e prévia. Só o período não deve reassociar doses antigas automaticamente. Pode ficar para uma segunda fase, desde que doses antigas continuem editáveis individualmente.
- Edição de dose: alterar horário revalida vínculo; se sair do período, exigir desvincular, escolher outro evento ou corrigir primeiro as datas do evento. Mesma dose pertence a no máximo um evento. Mudar vínculo não muda a dose.
- Edição de evento: nome e limites editáveis, conclusão só com alterações. Novo período deve conter as doses vinculadas. Mostrar conflitos e bloquear até corrigir; nunca cortar registros para caber. Datas futuras de início/fim não são aceitas nesta proposta.
- Reabrir: ação explícita em evento encerrado, possível somente sem outro aberto e sem conflito temporal. Reabrir remove o fim declarado; resumo deixa de mostrar duração final. Não retomar automaticamente ao apenas visualizar detalhes.
- Períodos: propor eventos sem sobreposição, usando intervalo [início, fim), permitindo encerrar um exatamente quando outro começa. Fim deve ser posterior à última dose vinculada; UI de minutos precisa explicar e resolver conflito com doses no mesmo minuto. Essa precisão exige protótipo antes de fixar o contrato.
- Excluir evento: por padrão remove somente a organização, deixando doses em Sem evento após prévia e confirmação. Exclusão conjunta de doses fica fora do primeiro escopo. Excluir bebida mantendo histórico preserva o vínculo dos snapshots com o evento.
- Excluir todas as doses de um evento: manter evento vazio. Reset de histórico preserva os eventos como metadados vazios e explica isso na prévia; APAGAR TUDO remove também eventos. Usuário deve avaliar essa regra antes da implementação.
- Offline, atualização, bloqueio e reinício: evento continua aberto, sem cronômetro baseado em aba aberta. Nada se encerra em background. Falha de gravação mantém estado anterior e mostra erro.
- Mudança de fuso: cálculos continuam por timestamp; definir exibição das datas pelo fuso do evento para não mudar o dia do aniversário após viagem. Mostrar indicação de fuso quando diferir do atual. Sem localização automática.

## Estrutura de dados proposta

O nome events já significa doses no código e em arquivos exportados. Não renomeá-lo nem reaproveitá-lo para ocasiões.

```js
{
  version: NEXT_DATA_VERSION,
  drinks: [...],
  events: [ // registros de consumo existentes
    { id, drinkId, consumedAt, intervalMinutes, /* snapshots existentes */ occasionId: null }
  ],
  occasions: [
    { id, name, startedAt, endedAt: null, timeZone, createdAt, updatedAt }
  ],
  preferences: { /* preferências existentes */ }
}
```

endedAt nulo indica evento aberto; não persistir status duplicado nem activeOccasionId como segunda fonte de verdade. Sem seleção ativa no histórico equivale a filtro de interface, não a alteração do evento aberto. IDs estáveis; datas em milissegundos; nome como texto simples com limite sugerido de 80 caracteres. Validar IDs únicos, referências, datas finitas, período, fuso aceito e no máximo um aberto. Vínculo inconsistente em backup deve gerar erro de prévia, não perda silenciosa.

Persistência deve gravar ocasião e vínculos em uma única atualização do payload atual, validada antes de trocar o estado em memória. Revalidar confirmação contra alterações recentes, assim como os fluxos destrutivos atuais. Manter o lock compartilhado entre gerações.

Hoje normalizeData reconstrói objetos com campos enumerados: acrescentar campos apenas no cadastro não basta, pois seriam descartados ao carregar. Atualizar normalização, validação, buildCurrentAppData/saveData, restauração, reset e todas as mutações relevantes. Criar um módulo puro occasions.js para transições e validação, reutilizando diálogos, campos e controle de rascunho existentes. Uma função compartilhada deve derivar a apresentação do card usando contexto e atividade global; não espalhar condições por várias telas.

## Migração e formatos

Planejar incremento de DATA_VERSION, pois surgem entidades e referências persistidas. Manter migração cumulativa: dados antigos ganham occasions vazio e occasionId nulo, sem agrupar retroativamente por palpite. Preservar IDs, timestamps, snapshots, PIN, preferência de proteção e adaptadores legados.

Backup completo passa a incluir ocasiões e vínculos, inclusive evento aberto. Após restauração e desbloqueio, mostrar qual evento continua aberto e oferecer revisão; não mudar silenciosamente seu estado. Importação/exportação de bebidas continua contendo somente bebidas; preservar ocasiões/histórico locais ao importar. Backup antigo continua restaurável com lista vazia de ocasiões. Versionar formato do backup se necessário para impedir que versões antigas aceitem o arquivo novo descartando vínculos; testar rejeição explícita na versão anterior. Não prometer downgrade preservando a organização.

## Fases e critérios para decidir

1. Validar conceito: comparar protótipos de cards neutros sem eventos e com eventos opcionais. Cenários: aniversário, uso avulso, festa que cruza meia-noite, retorno após semana, intervalo herdado.
2. Definir escolhas pendentes: opcional/obrigatório; verde após conclusão; política de esquecimento; períodos e precisão; ordenação; preservação de eventos vazios no reset.
3. Fechar schema e migração, com testes de ida/volta de backup e nenhuma perda de doses. Só então implementar início/encerramento, vínculo individual, histórico e edição básica.
4. Posteriormente, avaliar associação em lote de histórico antigo. Sem automação de encerramento, sobreposição de eventos ou compartilhamento no primeiro escopo.

Critério de utilidade: usuário identifica rapidamente se anotou uma bebida na ocasião atual, inicia/encerra sem precisar editar cada card e entende que uma contagem anterior continua. Se o conceito adicionar atrito sem melhorar a organização, entregar só a neutralização dos cards.

## Testes necessários antes de publicar

- Matriz de cards acima nos dois modos de contagem, interface limpa e acessibilidade; informação nunca apenas por cor.
- Intervalo ativo atravessa início, fim e troca de evento sem mudar cálculo/alerta; inclusive novo consumo logo após trocar evento.
- Reinício/offline/bloqueio, esquecimento, evento vazio, meia-noite, fuso e horário de verão.
- Edição retroativa, limites, nomes duplicados, reabertura, evento removido e bebida excluída com snapshots.
- Cancelar qualquer formulário não muda dados; voltar/reabrir não duplica ocasião; falha de armazenamento e confirmação obsoleta não aplicam parcialmente.
- Migração de todas as versões suportadas, backups antigos/novos, referências inválidas, reset e importação de bebidas preservando ocasiões.
- Navegação volta ao Início depois de iniciar/encerrar; filtros não ressuscitam eventos nem alteram o evento aberto.

Este documento é uma análise do código e uma proposta de produto. Não houve pesquisa com usuários, protótipo validado ou testes de implementação desse recurso.
