// Testes das regras de segurança contra o emulador do Firestore.
// Rode com `npm run test:rules` (sobe o emulador e executa este arquivo).
// Fora da suíte principal de propósito: exige Java e ~20s de inicialização.
//
// As regras são a única coisa separando os dados de duas pessoas. Cada caso abaixo
// que espera negação é uma forma concreta de alguém tentar ver o que não é seu.
const { test: nodeTest, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, Timestamp,
} = require('firebase/firestore');

// `npm run test:rules` sobe o emulador e define esta variável. No `npm test` comum ela
// não existe, e cada caso se pula sozinho em vez de falhar por falta de emulador.
const emuladorAtivo = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const test = (nome, fn) => nodeTest(nome, {
  skip: emuladorAtivo ? false : 'emulador do Firestore desligado — rode `npm run test:rules`',
}, fn);

const ANA = 'aaa-ana';
const BIA = 'bbb-bia';
const CAIO = 'ccc-caio';
const PAR_ANA_BIA = 'aaa-ana_bbb-bia';

const MINUTO = 60 * 1000;
const daquiA = (ms) => Timestamp.fromMillis(Date.now() + ms);

let env;

before(async () => {
  if (!emuladorAtivo) return;
  env = await initializeTestEnvironment({
    projectId: 'funtime-regras-teste',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => { if (emuladorAtivo) await env.clearFirestore(); });

const como = (uid) => env.authenticatedContext(uid).firestore();
const semRegras = (acao) => env.withSecurityRulesDisabled((contexto) => acao(contexto.firestore()));

async function semearCodigo(code, ownerUid, expiraEm = 5 * MINUTO) {
  await semRegras((db) => setDoc(doc(db, 'pairingCodes', code), {
    ownerUid, createdAt: Timestamp.now(), expiresAt: daquiA(expiraEm),
  }));
}

async function semearPareamento(aceitoPor) {
  await semRegras((db) => setDoc(doc(db, 'pairings', PAR_ANA_BIA), {
    uids: [ANA, BIA], createdBy: BIA, createdAt: Timestamp.now(), viaCode: 'AB7K29',
    acceptedBy: aceitoPor, aliases: { [BIA]: 'Bia' }, sharing: {},
  }));
}

async function semearShare(id, dados) {
  await semRegras((db) => setDoc(doc(db, 'shares', id), {
    ownerUid: ANA, viewerUid: BIA, ownerAlias: 'Ana', schemaVersion: 1,
    occasion: { name: 'Festa', startedAt: 1, endedAt: null },
    events: [], totals: [], eventCount: 0, truncated: false,
    expiresAt: daquiA(60 * MINUTO), ...dados,
  }));
}

// --- Dados próprios: a regra da spec 0022 não pode ter sido afrouxada ---------

test('os dados de alguém continuam ilegíveis para outra pessoa', async () => {
  await semRegras((db) => setDoc(doc(db, 'users', ANA, 'events', 'ev1'), { drinkName: 'Cerveja' }));

  await assertFails(getDoc(doc(como(BIA), 'users', ANA, 'events', 'ev1')));
  await assertSucceeds(getDoc(doc(como(ANA), 'users', ANA, 'events', 'ev1')));
});

test('estar pareado NÃO dá acesso aos dados do outro', async () => {
  await semearPareamento([ANA, BIA]);
  await semRegras((db) => setDoc(doc(db, 'users', ANA, 'events', 'ev1'), { drinkName: 'Cerveja' }));

  await assertFails(getDoc(doc(como(BIA), 'users', ANA, 'events', 'ev1')));
});

// --- Códigos de pareamento ---------------------------------------------------

test('quem conhece o código consegue lê-lo; vencido não', async () => {
  await semearCodigo('AB7K29', ANA);
  await semearCodigo('VENCID', ANA, -MINUTO);

  await assertSucceeds(getDoc(doc(como(BIA), 'pairingCodes', 'AB7K29')));
  await assertFails(getDoc(doc(como(BIA), 'pairingCodes', 'VENCID')));
});

test('ninguém varre a lista de códigos alheios', async () => {
  await semearCodigo('AB7K29', ANA);

  await assertFails(getDocs(query(collection(como(BIA), 'pairingCodes'), where('ownerUid', '==', ANA))));
  await assertSucceeds(getDocs(query(collection(como(ANA), 'pairingCodes'), where('ownerUid', '==', ANA))));
});

test('só dá para criar código em nome próprio, e com prazo curto', async () => {
  const base = { createdAt: Timestamp.now() };

  await assertSucceeds(setDoc(doc(como(ANA), 'pairingCodes', 'AB7K29'), { ...base, ownerUid: ANA, expiresAt: daquiA(5 * MINUTO) }));
  await assertFails(setDoc(doc(como(BIA), 'pairingCodes', 'XX1111'), { ...base, ownerUid: ANA, expiresAt: daquiA(5 * MINUTO) }));
  await assertFails(setDoc(doc(como(ANA), 'pairingCodes', 'XX2222'), { ...base, ownerUid: ANA, expiresAt: daquiA(24 * 60 * MINUTO) }));
});

// --- Pareamento --------------------------------------------------------------

test('criar pareamento exige posse de um código válido do outro', async () => {
  const pedido = {
    uids: [ANA, BIA], createdBy: BIA, createdAt: Timestamp.now(),
    acceptedBy: [ANA, BIA], aliases: { [BIA]: 'Bia' }, sharing: {},
  };

  await assertFails(setDoc(doc(como(BIA), 'pairings', PAR_ANA_BIA), { ...pedido, viaCode: 'INVENT' }));

  await semearCodigo('AB7K29', ANA);
  await assertSucceeds(setDoc(doc(como(BIA), 'pairings', PAR_ANA_BIA), { ...pedido, viaCode: 'AB7K29' }));
});

// Mostrar o código já é o consentimento de quem gerou; digitá-lo é o de quem
// recebeu — os dois já aconteceram fisicamente antes deste create. Nasce aceito
// pelos dois de propósito (v2.4.0, spec 0023) — sem isso não haveria conexão
// nenhuma sem uma segunda tela de aceite que o usuário pediu para remover.
test('nasce aceito pelos dois; nascer aceito por um só é negado', async () => {
  await semearCodigo('AB7K29', ANA);
  const base = {
    uids: [ANA, BIA], createdBy: BIA, createdAt: Timestamp.now(), viaCode: 'AB7K29',
    aliases: { [BIA]: 'Bia' }, sharing: {},
  };

  await assertSucceeds(setDoc(doc(como(BIA), 'pairings', PAR_ANA_BIA), { ...base, acceptedBy: [ANA, BIA] }));
});

test('nascer aceito só por quem criou é negado — não é mais o formato válido', async () => {
  await semearCodigo('AB7K29', ANA);

  await assertFails(setDoc(doc(como(BIA), 'pairings', PAR_ANA_BIA), {
    uids: [ANA, BIA], createdBy: BIA, createdAt: Timestamp.now(), viaCode: 'AB7K29',
    acceptedBy: [BIA], aliases: { [BIA]: 'Bia' }, sharing: {},
  }));
});

test('cada lado só se acrescenta a si mesmo', async () => {
  await semearPareamento([BIA]);

  await assertSucceeds(updateDoc(doc(como(ANA), 'pairings', PAR_ANA_BIA), { acceptedBy: [BIA, ANA] }));
});

test('ninguém aceita pelo outro nem mexe no apelido alheio', async () => {
  await semearPareamento([ANA]);

  await assertFails(updateDoc(doc(como(BIA), 'pairings', PAR_ANA_BIA), { acceptedBy: [ANA, BIA, CAIO] }));
  await assertFails(updateDoc(doc(como(BIA), 'pairings', PAR_ANA_BIA), { aliases: { [ANA]: 'invadido' } }));
  await assertFails(updateDoc(doc(como(BIA), 'pairings', PAR_ANA_BIA), { sharing: { [ANA]: 'share-falso' } }));
});

test('quem não é do par não enxerga nem mexe', async () => {
  await semearPareamento([ANA, BIA]);

  await assertFails(getDoc(doc(como(CAIO), 'pairings', PAR_ANA_BIA)));
  await assertFails(deleteDoc(doc(como(CAIO), 'pairings', PAR_ANA_BIA)));
});

test('qualquer um dos dois desfaz o pareamento', async () => {
  await semearPareamento([ANA, BIA]);

  await assertSucceeds(deleteDoc(doc(como(BIA), 'pairings', PAR_ANA_BIA)));
});

// --- Compartilhamento --------------------------------------------------------

test('compartilhar exige pareamento aceito pelos DOIS lados', async () => {
  const share = {
    ownerUid: ANA, viewerUid: BIA, ownerAlias: 'Ana', schemaVersion: 1,
    occasion: { name: 'Festa', startedAt: 1, endedAt: null },
    events: [], totals: [], eventCount: 0, truncated: false, expiresAt: daquiA(60 * MINUTO),
  };

  await semearPareamento([ANA]);
  await assertFails(setDoc(doc(como(ANA), 'shares', 's1'), share));

  await semearPareamento([ANA, BIA]);
  await assertSucceeds(setDoc(doc(como(ANA), 'shares', 's2'), share));
});

test('o convidado lê o que foi endereçado a ele', async () => {
  await semearShare('s1', {});

  await assertSucceeds(getDoc(doc(como(BIA), 'shares', 's1')));
});

test('ninguém lê compartilhamento endereçado a outra pessoa', async () => {
  await semearShare('s1', {});

  await assertFails(getDoc(doc(como(CAIO), 'shares', 's1')));
});

// O vencimento é cobrado pelo relógio do servidor, não por um botão escondido.
test('compartilhamento vencido é ilegível mesmo existindo', async () => {
  await semearShare('vencido', { expiresAt: daquiA(-MINUTO) });

  await assertFails(getDoc(doc(como(BIA), 'shares', 'vencido')));
  await assertSucceeds(getDoc(doc(como(ANA), 'shares', 'vencido')), 'o dono ainda enxerga para poder limpar');
});

test('o convidado não escreve nem apaga o compartilhamento', async () => {
  await semearShare('s1', {});

  await assertFails(updateDoc(doc(como(BIA), 'shares', 's1'), { ownerAlias: 'outro' }));
  await assertFails(deleteDoc(doc(como(BIA), 'shares', 's1')));
});

// Sem `list` para o convidado o vencimento pode ser cobrado contra o documento real;
// numa consulta, a regra seria avaliada contra a consulta.
test('o convidado não varre a coleção de compartilhamentos', async () => {
  await semearShare('s1', {});

  await assertFails(getDocs(query(collection(como(BIA), 'shares'), where('viewerUid', '==', BIA))));
  await assertSucceeds(getDocs(query(collection(como(ANA), 'shares'), where('ownerUid', '==', ANA))));
});

test('não dá para esticar o prazo além do teto', async () => {
  await semearPareamento([ANA, BIA]);

  await assertFails(setDoc(doc(como(ANA), 'shares', 'longo'), {
    ownerUid: ANA, viewerUid: BIA, ownerAlias: 'Ana', schemaVersion: 1,
    occasion: { name: 'Festa', startedAt: 1, endedAt: null },
    events: [], totals: [], eventCount: 0, truncated: false,
    expiresAt: daquiA(10 * 24 * 60 * MINUTO),
  }));
});

test('o dono revoga a qualquer momento', async () => {
  await semearShare('s1', {});

  await assertSucceeds(deleteDoc(doc(como(ANA), 'shares', 's1')));
});

test('ninguém compartilha em nome de outra pessoa', async () => {
  await semearPareamento([ANA, BIA]);

  await assertFails(setDoc(doc(como(CAIO), 'shares', 'falso'), {
    ownerUid: ANA, viewerUid: BIA, ownerAlias: 'Ana', schemaVersion: 1,
    occasion: { name: 'Festa', startedAt: 1, endedAt: null },
    events: [], totals: [], eventCount: 0, truncated: false, expiresAt: daquiA(60 * MINUTO),
  }));
});
