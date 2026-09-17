const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFirebaseAuth } = require('../src/auth/firebase-auth.js');

function setup({ popupError = null, onSignedIn = () => {}, onSignedOut = () => {}, onRedirectStart = () => {} } = {}) {
  const calls = { popup: 0, redirect: 0, signOut: 0 };
  let notifyAuthState = null;

  const appModule = { initializeApp: () => ({ name: 'app-falso' }) };
  const authModule = {
    getAuth: () => ({ name: 'auth-falsa' }),
    GoogleAuthProvider: class {},
    onAuthStateChanged: (auth, callback) => { notifyAuthState = callback; },
    getRedirectResult: async () => null,
    signInWithPopup: async () => { calls.popup += 1; if (popupError) throw popupError; },
    signInWithRedirect: async () => { calls.redirect += 1; },
    signOut: async () => { calls.signOut += 1; },
  };

  const auth = createFirebaseAuth({
    firebaseConfig: { projectId: 'p' }, onSignedIn, onSignedOut, onRedirectStart,
    importModule: async (url) => (url.includes('firebase-app.js') ? appModule : authModule),
  });

  return { auth, calls, notify: (user) => notifyAuthState(user) };
}

const errorWithCode = (code) => Object.assign(new Error(code), { code });

test('login usa o popup e não recorre ao redirect quando dá certo', async () => {
  const { auth, calls } = setup();
  await auth.signIn();
  assert.equal(calls.popup, 1);
  assert.equal(calls.redirect, 0);
});

test('cai para redirect quando o popup não funciona no ambiente', async () => {
  const { auth, calls } = setup({ popupError: errorWithCode('auth/operation-not-supported-in-this-environment') });
  await auth.signIn();
  assert.equal(calls.redirect, 1);
});

test('cai para redirect quando o popup é bloqueado', async () => {
  const { auth, calls } = setup({ popupError: errorWithCode('auth/popup-blocked') });
  await auth.signIn();
  assert.equal(calls.redirect, 1);
});

// O redirect recarrega o app do zero. Sem avisar antes de sair, nada reinicia a
// autenticação na volta e o login some em silêncio — era assim que falhava.
test('avisa antes de sair para o redirect, para o login sobreviver à recarga', async () => {
  const ordem = [];
  const { auth } = setup({
    popupError: errorWithCode('auth/popup-blocked'),
    onRedirectStart: () => ordem.push('avisou'),
  });

  await auth.signIn();
  assert.deepEqual(ordem, ['avisou']);
});

test('não avisa nem redireciona quando o popup funciona', async () => {
  const ordem = [];
  const { auth, calls } = setup({ onRedirectStart: () => ordem.push('avisou') });

  await auth.signIn();
  assert.deepEqual(ordem, []);
  assert.equal(calls.redirect, 0);
});

test('não reabre por redirect quando o usuário fechou o popup', async () => {
  const { auth, calls } = setup({ popupError: errorWithCode('auth/popup-closed-by-user') });
  await assert.rejects(() => auth.signIn(), /popup-closed-by-user/);
  assert.equal(calls.redirect, 0, 'desistir do login não pode virar um redirect');
});

test('avisa quem conectou, com o app do Firebase junto', async () => {
  const signedIn = [];
  const { auth, notify } = setup({ onSignedIn: (payload) => signedIn.push(payload) });

  await auth.init();
  notify({ uid: 'u1', email: 'a@b.c' });

  assert.equal(signedIn.length, 1);
  assert.equal(signedIn[0].user.uid, 'u1');
  assert.equal(signedIn[0].app.name, 'app-falso');
  assert.equal(auth.getCurrentUser().uid, 'u1');
});

test('avisa quando a sessão termina', async () => {
  let signedOut = 0;
  const { auth, notify } = setup({ onSignedOut: () => { signedOut += 1; } });

  await auth.init();
  notify(null);

  assert.equal(signedOut, 1);
  assert.equal(auth.getCurrentUser(), null);
});

test('sair encerra a sessão no Firebase', async () => {
  const { auth, calls } = setup();
  await auth.signOut();
  assert.equal(calls.signOut, 1);
});
