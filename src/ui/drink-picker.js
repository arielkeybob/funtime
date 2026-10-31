// Etiquetas de bebidas para marcar e desmarcar: a prévia de Importar bebidas e o "Copiar
// bebidas" para amigos. Só DOM: não conhece `state`. O chamador guarda `selected` (um Set
// de chaves) e decide o que cada marca significa.

export function drinkPickLabel(drink) {
  return `${drink?.icon || ""} ${drink?.name || ""}`.trim();
}

// "Marcar todas" / "Desmarcar todas" só contam o que dá para tocar: uma etiqueta presa
// (`locked`) fica como está.
export function allPicked(keys, selected, locked = () => false) {
  const livres = keys.filter((key) => !locked(key));
  return livres.length > 0 && livres.every((key) => selected.has(key));
}

export function toggleAll(keys, selected, locked = () => false) {
  const marcar = !allPicked(keys, selected, locked);
  for (const key of keys) {
    if (locked(key)) continue;
    if (marcar) selected.add(key);
    else selected.delete(key);
  }
  return marcar;
}

const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

// `locked(chave)` deixa a etiqueta riscada e fora de alcance, com `lockedLabel` no texto de
// acessibilidade (na prévia: a bebida que você já tem, ao adicionar). Tocar só troca a
// própria etiqueta e avisa `onToggle`: redesenhar tudo tiraria o foco de quem usa teclado.
// `toggleAllNode`, quando houver, vira "Marcar todas"/"Desmarcar todas" e some com menos de
// duas etiquetas livres; quem chama liga o clique dele a `toggleAll` e redesenha.
export function renderDrinkPicker({
  node, toggleAllNode = null, drinks, selected, keyOf = (drink, index) => index,
  locked = () => false, lockedLabel = "", onToggle = () => {},
}) {
  if (!node) return;
  const keys = drinks.map(keyOf);
  const syncToggleAll = () => {
    if (!toggleAllNode) return;
    toggleAllNode.hidden = keys.filter((key) => !locked(key)).length < 2;
    toggleAllNode.textContent = allPicked(keys, selected, locked) ? "Desmarcar todas" : "Marcar todas";
  };

  node.replaceChildren(...drinks.map((drink, index) => {
    const key = keys[index];
    const preso = locked(key);
    const etiqueta = document.createElement("button");
    etiqueta.type = "button";
    etiqueta.className = "drink-pick";
    etiqueta.disabled = preso;
    etiqueta.setAttribute("aria-pressed", String(!preso && selected.has(key)));
    if (preso) {
      etiqueta.classList.add("is-duplicate");
      if (lockedLabel) etiqueta.setAttribute("aria-label", `${drinkPickLabel(drink)} · ${lockedLabel}`);
    }

    const marca = document.createElement("span");
    marca.className = "drink-pick-check";
    marca.setAttribute("aria-hidden", "true");
    marca.innerHTML = CHECK;
    const nome = document.createElement("span");
    nome.className = "drink-pick-name";
    nome.textContent = drinkPickLabel(drink);
    etiqueta.append(marca, nome);

    etiqueta.addEventListener("click", () => {
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      etiqueta.setAttribute("aria-pressed", String(selected.has(key)));
      syncToggleAll();
      onToggle();
    });
    return etiqueta;
  }));
  syncToggleAll();
}
