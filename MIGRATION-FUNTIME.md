# Migração FunTime — fase 1 (v1.15.0)

Data: 07/09/2026. **Estado: implementado localmente, sem publicação.** Decisão geral e destino v2.0 em [ROADMAP.md](ROADMAP.md). Base da migração: app v1.14.3; destino v1.15.0; DATA_VERSION 9 e TERMS_VERSION 1.0.1 preservados; pasta `C:\xampp\htdocs\balada`, remote `https://github.com/arielkeybob/intervalo.git`.

As seções 1–5 preservam a especificação que orientou a implementação. O protocolo efetivamente adotado, evidências e limitações estão em **Implementação e validação** ao final.

## Resultado esperado

Após Atualizar, a interface apresenta FunTime e o app usa armazenamento com prefixo `funtime-`, preservando os registros e a proteção local, sem exigir exportação/importação manual ou novo aceite apenas por mudança de marca. Em falhas de armazenamento, informar o erro e preservar a origem recuperável; não iniciar silenciosamente com dados vazios ou sem bloqueio.

Manter nesta fase o endereço, a pasta, o repositório, o ícone e os valores efetivos de `id`, `start_url`, `scope`, `related_applications` e rotas de compartilhamento. A atualização do nome no launcher não é um critério garantido pelo botão Atualizar: depende da plataforma. A v2 tratará a nova instalação e o novo ícone.

## 1. Centralizar compatibilidade e inicialização

Inventariar todas as leituras, escritas e exclusões em `app.js`, `policies.js`, `reset.js` e `sw.js`, incluindo testes. Criar módulo local de compatibilidade/migração, carregado antes de `policies.js` e `app.js` e incluído no pré-cache. O código atual lê segurança ao construir `state`; a migração precisa anteceder essa leitura e a verificação de aceite.

Mapeamento proposto:

| Origem | Destino/conduta |
| --- | --- |
| `balada-v1-data` | `funtime-v1-data` |
| `balada-v1-drinks` | Adaptador legado para o estado completo em `funtime-v1-data` |
| `intervalo-security-v1` | `funtime-security-v1` |
| `intervalo-security-session-v1` | `funtime-security-session-v1` (sessionStorage) |
| `intervalo-terms-v1` | `funtime-terms-v1` |
| `intervalo-terms-draft-v1` | `funtime-terms-draft-v1` (sessionStorage) |
| `intervalo-restore-success-v1` | `funtime-restore-success-v1` (sessionStorage) |
| `intervalo-share-target-v1` | Compatibilidade transitória com cache `funtime-share-target-v1` |

Não derivar novas credenciais nem alterar hashes, salts, IDs de credenciais, RP ID ou requisitos de autenticação. Nomes de apresentação de novas credenciais podem usar FunTime; as existentes devem continuar utilizáveis. Campos de segurança e sessão devem manter as regras atuais de bloqueio e expiração.

## 2. Implementar migração recuperável

1. Inspecionar origem, destino e marcador de migração; validar os estados sem alterar a origem.
2. Preparar os valores de destino e um registro explícito da etapa. localStorage não oferece transação entre várias chaves: não considerar uma gravação isolada como conclusão de toda a migração.
3. Copiar, reler e validar os valores persistentes críticos, incluindo segurança e aceite. Só liberar o funcionamento normal após uma conclusão coerente; uma falha nunca pode resultar em desbloqueio involuntário.
4. Tornar a operação repetível após recarga/interrupção, sem duplicar registros ou sobrescrever um destino mais recente. Na presença de estados divergentes sem procedência suficiente, preservar ambos e informar o problema; não escolher arbitrariamente nem implementar mesclagem.
5. Definir antes da implementação a proteção contra abas com código antigo ainda gravando e duas abas migrando simultaneamente. Testar o mecanismo escolhido; cópia seguida de exclusão não resolve concorrência por si só.
6. Remover chaves antigas apenas após confirmação do destino e quando não houver risco de escrita por clientes antigos. Se a limpeza falhar, registrar pendência e não repetir a importação na próxima abertura. Não manter duas fontes de verdade em operação.
7. Integrar reset e restauração: exclusões não podem ressuscitar dados por fallback legado; APAGAR TUDO deve abranger os nomes próprios das duas gerações e preservar o aceite conforme a regra atual.

Migrar somente chaves do app, sem limpar armazenamento global. Falha em avisos/rascunhos opcionais não deve ser reportada como perda ou reversão de dados já persistidos. Uma atualização falha deve permitir recuperação, sem prometer rollback automático para código antigo que desconhece as novas chaves.

## 3. Atualizar a marca e os arquivos

- Revisar `index.html`, `manifest.webmanifest`, `app.js`, `policies.html` e documentação atual: títulos, bloqueio, instalação, mensagens, compartilhamento e nomes de downloads passam a FunTime.
- Manter termos funcionais como “Intervalo entre doses”, “Intervalo concluído” e o rótulo **Exportar bebidas**.
- Emitir `FunTime-Bebidas-…txt` e `FunTime-Backup-…json`. Usar tipos `funtime-drinks` e `funtime-backup` nos novos arquivos, aceitando também `intervalo-drinks` e `intervalo-backup` na leitura, com as mesmas validações e prévias.
- Documentar que versões antigas podem rejeitar os novos tipos de arquivo; a compatibilidade garantida é a nova versão ler os anteriores, não o contrário. Preservar fixtures reais dos formatos antigos nos testes.
- Atualizar o header de compartilhamento para `X-FunTime-Filename`, mantendo leitura de `X-Intervalo-Filename` e consumo de importações pendentes da geração antiga. Definir precedência e consumir cada pendência uma única vez.
- Backup continua excluindo segurança, sessão, aceite e metadados internos da migração. Importar bebidas continua preservando histórico e preferências locais.
- Não alterar o conteúdo substantivo das políticas nesta fase; conservar TERMS_VERSION 1.0.1 e o aceite válido. Preservar disclaimers e erros essenciais.

## 4. Preparar a release e o Service Worker

Usar APP_VERSION 1.15.0, atualizar footers aplicáveis e cabeçalhos documentais, e criar cache de shell `funtime-v1-15-0`. DATA_VERSION permanece 9 se o modelo dos registros continuar igual; o marcador de migração de nomes tem versionamento próprio. Manter a atualização controlada por Atualizar.

Revisar a limpeza do Service Worker para reconhecer os caches antigos e novos sem excluir importações compartilhadas pendentes. Validar a coexistência temporária de worker antigo e página nova e vice-versa. Preservar o endereço do worker existente nesta fase. Não publicar nem renomear recursos remotos durante a implementação local sem solicitação.

## 5. Validação e critérios de aceite

Testes automatizados em armazenamento simulado:

- Instalação limpa; migração de v1.14.3; dados somente em `balada-v1-drinks`; destino já migrado; nova execução após interrupção em cada etapa.
- Identidade de IDs, bebidas, eventos, timestamps, snapshots, preferências e catálogo de ícones antes/depois; nenhum registro duplicado.
- PIN de 4 e 6 dígitos, configuração de WebAuthn, sessão expirada, aceite válido e rascunho. Falha na migração de segurança mantém os dados protegidos.
- Quota, leitura/gravação/exclusão indisponível, origem inválida, destino inválido, conflito entre gerações e concorrência de abas.
- Backup/restauração e importação de bebidas nos formatos antigo e novo, exclusão de credenciais dos arquivos e falhas sem falsa mensagem de preservação.
- Reset após migração parcial/completa sem reaparecimento de dados; importação compartilhada pendente e limpeza de caches limitada ao app.

Comandos mínimos: `node --check app.js`, `node --check sw.js`, checagem de sintaxe dos outros scripts alterados e `node --test tests/audit.test.cjs tests/reset.test.cjs tests/ui.test.cjs`, além dos novos testes de migração.

Testes manuais pertinentes de DEVELOPMENT.md, em perfil/dados de teste isolados: instalar v1.14.3 e atualizar para v1.15.0, reabrir offline, múltiplas abas, bloqueio/PIN, biometria em aparelho real, aceite, exportar/importar, restaurar e compartilhar. Conferir apresentação no celular e comportamento do nome no launcher em Android/iOS. Não apagar armazenamento real. Relatar claramente tudo que não puder ser testado.

Concluir a implementação local somente com revisão do diff e evidências de preservação. Considerar pronta para publicação apenas após avaliar os testes de atualização e proteção em PWA instalada; se não houver aparelhos disponíveis, registrar a limitação, sem declarar esses fluxos aprovados.

## Implementação e validação

- **Marca:** interface, manifest, políticas, novas credenciais, downloads e mensagens FunTime; rótulos funcionais de intervalo preservados. Footers, app, boot e SW em 1.15.0. Novo ícone, repositório e URL continuam reservados para v2.0.
- **Inicialização:** `migration.js` e `boot.js` antecedem todos os leitores de dados. O boot obtém confirmação do SW `FUNTIME_PREPARE`, que identifica e navega janelas antigas para o shell novo. Sem confirmação, não migra. A página comum de instalação carrega apenas estado vazio em memória.
- **Concorrência:** Web Lock `funtime-app-writer-v1` é mantido durante toda a vida da janela instalada. Outras janelas aguardam sem carregar os dados e continuam ao fechar a primeira. Não se libera o lock no background. Retorno de BFCache recarrega. Reaparecimento de chaves antigas provoca recarga e bloqueio por conflito, preservando as duas origens para diagnóstico, sem mesclar.
- **Recuperação:** diário `funtime-migration-v1`, com fases prepared/committed/done; gravações relidas, destinos conflitantes rejeitados e origem removida somente após conclusão conjunta. Falha na limpeza mantém o diário para retomada. Diário concluído não contém cópias de dados/credenciais. Não há fallback para dados vazios nem proteção desativada quando a leitura falha depois de migrar. Sessão indisponível exige o desbloqueio normal.
- **Compatibilidade:** origem mais antiga `balada-v1-drinks` gera eventos com IDs determinísticos; a normalização atual completa preferências. Leitores aceitam os dois tipos de arquivos; novos arquivos usam FunTime. Reset considera nomes das duas gerações e preserva aceite. Pendência antiga de compartilhamento tem precedência; a nova permanece para a próxima abertura. O SW conserva esses caches e lê o shell apenas no cache da versão ativa.

Validação executada em 07/09/2026:

- Sintaxe: `node --check app.js`, `sw.js`, `migration.js`, `boot.js`, `policies.js` e `reset.js`.
- **46 testes Node aprovados:** `node --test tests/audit.test.cjs tests/migration.test.cjs tests/migration-sw.test.cjs tests/reset.test.cjs tests/ui.test.cjs`. Incluem interrupção em cada operação de armazenamento, retomada, conflito, falha tardia de leitura, PIN de 4/6 dígitos, preservação de credenciais, sessão/aceite, versões de arquivos, reset e protocolo/cache do SW.
- **Teste integrado no Edge:** `node --test tests/migration-browser.test.cjs`, com Playwright via NODE_PATH. Origem HTTP local aleatória e perfis descartáveis; modo instalado simulado por navigator.standalone. Carrega os arquivos reais da v1.14.3 no commit `06feefe693059ce7ff5586e04ce847e704eacdec` e depois a árvore atual. Cobre clique em Atualizar, duas janelas, preservação byte a byte de dados/proteção/aceite, PIN incorreto/correto, downloads reais, prévias/importações dos dois formatos, restauração de backup antigo, pendências compartilhadas das duas gerações, recarga offline, instalação limpa e bloqueio visível para proteção inválida.
- Inspeção visual da tela inicial em 390×844: layout compacto e disclaimer preservados, footer 1.15.0. `git diff --check` sem erros de whitespace.

Limites: não testados instalação real no launcher, atualização do nome pelo sistema, Android/iOS reais, biometria real, teclado virtual, leitor de tela ou compartilhamento pela folha nativa. O modo instalado simulado não substitui esses testes. A migração precisa de Web Locks/Service Worker e espaço temporário para diário e cópias; quota insuficiente bloqueia a abertura com erro, preservando a origem. Não foi testada uma base próxima da quota real de cada aparelho. Não apagar dados reais para contornar isso. Downgrade para código antigo não é suportado após a troca das chaves.

Referências do protocolo: [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) e [WindowClient.navigate](https://developer.mozilla.org/en-US/docs/Web/API/WindowClient/navigate).

## Continuidade para a próxima tarefa

A implementação local da primeira fase foi solicitada e executada. Sem commit, push ou publicação nesta tarefa. Antes de publicar, avaliar os testes em PWA realmente instalada e registrar o resultado. Para futuras releases v1.x, atualizar também a versão esperada em `boot.js` em conjunto com app/SW, preservando o protocolo de exclusividade. A preparação da v2 continua no roadmap; não renomear repositório/endereço nem substituir o ícone antecipadamente.
