// Intenção de compartilhar doses de um evento que ainda não começou (docs/specs/0025).
// A pessoa escolhe, antes da festa, com quem vai compartilhar; a escolha fica na ocasião
// (`shareWith`) e só vira compartilhamento de verdade quando o evento começa — manual ou por
// início automático. Nada sai do aparelho antes disso.
//
// Puro em relação ao app: recebe os dados e as funções e devolve o que aconteceu. Quem tem
// `state` (app.js) aplica o resultado na ocasião.

// Só evento já em andamento cumpre a intenção; agendado espera, encerrado não compartilha mais.
export function dueShareIntents(occasions) {
  return (Array.isArray(occasions) ? occasions : [])
    .filter((item) => item.startedAt !== null && item.endedAt === null && item.shareWith?.length);
}

// Para cada evento devido devolve { occasionId, name, started, remaining }:
//   - quem deixou de ser amigo (ou nunca foi) é DESCARTADO: a intenção não vale mais;
//   - quem já está recebendo este evento é pulado (senão viraria compartilhamento duplicado);
//   - quem falhou (sem rede, por exemplo) FICA em `remaining` para uma nova tentativa,
//     porque perder o que a pessoa escolheu seria pior do que tentar de novo.
export async function executeShareIntents({ occasions, events, pairings, shares, startShare }) {
  const resultados = [];

  for (const item of dueShareIntents(occasions)) {
    const doses = events.filter((event) => event.occasionId === item.id);
    const remaining = [];
    let started = 0;

    for (const uid of item.shareWith) {
      const par = pairings.find((candidato) => candidato.otherUid === uid && candidato.acceptedByMe && candidato.acceptedByOther);
      if (!par) continue;
      if (shares.some((share) => share.occasionId === item.id && share.viewerUid === uid)) continue;

      try {
        await startShare({ occasion: item, events: doses, viewerUid: uid, ownerAlias: par.myAlias || "Alguém" });
        started += 1;
      } catch (error) {
        remaining.push(uid);
      }
    }

    resultados.push({ occasionId: item.id, name: item.name, started, remaining });
  }

  return resultados;
}
