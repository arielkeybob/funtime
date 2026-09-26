// Tópico: Bloqueio do aplicativo (spec 0026, marco 2). A biometria real (WebAuthn) não é capturável:
// o tutorial mostra a escolha do método e percorre o caminho do PIN, que roda inteiro no navegador.

const irParaPrivacidade = async (t) => {
  await t.tocar('#open-settings');
  await t.tocar('[data-settings-open=privacy]');
  await t.esperar(300);
};

// Liga o bloqueio e cria o PIN 1234, sem mostrar (usado só para chegar ao estado "bloqueio ativo").
const ativarBloqueioComPin = async (t) => {
  await t.tocar('label[aria-label="Bloquear aplicativo"]');
  await t.page.waitForSelector('#security-method-dialog[open]');
  await t.tocar('#choose-pin-auth');
  await t.page.waitForSelector('#pin-setup-dialog[open]');
  await t.escrever('#pin-setup-value', '1234');
  await t.escrever('#pin-setup-confirm', '1234');
  await t.tocar('#pin-setup-form button[type=submit]');
  await t.page.waitForFunction(() => !document.querySelector('#pin-setup-dialog').open);
  await t.esperarAvisoSumir();
  await t.esperar(300);
};

module.exports = {
  id: 'privacidade',
  titulo: 'Bloqueio do aplicativo',
  resumo: 'PIN ou biometria do aparelho.',
  cobre: ['#security-method-dialog', '#pin-setup-dialog', '#lock-screen', '#security-details'],
  seed: 'demo',
  passos: [
    {
      tipo: 'imagem',
      legenda: 'Ative o bloqueio do aplicativo.',
      alt: 'Tela Privacidade com a chave Bloqueio do aplicativo, desligada, em destaque.',
      antes: irParaPrivacidade,
      destaque: 'label[aria-label="Bloquear aplicativo"]',
    },
    {
      tipo: 'imagem',
      legenda: 'Escolha como desbloquear: biometria ou PIN.',
      alt: 'Pergunta Como desbloquear? com as duas opções em destaque: Biometria / aparelho e PIN do aplicativo.',
      async antes(t) {
        await t.tocar('label[aria-label="Bloquear aplicativo"]');
        await t.page.waitForSelector('#security-method-dialog[open]');
        await t.esperar(300);
      },
      destaque: [
        { seletor: '#choose-device-auth', rotulo: 'Biometria', posicao: 'dentro' },
        { seletor: '#choose-pin-auth', rotulo: 'PIN', posicao: 'dentro' },
      ],
    },
    {
      tipo: 'video',
      legenda: 'Crie um PIN de 4 dígitos e toque em Salvar PIN.',
      alt: 'A opção PIN do aplicativo é tocada, o PIN 1234 é digitado e confirmado e o botão Salvar PIN é tocado; o app avisa que o bloqueio por PIN foi ativado.',
      async preparar(t) {
        await irParaPrivacidade(t);
        await t.tocar('label[aria-label="Bloquear aplicativo"]');
        await t.page.waitForSelector('#security-method-dialog[open]');
        await t.esperar(300);
      },
      async gravar(t) {
        await t.esperar(1200);
        await t.tocarComDedo('#choose-pin-auth');
        await t.page.waitForSelector('#pin-setup-dialog[open]');
        await t.esperar(700);
        await t.digitar('#pin-setup-value', '1234', { atraso: 220 });
        await t.esperar(300);
        await t.digitar('#pin-setup-confirm', '1234', { atraso: 220 });
        await t.esperar(600);
        await t.tocarComDedo('#pin-setup-form button[type=submit]', { antes: 400, descida: 700 });
        await t.page.waitForFunction(() => !document.querySelector('#pin-setup-dialog').open);
        await t.esperarAvisoSumir();
        await t.esperar(900);
      },
    },
    {
      tipo: 'imagem',
      legenda: 'Escolha em quanto tempo o app volta a bloquear.',
      alt: 'Tela Privacidade com o bloqueio ativo e a opção Bloquear após ficar sem uso, com o tempo de 5 minutos, em destaque.',
      async antes(t) {
        // Este ponto da página parte da escolha do método (passo 2): cria o PIN para mostrar as opções.
        await t.tocar('#choose-pin-auth');
        await t.page.waitForSelector('#pin-setup-dialog[open]');
        await t.escrever('#pin-setup-value', '1234');
        await t.escrever('#pin-setup-confirm', '1234');
        await t.tocar('#pin-setup-form button[type=submit]');
        await t.page.waitForFunction(() => !document.querySelector('#pin-setup-dialog').open);
        await t.esperarAvisoSumir();
        await t.esperar(300);
      },
      destaque: '#security-relock',
    },
    {
      tipo: 'video',
      legenda: 'Bloquear agora tranca o app até digitar o PIN.',
      alt: 'O botão Bloquear agora é tocado e o app mostra a tela de bloqueio, pedindo o PIN do aplicativo.',
      async preparar(t) { await irParaPrivacidade(t); await ativarBloqueioComPin(t); },
      async gravar(t) {
        await t.esperar(1400);
        await t.tocarComDedo('#lock-now');
        await t.page.waitForSelector('#lock-screen:not([hidden])');
        await t.esperar(2800);
      },
    },
  ],
};
