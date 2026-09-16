import { createIconReorderController } from "./icon-reorder.js";

export function createIconCatalog({
  state, iconOptions, drinkDialog, persistIconCatalog, clearDrinkFieldError, emojiGroups,
}) {
  let editingIconCatalog = false;
  let movedCatalogIcons = null;
  let removedCatalogIcon = null;

  function setIconCatalogStatus(message) {
    document.querySelector('#icon-catalog-status').textContent = message;
  }

  function toggleIconDeletion() {
    iconReorder.cancel();
    editingIconCatalog = !editingIconCatalog;
    const scroll = iconOptions.scrollLeft;
    buildIconPicker(iconOptions.querySelector('input:checked')?.value || null, true);
    iconOptions.scrollLeft = scroll;
    iconOptions.querySelector('.icon-edit').focus({ preventScroll: true });
    setIconCatalogStatus('');
  }

  function moveCatalogIcon(icon, targetIndex) {
    const catalog = [...state.preferences.iconCatalog];
    const from = catalog.indexOf(icon);
    if (from < 0 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= catalog.length || from === targetIndex) return false;
    catalog.splice(from, 1);
    catalog.splice(targetIndex, 0, icon);
    persistIconCatalog(catalog);
    return true;
  }

  function commitIconMove(icon, targetIndex) {
    const selected = iconOptions.querySelector('input:checked')?.value || null;
    const scroll = iconOptions.scrollLeft;
    try {
      const before = [...state.preferences.iconCatalog];
      if (!moveCatalogIcon(icon, targetIndex)) return;
      movedCatalogIcons = { before, after: [...state.preferences.iconCatalog] };
      buildIconPicker(selected, true);
      iconOptions.scrollLeft = scroll;
      const handle = [...iconOptions.querySelectorAll('input')].find(input => input.value === icon);
      handle?.focus({ preventScroll: true });
      handle?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      setIconCatalogStatus('Ordem salva.');
    } catch (error) {
      setIconCatalogStatus('Não foi possível salvar a ordem. A ordem anterior foi mantida.');
    }
  }

  function removeCatalogIcon(icon) {
    const current = iconOptions.querySelector('input:checked')?.value || null;
    const index = state.preferences.iconCatalog.indexOf(icon);
    if (index < 0) return;
    try {
      persistIconCatalog(state.preferences.iconCatalog.filter(item => item !== icon));
      removedCatalogIcon = { icon, index };
      buildIconPicker(current, true);
      setIconCatalogStatus('Ícone excluído do catálogo. Bebidas e histórico preservados.');
      document.querySelector('#undo-icon-removal').hidden = false;
      document.querySelector('#undo-icon-removal').focus();
    } catch (error) { setIconCatalogStatus('Não foi possível salvar. O ícone foi mantido.'); }
  }

  const iconReorder = createIconReorderController({
    state, iconOptions, drinkDialog,
    getEditingIconCatalog: () => editingIconCatalog,
    commitIconMove, removeCatalogIcon,
  });

  function buildIconPicker(selectedIcon = null, preserveFeedback = false) {
    iconReorder.cancel();
    iconOptions.innerHTML = '';
    if (!preserveFeedback) {
      removedCatalogIcon = null;
      movedCatalogIcons = null;
      editingIconCatalog = false;
      document.querySelector('#undo-icon-removal').hidden = true;
      document.querySelector('#icon-add-panel').hidden = true;
      setIconCatalogStatus('');
    }
    iconOptions.classList.toggle('icon-options-reordering', !editingIconCatalog);
    document.querySelector('#icon-reorder-help').hidden = editingIconCatalog;
    document.querySelector('#icon-delete-help').hidden = !editingIconCatalog;
    if (movedCatalogIcons && JSON.stringify(movedCatalogIcons.after) !== JSON.stringify(state.preferences.iconCatalog)) movedCatalogIcons = null;
    document.querySelector('#undo-icon-reorder').hidden = !movedCatalogIcons;
    const catalog = state.preferences.iconCatalog;
    const selected = typeof selectedIcon === 'string' && selectedIcon.trim() ? selectedIcon.trim() : null;
    const icons = selected && !catalog.includes(selected) ? [selected, ...catalog] : [...catalog];
    icons.forEach(icon => {
      const wrapper = document.createElement('div');
      wrapper.className = 'icon-option';
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'icon';
      input.value = icon;
      input.checked = selected === icon;
      input.setAttribute('aria-label', 'Selecionar ' + icon);
      input.addEventListener('change', () => clearDrinkFieldError('icon'));
      const visual = document.createElement('span');
      visual.textContent = icon;
      visual.setAttribute('aria-hidden', 'true');
      label.append(input, visual);
      wrapper.append(label);
      if (catalog.includes(icon)) {
        wrapper.dataset.catalogIcon = icon;
        iconReorder.attachIconGestures(wrapper, input, icon);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'icon-remove';
        remove.hidden = !editingIconCatalog;
        remove.textContent = '×';
        remove.setAttribute('aria-label', 'Remover ' + icon + ' do catálogo');
        remove.addEventListener('click', () => removeCatalogIcon(icon));
        wrapper.append(remove);
      } else {
        wrapper.title = 'Ícone atual; fora do catálogo';
      }
      iconOptions.append(wrapper);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'icon-option icon-add';
    const actionColumn = Math.ceil(icons.length / 2) + 1;
    add.style.gridColumn = String(actionColumn);
    add.setAttribute('aria-controls', 'icon-add-panel');
    add.setAttribute('aria-expanded', String(!document.querySelector('#icon-add-panel').hidden));
    add.textContent = '+';
    add.setAttribute('aria-label', 'Adicionar ícone');
    add.addEventListener('click', () => {
      document.querySelector('#icon-add-panel').hidden = false;
      add.setAttribute('aria-expanded', 'true');
      renderEmojiMenu();
      document.querySelector('#emoji-category').focus();
    });
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'icon-option icon-edit';
    edit.style.gridColumn = String(actionColumn);
    edit.textContent = editingIconCatalog ? '✓' : '✎';
    edit.setAttribute('aria-label', editingIconCatalog ? 'Concluir exclusão de ícones' : 'Excluir ícones do catálogo');
    edit.setAttribute('aria-pressed', String(editingIconCatalog));
    edit.addEventListener('click', toggleIconDeletion);
    iconOptions.append(add, edit);
  }

  function renderEmojiMenu() {
    const grid = document.querySelector('#emoji-menu');
    const category = document.querySelector('#emoji-category');
    if (!category.options.length) {
      emojiGroups.forEach((group, index) => category.add(new Option(group.name, index)));
      const fragment = document.createDocumentFragment();
      emojiGroups.forEach((group, index) => {
        const section = document.createElement('section');
        section.className = 'emoji-section';
        section.dataset.category = String(index);
        const heading = document.createElement('h3');
        heading.id = 'emoji-heading-' + index;
        heading.textContent = group.name;
        section.setAttribute('aria-labelledby', heading.id);
        const choices = document.createElement('div');
        choices.className = 'emoji-choices';
        group.icons.forEach(icon => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'emoji-choice';
          button.textContent = icon;
          choices.append(button);
        });
        section.append(heading, choices);
        fragment.append(section);
      });
      grid.append(fragment);
    }
    grid.querySelectorAll('.emoji-choice').forEach(button => {
      const icon = button.textContent;
      button.disabled = state.preferences.iconCatalog.includes(icon);
      button.setAttribute('aria-label', button.disabled ? icon + ' já adicionado' : 'Adicionar ' + icon);
    });
    scrollToEmojiCategory();
  }

  function scrollToEmojiCategory() {
    const grid = document.querySelector('#emoji-menu');
    const section = grid.children[Number(document.querySelector('#emoji-category').value) || 0];
    if (!section) return;
    // Scroll only the palette, preserving the form and dropdown focus.
    grid.scrollTop += section.getBoundingClientRect().top - grid.getBoundingClientRect().top;
  }

  function syncEmojiCategory() {
    const grid = document.querySelector('#emoji-menu');
    if (!grid.clientHeight) return;
    const top = grid.getBoundingClientRect().top;
    let active = 0;
    for (const section of grid.children) {
      if (section.getBoundingClientRect().top > top + 2) break;
      active = Number(section.dataset.category);
    }
    if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 2) active = grid.children.length - 1;
    document.querySelector('#emoji-category').value = String(active);
  }

  function addCatalogIcon(icon) {
    if (!emojiGroups.some(group => group.icons.includes(icon))) return;
    const catalog = state.preferences.iconCatalog;
    if (catalog.includes(icon)) { setIconCatalogStatus('Esse ícone já está na lista.'); return; }
    if (catalog.length >= 100) { setIconCatalogStatus('Limite de 100 ícones. Remova um para adicionar outro.'); return; }
    try {
      persistIconCatalog([...catalog, icon]);
      document.querySelector('#icon-add-panel').hidden = true;
      buildIconPicker(icon, true);
      clearDrinkFieldError('icon');
      setIconCatalogStatus('Ícone adicionado e selecionado.');
      iconOptions.querySelector('input:checked').focus();
    } catch (error) { setIconCatalogStatus('Não foi possível salvar o ícone. Tente novamente.'); }
  }

  // Catálogo é uma preferência global, independente do rascunho da bebida.
  document.querySelector('#undo-icon-reorder').addEventListener('click', () => {
    if (!movedCatalogIcons) return;
    try {
      persistIconCatalog([...movedCatalogIcons.before]);
      movedCatalogIcons = null;
      const scroll = iconOptions.scrollLeft;
      buildIconPicker(iconOptions.querySelector('input:checked')?.value || null, true);
      iconOptions.scrollLeft = scroll;
      iconOptions.querySelector('.icon-edit').focus({ preventScroll: true });
      setIconCatalogStatus('Ordem anterior restaurada.');
    } catch (error) { setIconCatalogStatus('Não foi possível desfazer. A ordem atual foi mantida.'); }
  });
  document.querySelector('#emoji-category').addEventListener('change', scrollToEmojiCategory);
  document.querySelector('#emoji-menu').addEventListener('scroll', syncEmojiCategory, { passive: true });
  document.querySelector('#emoji-menu').addEventListener('click', event => {
    const button = event.target.closest('.emoji-choice');
    if (button && !button.disabled) addCatalogIcon(button.textContent);
  });
  document.querySelector('#cancel-add-icon').addEventListener('click', () => {
    document.querySelector('#icon-add-panel').hidden = true;
    iconOptions.querySelector('.icon-add').setAttribute('aria-expanded', 'false');
    iconOptions.querySelector('.icon-add').focus();
  });
  document.querySelector('#undo-icon-removal').addEventListener('click', () => {
    if (!removedCatalogIcon) return;
    const { icon, index } = removedCatalogIcon;
    const catalog = [...state.preferences.iconCatalog];
    if (!catalog.includes(icon)) {
      if (catalog.length >= 100) { setIconCatalogStatus('Remova um ícone antes de desfazer.'); return; }
      catalog.splice(Math.min(index, catalog.length), 0, icon);
    }
    try {
      persistIconCatalog(catalog);
      const selected = iconOptions.querySelector('input:checked')?.value || null;
      buildIconPicker(selected, true);
      removedCatalogIcon = null;
      document.querySelector('#undo-icon-removal').hidden = true;
      setIconCatalogStatus('Ícone restaurado.');
      const restored = [...iconOptions.querySelectorAll('input')].find(input => input.value === icon);
      restored?.focus();
    } catch (error) { setIconCatalogStatus('Não foi possível restaurar o ícone. Tente novamente.'); }
  });

  return {
    buildIconPicker,
    getEditingIconCatalog: () => editingIconCatalog,
    cancelIconReorder: () => iconReorder.cancel(),
    moveCatalogIcon,
    syncEmojiCategory,
    scrollToEmojiCategory,
  };
}
