const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  generatePairingCode, formatPairingCode, normalizePairingCode, buildPairId,
  otherUidOf, pairingConfirmationCode, PAIRING_CODE_ALPHABET, PAIRING_CODE_LENGTH,
} = require('../src/data/share-codes.js');

test('o alfabeto não tem glifos que se confundem', () => {
  for (const ambiguo of ['0', 'O', '1', 'I', 'L', 'U', 'Q']) {
    assert.ok(!PAIRING_CODE_ALPHABET.includes(ambiguo), `${ambiguo} não deveria estar no alfabeto`);
  }
});

test('gera código do tamanho certo, só com o alfabeto', () => {
  const code = generatePairingCode(() => Uint8Array.from([0, 1, 2, 3, 4, 5]));

  assert.equal(code.length, PAIRING_CODE_LENGTH);
  assert.ok([...code].every((character) => PAIRING_CODE_ALPHABET.includes(character)));
});

// `byte % 29` deixaria os primeiros símbolos mais prováveis; os bytes altos são
// descartados em vez de dobrados sobre o início do alfabeto.
test('descarta bytes que enviesariam o sorteio', () => {
  const sequencias = [Uint8Array.from([255, 254, 253, 252, 251, 250]), Uint8Array.from([0, 0, 0, 0, 0, 0])];
  let chamada = 0;
  const code = generatePairingCode(() => sequencias[Math.min(chamada++, 1)]);

  assert.equal(code, PAIRING_CODE_ALPHABET[0].repeat(PAIRING_CODE_LENGTH));
});

test('normaliza o que a pessoa digita', () => {
  const esperado = normalizePairingCode('AB7K29');

  assert.equal(normalizePairingCode('ab7k29'), esperado);
  assert.equal(normalizePairingCode('AB7-K29'), esperado);
  assert.equal(normalizePairingCode('  AB7 K29 '), esperado);
});

test('recusa o que não dá para aproveitar, sem lançar', () => {
  assert.equal(normalizePairingCode('AB7K2'), null, 'curto demais');
  assert.equal(normalizePairingCode('AB7K299'), null, 'longo demais');
  assert.equal(normalizePairingCode('AB7K2O'), null, 'letra fora do alfabeto');
  assert.equal(normalizePairingCode(''), null);
  assert.equal(normalizePairingCode(null), null);
});

test('formata para exibição sem alterar o valor', () => {
  assert.equal(formatPairingCode('AB7K29'), 'AB7-K29');
  assert.equal(normalizePairingCode(formatPairingCode('AB7K29')), 'AB7K29');
});

test('o id do par não depende da ordem', () => {
  assert.equal(buildPairId('zzz', 'aaa'), buildPairId('aaa', 'zzz'));
  assert.equal(buildPairId('aaa', 'zzz'), 'aaa_zzz');
});

test('otherUidOf devolve o outro lado', () => {
  assert.equal(otherUidOf(['aaa', 'zzz'], 'aaa'), 'zzz');
  assert.equal(otherUidOf(['aaa', 'zzz'], 'zzz'), 'aaa');
  assert.equal(otherUidOf([], 'aaa'), null);
});

test('número de conferência: 4 dígitos, igual nos dois aparelhos', async () => {
  const doLadoDeA = await pairingConfirmationCode('aaa_zzz');
  const doLadoDeB = await pairingConfirmationCode(buildPairId('zzz', 'aaa'));

  assert.match(doLadoDeA, /^\d{4}$/);
  assert.equal(doLadoDeA, doLadoDeB, 'os dois lados precisam ver o mesmo número');
});

test('número de conferência muda com o par', async () => {
  assert.notEqual(await pairingConfirmationCode('aaa_zzz'), await pairingConfirmationCode('aaa_yyy'));
});
