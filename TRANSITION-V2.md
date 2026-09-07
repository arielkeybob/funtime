# FunTime v1.16.0 — preparação da transição para v2

Registrado em 07/09/2026. Segunda fase v1.16.0 implementada, validada e incluída nesta entrega. A v2, seu ícone, sua publicação e o novo repositório ainda não foram executados. A v1.15.0 foi enviada a `origin/main` no commit `5edf167`; o deployment do GitHub Pages deve ser conferido separadamente após cada push.

## Entrega desta fase

- Diário de migração compacto com SHA-256, sem duplicar bebidas, histórico ou credenciais no próprio diário. Mantém cópia verificada no destino antes de remover a origem. Também compacta e retoma diários parciais gravados pela v1.15.0, inclusive após início da limpeza.
- Migração assíncrona, aguardada pelo boot enquanto mantém o Web Lock exclusivo. Confere novamente o armazenamento depois dos cálculos de hash. O hash verifica consistência; não é criptografia dos dados nem dos backups.
- Protocolo de boot 2: o Service Worker exige que as janelas tenham o código desta fase; uma janela v1.15.0 respondendo ao protocolo 1 também precisa ser atualizada antes de liberar a migração.
- A limpeza do Service Worker limita-se aos shells da geração v1. Não apaga caches `funtime-v2-*` nem pendências de compartilhamento.
- Descoberta sem dados privados em `/funtime/transition.json`. A v1 só oferece “Abrir FunTime 2” quando recebe diretamente, sem redirecionamento, um JSON válido com status ready, versão 2.x e protocolo compatível. Offline, ausente ou inválido, a v1 segue normalmente. O usuário pode continuar na v1.16 para fazer backup; ao abrir a v2 na mesma janela, a página antiga é encerrada e libera o lock.
- Leitura de um registro local de posse da v2. Quando esse registro válido existir, a v1 mostra somente a orientação para abrir FunTime 2 e o disclaimer, antes de carregar dados, proteção, políticas ou funções de escrita do app. Funciona offline se o shell v1 já estiver em cache. A v1 não cria esse registro e não transfere dados pela rede.

APP_VERSION/boot/SW/footers 1.16.0; cache `funtime-v1-16-0`. DATA_VERSION 9, TERMS_VERSION 1.0.1, formatos de arquivos, ícone, pasta `balada`, repositório `intervalo` e identidade/rotas da PWA permanecem nesta fase.

## Diário compacto

Chave: `funtime-migration-v1`.

- Durante a migração, `version: 2`, `phase: prepared|committed`, com mapas `sources` e `targets` contendo SHA-256 dos valores JSON originais, ou null para ausência.
- O protocolo `version: 1` com cópias completas é aceito somente para retomada/compactação de uma migração anterior. Estado inconsistente bloqueia a abertura.
- A conclusão continua `{ "version": 1, "phase": "done" }`, sem cópias nem hashes dos dados. Uma base já concluída não é copiada novamente.
- Os nomes de armazenamento e o schema dos dados não mudam. Não alterar DATA_VERSION por causa do formato interno do diário.
- Ainda é necessário espaço para a origem e sua cópia no destino. A redução do diário não elimina a quota nem autoriza apagar origens antes de verificar a cópia. Falha preserva os dados e permite retomar; não há downgrade garantido durante uma migração parcial.

## Contrato para a futura instalação v2

Este contrato vale somente quando as instalações compartilham a mesma origem e o mesmo armazenamento. Outro domínio, navegador, perfil ou armazenamento isolado de PWA exige um caminho próprio, a ser validado na v2. Não apresentar esse caso como transferência automática já resolvida.

O lock continua `funtime-app-writer-v1` nas duas gerações. O sufixo é a versão do protocolo de exclusividade, não a versão do produto; renomeá-lo na v2 permitiria duas instalações gravando ao mesmo tempo.

A chave de posse é `funtime-installation-owner-v1`, com este formato:

```json
{
  "version": 1,
  "generation": 2,
  "targetPath": "/funtime/",
  "claimedAt": 1790000000000,
  "dataVersion": 9
}
```

O horário acima é apenas exemplo. `claimedAt` será o timestamp da transferência; `dataVersion` registra o schema assumido. `targetPath` é exatamente `/funtime/`, na mesma origem, sem query, fragmento, domínio externo ou dados privados. Protocolos de posse desconhecidos ou conteúdo inválido bloqueiam a v1, sem fallback para escrita.

Para liberar o convite, a raiz da v2 deverá publicar `transition.json` com o formato de [transition-v2-ready.example.json](transition-v2-ready.example.json), substituindo `publishedAt` pelo timestamp real. Publicar esse marcador é o último passo da disponibilização: primeiro devem estar validados o app, manifest, Service Worker, receptor e instalação da v2. Remover ou invalidar o marcador interrompe novos convites, sem reativar uma v1 cuja posse já tenha sido transferida.

`transition.js` fornece apenas o leitor desse contrato e os nomes do lock/chave. O receptor de teste em `tests/transition-browser.test.cjs` não é um app v2 pronto para publicação.

### Ordem exigida da entrega v2

1. Publicar e verificar o destino com o novo ícone e a nova identidade da PWA. Manter a mesma origem se for usar este protocolo. Publicar `transition.json` somente depois dessa verificação; a v1.16 passa a descobrir a disponibilidade sem outra atualização.
2. Garantir que a ponte v1.16 ou posterior continue disponível em `/intervalo/`, incluindo manifest, SW e shell. Validar a versão ativa do SW, não apenas o arquivo remoto: `GET_VERSION` precisa anunciar `migrationProtocol: 2` e `transitionProtocol: 1`; `FUNTIME_PREPARE` precisa confirmar `ready: true`, `protocol: 2` e `transitionProtocol: 1`. Usuários podem ter pulado todas as versões intermediárias.
3. Adquirir o mesmo lock exclusivo, aguardando o encerramento da janela v1. Não usar `steal`, não forçar escrita concorrente e não tirar um snapshot antes de obter o lock: a v1 pode receber novos registros enquanto o receptor aguarda.
4. Sob o lock, concluir qualquer migração pendente, validar e reler os dados restauráveis e a configuração de proteção. Não iniciar silenciosamente com estado vazio se o armazenamento esperado não estiver acessível. Verificar a acessibilidade real no contexto instalado da v2.
5. Só depois dessas verificações, gravar e reler o registro de posse. O registro é o ponto de compromisso que impede a v1 de voltar a escrever. Antes de alterar o schema de forma incompatível, a v1 já precisa estar desativada por esse registro. Em caso de falha posterior, a v2 deve recuperar o processo; não apagar o registro para fazer downgrade automático.
6. A v2 assume as escritas sob o mesmo lock. Na mesma área de armazenamento pode reutilizar os dados, sem exportação nem cópia pela rede. Se precisar mudar novamente as chaves/schema, implementar um diário próprio com recuperação e testes de interrupção.
7. Tratar autenticação e sessão do aparelho no contexto da nova instalação. Não transportar PIN, credenciais, sessão ou aceite por arquivos de backup. Não prometer reutilização universal de biometria entre instalações.
8. Consumir também pendências recebidas no caminho antigo `/intervalo/__shared-drinks-import__`, nos caches compatíveis. Um compartilhamento para o ícone antigo ainda pode ser recebido pelo SW antigo mesmo quando sua interface já está desativada. Preservar prévia e confirmação, evitando perder ou duplicar arquivos.

O registro não substitui autenticação nem estabelece uma fronteira de segurança entre scripts da mesma origem; é um contrato de consistência entre versões confiáveis do próprio app. A v1 não lê os dados privados quando a posse é da v2, mesmo se encontrar um schema futuro que não conhece.

## Publicação e renomeação futuras

Na publicação da v2, o arranjo recomendado é criar o repositório principal `funtime` com o histórico do projeto e manter `intervalo` como repositório mínimo de compatibilidade, servindo a ponte v1.16 em `/intervalo/`. Renomear o único repositório faria o GitHub Pages antigo deixar de atender a ponte. Documentar e testar os dois deployments, inclusive usuários offline que retornem meses depois. Esta entrega ainda não cria o segundo repositório nem altera o remote.

A fase v2 ainda depende do novo ícone prometido pelo usuário e de testes de instalação/armazenamento nos aparelhos usados. No caso de armazenamento isolado, os backups compatíveis já existentes são um recurso de recuperação, mas qualquer fluxo adicional de transferência deve ser projetado e testado antes da v2.

## Validação desta fase

Resultado em 07/09/2026: **55 testes Node e 3 testes integrados no Edge aprovados**, além de `node --check app.js`, `sw.js`, `boot.js`, `migration.js`, `transition.js` e `git diff --check`. Inspeção visual em 390×844: início compacto e tela de transição com disclaimer e alvo de toque de 44px. Dados reais preservados.

Testes Node: `node --test tests/audit.test.cjs tests/migration.test.cjs tests/migration-sw.test.cjs tests/transition.test.cjs tests/reset.test.cjs tests/ui.test.cjs`.

Testes de navegador com Playwright e Edge via NODE_PATH:

- `node --test tests/migration-browser.test.cjs`: atualizações diretas dos arquivos reais da v1.14.3 e v1.15.0 para a árvore atual; PIN, duas janelas, arquivos antigos/novos, prévias, restauração e offline. Downloads usam o fallback explicitamente; a folha nativa permanece teste de aparelho.
- `node --test tests/transition-browser.test.cjs`: `/intervalo/` e receptor de teste em `/funtime/`, na mesma origem; valida descoberta do marcador, opção de continuar na v1, espera do lock, última gravação e registro de posse. Depois disso a v1 não carrega dados/scripts do app, nem com schema futuro ou após recarga offline. Registro de posse inválido bloqueia sem link externo.

Perfis e servidor são temporários, com dados fictícios. `navigator.standalone` simula o modo instalado, não a instalação real no launcher. Android/iOS, biometria real, armazenamento isolado entre instalações, teclado virtual, leitor de tela e compartilhamento nativo continuam pendentes. Nenhum armazenamento real foi alterado.

Referências: [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), [SHA-256 com Web Crypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest), [Web Storage por origem](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API).
