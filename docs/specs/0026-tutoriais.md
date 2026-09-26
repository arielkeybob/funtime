# 0026 — Tutoriais: introdução no primeiro acesso e "Como usar" em Configurações

Status: em implementação (M1)

## Contexto

Hoje o app só pede o aceite dos termos (`policies.js`) e mostra o estado vazio da Home
(`index.html`, `#empty-state`). Não há onboarding nem ajuda de uso, e o app já tem fluxos que
não se descobrem sozinhos (arrastar para reordenar, eventos, compartilhamento entre amigos).

Duas abordagens foram avaliadas com o usuário: **slides com mídia** ou **ações guiadas** que
focam o campo e esperam o gesto. Ficou decidido pelos slides, por enquanto:

- ações guiadas são código de runtime preso aos ids do DOM de um `app.js` com dialogs
  empilhados (`navigation.js` registra uma entrada de History por camada), bloqueio por PIN e
  eventos ligados/desligados; toda mudança de interface as quebraria em silêncio, na mão de
  quem usa;
- na primeira execução a Home está vazia — guiar exigiria cadastrar uma bebida de mentira e
  poluir o histórico;
- amigos e pareamento exigem duas contas, então "esperar a ação acontecer" não vale ali.

Slides são um módulo isolado que nunca quebra o app. O risco deles é outro: **ficar velho**.
Por isso esta spec trata a geração das mídias e o aviso de desatualização como parte do
produto, não como extra.

## Decisão

**Duas camadas, um visualizador só.**

1. **Introdução no primeiro acesso**: 4 slides (cadastrar bebida e intervalo → **dois toques** para
   registrar e ver a contagem → histórico geral ou só de uma bebida → onde rever os tutoriais
   em Configurações → Como usar), legendas curtas, com **Pular** sempre visível. Aparece depois do aceite dos termos e da
   segurança, em `bootstrapApp()`, só se a pessoa não tem dados.
2. **Configurações → Como usar**: nova categoria no menu, com a lista de tópicos e "Rever a
   introdução". Cada tópico abre a mesma folha de slides (3 a 6 quadros).

**Mídia mista**: imagens anotadas na maioria (WebP); vídeo curto em loop (MP4, sem áudio)
só onde há gesto ou movimento (registrar dose com a contagem, arrastar para reordenar).
GIF fica de fora: pesado, 256 cores, sem pausa.

**Mídia gerada, nunca editada à mão.** Cada tópico é um *roteiro* (`tutorials/roteiros/*.cjs`)
que `scripts/tutorials-build.cjs` executa no app real (Playwright + Edge, 390×844, contexto
isolado, dados semeados, relógio congelado) e que produz imagens, vídeos, o módulo
`src/tutorials/content.js` e o `tutorials/manifest.lock.json`. Seletor que sumiu = o build
falha, como um teste.

**Manter atualizado** (o item mais importante):

- Cada roteiro declara `cobre`: os seletores estáticos das telas que ele mostra. O manifesto
  guarda o hash do HTML desses trechos.
- `npm run tutorials:check` recalcula os hashes e lista os tópicos cujo trecho coberto mudou;
  com `--visual` recaptura as imagens e lista as que diferem das commitadas.
- `tests/tutorials.test.cjs` (dentro do `npm test`, sem navegador) falha se um seletor
  estático de roteiro deixou de existir em `index.html`, se falta `alt`, se a legenda passa do
  limite ou se o manifesto aponta para mídia inexistente.
- `AGENTS.md` manda rodar `tutorials:check` depois de qualquer mudança visível de interface ou
  de fluxo e relatar; o gabarito de spec e o checklist de release ganham "Afeta algum
  tutorial?".
- Limite aceito: a automação pega marcação e visual que mudaram, **não** uma legenda que
  ficou falsa por mudança de comportamento com a mesma tela. O `check` aponta o tópico e a
  revisão do diff das imagens é humana.

**O que não muda**: `DATA_VERSION`, formato de backup, regras do Firestore, políticas e
aceite (o visualizador não coleta, envia nem guarda nada além de uma flag local). Interface
limpa continua ligada nas capturas. O aviso "o app não determina segurança para consumo"
permanece, e nenhuma legenda pode sugerir que é seguro consumir.

## Contrato do módulo

`src/tutorials/viewer.js` (ES, exports nomeados, sem `localStorage` nem `state` global):

- `clampIndex(index, total)` → inteiro em `[0, total-1]`; `total` inválido → `0`.
- `shouldShowIntro({ seen, hasData })` → `true` só se `seen` é falso e `hasData` é falso.
  `hasData` = há bebidas ou registros. Com dados e sem flag o app grava a flag em silêncio.
- `createTutorialViewer({ dialog, tutorials, onClose, prefersReducedMotion?, saveData?, isOnline?, fetchMedia? })` →
  `{ open(tutorialId, { intro }), close(), isOpen() }`; `onClose({ id, intro, reachedEnd })` roda em todo
  fechamento (botões, Voltar, Escape). Monta img/video, legenda, "2 de 4", Anterior/Próximo/Concluir,
  **Pular** (só na introdução, some no último slide) e **×** (só nos tópicos), setas do teclado e deslizar
  horizontal. Vídeo: `muted loop playsinline preload="metadata" poster`;
  pausa ao trocar de slide, ao fechar e com `document.hidden`; com `prefers-reduced-motion` ou
  `navigator.connection.saveData` mostra só o pôster e um botão de tocar.

`src/tutorials/content.js` (gerado): `export const TUTORIALS = [{ id, titulo, resumo, intro?,
passos: [{ tipo: 'imagem'|'video', src, poster?, alt, legenda }] }]`.

`app.js` guarda e lê a flag `funtime-tutorial-v1` (`{ seen: true, at }`) no `localStorage`,
**por aparelho e fora do backup**, no mesmo padrão de `funtime-terms-v1`.

O visualizador **não** usa `wireDialogDismissal`: tocar fora do dialog não o fecha, para não encerrar
a introdução (e gravar "já vi") por acidente. `navigation.js` já registra todo
`<dialog>` presente no carregamento (Voltar/Escape fecham com `dialog.close()`) e
`src/security/lock.js` já fecha todo `dialog[open]` ao bloquear — sem mudança nesses arquivos.

**Compatibilidade de dados:** `DATA_STORAGE_KEY` e `SECURITY_STORAGE_KEY` não mudam; nenhum
campo novo em `state`.

**Service Worker:** `./src/tutorials/viewer.js` e `./src/tutorials/content.js` entram em
`APP_SHELL`. A mídia em `tutorials/media/` usa o cache próprio
`funtime-tutorials-v<maior>-<menor>` (ex.: `funtime-tutorials-v2-18`), com nomes de arquivo com hash
de conteúdo — então cache-first não serve imagem velha. Diferente de `bg/`, o worker busca o arquivo
inteiro uma vez, guarda, e **responde 206 a pedidos com `Range`** (o Safari só toca vídeo assim,
inclusive offline). A ativação de uma versão menor nova descarta o cache de tutoriais anterior, então
o cache não cresce sem limite; o preço é rebaixar a mídia já vista após cada versão menor.
`scripts/dev-server.cjs` passa a liberar `tutorials/media/*` e o mime `.webp`.

## Achados na implementação

- **Registrar dose é por duplo toque** (um toque isolado não faz nada; pressão longa de ~750 ms inicia a
  reordenação). A proposta inicial dizia "toque para registrar", o que estaria errado num tutorial:
  os roteiros e as legendas foram escritos a partir do comportamento real.
- A imagem do slide transbordava a área reservada e cobria o botão Próximo (`max-height` em
  porcentagem não resolve em linha de grid automática). Corrigido com `flex` + `overflow: hidden`;
  o teste de navegador clica nos botões de verdade e pegou o defeito.
- O evento `close` do `<dialog>` chega uma tarefa depois de `open` virar `false`; testes precisam
  esperar a flag "já vi" aparecer em vez de ler logo após o fechamento.
- O rodapé do app mostra a versão; nas capturas ele fica oculto para o número não mudar as imagens a
  cada release.

- Slide sobre o aviso de segurança **foi retirado** da introdução (retorno de uso): o aviso já está no
  card da Home, no rodapé e nos termos aceitos antes; um slide só para ele era repetição. O mesmo vale
  para "Eventos" no slide do histórico, que confundia — Eventos fica para o tópico próprio (M2).

## Casos de borda preservados

- Usuário que já tem dados (atual ou backup restaurado) **não** vê a introdução; a flag é
  gravada em silêncio. Backup nunca carrega a flag: aparelho novo sem dados vê a introdução.
- Voltar e Escape fecham o visualizador e voltam a Configurações → Como usar
  (`tests/navigation-browser.test.cjs` continua valendo; linha nova em `NAVIGATION.md`).
- Bloquear com o visualizador aberto fecha o dialog e a mídia (`src/security/lock.js`).
- Sem armazenamento local disponível: a introdução aparece de novo na próxima abertura, sem
  erro (mesma tolerância de `requestPersistentStorage`).
- Offline: imagens e vídeos já baixados abrem do cache; mídia ainda não baixada mostra a legenda
  e um aviso curto de "sem conexão", sem quebrar a folha. Para reduzir esse caso, **ao abrir um
  tópico com conexão e sem economia de dados o visualizador baixa em segundo plano toda a mídia
  dele** (~100 a 200 KB por tópico): o tópico segue inteiro se a conexão cair no meio. Sem conexão
  ou com `saveData` não há prefetch e cada slide baixa quando aberto. Uma falha de download é
  engolida e a próxima abertura tenta de novo; no Service Worker, pedidos simultâneos da mesma
  mídia (o prefetch e a própria `<img>`) compartilham uma ida à rede, e uma falha não fica presa
  como download em andamento.

## Plano de teste

- `node --input-type=module --check < app.js`, `node --check sw.js`, `node --check boot.js` e
  checagem de módulo de `src/tutorials/*.js`.
- `tests/tutorials.test.cjs` (unidade: `clampIndex`, `shouldShowIntro`, integridade do manifesto
  e dos seletores) e `tests/tutorials-browser.test.cjs` (primeiro acesso → Pular/Concluir; recarregar
  não reabre; perfil com dados não mostra; Configurações → Como usar; Voltar; bloqueio).
- `tests/settings-menu-browser.test.cjs` atualizado para a nova categoria.
- Determinismo: `tutorials:build` duas vezes, sem diferença nas imagens.
- Fora desta rodada: aparelhos reais (iOS/Android, reprodução de vídeo no Safari), tópicos de
  amigos e evento compartilhado (M3, dependem de estado semeado de nuvem), coach-marks guiados.

## Marcos

M0 esta spec · M1 visualizador, Configurações, introdução, flag, harness de captura, 2 tópicos
(cadastrar bebida; registrar dose, com um vídeo), `check`, teste e regra no `AGENTS.md` (v2.18.0) ·
M2 tópicos de Histórico, Eventos, Backup e bebidas, Privacidade · M3 Amigos e Evento compartilhado.
