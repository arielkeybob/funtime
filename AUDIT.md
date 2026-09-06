# Auditoria · Intervalo

Base: versão local 1.10.6, em 06/09/2026, branch `main` limpa antes das alterações; remote `https://github.com/arielkeybob/intervalo.git`. Não foi feito fetch nem verificada a implantação pública. Resultado implementado: 1.11.0, dados versão 8.

O projeto tem como finalidade principal estudo de programação e fins acadêmicos e didáticos, além do uso pessoal e testes com conhecidos. A avaliação é técnica e proporcional a esse contexto; não é certificação de segurança ou parecer jurídico.

## Diagnóstico anterior às alterações

| Item/sugestão | Classificação anterior | Prioridade/risco concreto | Decisão |
|---|---|---|---|
| Finalidade de registro e temporização | Já implementada adequadamente | Baixo: nenhum cálculo fisiológico encontrado | Preservar timestamps, snapshots e intervalos do usuário; explicitar finalidade didática |
| Texto de conclusão | Já implementada adequadamente | Baixo: já dizia “INTERVALO CONCLUÍDO” | Manter |
| Texto durante contagem | Parcialmente implementada | Médio: “⛔ Aguarde” sugere orientação comportamental | Trocar por “Restam”, mantendo alerta de sobreposição |
| Cores e ícones | Parcialmente implementada | Médio: verde de conclusão e catálogo com 💊/🚬 podem ampliar interpretação | Explicar que cores descrevem intervalos e ícones identificam cadastros; preservar dados e catálogo |
| Sobre o app e finalidade acadêmica | Parcialmente implementada | Baixo: footer “App para estudo” já existe | Detalhar na página e no primeiro acesso |
| Página de informações | Ainda necessária | Médio: informações espalhadas ou ausentes | `policies.html`, oito seções, índice, leitura responsiva e pré-cache |
| Footer discreto | Parcialmente implementada | Baixo: disclaimer existe, link não | Link no app, instalação e tela de aceite; acesso também no bloqueio |
| Álcool, sobriedade, direção e atividades de risco | Parcialmente implementada | Médio: disclaimer já afasta consumo seguro, mas não explicita todos os limites | Centralizar explicações na página; resumo único no aceite |
| Medicamentos e outras substâncias | Ainda necessária | Médio: personalização pode sugerir uso além de bebidas | Explicitar usos fora do escopo; não criar ferramenta médica |
| Idade e legislação local | Ainda necessária | Médio: não havia autodeclaração | Declaração local, sem tabela internacional ou alegação de verificação |
| Primeiro aceite obrigatório | Ainda necessária | Médio: instalação e bloqueio não são onboarding | Três confirmações antes da inicialização funcional da PWA |
| Persistência/versionamento do aceite | Ainda necessária | Médio: nenhum registro existente | `intervalo-terms-v1`, versão `1.0`, timestamp local, fora de backup |
| Timers e limitações | Parcialmente implementada | Médio: dependência do relógio e suspensão pelo SO | Documentar cálculo por timestamps e limites; preservar algoritmo |
| Notificações de término | Desnecessária para a arquitetura atual | Baixo: não há Notification API, push ou alarmes | Informar ausência; não criar recurso novo |
| Perda de dados e armazenamento | Parcialmente implementada | Médio: localStorage/cache não garantem retenção | Explicar limpeza, dispositivo, corrupção e limites de recuperação |
| Privacidade | Parcialmente implementada | Médio: proteção de interface não equivale a criptografia | Explicar dados locais, hospedagem, exportação e bloqueio |
| Arquivos de bebidas separados de backup | Já implementada adequadamente | Baixo: formatos e prévias separados | Preservar rótulo “Exportar bebidas” e histórico ao importar |
| Validação de importação | Parcialmente implementada | Médio: limites já existem, mas havia coerção de tipos e ícones/IDs sem limite próprio | Tipos estritos, limites de strings, prévia mantida |
| Validação de restauração | Parcialmente implementada | Alto: normalização descartava registros inválidos e aceitava schema futuro/datas não representáveis | Validar integralmente antes de normalizar; rejeitar duplicatas e inconsistências |
| Erro após restaurar | Parcialmente implementada | Alto: falha em sessionStorage após setItem podia afirmar que os dados foram mantidos | Aviso opcional protegido; falha da gravação principal continua sem substituir dados |
| HTML/JavaScript importado e prototype pollution | Já implementada adequadamente | Baixo: conteúdo exibido com textContent, objetos reconstruídos e Map/Set | Preservar; teste com `__proto__` e HTML como texto |
| KYC, documentos, geoblocking, backend para aceite | Desnecessária para a arquitetura atual | Baixo: desproporcional ao projeto | Não implementar |
| Novos banners e repetição de disclaimers | Desnecessária para a arquitetura atual | Baixo: prejudicariam interface clean | Preservar avisos essenciais existentes; não acrescentar banner jurídico |
| Sincronização, relações, mesclagem, backup criptografado | Recomendada para o futuro | Baixo nesta versão: não há implementação ativa | Manter no roadmap, sem antecipar recursos |

Não foram encontrados recomendador de quantidade, cálculo de BAC/metabolismo, avaliação de sobriedade ou capacidade para dirigir, backend, login remoto, Firebase, APIs de analytics, pixels, telemetria, crash reporting remoto, cookies próprios, CDNs ou fontes carregadas externamente. `Inter` aparece apenas como preferência de fonte local no CSS. As chamadas `fetch` do Service Worker buscam recursos da própria origem; exportação usa arquivo/download ou Web Share escolhido pelo usuário. WebAuthn faz verificação local da credencial, e não login num servidor.

A hospedagem não deve ser confundida com armazenamento do histórico: o GitHub Pages registra IP dos visitantes por segurança, conforme a [documentação oficial](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), consultada em 06/09/2026. A página nova inclui essa distinção e links externos, sem carregar recursos desses destinos automaticamente.

## Decisões de implementação

- Página HTML separada, pública e sem depender do desbloqueio ou de JavaScript para leitura. Usa CSS existente e entra no shell offline. Retornar ao app mantém a exigência de instalação já existente em abas comuns.
- Primeiro aceite solicitado na PWA instalada, antes da inicialização de segurança, relógio e importação compartilhada. Não duplica a landing de instalação. A leitura dos dados locais já acontece no carregamento do script; esta é uma barreira de interface, não proteção criptográfica.
- Aceite fora de `balada-v1-data`, segurança e sessão. Importações/restauração de preferências não transferem nem apagam essa confirmação. Limpeza do navegador exige novo aceite; reinstalação depende da retenção do armazenamento. Não há identificador confiável de instalação no navegador.
- Mudanças materiais exigem atualizar `TERMS_VERSION` em `policies.js`, versão/data/texto em `policies.html`, testes e cache/versão da aplicação. O nome da chave pode permanecer `intervalo-terms-v1`; seu sufixo identifica o formato de armazenamento, não a edição das políticas. Não alterar `DATA_VERSION` por mudança de políticas.
- Arquivos externos: mantém limites de 1.500.000 bytes para bebidas e 20.000.000 para backup, 500 bebidas e 200.000 eventos. Nome até 80 caracteres (compatibilidade com importação anterior), ícone até 64 e ID até 200. Números e booleanos não são mais aceitos como strings; intervalos devem ser inteiros entre 1 e 1440. Campos desconhecidos são ignorados por reconstrução explícita, não mesclados. IDs ausentes/colidentes na lista de bebidas podem ser regenerados; duplicatas em backup são rejeitadas para não reinterpretar relações históricas.
- Datas do backup precisam ser números representáveis por `Date`; não são comparadas ao relógio atual para evitar rejeitar dados pessoais somente por relógio desajustado. Não houve mudança na migração local tolerante.
- A página explica ausência de notificações em segundo plano e de criptografia, sem inventar garantias. Mantidos o aviso principal e o disclaimer do footer exigidos pelas instruções do projeto.

## Limites e outros riscos identificados

- `loadAppData()` e a migração local preexistente merecem uma revisão própria de recuperação: dados ilegíveis podem levar ao fallback legado; a UI não oferece recuperação do conteúdo bruto. Esta implementação fortalece arquivos externos, sem redesenhar migrações existentes.
- CRUD comum altera estado em memória antes de `saveData()`, cuja falha não recebe tratamento transacional em todos os chamadores. Em quota cheia pode haver divergência até recarregar. Não se generaliza para esse fluxo a garantia específica da importação/restauração.
- O limite de 200 mil eventos não é uma garantia de performance: renderização e filtros do histórico podem ser custosos em aparelhos modestos. Mudança do algoritmo e paginação ficam para trabalho específico.
- O arquivo pendente de share target fica em cache até a leitura, sem prazo automático; um novo recebimento substitui o anterior. A página documenta isso. Integração depende de suporte do sistema e atualização do manifest.
- Bloqueio de interface, PIN local e autodeclaração são contornáveis por quem controla o navegador. Não foram apresentados como proteção dos arquivos, prova de identidade ou verificação legal de idade.

## Validação executada

- `node --check app.js`, `node --check sw.js` e `node --check policies.js`.
- `node --test tests/audit.test.cjs`: 9 testes aprovados. Cobrem backup válido/snapshot/bebida excluída, versões/tipos/datas/IDs inválidos, propriedades desconhecidas e HTML, arquivos vazios/corrompidos/excessivos, preservação de eventos/preferências, quota e sessão na restauração, três confirmações/erro de persistência/versão anterior no aceite, inclusão e existência dos recursos offline.
- `git diff --check` sem erro de whitespace; somente avisos normais de conversão LF/CRLF do Git.
- Inspeção visual da página no navegador desktop e em viewport mobile de 390 × 844; primeiro acesso e link anterior ao aceite em servidor temporário isolado, que simulou `standalone` apenas na resposta de teste. Nenhum desvio de instalação foi adicionado ao código entregue e nenhum armazenamento real foi apagado.
- Não executados: instalação/upgrade em aparelhos reais Android/iOS, WebAuthn/PIN real, recebimento via WhatsApp/share target, execução suspensa pelo SO e teste ponta a ponta de rede offline. A inclusão no pré-cache foi validada estruturalmente; não equivale a provar funcionamento offline em todos os navegadores. A suíte manual completa de CRUD, gestos e histórico de DEVELOPMENT.md não foi repetida.

## Arquivos desta entrega

Modificados: `app.js`, `index.html`, `styles.css`, `sw.js`, `README.md`, `DEVELOPMENT.md`.

Criados: `policies.html`, `policies.js`, `tests/audit.test.cjs`, `AUDIT.md`.

Sem commit, push, publicação ou ZIP.
