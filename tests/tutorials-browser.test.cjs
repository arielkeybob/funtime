// Tutoriais (spec 0026) em navegador real, origem e perfil efêmeros: introdução no primeiro
// acesso, Configurações → Como usar o App, Voltar/Escape, mídia que falha e movimento reduzido.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('../scripts/dev-server.cjs');

const FLAG = 'funtime-tutorial-v1';

async function withApp(run, { contextOptions = {}, initScript = null } = {}) {
  const server = createDevServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...contextOptions });
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    if (initScript) await context.addInitScript(initScript);
    const page = await context.newPage();
    const erros = [];
    page.on('pageerror', (error) => erros.push(error.message));
    // ?tutorial-intro: o dev server marca a introdução como vista, salvo quando este parâmetro pede o primeiro acesso.
    const url = `http://127.0.0.1:${server.address().port}/funtime/?tutorial-intro=1`;
    await page.goto(url);
    for (const caixa of await page.locator('#terms-form input[type=checkbox]').all()) await caixa.check();
    await page.locator('#terms-continue').click();
    await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    await run(page, erros, { context, recarregar: async () => {
      await page.reload();
      await page.waitForFunction(() => typeof state !== 'undefined' && !document.body.classList.contains('boot-pending'));
    } });
  } finally {
    await browser.close();
    server.close();
  }
}

const dialogAberto = (page) => page.evaluate(() => document.querySelector('#tutorial-dialog').open);
const contador = async (page) => {
  const [, atual, total] = /^(\d+) de (\d+)$/.exec(await page.locator('#tutorial-counter').textContent());
  return { atual: Number(atual), total: Number(total) };
};
const fecharIntro = async (page) => {
  await page.waitForSelector('#tutorial-dialog[open]');
  await page.locator('#tutorial-skip').click();
  await page.waitForFunction(() => !document.querySelector('#tutorial-dialog').open);
};
const flag = (page) => page.evaluate((chave) => JSON.parse(localStorage.getItem(chave)), FLAG);
// O evento `close` do dialog chega uma tarefa depois de `open` virar false: espera a flag aparecer.
const flagGravada = async (page) => {
  await page.waitForFunction((chave) => localStorage.getItem(chave) !== null, FLAG);
  return flag(page);
};

test('primeiro acesso abre a introdução com Pular; pular grava a flag e recarregar não reabre', { timeout: 60000 }, async () => {
  await withApp(async (page, erros, { recarregar }) => {
    await page.waitForSelector('#tutorial-dialog[open]');
    assert.equal(await page.locator('#tutorial-eyebrow').textContent(), 'Primeiros passos');
    assert.equal(await page.locator('#tutorial-skip').isVisible(), true);
    assert.equal(await page.locator('#tutorial-close').isVisible(), false);
    assert.equal((await contador(page)).atual, 1);
    assert.notEqual((await page.locator('#tutorial-caption').textContent()).trim(), '');
    await page.waitForFunction(() => {
      const midia = document.querySelector('#tutorial-stage .tutorial-media');
      return midia && (midia.tagName === 'VIDEO' || midia.naturalWidth > 0);
    });
    assert.equal(await flag(page), null, 'a flag só é gravada quando a introdução termina');
    await page.locator('#tutorial-skip').click();
    await page.waitForFunction(() => !document.querySelector('#tutorial-dialog').open);
    assert.equal((await flagGravada(page)).seen, true);
    await recarregar();
    await page.waitForTimeout(400);
    assert.equal(await dialogAberto(page), false);
    assert.deepEqual(erros, []);
  });
});

test('avançar até o fim troca Pular por Concluir, e Concluir encerra e grava a flag', { timeout: 60000 }, async () => {
  await withApp(async (page, erros) => {
    await page.waitForSelector('#tutorial-dialog[open]');
    const { total } = await contador(page);
    assert.ok(total >= 2);
    assert.equal(await page.locator('#tutorial-prev').isDisabled(), true);
    for (let i = 1; i < total; i++) await page.locator('#tutorial-next').click();
    assert.deepEqual(await contador(page), { atual: total, total });
    assert.equal(await page.locator('#tutorial-next').textContent(), 'Concluir');
    assert.equal(await page.locator('#tutorial-skip').isVisible(), false);
    await page.locator('#tutorial-prev').click();
    assert.equal((await contador(page)).atual, total - 1);
    await page.keyboard.press('ArrowRight');
    assert.equal((await contador(page)).atual, total);
    await page.locator('#tutorial-next').click();
    await page.waitForFunction(() => !document.querySelector('#tutorial-dialog').open);
    assert.equal((await flagGravada(page)).seen, true);
    assert.deepEqual(erros, []);
  });
});

test('Voltar/Escape na introdução contam como pular', { timeout: 60000 }, async () => {
  await withApp(async (page, erros) => {
    await page.waitForSelector('#tutorial-dialog[open]');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#tutorial-dialog').open);
    assert.equal((await flagGravada(page)).seen, true);
    assert.deepEqual(erros, []);
  });
});

test('quem já tem dados não vê a introdução, e a flag é gravada em silêncio', { timeout: 60000 }, async () => {
  await withApp(async (page, erros, { recarregar }) => {
    await fecharIntro(page);
    await page.evaluate((chave) => {
      state.drinks = [{ id: 'd', name: 'Água', icon: '💧', intervalMinutes: 30, askDoseSize: false }];
      state.events = [];
      saveData();
      localStorage.removeItem(chave);
    }, FLAG);
    await recarregar();
    await page.waitForTimeout(400);
    assert.equal(await dialogAberto(page), false);
    assert.equal((await flagGravada(page)).seen, true);
    assert.deepEqual(erros, []);
  });
});

test('Configurações → Como usar o App lista os tópicos; abrir mostra × sem Pular; Voltar fecha só o visualizador', { timeout: 60000 }, async () => {
  await withApp(async (page, erros) => {
    await fecharIntro(page);
    await page.locator('#open-settings').click();
    assert.equal(await page.locator('#settings-row-tutorials').isVisible(), true);
    assert.match(await page.locator('#settings-summary-tutorials').textContent(), /^\d+ tutoriais?$/);
    await page.locator('#settings-row-tutorials').click();
    assert.equal(await page.locator('#settings-header-title').textContent(), 'Como usar o App');
    const linhas = page.locator('#tutorial-topics .settings-nav-row');
    assert.ok(await linhas.count() >= 2);
    assert.equal(await linhas.first().locator('strong').textContent(), 'Rever a introdução');

    await linhas.nth(1).click();
    await page.waitForSelector('#tutorial-dialog[open]');
    assert.equal(await page.locator('#tutorial-eyebrow').textContent(), 'Como usar o App');
    assert.equal(await page.locator('#tutorial-skip').isVisible(), false);
    assert.equal(await page.locator('#tutorial-close').isVisible(), true);
    const alt = await page.locator('#tutorial-stage .tutorial-media').getAttribute('alt')
      ?? await page.locator('#tutorial-stage .tutorial-media').getAttribute('aria-label');
    assert.ok(alt && alt.trim());
    await page.locator('#tutorial-next').click();
    assert.equal((await contador(page)).atual, 2);

    await page.waitForFunction(() => history.state?.funtimeNavigation?.depth === 3);
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector('#tutorial-dialog').open);
    assert.equal(await page.evaluate(() => state.settingsPage), 'tutorials');
    await page.goBack();
    await page.waitForFunction(() => state.currentView === 'settings' && state.settingsPage === null);

    // Escape também fecha, e "Rever a introdução" abre a introdução como tópico comum.
    await page.locator('#settings-row-tutorials').click();
    await page.locator('#tutorial-topics .settings-nav-row').first().click();
    await page.waitForSelector('#tutorial-dialog[open]');
    assert.equal(await page.locator('#tutorial-close').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#tutorial-dialog').open);
    assert.equal(await page.evaluate(() => state.settingsPage), 'tutorials');
    assert.deepEqual(erros, []);
  });
});

test('mídia que não carrega mostra um aviso e não trava a navegação da folha', { timeout: 60000 }, async () => {
  await withApp(async (page, erros) => {
    await fecharIntro(page);
    await page.route('**/tutorials/media/**', (rota) => rota.abort());
    await page.locator('#open-settings').click();
    await page.locator('#settings-row-tutorials').click();
    await page.locator('#tutorial-topics .settings-nav-row').nth(1).click();
    await page.waitForSelector('#tutorial-dialog[open]');
    await page.waitForSelector('.tutorial-media-error');
    assert.equal((await page.locator('.tutorial-media-error').textContent()).trim(),
      'Não foi possível carregar esta mídia. Conecte-se à internet e abra de novo.');
    assert.notEqual((await page.locator('#tutorial-caption').textContent()).trim(), '', 'a legenda continua valendo');
    await page.locator('#tutorial-next').click();
    assert.equal((await contador(page)).atual, 2);
    assert.deepEqual(erros, []);
  });
});

test('com movimento reduzido o vídeo não toca sozinho e oferece um botão', { timeout: 60000 }, async (t) => {
  await withApp(async (page, erros) => {
    await fecharIntro(page);
    await page.evaluate(() => { document.querySelector('#open-settings').click(); });
    await page.locator('#settings-row-tutorials').click();
    // Procura o primeiro slide com vídeo em qualquer tópico.
    const linhas = await page.locator('#tutorial-topics .settings-nav-row').count();
    let achou = false;
    for (let i = 0; i < linhas && !achou; i++) {
      await page.locator('#tutorial-topics .settings-nav-row').nth(i).click();
      await page.waitForSelector('#tutorial-dialog[open]');
      const { total } = await contador(page);
      for (let passo = 1; passo <= total && !achou; passo++) {
        if (await page.locator('#tutorial-stage video').count()) achou = true;
        else if (passo < total) await page.locator('#tutorial-next').click();
      }
      if (!achou) { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#tutorial-dialog').open); }
    }
    if (!achou) { t.skip('o conteúdo atual não tem slide de vídeo'); return; }
    assert.equal(await page.locator('.tutorial-play').isVisible(), true);
    assert.equal(await page.locator('#tutorial-stage video').evaluate((video) => video.paused), true);
    await page.locator('.tutorial-play').click();
    await page.waitForFunction(() => document.querySelector('#tutorial-stage video')?.paused === false);
    assert.equal(await page.locator('.tutorial-play').count(), 0);
    assert.deepEqual(erros, []);
  }, { contextOptions: { reducedMotion: 'reduce' } });
});

// Caminhos (pathname) da mídia de um tópico, lidos do content.js que o próprio app carrega.
const midiaDoTopico = (page, indice) => page.evaluate(async (i) => {
  const { TUTORIALS } = await import(new URL('./src/tutorials/content.js', location.href).href);
  return TUTORIALS[i].passos.flatMap((passo) => [passo.src, passo.poster]).filter(Boolean)
    .map((src) => new URL(src, location.href).pathname);
}, indice);

const observarMidia = (page) => {
  const pedidos = new Set();
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.includes('/tutorials/media/')) pedidos.add(pathname);
  });
  return pedidos;
};

test('abrir um tópico baixa em segundo plano toda a mídia dele, para seguir inteiro se a conexão cair', { timeout: 60000 }, async () => {
  await withApp(async (page, erros) => {
    const pedidos = observarMidia(page);
    await fecharIntro(page);
    await page.locator('#open-settings').click();
    await page.locator('#settings-row-tutorials').click();
    const esperados = await midiaDoTopico(page, 1);
    assert.ok(esperados.length >= 6, 'o tópico tem vários slides, com pôster nos vídeos');
    const antes = esperados.filter((caminho) => pedidos.has(caminho));
    assert.ok(antes.length < esperados.length, 'nada do tópico deveria ter sido baixado antes de abri-lo');
    await page.locator('#tutorial-topics .settings-nav-row').nth(1).click();
    await page.waitForSelector('#tutorial-dialog[open]');
    await page.waitForFunction((lista) => lista.every((caminho) => performance.getEntriesByType('resource')
      .some((entrada) => new URL(entrada.name).pathname === caminho)), esperados, { timeout: 15000 });
    for (const caminho of esperados) assert.ok(pedidos.has(caminho), `${caminho} deveria ter sido baixado ao abrir o tópico`);
    assert.deepEqual(erros, []);
  });
});

test('com economia de dados só a mídia do slide aberto é baixada', { timeout: 60000 }, async () => {
  await withApp(async (page, erros) => {
    // A introdução abre durante o boot, antes de qualquer observador de requisições existir; por isso
    // a leitura é feita pelo Resource Timing da página, que registra tudo desde o carregamento.
    await page.waitForSelector('#tutorial-dialog[open]');
    await page.waitForFunction(() => document.querySelector('#tutorial-stage .tutorial-media'));
    await page.waitForTimeout(800);
    const carregados = await page.evaluate(() => performance.getEntriesByType('resource')
      .map((entrada) => new URL(entrada.name).pathname).filter((caminho) => caminho.includes('/tutorials/media/')));
    const todos = await midiaDoTopico(page, 0);
    const primeiro = await page.evaluate(() => {
      const midia = document.querySelector('#tutorial-stage .tutorial-media');
      return new URL(midia.currentSrc || midia.src, location.href).pathname;
    });
    assert.ok(carregados.includes(primeiro), 'a mídia do slide aberto precisa ser carregada');
    const dosOutrosSlides = todos.filter((caminho) => caminho !== primeiro && !caminho.includes('.poster.'));
    assert.ok(dosOutrosSlides.length >= 2);
    for (const caminho of dosOutrosSlides) assert.equal(carregados.includes(caminho), false, caminho + ' não deveria ser baixado com economia de dados');
    assert.deepEqual(erros, []);
  }, { initScript: () => Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }) });
});

test('sem conexão o tópico abre com o aviso, sem baixar em segundo plano nem gerar erro', { timeout: 60000 }, async () => {
  await withApp(async (page, erros, { context }) => {
    await fecharIntro(page);
    await page.locator('#open-settings').click();
    await page.locator('#settings-row-tutorials').click();
    await context.setOffline(true);
    await page.locator('#tutorial-topics .settings-nav-row').nth(1).click();
    await page.waitForSelector('#tutorial-dialog[open]');
    await page.waitForSelector('.tutorial-media-error');
    assert.notEqual((await page.locator('#tutorial-caption').textContent()).trim(), '');
    await page.locator('#tutorial-next').click();
    assert.equal((await contador(page)).atual, 2);
    await context.setOffline(false);
    assert.deepEqual(erros, []);
  });
});

// Leva a folha até o primeiro slide de vídeo do tópico aberto; devolve false se não houver.
async function irAteVideo(page) {
  const { total } = await contador(page);
  for (let passo = 1; passo <= total; passo++) {
    if (await page.locator('#tutorial-stage video').count()) return true;
    if (passo < total) await page.locator('#tutorial-next').click();
  }
  return false;
}

test('o vídeo em loop mostra uma barra de progresso que avança e zera a cada volta', { timeout: 60000 }, async () => {
  await withApp(async (page, erros) => {
    await page.waitForSelector('#tutorial-dialog[open]');
    assert.equal(await irAteVideo(page), true, 'a introdução tem um slide de vídeo');
    await page.waitForFunction(() => document.querySelector('#tutorial-stage video')?.readyState >= 2);
    const barra = page.locator('.tutorial-video-bar span');
    assert.equal(await barra.count(), 1);
    const leitura = () => page.evaluate(() => {
      const video = document.querySelector('#tutorial-stage video');
      const escala = Number(/scaleX\(([\d.e-]+)\)/.exec(document.querySelector('.tutorial-video-bar span').style.transform)?.[1] ?? 0);
      return { escala, tempo: video.currentTime, duracao: video.duration };
    });
    // Amostra por mais que a duração do vídeo: a barra sobe e, na volta do loop, cai de novo para perto de 0.
    const { duracao } = await leitura();
    const escalas = [];
    for (let i = 0; i < Math.ceil((duracao * 1000) / 250) + 6; i++) { escalas.push((await leitura()).escala); await page.waitForTimeout(250); }
    assert.ok(Math.max(...escalas) > 0.7, 'a barra chega perto do fim');
    assert.ok(escalas.some((valor, i) => i > 0 && valor < escalas[i - 1] - 0.5), 'a barra volta a zero quando o loop recomeça');
    // Trocar de slide desliga o laço de atualização (nada de barra fantasma).
    await page.locator('#tutorial-next').click();
    assert.equal(await page.locator('.tutorial-video-bar').count(), 0);
    assert.deepEqual(erros, []);
  });
});

test('com movimento reduzido o vídeo não tem barra de progresso', { timeout: 60000 }, async () => {
  await withApp(async (page, erros) => {
    await page.waitForSelector('#tutorial-dialog[open]');
    assert.equal(await irAteVideo(page), true);
    assert.equal(await page.locator('.tutorial-video-bar').count(), 0);
    assert.equal(await page.locator('.tutorial-play').isVisible(), true);
    assert.deepEqual(erros, []);
  }, { contextOptions: { reducedMotion: 'reduce' } });
});

test('slide só de texto: cartão com a frase, ícone e linhas, sem mídia; a legenda fica invisível mas ocupa o espaço', { timeout: 60000 }, async () => {
  await withApp(async (page, erros) => {
    await fecharIntro(page);
    await page.locator('#open-settings').click();
    await page.locator('#settings-row-tutorials').click();
    await page.locator('#tutorial-topics .settings-nav-row', { hasText: 'Amigos e compartilhar doses' }).click();
    await page.waitForSelector('#tutorial-dialog[open]');
    // Avança até o primeiro slide de texto (o 4º do tópico).
    for (let i = 0; i < 3; i++) await page.locator('#tutorial-next').click();
    assert.deepEqual(await contador(page), { atual: 4, total: 8 });
    assert.equal(await page.locator('.tutorial-texto').count(), 1);
    assert.equal(await page.locator('#tutorial-stage .tutorial-media').count(), 0, 'slide de texto não tem imagem nem vídeo');
    assert.equal((await page.locator('.tutorial-texto-titulo').textContent()).trim(), 'Você pode compartilhar seu consumo com um amigo se quiser.');
    assert.equal(await page.locator('.tutorial-texto-icone').count(), 1);
    assert.equal(await page.locator('.tutorial-texto-linha').count(), 4);
    const legenda = await page.locator('#tutorial-caption').evaluate((no) => ({ classe: no.className, visibilidade: getComputedStyle(no).visibility, altura: no.getBoundingClientRect().height }));
    assert.match(legenda.classe, /tutorial-caption--repetida/);
    assert.equal(legenda.visibilidade, 'hidden');
    assert.ok(legenda.altura > 20, 'a legenda invisível ainda ocupa espaço, para a folha não mudar de tamanho');

    // O cartão cabe na área do slide (nada cortado) e, ao sair do texto, a legenda volta.
    const cabe = await page.evaluate(() => {
      const palco = document.querySelector('#tutorial-stage').getBoundingClientRect();
      const cartao = document.querySelector('.tutorial-texto');
      return cartao.scrollHeight <= cartao.clientHeight + 1 && cartao.getBoundingClientRect().bottom <= palco.bottom + 1;
    });
    assert.equal(cabe, true, 'as linhas do cartão precisam caber sem rolar');
    await page.locator('#tutorial-next').click();
    assert.equal(await page.locator('#tutorial-caption').evaluate((no) => getComputedStyle(no).visibility), 'visible');
    assert.equal(await page.locator('.tutorial-texto').count(), 0);
    await page.locator('#tutorial-next').click();
    assert.equal((await page.locator('.tutorial-texto-titulo').textContent()).trim(), 'Compartilhar funciona dentro de um evento.');
    assert.deepEqual(erros, []);
  });
});

// Percorre todos os slides de todos os tópicos e devolve o que não cabe: cartão de texto que rola, folha que rola
// (o botão Próximo sairia da tela) ou Próximo fora da área visível.
async function slidesQueNaoCabem(page) {
  await fecharIntro(page);
  await page.locator('#open-settings').click();
  await page.locator('#settings-row-tutorials').click();
  const nomes = await page.locator('#tutorial-topics .settings-nav-row strong').allTextContents();
  const problemas = [];
  for (let i = 0; i < nomes.length; i++) {
    await page.locator('#tutorial-topics .settings-nav-row').nth(i).click();
    await page.waitForSelector('#tutorial-dialog[open]');
    const { total } = await contador(page);
    for (let passo = 1; passo <= total; passo++) {
      const medida = await page.evaluate(() => {
        const dialogo = document.querySelector('#tutorial-dialog');
        const proximo = document.querySelector('#tutorial-next').getBoundingClientRect();
        const cartao = document.querySelector('.tutorial-texto');
        return {
          cartaoRola: cartao ? cartao.scrollHeight > cartao.clientHeight + 1 : false,
          folhaRola: dialogo.scrollHeight > dialogo.clientHeight + 1,
          proximoVisivel: proximo.top >= 0 && proximo.bottom <= innerHeight,
        };
      });
      if (medida.cartaoRola || medida.folhaRola || !medida.proximoVisivel) problemas.push(`${nomes[i]} #${passo}: ${JSON.stringify(medida)}`);
      if (passo < total) await page.locator('#tutorial-next').click();
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#tutorial-dialog').open);
  }
  return problemas;
}

test('todos os slides cabem na folha em celular de tela alta e de tela curta, sem rolar', { timeout: 180000 }, async () => {
  for (const [largura, altura] of [[390, 844], [375, 667], [360, 640]]) {
    await withApp(async (page, erros) => {
      assert.deepEqual(await slidesQueNaoCabem(page), [], `${largura}×${altura}`);
      assert.deepEqual(erros, []);
    }, { contextOptions: { viewport: { width: largura, height: altura }, isMobile: true, hasTouch: true } });
  }
});
