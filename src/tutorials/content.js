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
        "src": "./tutorials/media/introducao/02.5e08aac3.mp4",
        "poster": "./tutorials/media/introducao/02.poster.f67e5140.webp",
        "alt": "O cartão da Cerveja recebe o destaque azul e dois toques seguidos o registram; o cartão passa a mostrar a contagem do intervalo e o app avisa que o consumo foi anotado.",
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
        "src": "./tutorials/media/introducao/04.170f3d46.webp",
        "alt": "Menu de Configurações com a linha Como usar o App em destaque.",
        "legenda": "Mais detalhes em Configurações → Como usar o App."
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
        "src": "./tutorials/media/cadastrar-bebida/01.596efc52.webp",
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
        "src": "./tutorials/media/cadastrar-bebida/05.557e75fb.mp4",
        "poster": "./tutorials/media/cadastrar-bebida/05.poster.e25c366e.webp",
        "alt": "O botão Salvar é tocado e o cadastro fecha, mostrando o cartão da Cerveja na tela inicial.",
        "legenda": "Toque em Salvar: a bebida aparece na tela inicial."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/cadastrar-bebida/06.ca3e0865.mp4",
        "poster": "./tutorials/media/cadastrar-bebida/06.poster.ed0d6589.webp",
        "alt": "O botão ⋮ do cartão da Cerveja é tocado e abre o menu com as opções Anotar dose e Editar bebida.",
        "legenda": "Toque em ⋮ no cartão para anotar uma dose ou editar a bebida."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/cadastrar-bebida/07.513a3d69.mp4",
        "poster": "./tutorials/media/cadastrar-bebida/07.poster.f6637880.webp",
        "alt": "A Água é segurada e arrastada para o topo da lista de bebidas.",
        "legenda": "Segure uma bebida e arraste para mudar a ordem."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/cadastrar-bebida/08.1c3f6240.mp4",
        "poster": "./tutorials/media/cadastrar-bebida/08.poster.3e13b43d.webp",
        "alt": "Da tela inicial, o botão ⋮ da Água é tocado, depois Editar bebida e Excluir bebida; a pergunta sobre o histórico mostra as duas opções, e a opção de manter o histórico é tocada; a Água some da lista e o app avisa que ela foi excluída e o histórico mantido.",
        "legenda": "Para excluir a bebida, escolha manter ou apagar o histórico dela."
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
        "src": "./tutorials/media/registrar-dose/01.199f9554.mp4",
        "poster": "./tutorials/media/registrar-dose/01.poster.7770d35b.webp",
        "alt": "O cartão da Cerveja recebe o destaque azul e dois toques rápidos o registram; a contagem do intervalo começa e o app avisa que o consumo foi anotado.",
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
  },
  {
    "id": "historico",
    "titulo": "Histórico e correções",
    "resumo": "Geral, por bebida, correções e reações.",
    "passos": [
      {
        "tipo": "video",
        "src": "./tutorials/media/historico/01.1b172782.mp4",
        "poster": "./tutorials/media/historico/01.poster.3a1012f3.webp",
        "alt": "Na tela inicial, o botão Histórico do menu de baixo recebe o destaque azul e é tocado; abre a lista com todos os registros, do mais recente ao mais antigo.",
        "legenda": "Toque em Histórico no menu para ver todos os registros."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/historico/02.e3b2a32d.mp4",
        "poster": "./tutorials/media/historico/02.poster.71e538b3.webp",
        "alt": "O botão Histórico do cartão da Cerveja é tocado e abre a lista só com os registros dessa bebida.",
        "legenda": "No card, o botão Histórico mostra só aquela bebida."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/historico/03.e8af93eb.mp4",
        "poster": "./tutorials/media/historico/03.poster.9fe8a5ab.webp",
        "alt": "Um registro do Histórico é tocado e abre o editor, com a data e as rodas de hora e minuto em destaque.",
        "legenda": "Toque num registro para corrigir o horário."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/historico/04.17b6a80d.mp4",
        "poster": "./tutorials/media/historico/04.poster.74e28455.webp",
        "alt": "Um registro do Histórico recebe um toque e segurar; um seletor flutuante com até quatro reações, de \"Péssimo\" a \"Ótimo\", aparece perto dele; a reação \"Ótimo\" é tocada, o seletor fecha e o selo da reação aparece no canto do registro.",
        "legenda": "Segure um registro para reagir à dose."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/historico/05.71487d54.mp4",
        "poster": "./tutorials/media/historico/05.poster.5ad73986.webp",
        "alt": "Da tela inicial, o botão Histórico é tocado e depois um registro; no editor, o botão Excluir este registro é tocado e a exclusão é confirmada; o registro some da lista e o app avisa que foi excluído, com a opção Desfazer.",
        "legenda": "Para excluir um registro, toque nele, em Excluir e confirme."
      }
    ]
  },
  {
    "id": "privacidade",
    "titulo": "Bloqueio do aplicativo",
    "resumo": "PIN ou biometria do aparelho.",
    "passos": [
      {
        "tipo": "texto",
        "legenda": "Mantenha sua privacidade.",
        "icone": "🔒",
        "linhas": [
          "Se alguém pegar seu celular, não abre o app nem vê seus consumos.",
          "Você escolhe como desbloquear: PIN ou biometria.",
          "É opcional e vale só neste aparelho.",
          "Protege a abertura do app, não os arquivos do celular."
        ]
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/privacidade/02.4e76983f.webp",
        "alt": "Tela Privacidade com a chave Bloqueio do aplicativo, desligada, em destaque.",
        "legenda": "Ative o bloqueio do aplicativo."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/privacidade/03.2e812146.webp",
        "alt": "Pergunta Como desbloquear? com as duas opções em destaque: Biometria / aparelho e PIN do aplicativo.",
        "legenda": "Escolha como desbloquear: biometria ou PIN."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/privacidade/04.8bda7219.mp4",
        "poster": "./tutorials/media/privacidade/04.poster.bf7ca204.webp",
        "alt": "A opção PIN do aplicativo é tocada, o PIN 1234 é digitado e confirmado e o botão Salvar PIN é tocado; o app avisa que o bloqueio por PIN foi ativado.",
        "legenda": "Crie um PIN de 4 dígitos e toque em Salvar PIN."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/privacidade/05.f4216c70.webp",
        "alt": "Tela Privacidade com o bloqueio ativo e a opção Bloquear após ficar sem uso, com o tempo de 5 minutos, em destaque.",
        "legenda": "Escolha em quanto tempo o app vai bloquear sozinho."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/privacidade/06.13c02600.mp4",
        "poster": "./tutorials/media/privacidade/06.poster.673bcf62.webp",
        "alt": "O botão Bloquear agora é tocado e o app mostra a tela de bloqueio, pedindo o PIN do aplicativo (ou a biometria do aparelho, se esse for o método escolhido).",
        "legenda": "Bloquear agora tranca o app até digitar o PIN ou biometria."
      }
    ]
  },
  {
    "id": "eventos",
    "titulo": "Eventos e agenda",
    "resumo": "Ligar, criar, agendar e encerrar.",
    "passos": [
      {
        "tipo": "texto",
        "legenda": "Um evento reúne os consumos de uma ocasião.",
        "icone": "🎉",
        "linhas": [
          "Pode ser uma festa, churrasco ou viagem.",
          "No Histórico, você filtra por evento.",
          "Dá para agendar para começar depois.",
          "É opcional: o app funciona sem eventos."
        ]
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/eventos/02.686ab4d9.mp4",
        "poster": "./tutorials/media/eventos/02.poster.afa1c830.webp",
        "alt": "A opção Usar eventos, em Configurações → Aparência, é tocada e liga; o app avisa que os eventos foram ativados.",
        "legenda": "Em Configurações → Aparência, ative Usar eventos."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/eventos/03.8c51c0c9.webp",
        "alt": "Tela inicial com a aba Evento, recém-criada, em destaque no menu de baixo.",
        "legenda": "A aba Evento aparece no menu de baixo."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/eventos/04.4f7507bf.mp4",
        "poster": "./tutorials/media/eventos/04.poster.22ff9cbb.webp",
        "alt": "A aba Evento é tocada e, na lista de eventos, o botão + Novo é tocado e abre o formulário Novo evento.",
        "legenda": "Na aba Evento, toque em + Novo."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/eventos/05.7ac7a17f.mp4",
        "poster": "./tutorials/media/eventos/05.poster.fc6d845f.webp",
        "alt": "O nome Churrasco do João é digitado no formulário Novo evento e o botão Iniciar evento é tocado.",
        "legenda": "Dê um nome e toque em Iniciar evento."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/eventos/06.20507289.webp",
        "alt": "Tela inicial com o evento Churrasco do João em andamento, em destaque no topo, e os cartões das bebidas.",
        "legenda": "As doses que você registrar entram no evento em andamento."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/eventos/07.082705d2.webp",
        "alt": "Formulário Novo evento com a opção Escolher data selecionada em Quando começar?, em destaque.",
        "legenda": "Para agendar, troque para Escolher data."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/eventos/08.4640d5a2.mp4",
        "poster": "./tutorials/media/eventos/08.poster.437d6b31.webp",
        "alt": "No detalhe do evento em andamento, o botão Encerrar evento é tocado e, na confirmação, o botão Encerrar também.",
        "legenda": "No evento, toque em Encerrar evento e confirme."
      }
    ]
  },
  {
    "id": "amigos",
    "titulo": "Amigos e compartilhar doses",
    "resumo": "Conectar e mostrar as doses.",
    "passos": [
      {
        "tipo": "imagem",
        "src": "./tutorials/media/amigos/01.3cb25e77.webp",
        "alt": "Tela Backup e conta com o botão Entrar com Google, no cartão Sincronizar entre aparelhos, em destaque.",
        "legenda": "A função Amigos precisa da Conta Google: entre em Backup e conta."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/amigos/02.f7d8ae6a.mp4",
        "poster": "./tutorials/media/amigos/02.poster.058e705d.webp",
        "alt": "Na tela inicial, o ícone Amigos, no canto superior direito, é tocado e abre a tela Amigos com Bia, Caio e Duda.",
        "legenda": "Com a conta conectada, toque no ícone Amigos da tela inicial."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/amigos/03.d7458e3d.mp4",
        "poster": "./tutorials/media/amigos/03.poster.74feb5ec.webp",
        "alt": "Na tela Amigos, o botão + é tocado e abre Adicionar amigo; o botão Gerar código é tocado e aparecem o código com QR e o tempo de validade.",
        "legenda": "Toque em + e mostre o código à outra pessoa, ou digite o dela."
      },
      {
        "tipo": "texto",
        "legenda": "Você pode compartilhar seu consumo com um amigo se quiser.",
        "icone": "🤝",
        "linhas": [
          "Só compartilha se você quiser: a escolha é sua.",
          "Você decide com quem e em qual evento.",
          "Seu amigo vê só as doses daquele evento.",
          "Você pode parar quando quiser."
        ]
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/amigos/05.849921ef.webp",
        "alt": "Detalhe de um amigo, na aba Compartilhando, com o evento Churrasco do João, em andamento e ainda não compartilhado, em destaque.",
        "legenda": "O fato de ser amigo não mostra nada. É preciso compartilhar."
      },
      {
        "tipo": "texto",
        "legenda": "Compartilhar funciona dentro de um evento.",
        "icone": "🎉",
        "linhas": [
          "Primeiro, precisa estar rolando um evento.",
          "Tudo que for consumido nele pode ser compartilhado, ou não.",
          "Você escolhe com quais amigos: um ou mais."
        ]
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/amigos/07.fa8d6c93.mp4",
        "poster": "./tutorials/media/amigos/07.poster.8e7feb22.webp",
        "alt": "Um amigo é tocado, depois a aba Compartilhando e o botão Compartilhar; o evento passa a aparecer como ao vivo para essa pessoa, com o botão Parar.",
        "legenda": "Toque no amigo, em Compartilhando e em Compartilhar."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/amigos/08.4f09ee13.webp",
        "alt": "Aba Compartilhando com o evento Churrasco do João ao vivo para essa pessoa e o botão Parar em destaque.",
        "legenda": "Para encerrar antes do fim do evento, toque em Parar."
      }
    ]
  },
  {
    "id": "evento-compartilhado",
    "titulo": "Evento compartilhado",
    "resumo": "Convidar amigos e aceitar.",
    "passos": [
      {
        "tipo": "video",
        "src": "./tutorials/media/evento-compartilhado/01.90f1f2c9.mp4",
        "poster": "./tutorials/media/evento-compartilhado/01.poster.0b792f73.webp",
        "alt": "No formulário Novo evento, a linha Convidados é tocada; Bia e Caio são escolhidos e confirmados, e a linha passa a mostrar 2 pessoas.",
        "legenda": "No evento, toque em Convidados e escolha os amigos."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/evento-compartilhado/02.65168e5e.webp",
        "alt": "Formulário Novo evento com as duas linhas em destaque: Convidados, que mostra só o evento, e Compartilhar doses, que é uma escolha separada.",
        "legenda": "Convidar mostra só o evento; as doses são outra escolha."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/evento-compartilhado/03.3f1441ce.mp4",
        "poster": "./tutorials/media/evento-compartilhado/03.poster.e74a5859.webp",
        "alt": "A aba Evento é tocada e mostra, no topo de Próximos, o convite Festa Junina, da Bia, aguardando resposta; o botão Vou é tocado e o app avisa que o evento foi para a agenda.",
        "legenda": "Quem é convidado responde Vou ou Não vou na aba Evento."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/evento-compartilhado/04.ed5647c4.webp",
        "alt": "Lista de convidados de uma festa agendada: a Bia tem o símbolo de envelope, convidada sem resposta; o Caio tem o símbolo de confirmado; a Duda não foi convidada.",
        "legenda": "✉ foi convidado; ✔ já confirmou que vai."
      }
    ]
  },
  {
    "id": "backup-e-bebidas",
    "titulo": "Backup e bebidas",
    "resumo": "Exportar, importar e restaurar.",
    "passos": [
      {
        "tipo": "texto",
        "legenda": "Bebidas e backup são coisas diferentes.",
        "icone": "💾",
        "linhas": [
          "Exportar bebidas: só a lista, para passar a alguém.",
          "Backup: bebidas, histórico e preferências.",
          "Guarde seus dados ou troque de celular.",
          "O PIN e o bloqueio nunca vão no arquivo."
        ]
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/backup-e-bebidas/02.894c3f85.webp",
        "alt": "Tela Backup e conta com dois cartões em destaque: Exportar e importar, rotulado Só as bebidas, e Dados do aplicativo, rotulado Bebidas + histórico.",
        "legenda": "Em Backup e conta, os dois ficam em cartões separados."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/backup-e-bebidas/03.d64fb992.mp4",
        "poster": "./tutorials/media/backup-e-bebidas/03.poster.b2fec5d9.webp",
        "alt": "O botão Exportar bebidas é tocado e o app avisa que o arquivo de bebidas foi exportado.",
        "legenda": "Exportar bebidas gera um arquivo para compartilhar ou guardar."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/backup-e-bebidas/04.e5ae0aad.mp4",
        "poster": "./tutorials/media/backup-e-bebidas/04.poster.6bca91c8.webp",
        "alt": "O botão Importar bebidas é tocado e abre a prévia do arquivo, com as opções Adicionar às bebidas atuais e Substituir minha lista de bebidas em destaque.",
        "legenda": "Importar mostra uma prévia: adicionar ou substituir a lista."
      },
      {
        "tipo": "video",
        "src": "./tutorials/media/backup-e-bebidas/05.8c6e7bbb.mp4",
        "poster": "./tutorials/media/backup-e-bebidas/05.poster.d9fbe946.webp",
        "alt": "O botão Fazer backup é tocado e o app avisa que o backup foi criado e que o arquivo deve ser guardado em local privado.",
        "legenda": "Fazer backup salva bebidas, histórico e preferências."
      },
      {
        "tipo": "imagem",
        "src": "./tutorials/media/backup-e-bebidas/06.d4d38cba.webp",
        "alt": "Prévia de Restaurar backup, com o aviso O que será substituído em destaque: bebidas, histórico e preferências; bloqueio e PIN do aparelho não mudam.",
        "legenda": "Restaurar troca os dados atuais; o PIN não muda."
      }
    ]
  }
];
