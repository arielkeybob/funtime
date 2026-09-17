const SDK_BASE = "https://www.gstatic.com/firebasejs/12.19.0";

// Erros em que o popup não é utilizável no ambiente (webview, PWA standalone de iOS,
// bloqueador) e vale repetir por redirect. `popup-closed-by-user` fica de fora de
// propósito: ali o usuário desistiu, e reabrir por redirect seria ignorar a escolha.
const REDIRECT_FALLBACK_CODES = new Set([
  "auth/operation-not-supported-in-this-environment",
  "auth/popup-blocked",
  "auth/web-storage-unsupported",
]);

export function createFirebaseAuth({
  firebaseConfig, onSignedIn, onSignedOut, onRedirectStart,
  importModule = (url) => import(url),
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
