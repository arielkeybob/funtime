// GERADO por scripts/tutorials-build.cjs a partir de tutorials/roteiros/ — não edite à mão (spec 0026).
export const TUTORIALS = [
  {
    "id": "introducao",
    "titulo": "Bem-vindo ao FunTime",
    "resumo": "Uma volta rápida pelo app.",
    "intro": true,
    "passos": [
      {
        "tipo": "imagem",
        "src": "./tutorials/media/introducao/01.977bf241.webp",
        "alt": "Tela de cadastro de bebida com nome, ícones e as rodas de horas e minutos do intervalo.",
        "legenda": "Cadastre suas bebidas e escolha o intervalo entre as doses."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/introducao/02.3ea783f5.mp4",
        "poster": "./tutorials/media/introducao/02.poster.753c7a29.webp",
        "alt": "Dois toques no cartão da Cerveja registram a dose e o cartão passa a mostrar a contagem do intervalo.",
        "legenda": "Dê dois toques na bebida para registrar. O intervalo começa a contar."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/introducao/03.5924afee.webp",
        "alt": "Tela inicial com dois botões Histórico em destaque: o do menu inferior, rotulado Geral, e o do cartão da Água, rotulado Só desta bebida.",
        "legenda": "Veja o histórico geral ou só o de uma bebida."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/introducao/04.061b59eb.webp",
        "alt": "Menu de Configurações com a linha Como usar em destaque.",
        "legenda": "Mais detalhes em Configurações → Como usar."
      }
    ]
  },
  {
    "id": "cadastrar-bebida",
    "titulo": "Cadastrar e organizar bebidas",
    "resumo": "Nome, ícone, intervalo e ordem.",
    "passos": [
      {
        "tipo": "imagem",
        "src": "./tutorials/media/cadastrar-bebida/01.89be4c59.webp",
        "alt": "Tela inicial vazia com o botão Adicionar bebida em destaque.",
        "legenda": "Na tela inicial, toque em Adicionar bebida para começar."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/cadastrar-bebida/02.499ce156.webp",
        "alt": "Formulário de cadastro com o nome Cerveja e a lista de ícones em destaque.",
        "legenda": "Dê um nome e escolha um ícone."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/cadastrar-bebida/03.977bf241.webp",
        "alt": "Formulário de cadastro com as rodas de horas e minutos do intervalo em destaque.",
        "legenda": "Defina o intervalo entre as doses girando horas e minutos."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/cadastrar-bebida/04.f11ed3c9.webp",
        "alt": "Formulário de cadastro com a opção Perguntar se é dose inteira ou meia ligada e em destaque.",
        "legenda": "Ative para escolher dose inteira ou meia a cada registro."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/cadastrar-bebida/05.3a31ddfa.mp4",
        "poster": "./tutorials/media/cadastrar-bebida/05.poster.be3fdd5a.webp",
        "alt": "O botão Salvar é tocado e o cadastro fecha, mostrando o cartão da Cerveja na tela inicial.",
        "legenda": "Toque em Salvar: a bebida aparece na tela inicial."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/cadastrar-bebida/06.9862fb6a.mp4",
        "poster": "./tutorials/media/cadastrar-bebida/06.poster.5fb60d7b.webp",
        "alt": "O botão ⋮ do cartão da Cerveja é tocado e abre o menu com as opções Anotar dose e Editar bebida.",
        "legenda": "Toque em ⋮ no cartão para anotar uma dose ou editar a bebida."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/cadastrar-bebida/07.2ba3274b.mp4",
        "poster": "./tutorials/media/cadastrar-bebida/07.poster.3e821fdb.webp",
        "alt": "A Água é segurada e arrastada para o topo da lista de bebidas.",
        "legenda": "Segure uma bebida e arraste para mudar a ordem."
      }
    ]
  },
  {
    "id": "registrar-dose",
    "titulo": "Registrar doses e intervalos",
    "resumo": "Dois toques, contagem e aviso.",
    "passos": [
      {
        "tipo": "video",
        "src": "./tutorials/media/registrar-dose/01.294525c6.mp4",
        "poster": "./tutorials/media/registrar-dose/01.poster.0062f4e2.webp",
        "alt": "Dois toques rápidos no cartão da Cerveja registram a dose e iniciam a contagem.",
        "legenda": "Dê dois toques na bebida para registrar a dose."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/registrar-dose/02.fed0d2db.webp",
        "alt": "Cartão da Água em contagem regressiva, com o tempo restante em destaque.",
        "legenda": "O cartão mostra quanto falta para o intervalo terminar."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/registrar-dose/03.1b76fdb6.webp",
        "alt": "Aviso Intervalo em andamento com os botões Voltar e Já consumi — anotar.",
        "legenda": "Registrar outra dose antes de terminar a anterior mostra um aviso; você decide."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/registrar-dose/04.b7fe37fa.webp",
        "alt": "Menu da bebida com a opção Anotar dose em destaque.",
        "legenda": "Esqueceu de registrar? Use o menu ⋮ e anote a dose em outro horário."
      }
    ]
  }
];
