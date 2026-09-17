export const SDK_BASE = "https://www.gstatic.com/firebasejs/12.19.0";
export const BATCH_LIMIT = 450; // o Firestore aceita 500 operações por lote; sobra folga.

export function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

// Cache persistente para a fila de escritas sobreviver ao fechamento do app: sem ele,
// uma exclusão feita offline se perderia e o registro voltaria da nuvem na próxima
// sincronização. Navegação privada e armazenamento bloqueado fazem isso falhar — aí
// sincroniza sem fila persistente, que é melhor do que não sincronizar.
function openDatabase(firestore, app) {
  try {
    return firestore.initializeFirestore(app, {
      localCache: firestore.persistentLocalCache({ tabManager: firestore.persistentMultipleTabManager() }),
    });
  } catch {
    return firestore.getFirestore(app);
  }
}

// Memoizado pelo próprio objeto `app` porque `initializeFirestore` lança na segunda
// chamada para o mesmo app, e mais de um módulo precisa do mesmo handle.
const handles = new WeakMap();

export function loadFirestore({ app, importModule = (url) => import(url) }) {
  if (!handles.has(app)) {
    handles.set(app, (async () => {
      const firestore = await importModule(`${SDK_BASE}/firebase-firestore.js`);
      return { firestore, db: openDatabase(firestore, app) };
    })());
  }

  return handles.get(app);
}
