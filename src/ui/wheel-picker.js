const WHEEL_REPEAT_COUNT = 7;
const WHEEL_MIDDLE_REPEAT = Math.floor(WHEEL_REPEAT_COUNT / 2);
const WHEEL_ITEM_HEIGHT = 44;

// A altura de cada número vem do CSS (--wheel-item-h), para a roleta de hora e a de duração
// terem tamanhos próprios sem o cálculo da rolagem divergir do que aparece na tela.
function itemHeight(element) {
  const value = parseFloat(getComputedStyle(element).getPropertyValue("--wheel-item-h"));
  return value > 0 ? value : WHEEL_ITEM_HEIGHT;
}

// Monta o par de roletas no mesmo formato do index.html. `clock` é hora do relógio (00–23 : 00–59,
// sem legendas, como no despertador); `duration` mantém as legendas "Horas"/"Minutos".
export function buildWheelPair({ mode = "clock", ariaSuffix = "", labels = ["Hora", "Minuto"], maxHours = 23 } = {}) {
  const row = document.createElement("div");
  row.className = "duration-inputs wheel-duration-inputs" + (mode === "clock" ? " wheel-clock" : "");
  const parts = [];
  for (const [text, max] of [[labels[0], maxHours], [labels[1], 59]]) {
    const field = document.createElement("div"); field.className = "duration-field";
    const shell = document.createElement("div"); shell.className = "wheel-picker-shell";
    const wheel = document.createElement("div"); wheel.className = "wheel-picker"; wheel.tabIndex = 0;
    wheel.setAttribute("role", "spinbutton"); wheel.setAttribute("aria-label", text + ariaSuffix);
    wheel.setAttribute("aria-valuemin", "0"); wheel.setAttribute("aria-valuemax", String(max));
    const track = document.createElement("div"); track.className = "wheel-picker-track"; track.setAttribute("aria-hidden", "true");
    const selection = document.createElement("div"); selection.className = "wheel-picker-selection"; selection.setAttribute("aria-hidden", "true");
    const input = document.createElement("input"); input.type = "hidden";
    wheel.append(track); shell.append(wheel, selection);
    if (mode !== "clock") { const caption = document.createElement("span"); caption.textContent = text; field.append(caption); }
    field.append(shell, input);
    if (parts.length && mode === "clock") {
      const separator = document.createElement("span"); separator.className = "wheel-clock-separator";
      separator.setAttribute("aria-hidden", "true"); separator.textContent = ":"; row.append(separator);
    }
    row.append(field);
    parts.push({ wheel, input, max });
  }
  return { row, hours: parts[0], minutes: parts[1] };
}

export function createWheelPicker(element, input, maxValue, { onValueChange } = {}) {
  const track = element.querySelector(".wheel-picker-track");
  const valueCount = maxValue + 1;
  const fragment = document.createDocumentFragment();

  for (let repeat = 0; repeat < WHEEL_REPEAT_COUNT; repeat += 1) {
    for (let value = 0; value <= maxValue; value += 1) {
      const item = document.createElement("div");
      item.className = "wheel-picker-item";
      item.dataset.value = String(value);
      item.dataset.index = String(repeat * valueCount + value);
      item.textContent = String(value).padStart(2, "0");
      fragment.appendChild(item);
    }
  }

  track.replaceChildren(fragment);

  const wheelState = {
    input,
    maxValue,
    valueCount,
    track,
    selectedIndex: -1,
    scrollRaf: null,
    settleTimer: null,
    onValueChange,
  };

  element._wheelState = wheelState;

  const updateFromScroll = () => {
    wheelState.scrollRaf = null;
    const maxIndex = track.children.length - 1;
    const index = Math.max(0, Math.min(maxIndex, Math.round(element.scrollTop / itemHeight(element))));
    const item = track.children[index];
    if (!item) return;

    const value = Number(item.dataset.value);
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    element.setAttribute("aria-valuenow", String(value));
    element.setAttribute("aria-valuetext", String(value).padStart(2, "0"));

    if (wheelState.selectedIndex !== index) {
      if (wheelState.selectedIndex >= 0 && track.children[wheelState.selectedIndex]) {
        track.children[wheelState.selectedIndex].classList.remove("is-selected");
      }
      item.classList.add("is-selected");
      wheelState.selectedIndex = index;
    }

    wheelState.onValueChange?.(value);
  };

  const settle = () => {
    const index = Math.round(element.scrollTop / itemHeight(element));
    const repeat = Math.floor(index / valueCount);
    const value = Number(input.value);

    if (repeat <= 1 || repeat >= WHEEL_REPEAT_COUNT - 2) {
      const middleIndex = WHEEL_MIDDLE_REPEAT * valueCount + value;
      element.scrollTo({ top: middleIndex * itemHeight(element), behavior: "auto" });
      updateFromScroll();
    }
  };

  element.addEventListener("scroll", () => {
    if (!wheelState.scrollRaf) {
      wheelState.scrollRaf = requestAnimationFrame(updateFromScroll);
    }

    clearTimeout(wheelState.settleTimer);
    wheelState.settleTimer = setTimeout(settle, 120);
  }, { passive: true });

  element.addEventListener("click", (event) => {
    const item = event.target.closest(".wheel-picker-item");
    if (!item || element.classList.contains("is-disabled")) return;

    element.scrollTo({
      top: Number(item.dataset.index) * itemHeight(element),
      behavior: "smooth",
    });
  });

  element.addEventListener("keydown", (event) => {
    if (element.classList.contains("is-disabled")) return;

    let direction = 0;
    if (event.key === "ArrowUp") direction = -1;
    if (event.key === "ArrowDown") direction = 1;
    if (!direction) return;

    event.preventDefault();
    const currentIndex = Math.round(element.scrollTop / itemHeight(element));
    element.scrollTo({
      top: (currentIndex + direction) * itemHeight(element),
      behavior: "smooth",
    });
  });

  setWheelPickerValue(element, Number(input.value) || 0);
}

export function setWheelPickerValue(element, rawValue, behavior = "auto") {
  const wheelState = element._wheelState;
  if (!wheelState) return;

  const value = Math.max(0, Math.min(wheelState.maxValue, Number(rawValue) || 0));
  const targetIndex = WHEEL_MIDDLE_REPEAT * wheelState.valueCount + value;

  wheelState.input.value = String(value);
  wheelState.input.dispatchEvent(new Event("input", { bubbles: true }));
  element.setAttribute("aria-valuenow", String(value));
  element.setAttribute("aria-valuetext", String(value).padStart(2, "0"));
  element.scrollTo({ top: targetIndex * itemHeight(element), behavior });

  if (wheelState.selectedIndex >= 0 && wheelState.track.children[wheelState.selectedIndex]) {
    wheelState.track.children[wheelState.selectedIndex].classList.remove("is-selected");
  }
  wheelState.selectedIndex = targetIndex;
  wheelState.track.children[targetIndex]?.classList.add("is-selected");

  wheelState.onValueChange?.(value);
}

export function createDurationPicker({
  maxHours, hoursWheel, minutesWheel, hoursInput, minutesInput,
  capMinutesAtMaxHours = false, onHoursChange,
  createWheelPicker: createWheel = createWheelPicker, setWheelPickerValue: setWheelValue = setWheelPickerValue,
}) {
  function set(hours, minutes) {
    const safeHours = Math.max(0, Math.min(maxHours, Number(hours) || 0));
    const atMax = capMinutesAtMaxHours && safeHours === maxHours;
    const safeMinutes = atMax ? 0 : Math.max(0, Math.min(59, Number(minutes) || 0));

    if (capMinutesAtMaxHours) {
      delete minutesWheel.dataset.valueBeforeMax;
      minutesWheel.classList.remove("is-disabled");
      minutesWheel.setAttribute("aria-disabled", "false");
      minutesWheel.tabIndex = 0;
    }

    hoursInput.value = String(safeHours);
    minutesInput.value = String(safeMinutes);
    setWheelValue(minutesWheel, safeMinutes);
    setWheelValue(hoursWheel, safeHours);
  }

  function initialize(initialHours, initialMinutes) {
    createWheel(hoursWheel, hoursInput, maxHours, { onValueChange: onHoursChange });
    createWheel(minutesWheel, minutesInput, 59);
    set(initialHours, initialMinutes);
  }

  return { set, initialize };
}
