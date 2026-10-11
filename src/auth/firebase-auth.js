const SDK_BASE = "https://www.gstatic.com/firebasejs/12.19.0";

// Erros em que o popup não é utilizável no ambiente (webview, PWA standalone de iOS,
// bloqueador) e vale repetir por redirect. `popup-closed-by-user` fica de fora de
// propósito: ali o usuário desistiu, e reabrir por redirect seria ignorar a escolha.
const REDIRECT_FALLBACK_CODES = new Set([
  "auth/operation-not-supported-in-this-environment",
  "auth/popup-blocked",
  "auth/web-storage-unsupported",
]);

// O navegador guarda a falha de um import() dinâmico: pedir a mesma URL de novo falha na
// hora, sem rede, até recarregar a página. Testar a conexão com um fetch antes impede
// que abrir o app sem internet trave a reconexão de quando a rede voltar.
async function importWhenReachable(url) {
  await fetch(url, { mode: "no-cors" });
  return import(url);
}

export function createFirebaseAuth({
  firebaseConfig, onSignedIn, onSignedOut, onRedirectStart,
  importModule = importWhenReachable,
}) {
  let loaded = null;
  let currentUser = null;

  // Carrega o SDK sob demanda para quem nunca sincroniza não pagar o download.
  function load() {
    if (!loaded) {
      loaded = (async () => {
        const [appModule, authModule] = await Promise.all([
          importModule(`${SDK_BASE}/firebase-app.js`),
          importModule(`${SDK_BASE}/firebase-auth.js`),
        ]);

        const app = appModule.initializeApp(firebaseConfig);
        const auth = authModule.getAuth(app);

        authModule.onAuthStateChanged(auth, (user) => {
          currentUser = user;
          if (user) onSignedIn({ user, app });
          else onSignedOut();
        });

        return { app, auth, authModule };
      })();
      // Sem internet na abertura o carregamento falha. Guardar a promessa rejeitada
      // travaria o login (e a retomada) até reabrir o app; zerada, a próxima tentativa refaz.
      loaded.catch(() => { loaded = null; });
    }

    return loaded;
  }

  async function init() {
    const { auth, authModule } = await load();
    // Só para propagar erro de um redirect anterior; o login em si chega pelo
    // onAuthStateChanged acima, tendo vindo de popup ou de redirect.
    await authModule.getRedirectResult(auth).catch(() => null);
  }

  async function signIn() {
    const { auth, authModule } = await load();
    const provider = new authModule.GoogleAuthProvider();
    // Sem isto, o Google entra direto na única sessão ativa do navegador e não há como
    // escolher outra conta — nem trocar de conta depois de sair.
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      await authModule.signInWithPopup(auth, provider);
    } catch (error) {
      if (!REDIRECT_FALLBACK_CODES.has(error?.code)) throw error;
      // O redirect recarrega o app do zero na volta. Sem registrar a intenção antes de
      // sair, nada reinicia a autenticação ao voltar e o login se perderia em silêncio.
      onRedirectStart?.();
      await authModule.signInWithRedirect(auth, provider);
    }
  }

  async function signOut() {
    const { auth, authModule } = await load();
    await authModule.signOut(auth);
  }

  function getCurrentUser() {
    return currentUser;
  }

  return { init, signIn, signOut, getCurrentUser };
}
