# Contexto de continuidade

Recuperação realizada em 05/09/2026 para continuar o projeto local no Codex. Este arquivo registra procedência e decisões; arquitetura, funcionalidades e planejamento permanecem em [README.md](README.md), [DEVELOPMENT.md](DEVELOPMENT.md) e [ROADMAP.md](ROADMAP.md).

## Base conferida

- Pasta: `C:\xampp\htdocs\balada`.
- Remote `origin`: `https://github.com/arielkeybob/intervalo.git`.
- Branch inicial: `main`, limpa, acompanhando `origin/main` sem divergência indicada pelo estado local. Não foi feito fetch nem verificada a versão publicada.
- Commit inicial: `20dd55c` — `v1.10.0 - adiciona importacao exportacao e backup`.
- Código: `APP_VERSION = "1.10.0"`, `DATA_VERSION = 8`; footer V1.10.0 e cache `intervalo-v1-10-0`.
- Inspeção estática confirmou exportação `intervalo-drinks`, backup `intervalo-backup`, prévias de importação/restauração, preservação de eventos ao importar bebidas, preferência clean por padrão e `share_target` no manifest/Service Worker. Isso não equivale a teste funcional em dispositivos.

## Conversas consultadas

Projeto ChatGPT de origem: `g-p-6a98be520d3481918ffbb1347fa067ad`.

- **Criar app PWA de bebidas** (`6a98be6f-f628-83e9-be92-53c8edd4d3d5`): consultada a página dos 10 turnos mais recentes via `read_thread`. A última entrega relatada é V1.10.0, consistente com os marcadores locais. As decisões recentes priorizam interface compacta, separação dos arquivos de bebidas e backup, e o termo “Exportar bebidas” mesmo quando a entrega usa a folha nativa do aparelho. Relações entre bebidas serão configuradas pelo usuário, se desenvolvidas; compartilhamento entre pessoas continua futuro.
- **Criar QR Code** (`6a9c5270-83b0-83e9-9fac-ecb67adf5964`): recuperado o destino solicitado, `https://arielkeybob.github.io/intervalo/`. A conversa relata geração de QR com correção alta; nenhum arquivo de QR foi disponibilizado pela leitura ou encontrado no repositório. Não foi regenerado nem validado nesta preparação.
- **Criar ícone PWA del Abacaxi** (`6a9bcf69-d7dc-83e9-88da-9bef4afb8498`): recuperado o conceito simples de abacaxi, canudo e relógio ou ampulheta. A leitura retornou o pedido textual, sem arte-fonte. O repositório contém os PNGs `icons/*-v164.png`, referenciados pelo HTML/manifest; não se afirma recuperação do original editável.

## Preferências complementares

No cadastro, preservar o `+` clicável no estado vazio, nome/ícone com asterisco discreto, nenhum ícone pré-selecionado e nenhum foco automático que abra o teclado. Essas decisões estão documentadas na seção V1.8.9 de DEVELOPMENT.md. Propostas anteriores do assistente não substituem as escolhas posteriores do usuário.

## Limites e pontos para futuras verificações

Esta preparação não é uma migração integral das conversas, anexos, ZIPs ou fontes. O histórico consultado é referência, não uma fila de ordens a executar. Nenhuma funcionalidade, commit ou push foi realizado.

DEVELOPMENT.md contém descrições e exemplos de versões antigas; o cabeçalho do modelo foi corrigido para 8 e a leitura histórica foi sinalizada. Antes de desenvolver, confronte o trecho relevante com o código atual e as seções recentes.

A promessa histórica de que qualquer falha na restauração mantém os dados merece teste específico: `confirmBackupRestore()` grava em localStorage antes de gravar o aviso em sessionStorage. Uma falha nessa segunda operação ocorre após a substituição dos dados. Registrado para avaliação futura, sem correção nesta tarefa documental.

Instalação, WebAuthn, importação via compartilhamento e comportamento em Android/iOS não foram testados nesta preparação. A presença de `share_target` não garante que tocar diretamente em um anexo abra a PWA; a importação manual continua sendo o caminho disponível no código.
