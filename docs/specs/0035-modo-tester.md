# 0035 — Modo tester avançado (diagnóstico local)

Status: implementada (v2.35.0)

## Contexto

Em novembro de 2026, três problemas aconteceram no celular de um tester: doses feitas sem internet
sumiram ao reconectar, a tela "Você está offline" apareceu e a conta do Google caiu. A investigação só
andou com o celular no cabo USB, lendo o armazenamento pela depuração do Chrome. Mesmo assim, a prova
de por que a conta caiu em 02/11 já tinha sumido: nada registra o momento em que algo dá errado.

O usuário pediu uma opção em Configurações, desligada por padrão, que se liga e desliga quando quiser,
para coletar dados e logs de depuração. Decisão registrada no ROADMAP.md: começar pelo registro local
com exportação manual (etapa 1). O envio automático à nuvem (etapa 2) fica para depois, se precisar,
porque exige mudar as políticas, as regras do Firestore, o prazo de retenção e o consentimento.

## Decisão

- **Cartão "Modo tester avançado"** em Configurações → Sobre o app. Começa desligado. Era sempre
  visível na v2.35.0; desde a v2.36.0 fica nas opções de teste ocultas, liberadas por 7 toques na
  versão (spec 0036).
- **Só no aparelho.** O registro fica no localStorage (`funtime-diagnostics-v1`), fora do backup, das
  preferências e da nuvem. Foi o localStorage que sobreviveu quando o Chrome apagou o resto por falta
  de espaço. Nada é enviado: **Exportar diagnóstico** abre o compartilhamento do sistema ou baixa um
  JSON, e a pessoa escolhe com quem mandar.
- **Desligar apaga o registro**, com confirmação quando há eventos. **Apagar registro** limpa e mantém
  ligado. **Apagar tudo deste aparelho** também apaga o registro.
- **Limite:** 1.500 eventos, os mais antigos saem. A gravação espera 500 ms e é forçada quando o app sai
  da tela. Sem espaço, descarta a metade mais antiga; nunca derruba o app.
- **Nunca registra** nome de bebida, conteúdo de registro, e-mail, PIN, token, chave de API nem corpo de
  requisição. Só tipos de evento, contagens, códigos de erro e horários; o uid aparece com 6 caracteres.
  Textos são cortados em 200 caracteres e só se aceita um nível de objeto.

## O que é registrado

| Evento | Quando | Para que serve |
|---|---|---|
| `app.abriu`, `app.ambiente` | Abertura e ao ligar o modo | Versão; se a página veio do Service Worker; armazenamento persistente; uso e cota; bancos IndexedDB do Firebase e caches existentes; se havia sessão guardada; quantas bebidas, registros e eventos |
| `conta.retomando` | Antes de o Firebase abrir | `sessaoGuardada`: se a conta cair em seguida, separa "o armazenamento perdeu a sessão" de "o Firebase a descartou" |
| `conta.http` | Resposta dos servidores de login do Google | Rota, status e **código do erro** (`TOKEN_EXPIRED`…). O SDK só descarta a sessão quando o servidor responde com erro que não é de rede |
| `conta.conectada`, `conta.caiu`, `conta.saiu`, `conta.login`, `conta.sdk-falhou` | Mudanças da conta | Quando caiu, se estava online, se o login funcionou |
| `sync.escutando`, `sync.retrato`, `sync.historico`, `sync.enviou`, `sync.falhou` | Sincronização | Por coleção: quantos havia aqui e na nuvem, quantos ficaram e **quantos foram descartados**; quantos subiram e apagaram |
| `nuvem.erro`, `dados.falhou-gravar`, `erro` | Falhas | Erros dos módulos de nuvem, gravação local recusada (sem espaço) e erros da página |
| `rede`, `app.oculto`, `app.visivel`, `sw.trocou` | Contexto | Conexão, idas e vindas do app e troca de versão |

As respostas de login são observadas por um invólucro do `fetch`, instalado só com o modo ligado, que
olha apenas as rotas `accounts:lookup`, `accounts:signInWithIdp` e `token`. Ele repassa tudo sem mudar
nada.

## A queda de 02/11 (ROADMAP, "Correções a fazer")

No SDK 12.19.0 (`firebase-auth.js` do CDN), a sessão guardada é descartada quando:
1. não há sessão no armazenamento ao abrir;
2. ao recarregar o usuário, qualquer erro com código diferente de `auth/network-request-failed`
   (`reloadAndSetCurrentUserOrClear`). Exceções de rede, tempo esgotado e respostas que não são JSON
   viram `network-request-failed`; só uma resposta de erro do servidor derruba;
3. `auth/user-disabled` ou `auth/user-token-expired` em qualquer renovação (`_logoutIfInvalidated`);
4. a leitura periódica da persistência volta vazia duas vezes seguidas (`_onStorageEvent`).

O servidor não revogou nada (tokens válidos desde a criação nas 3 contas), o que exclui o 3. O 1 e o 4
dependem do armazenamento, que estava intacto em 02/11; e o 4 saiu do caminho na v2.34.3, que tirou a
sessão do IndexedDB. Sobra o 2, que `conta.retomando` + `conta.http` + `conta.caiu` identificam na
próxima ocorrência. Sem saber o erro, não há correção segura: restaurar sozinho uma sessão que o
Firebase descartou ignoraria um bloqueio legítimo.

## Arquivos

- `src/diagnostics/log.js`: o registro (puro, testado em Node).
- `src/diagnostics/probes.js`: invólucro das rotas de login, retrato do armazenamento, erros da página.
- `src/data/firestore-sync.js`: `onDiagnostic(type, build)`; o resumo só é montado com o modo ligado.
- `app.js`: ganchos, cartão e exportação (`deliverFile`, generalizado de `deliverDrinksExport`).
- `reset.js`: "Apagar tudo" chama `disableDiagnostics`.
- `sw.js`: os dois módulos no `APP_SHELL`.

## Testes

- `tests/diagnostics.test.cjs` (15): desligado não grava; grava com atraso e no `flush`; sobrevive a
  reabrir; desligar apaga; limite; limpeza dos detalhes; relatório; registro ilegível; sem espaço;
  invólucro do login guarda só rota, status e código, nunca chave ou corpo; repassa o resto; resumo da
  sincronização com `descartados`.
- `tests/diagnostics-browser.test.cjs` (app real): desligado por padrão; liga; sobrevive a recarregar;
  exportação sem nomes de bebidas; desligar confirma e apaga.

## Políticas

Versão 1.0.10: o item 7 (Privacidade e proteção) descreve o modo tester. **Sem novo aceite**, a pedido
do usuário: a 1.0.9 entrou em `TERMS_VERSIONS_STILL_VALID`, com a justificativa em `policies.js`, e
`tests/audit.test.cjs` trava a dispensa e o trecho.

## Fora desta spec

- Envio automático à nuvem (etapa 2 do ROADMAP).
