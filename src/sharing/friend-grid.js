// Grade de amigos: um avatar (inicial) e o nome, tocável. Reaproveitada em três telas —
// compartilhar doses, convidar para o evento e a lista de quem vai. Só DOM: não conhece
// `state`, o escritor nem a nuvem.

export function initial(alias) {
  const primeiro = [...String(alias || "")].find((char) => char.trim());
  return (primeiro || "?").toLocaleUpperCase("pt-BR");
}

// Só decide qual marca uma pessoa recebe: presença vale mais que convite. Puro, para o
// texto de acessibilidade e a tela nunca discordarem.
export function rosterStatus(uid, roster) {
  if (!roster) return null;
  if (roster.going?.has(uid)) return "going";
  if (roster.invited?.has(uid)) return "invited";
  return null;
}

export const MARK_LABELS = { going: "confirmou presença", invited: "convidado, sem resposta" };

const MARK_PATHS = {
  // envelope: convidado; check: confirmou. Formas distintas — nunca só por cor.
  invited: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  going: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};

// Marca pequena, ABAIXO do avatar e afastada dele — de propósito diferente das setas de
// "vendo"/"compartilhando", que ficam coladas no canto do círculo.
export function renderInviteMark(kind) {
  const marca = document.createElement("span");
  marca.className = `share-mark share-mark--${kind}`;
  marca.setAttribute("role", "img");
  marca.setAttribute("aria-label", MARK_LABELS[kind]);
  marca.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${MARK_PATHS[kind]}</svg>`;
  return marca;
}

// `marks(par)` devolve "going" | "invited" | null; quando é informado, cada pessoa ganha a
// faixa de marcas (vazia se não há o que mostrar) para a grade não mudar de altura.
// `readOnly` desliga o toque. `only(par)` filtra quem aparece. Devolve `true` sem ninguém.
export function renderFriendGrid({
  gridNode, emptyNode, pairings, selected = new Set(), onToggle = () => {},
  marks = null, readOnly = false, only = null, decorateSelected = null,
}) {
  if (!gridNode) return true;
  gridNode.replaceChildren();

  const conectados = [...pairings]
    .filter((par) => par.acceptedByMe && par.acceptedByOther)
    .filter((par) => (only ? only(par) : true))
    .sort((a, b) => (a.alias || "").localeCompare(b.alias || "", "pt-BR"));

  const semNinguem = conectados.length === 0;
  if (emptyNode) emptyNode.hidden = !semNinguem;
  gridNode.hidden = semNinguem;

  for (const par of conectados) {
    const pessoa = document.createElement(readOnly ? "div" : "button");
    if (!readOnly) pessoa.type = "button";
    pessoa.className = "share-person";
    const estado = marks ? marks(par) : null;
    const partes = [par.alias || "Amigo"];
    if (estado) partes.push(MARK_LABELS[estado]);

    if (!readOnly) {
      pessoa.setAttribute("aria-pressed", String(selected.has(par.otherUid)));
      pessoa.addEventListener("click", () => {
        if (selected.has(par.otherUid)) selected.delete(par.otherUid);
        else selected.add(par.otherUid);
        onToggle();
      });
    }
    pessoa.setAttribute("aria-label", partes.join(" · "));

    const avatar = document.createElement("span");
    avatar.className = "share-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = initial(par.alias);
    if (decorateSelected && selected.has(par.otherUid)) decorateSelected(avatar);
    pessoa.append(avatar);

    if (marks) {
      const faixa = document.createElement("span");
      faixa.className = "share-marks";
      if (estado) faixa.append(renderInviteMark(estado));
      pessoa.append(faixa);
    }

    const nome = document.createElement("span");
    nome.className = "share-person-name";
    nome.textContent = par.alias || "Sem apelido";
    pessoa.append(nome);
    gridNode.append(pessoa);
  }

  return semNinguem;
}
