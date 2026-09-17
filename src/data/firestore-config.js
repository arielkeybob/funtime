// Config pública do projeto Firebase. Apesar do nome, `apiKey` não é segredo e pode
// ficar no repositório: ela só identifica o projeto. Quem controla acesso de verdade
// são as regras de segurança do Firestore (ver docs/specs/0022-cloud-sync-firebase.md).
// O console do Firebase mostra mais campos (storageBucket, messagingSenderId); eles
// servem a produtos que este app não usa.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCVit7aBIWwp95fdDXefpq5nG403PpYOEU",
  authDomain: "funtime-bob.firebaseapp.com",
  projectId: "funtime-bob",
  appId: "1:558466862859:web:4ae148ae30be0108511c0e",
};

export function getFirebaseConfig() {
  return { ...FIREBASE_CONFIG };
}

export function isFirebaseConfigured() {
  return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.authDomain && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
}
