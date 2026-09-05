# Intervalo — V1.7.0

Aplicação em HTML, CSS e JavaScript puro para registro pessoal de bebidas e acompanhamento dos intervalos configurados pelo usuário.

Documentação técnica detalhada: [`DEVELOPMENT.md`](./DEVELOPMENT.md).




## Mudanças da V1.7.0

- Implementado fluxo de **atualização controlada da PWA**.
- Uma nova versão do Service Worker é baixada em background e permanece aguardando enquanto a versão atual está em uso.
- Quando existe atualização pronta, o app mostra um aviso discreto **“Nova versão disponível”** com o botão **Atualizar**.
- O novo Service Worker só chama `skipWaiting()` depois da ação explícita do usuário.
- Após a ativação, o app recarrega automaticamente e passa a usar o novo shell em cache.
- O app verifica atualizações no carregamento, ao voltar do background e ao recuperar conexão com a internet.
- O registro do Service Worker usa `updateViaCache: "none"` e o pré-cache baixa os arquivos com `cache: "reload"`, reduzindo risco de instalar assets antigos vindos do cache HTTP.
- O cache desta versão é `intervalo-v1-7-0`.
- `DATA_VERSION` permanece `7`; não houve mudança no schema dos dados do usuário.

## Mudanças da V1.6.5

- Removida da lista do histórico a linha **“Intervalo da dose”**, reduzindo informação redundante no card.
- O selo de tempo decorrido agora comunica também o estado do intervalo daquele registro: **vermelho suave** enquanto ainda não chegou ao intervalo configurado e **verde suave** quando o intervalo já foi concluído.
- A cor do selo é recalculada automaticamente enquanto o histórico permanece aberto, portanto pode mudar de vermelho para verde sem recarregar a tela.
- Mantidos o horário absoluto (`às 05:43h`) e o tempo relativo (`19 min atrás`, `06:52h atrás`, `2 dias atrás`) como informações visuais distintas.
- Cache do Service Worker atualizado para `intervalo-v1-6-5`.

## Mudanças da V1.6.4

- Substituídos os ícones da PWA pelo novo conceito visual do **abacaxi com relógio e canudo**, com arquivos específicos para `192x192`, `512x512`, Apple Touch Icon e favicon.
- Os caminhos dos ícones receberam sufixo de versão para reduzir problemas de cache durante testes de atualização da PWA.
- O histórico agora mostra a hora exata no formato **`às 05:43h`**, diferenciando claramente o horário absoluto.
- Cada anotação do histórico também exibe quanto tempo passou desde o consumo, em estilo visual secundário: **`9 min atrás`**, **`01:25h atrás`** ou **`2 dias atrás`**.
- O tempo decorrido é atualizado enquanto a tela de histórico permanece aberta, sem alterar os dados persistidos.
- Cache do Service Worker atualizado para `intervalo-v1-6-4`.

## Mudanças da V1.6.3

- O corpo do card agora exige **dois toques rápidos** para anotar uma dose ou abrir o fluxo de confirmação quando ainda existe countdown.
- Um toque isolado não cria nenhuma anotação. O primeiro toque recebe feedback visual discreto enquanto o app aguarda o segundo toque por até 430 ms.
- O gesto foi implementado com detecção própria em vez de depender de `dblclick`, visando comportamento mais consistente em Chrome Android, Samsung Internet, Safari iOS e navegadores desktop.
- O **toque e segure** continua abrindo `Anotar dose` para horários retroativos.
- `touch-action: manipulation` evita o zoom de duplo toque do navegador sem impedir a rolagem vertical da lista.
- Cache do Service Worker atualizado para `intervalo-v1-6-3`.

## Mudanças da V1.6.2

- O card principal da tela inicial foi reorganizado em **duas linhas**: o bloco superior concentra ícone, estado, nome e informações auxiliares; a linha inferior concentra a ação principal (por exemplo, **Anotar nova dose** ou **⛔ Aguarde: 00:05:47**).
- A linguagem da interface passou de **registrar** para **anotar** nas ações principais, toasts e fluxos de anotação retroativa.
- O diálogo **Anotar consumo** no mobile agora abre em **tela cheia**, com rolagem do conteúdo e barra de ações fixa no rodapé.
- O formulário de anotação retroativa substituiu os campos numéricos por **wheel pickers** de horas e minutos, visualmente alinhados com o editor de bebidas.
- O menu da bebida passou a usar o texto **Anotar dose** no lugar de **Anotar dose**.

## Mudanças da V1.6.1

- Linguagem dos alertas de sobreposição revisada para **“Tomou dose por cima da outra”** na tela principal, histórico e edição de registro.
- O detalhe da edição agora usa a forma curta: **“Você tomou X após o anterior, quando ainda faltava Y.”**
- A ajuda “Ao salvar, a ordem do histórico...” passou a usar `.clean-optional`, ficando oculta no modo clean atual.
- Adicionado `DEVELOPMENT.md` com documentação técnica detalhada da arquitetura, modelo de dados, fluxos, estados, manutenção, testes e processo de release.

- O botão lateral `Horário` foi substituído por `Histórico`.
- Cada bebida agora pode abrir um histórico filtrado somente com seus próprios registros.
- Toque e segure o corpo do card por cerca de 600 ms para abrir `Anotar dose`.
- O long press é cancelado quando o gesto vira rolagem, evitando registros acidentais ao navegar pela lista.
- O menu `⋮` agora reúne `Anotar dose`, `Editar bebida` e `Excluir bebida`.
- O registro retroativo pelo long press/menu pula a confirmação intermediária, mas continua exibindo o alerta dentro do formulário quando existe intervalo em andamento.
- O toque normal mantém o comportamento anterior: registra agora quando permitido e mostra a confirmação quando o intervalo ainda está contando.


## Mudanças da V1.5.1

- Cada bebida pode ativar a opção **Perguntar se é dose inteira ou meia**.
- Quando a opção está ativa, um novo registro é criado imediatamente como **Inteira**; em seguida, um popup simples permite trocar o registro para **Meia dose**. Fechar o popup sem escolher mantém **Inteira**.
- O tamanho da dose fica salvo no próprio evento (`doseSize: "full" | "half"`). Registros antigos permanecem sem classificação, evitando inventar informação retroativamente.
- O histórico mostra um selo **Meia** ou **Inteira** nos registros que possuem essa informação.
- A tela de edição de um registro permite corrigir posteriormente entre **Meia** e **Inteira**.
- A tela principal mostra a classificação da dose mais recente junto de `Tomou às` ou `Anterior`, quando disponível.
- Ativar/desativar a pergunta em uma bebida afeta apenas novos registros; classificações já salvas permanecem no histórico.
- Dose inteira/meia **não altera o countdown nem a detecção de registros durante o intervalo** nesta versão. O intervalo continua sendo exatamente o configurado para a bebida.
- O editor mobile foi compactado levemente nos ícones e wheel pickers para acomodar a nova opção sem sacrificar a barra fixa de ações.
- Modelo de dados atualizado para a versão 6, com normalização automática dos dados existentes.

### Modelo relevante

```js
// Bebida
{
  id: "...",
  name: "Cafe",
  icon: "🍬",
  intervalMinutes: 60,
  askDoseSize: true
}

// Registro
{
  id: "...",
  drinkId: "...",
  consumedAt: 1788541200000,
  intervalMinutes: 60,
  doseSize: "full" // ou "half"; null em registros antigos/não classificados
}
```


## Mudanças da V1.4.6

- No mobile, o cadastro/edição de bebida passa a ocupar toda a altura útil da viewport.
- O conteúdo do editor possui rolagem própria, enquanto os botões **Cancelar** e **Salvar** permanecem sempre visíveis em uma barra fixa na parte inferior do painel.
- Espaçamentos verticais, seletor de ícones e wheel pickers foram levemente compactados no mobile sem reduzir os botões principais nem comprometer os alvos de toque.
- Em telas particularmente baixas, o editor adota uma compactação adicional dos ícones e dos wheels.
- No desktop, o comportamento continua sendo o modal centralizado tradicional.
- O modelo de dados e a lógica dos wheel pickers não foram alterados.


## Mudanças da V1.4.5

- Os horários `Tomou às` e `Anterior` exibem o `h` como unidade menor e mais discreta.
- O cadastro/edição substitui os campos numéricos de horas e minutos por wheel pickers próprios, com rolagem por toque e `scroll-snap`, para comportamento consistente em Android e iOS.
- Horas variam circularmente de `00` a `24`; minutos variam de `00` a `59`.
- Ao selecionar `24` horas, os minutos são automaticamente fixados em `00` para preservar o limite máximo de 24 horas.
- Os valores continuam sendo persistidos no mesmo campo `intervalMinutes`; não houve mudança no modelo de dados.


## Mudanças da V1.4.2

O seletor de ícones agora usa apenas duas linhas e rolagem horizontal, pensado principalmente para uso por toque no celular.

O catálogo atual, na ordem exibida, é:

`🍬 💊 🍍 🍭 🥃 🍺 🍷 🥂 👃 🐽 🌿 🚬 🌻 ❄️ 🍫 🍄 🍪 🌵 💧 💦 😵‍💫 🕳️ 💤 💫 🥶 🥵 🌊 🪄 🧪 👽 😈 🧙‍♂️`

O catálogo atual é composto pelos emojis escolhidos para o projeto:

```text
🍄 💦 🍄‍🟫 🍬 💊 🍍 🍭 🍫 🍺 🍷 🥂 🚬 🌿 🌻 🌵 💨
❄️ 🧃 💧 👃 🕳️ 💤 💫 🥶 🥵 😵‍💫 🌊 🪄 🧪 👽 😈 🧙‍♂️
```

A lista do seletor não é mais usada para validar dados já gravados. Isso significa que uma bebida antiga pode continuar usando um emoji que não está mais disponível no catálogo atual sem ter seu ícone substituído. Ao editar essa bebida, o ícone antigo aparece como opção selecionada junto do catálogo atual.

Internamente os ícones continuam sendo strings Unicode, portanto o modelo já preserva qualquer emoji válido sem exigir biblioteca ou arquivo de imagem.

## Principal mudança da V1.4

A V1.4 adiciona edição completa das bebidas e reorganiza as ações da tela principal.

Agora o botão lateral `⋮` abre a edição da bebida, permitindo alterar:

- nome;
- ícone;
- intervalo em horas e minutos.

O botão destrutivo foi removido da tela principal e passou a ficar dentro da edição da bebida.

## Alteração de intervalo

Alterar o intervalo da bebida afeta somente registros futuros.

Cada evento continua armazenando o intervalo que estava configurado quando ele foi criado:

```js
{
  id: "...",
  drinkId: "...",
  drinkName: "Vinho",
  drinkIcon: "🍷",
  consumedAt: 1788541200000,
  intervalMinutes: 60
}
```

Portanto, se uma bebida passar de 60 para 90 minutos, os registros antigos continuam sendo avaliados com 60 minutos e os próximos passam a usar 90.

## Exclusão de bebida

Ao escolher **Excluir bebida**, o app mostra três opções:

1. **Cancelar**
2. **Excluir bebida e manter histórico**
3. **Excluir bebida e registros**

### Excluir bebida e manter histórico

A bebida é removida da tela principal, mas seus eventos permanecem no histórico.

Para isso, cada evento passa a guardar também um snapshot do nome e do ícone da bebida. Registros de uma bebida excluída continuam podendo ter data/horário corrigidos ou ser excluídos individualmente.

### Excluir bebida e registros

Remove definitivamente a bebida e todos os eventos ligados a ela.

## Histórico

Mantém as funções da V1.3:

- timeline agrupada por dia;
- destaque permanente de registros ocorridos durante um intervalo;
- edição de data e horário;
- exclusão individual de registros;
- recálculo automático dos alertas depois de qualquer correção.

Quando a bebida já foi excluída, o histórico mostra uma indicação discreta de que o registro foi mantido.

## Estados da tela principal

1. **Sem registro** — bebida sem registros.
2. **Intervalo em andamento** — o intervalo do registro mais recente ainda está contando.
3. **Consumo durante o intervalo** — houve novo registro antes de completar o intervalo anterior.
4. **Intervalo concluído** — o intervalo do registro cronologicamente mais recente terminou.

## Compatibilidade

A chave de dados continua sendo:

```text
balada-v1-data
```

Os dados da V1.3/V1.3.1 são normalizados automaticamente para o modelo da V1.4. A migração antiga de `balada-v1-drinks` também continua disponível.

## Outras funções mantidas

- Cadastro de bebidas.
- Ícones predefinidos.
- Intervalo em horas e minutos, até 24 horas.
- Registro imediato ou retroativo em até 48 horas.
- Reordenação das bebidas pelo consumo cronologicamente mais recente.
- Desfazer novo registro durante 7 segundos.
- Persistência com `localStorage`.
- Manifest e Service Worker mantidos para uso futuro como PWA.

## Aviso de escopo

Os contadores e alertas representam apenas os intervalos configurados pelo próprio usuário. O aplicativo não determina quando é seguro consumir mais álcool.

## Rodar com XAMPP

Coloque a pasta dentro de `htdocs`, por exemplo:

```text
C:\xampp\htdocs\balada-v1
```

Depois acesse:

```text
http://localhost/balada-v1/
```

Para testar no celular na mesma rede, use o IPv4 do computador, por exemplo:

```text
http://192.168.0.10/balada-v1/
```

## Cache ao atualizar

O cache do Service Worker desta versão é:

```text
intervalo-v1-6-2
```

Se uma versão anterior continuar aparecendo, use `Ctrl + F5`. Se necessário, remova o Service Worker/cache do site nas ferramentas do navegador.

## V1.4.4 — refinamentos de interface

- Título da tela principal alterado para **Início**.
- Aviso de escopo movido para depois da lista de bebidas, com espaçamento próprio.
- Cards concluídos usam **Anterior:** no lugar de “Último registro”.
- Cards em contagem usam **Tomou às:** e exibem o contador como **Aguarde: HH:MM:SS**.
- O texto redundante “Intervalo em andamento” foi removido do card em contagem normal.
- Timeline do histórico reorganizada no celular: o horário passa para dentro do card, liberando largura e evitando sobreposição/cortes.
- Footer discreto com `v1.4.4 · By: arielkeybob`.

### Ajustes da V1.4.4

- Countdown em andamento usa `⛔ Aguarde: HH:MM:SS`.
- Horários dos cards usam sufixo `h`, como `Tomou às 18:05h` e `Anterior: 18:05h`.
- Cadastro usa **Intervalo entre doses**.
- A mensagem visual de máximo de 24 horas foi removida; a validação do campo continua existente.
- O aviso sobre alterações futuras de intervalo foi marcado como `.clean-optional` e fica oculto enquanto o `<body>` tiver `.clean-mode`, preparando uma futura configuração de interface limpa.
