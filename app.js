const DATA_STORAGE_KEY = "balada-v1-data";
const LEGACY_DRINKS_STORAGE_KEY = "balada-v1-drinks";
const DATA_VERSION = 7;

const PICKER_ICONS = [
  "🍬", "💊", "🍍", "🍭", "🥃", "🍺", "🍷", "🥂",
  "👃", "🐽", "🌿", "🚬", "🌻", "❄️", "🍫", "🍄",
  "🍪", "🌵", "💧", "💦", "😵‍💫", "🕳️", "💤", "💫",
  "🥶", "🥵", "🌊", "🪄", "🧪", "👽", "😈", "🧙‍♂️"
];
const DEFAULT_ICON = "🍺";

const WHEEL_REPEAT_COUNT = 7;
const WHEEL_MIDDLE_REPEAT = Math.floor(WHEEL_REPEAT_COUNT / 2);
const WHEEL_ITEM_HEIGHT = 44;

const REORDER_ANIMATION_MS = 880;
const REORDER_ANIMATION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

const LONG_PRESS_MS = 600;
const LONG_PRESS_FEEDBACK_MS = 280;
const LONG_PRESS_MOVE_TOLERANCE = 12;
const DOUBLE_TAP_MAX_DELAY_MS = 430;
const DOUBLE_TAP_FEEDBACK_MS = 430;

const initialData = loadAppData();

const state = {
  drinks: initialData.drinks,
  events: initialData.events,
  timerId: null,
  selectedDrinkId: null,
  pendingDrinkId: null,
  pendingDoseEventId: null,
  selectedEventId: null,
  editingDrinkId: null,
  deleteDrinkId: null,
  deleteReturnToEditor: false,
  menuDrinkId: null,
  historyDrinkId: null,
  currentView: "home",
  undo: null,
  toastTimerId: null,
  reorderAnimationUntil: 0,
  pendingDoubleTap: null,
};

const homeHeader = document.querySelector("#home-header");
const historyHeader = document.querySelector("#history-header");
const homeView = document.querySelector("#home-view");
const historyView = document.querySelector("#history-view");
const historyList = document.querySelector("#history-list");
const historyEmptyState = document.querySelector("#history-empty-state");
const historyCount = document.querySelector("#history-count");
const historyDescription = document.querySelector("#history-description");
const historyHeaderEyebrow = document.querySelector("#history-header-eyebrow");
const historyHeaderTitle = document.querySelector("#history-header-title");

const drinkList = document.querySelector("#drink-list");
const emptyState = document.querySelector("#empty-state");
const drinkDialog = document.querySelector("#drink-dialog");
const drinkForm = document.querySelector("#drink-form");
const nameInput = document.querySelector("#drink-name");
const intervalHoursInput = document.querySelector("#interval-hours");
const intervalMinutesInput = document.querySelector("#interval-minutes");
const intervalHoursWheel = document.querySelector("#interval-hours-wheel");
const intervalMinutesWheel = document.querySelector("#interval-minutes-wheel");
const iconOptions = document.querySelector("#icon-options");
const formError = document.querySelector("#form-error");
const drinkDialogEyebrow = document.querySelector("#drink-dialog-eyebrow");
const drinkDialogTitle = document.querySelector("#drink-dialog-title");
const drinkSubmitButton = document.querySelector("#drink-submit-button");
const deleteDrinkFromEditorButton = document.querySelector("#delete-drink-from-editor");
const drinkDangerZone = document.querySelector("#drink-danger-zone");
const drinkIntervalEditNote = document.querySelector("#drink-interval-edit-note");
const askDoseSizeInput = document.querySelector("#ask-dose-size");
const cardTemplate = document.querySelector("#drink-card-template");

const deleteDrinkDialog = document.querySelector("#delete-drink-dialog");
const deleteDrinkName = document.querySelector("#delete-drink-name");
const deleteDrinkSummary = document.querySelector("#delete-drink-summary");

const intervalWarningDialog = document.querySelector("#interval-warning-dialog");
const intervalWarningDrinkName = document.querySelector("#interval-warning-drink-name");
const intervalWarningRemaining = document.querySelector("#interval-warning-remaining");
const intervalWarningMessage = document.querySelector("#interval-warning-message");
const intervalWarningContext = document.querySelector("#interval-warning-context");

const drinkMenuDialog = document.querySelector("#drink-menu-dialog");
const drinkMenuName = document.querySelector("#drink-menu-name");

const logDialog = document.querySelector("#log-dialog");
const logForm = document.querySelector("#log-form");
const logDrinkName = document.querySelector("#log-drink-name");
const activeIntervalWarning = document.querySelector("#active-interval-warning");
const activeIntervalWarningTitle = document.querySelector("#active-interval-warning-title");
const activeIntervalWarningText = document.querySelector("#active-interval-warning-text");
const logHoursAgoInput = document.querySelector("#log-hours-ago");
const logMinutesAgoInput = document.querySelector("#log-minutes-ago");
const logHoursWheel = document.querySelector("#log-hours-wheel");
const logMinutesWheel = document.querySelector("#log-minutes-wheel");
const logFormError = document.querySelector("#log-form-error");

const eventDialog = document.querySelector("#event-dialog");
const eventForm = document.querySelector("#event-form");
const eventDrinkName = document.querySelector("#event-drink-name");
const eventDateInput = document.querySelector("#event-date");
const eventTimeInput = document.querySelector("#event-time");
const eventInterval = document.querySelector("#event-interval");
const eventWarning = document.querySelector("#event-warning");
const eventWarningText = document.querySelector("#event-warning-text");
const eventDeletedNote = document.querySelector("#event-deleted-note");
const eventFormError = document.querySelector("#event-form-error");
const eventDoseField = document.querySelector("#event-dose-field");

const doseSizeDialog = document.querySelector("#dose-size-dialog");
const doseSizeDrinkName = document.querySelector("#dose-size-drink-name");
const doseHalfButton = document.querySelector("#dose-half-button");
const doseFullButton = document.querySelector("#dose-full-button");

const toast = document.querySelector("#toast");
const toastMessage = document.querySelector("#toast-message");
const toastUndo = document.querySelector("#toast-undo");

function loadAppData() {
  try {
    const raw = localStorage.getItem(DATA_STORAGE_KEY);

    if (raw) {
      const parsed = JSON.parse(raw);
      const normalized = normalizeData(parsed);

      if (normalized) {
        return normalized;
      }
    }
  } catch (error) {
    console.error("Não foi possível carregar os dados atuais.", error);
  }

  return migrateLegacyData();
}

function normalizeData(data) {
  if (!data || !Array.isArray(data.drinks) || !Array.isArray(data.events)) {
    return null;
  }

  const drinks = data.drinks
    .filter((drink) => drink && drink.id && drink.name)
    .map((drink) => ({
      id: String(drink.id),
      name: String(drink.name),
      icon: normalizeIcon(drink.icon),
      intervalMinutes: normalizeIntervalMinutes(drink.intervalMinutes),
      askDoseSize: Boolean(drink.askDoseSize),
    }));

  const drinkById = new Map(drinks.map((drink) => [drink.id, drink]));

  const events = data.events
    .filter((event) => {
      return (
        event &&
        event.id &&
        event.drinkId &&
        Number.isFinite(Number(event.consumedAt))
      );
    })
    .map((event) => {
      const drinkId = String(event.drinkId);
      const activeDrink = drinkById.get(drinkId);
      const snapshotName = String(event.drinkName || activeDrink?.name || "Bebida excluída").trim() || "Bebida excluída";
      const snapshotIcon = normalizeIcon(event.drinkIcon, activeDrink?.icon || DEFAULT_ICON);

      return {
        id: String(event.id),
        drinkId,
        drinkName: snapshotName,
        drinkIcon: snapshotIcon,
        consumedAt: Number(event.consumedAt),
        intervalMinutes: normalizeIntervalMinutes(event.intervalMinutes),
        doseSize: normalizeDoseSize(event.doseSize),
      };
    });

  return {
    version: DATA_VERSION,
    drinks,
    events,
  };
}

function migrateLegacyData() {
  let legacyDrinks = [];

  try {
    const raw = localStorage.getItem(LEGACY_DRINKS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) legacyDrinks = parsed;
    }
  } catch (error) {
    console.error("Não foi possível migrar os dados da versão anterior.", error);
  }

  const drinks = legacyDrinks
    .filter((drink) => drink && drink.id && drink.name)
    .map((drink) => ({
      id: String(drink.id),
      name: String(drink.name),
      icon: normalizeIcon(drink.icon),
      intervalMinutes: normalizeIntervalMinutes(drink.intervalMinutes),
      askDoseSize: false,
    }));

  const events = legacyDrinks
    .filter((drink) => drink && drink.id && Number.isFinite(Number(drink.lastConsumedAt)) && Number(drink.lastConsumedAt) > 0)
    .map((drink) => ({
      id: createId(),
      drinkId: String(drink.id),
      drinkName: String(drink.name),
      drinkIcon: normalizeIcon(drink.icon),
      consumedAt: Number(drink.lastConsumedAt),
      intervalMinutes: normalizeIntervalMinutes(drink.intervalMinutes),
      doseSize: null,
    }));

  const migrated = {
    version: DATA_VERSION,
    drinks,
    events,
  };

  try {
    localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(migrated));
  } catch (error) {
    console.error("Não foi possível salvar a migração dos dados.", error);
  }

  return migrated;
}

function normalizeIcon(value, fallback = DEFAULT_ICON) {
  const icon = typeof value === "string" ? value.trim() : "";
  return icon || fallback;
}

function normalizeIntervalMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return 60;
  return Math.min(1440, Math.round(numeric));
}

function normalizeDoseSize(value) {
  return value === "half" || value === "full" ? value : null;
}

function getDoseLabel(value) {
  if (value === "half") return "Meia";
  if (value === "full") return "Inteira";
  return "";
}

function getDoseStatusSuffix(event) {
  const label = getDoseLabel(event?.doseSize);
  return label ? ` · ${label}` : "";
}

function saveData() {
  const data = {
    version: DATA_VERSION,
    drinks: state.drinks,
    events: state.events,
  };

  localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(data));
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatClock(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatHistoryElapsed(timestamp, now = Date.now()) {
  const elapsedMs = Math.max(0, now - Number(timestamp));
  const totalMinutes = Math.floor(elapsedMs / 60000);

  if (totalMinutes < 1) return "menos de 1 min atrás";
  if (totalMinutes < 60) return `${totalMinutes} min atrás`;

  if (totalMinutes < 24 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}h atrás`;
  }

  const days = Math.floor(totalMinutes / (24 * 60));
  return `${days} ${days === 1 ? "dia" : "dias"} atrás`;
}

function setHistoryClockLabel(element, timestamp) {
  element.replaceChildren();
  element.append(document.createTextNode(`às ${formatClock(timestamp)}`));

  const unit = document.createElement("span");
  unit.className = "time-unit";
  unit.textContent = "h";
  element.append(unit);
}

function updateHistoryElapsedLabels() {
  document.querySelectorAll(".history-event-elapsed[data-consumed-at]").forEach((element) => {
    const timestamp = Number(element.dataset.consumedAt);
    if (!Number.isFinite(timestamp)) return;
    const label = formatHistoryElapsed(timestamp);
    element.textContent = label;
    element.setAttribute("aria-label", `Tempo desde o consumo: ${label}`);
  });
}

function setClockStatus(element, prefix, timestamp, trailingText = "") {
  element.replaceChildren();
  element.append(document.createTextNode(`${prefix} ${formatClock(timestamp)}`));

  const unit = document.createElement("span");
  unit.className = "time-unit";
  unit.textContent = "h";
  element.append(unit);

  if (trailingText) {
    element.append(document.createTextNode(trailingText));
  }
}

function formatInterval(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) return `${hours} h ${minutes} min`;
  if (hours) return `${hours} h`;
  return `${minutes} min`;
}

function formatElapsed(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  if (totalMinutes < 1) return "menos de 1 min";
  return formatInterval(totalMinutes);
}

function toLocalDateInputValue(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalTimeInputValue(timestamp) {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getLocalDateKey(timestamp) {
  return toLocalDateInputValue(timestamp);
}

function getStartOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function formatHistoryDay(timestamp) {
  const date = new Date(timestamp);
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const todayStart = getStartOfToday();
  const oneDay = 24 * 60 * 60 * 1000;
  const difference = Math.round((todayStart - dayStart.getTime()) / oneDay);

  if (difference === 0) return "Hoje";
  if (difference === 1) return "Ontem";

  const options = date.getFullYear() === new Date().getFullYear()
    ? { day: "numeric", month: "long" }
    : { day: "numeric", month: "long", year: "numeric" };

  return new Intl.DateTimeFormat("pt-BR", options).format(date);
}

function getDrinkEvents(drinkId) {
  return state.events
    .filter((event) => event.drinkId === drinkId)
    .sort((a, b) => a.consumedAt - b.consumedAt || a.id.localeCompare(b.id));
}

function getEventDrinkIdentity(event) {
  const activeDrink = state.drinks.find((drink) => drink.id === event.drinkId);

  if (activeDrink) {
    return {
      id: activeDrink.id,
      name: activeDrink.name,
      icon: activeDrink.icon,
      isDeleted: false,
    };
  }

  return {
    id: event.drinkId,
    name: event.drinkName || "Bebida excluída",
    icon: normalizeIcon(event.drinkIcon),
    isDeleted: true,
  };
}

function isEventBeforePreviousIntervalEnded(events, index) {
  if (index <= 0 || index >= events.length) return false;

  const previous = events[index - 1];
  const current = events[index];
  const previousAvailableAt = previous.consumedAt + previous.intervalMinutes * 60 * 1000;

  return current.consumedAt < previousAvailableAt;
}

function getCurrentViolationClusterCount(events) {
  if (events.length < 2) return 0;

  let index = events.length - 1;
  if (!isEventBeforePreviousIntervalEnded(events, index)) return 0;

  let count = 2;
  index -= 1;

  while (index > 0 && isEventBeforePreviousIntervalEnded(events, index)) {
    count += 1;
    index -= 1;
  }

  return count;
}

function getEventContext(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return null;

  const events = getDrinkEvents(event.drinkId);
  const index = events.findIndex((item) => item.id === eventId);
  const previousEvent = index > 0 ? events[index - 1] : null;

  if (!previousEvent) {
    return {
      event,
      previousEvent: null,
      isViolation: false,
      elapsedMs: null,
      remainingAtConsumptionMs: null,
    };
  }

  const elapsedMs = event.consumedAt - previousEvent.consumedAt;
  const previousAvailableAt = previousEvent.consumedAt + previousEvent.intervalMinutes * 60 * 1000;
  const isViolation = event.consumedAt < previousAvailableAt;

  return {
    event,
    previousEvent,
    isViolation,
    elapsedMs,
    remainingAtConsumptionMs: isViolation ? previousAvailableAt - event.consumedAt : 0,
  };
}

function getDrinkActivity(drink) {
  const events = getDrinkEvents(drink.id);
  const latestEvent = events.at(-1) || null;

  if (!latestEvent) {
    return {
      events,
      latestEvent: null,
      remainingMs: 0,
      violationClusterCount: 0,
      state: "new",
    };
  }

  const availableAt = latestEvent.consumedAt + latestEvent.intervalMinutes * 60 * 1000;
  const remainingMs = availableAt - Date.now();
  const violationClusterCount = getCurrentViolationClusterCount(events);

  let activityState = "completed";

  if (remainingMs > 0) {
    activityState = violationClusterCount > 0 ? "danger" : "waiting";
  }

  return {
    events,
    latestEvent,
    remainingMs,
    violationClusterCount,
    state: activityState,
  };
}

function getSortedDrinks() {
  return [...state.drinks].sort((a, b) => {
    const aLatest = getDrinkEvents(a.id).at(-1)?.consumedAt || 0;
    const bLatest = getDrinkEvents(b.id).at(-1)?.consumedAt || 0;

    if (aLatest !== bLatest) return bLatest - aLatest;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

function captureDrinkCardPositions() {
  const positions = new Map();

  drinkList.querySelectorAll(".drink-card[data-drink-id]").forEach((card) => {
    positions.set(card.dataset.drinkId, card.getBoundingClientRect());
  });

  return positions;
}

function animateDrinkReorder(previousPositions, focusDrinkId = null) {
  const noAnimation = {
    movedFocus: false,
    promise: Promise.resolve(),
  };

  if (!previousPositions?.size || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return noAnimation;
  }

  const animations = [];
  const animatedCards = [];
  let movedFocus = false;

  drinkList.querySelectorAll(".drink-card[data-drink-id]").forEach((card) => {
    const previousRect = previousPositions.get(card.dataset.drinkId);
    if (!previousRect) return;

    const currentRect = card.getBoundingClientRect();
    const deltaX = previousRect.left - currentRect.left;
    const deltaY = previousRect.top - currentRect.top;

    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

    const isFocus = card.dataset.drinkId === focusDrinkId;
    if (isFocus && Math.abs(deltaY) >= 4) movedFocus = true;

    card.classList.add("is-reordering-card");
    if (isFocus) card.classList.add("is-reordering-focus");
    animatedCards.push(card);

    const animation = card.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: "translate(0, 0)" },
      ],
      {
        duration: REORDER_ANIMATION_MS,
        easing: REORDER_ANIMATION_EASING,
        fill: "both",
      }
    );

    animations.push(animation.finished.catch(() => {}));
  });

  if (!animations.length) return noAnimation;

  state.reorderAnimationUntil = Date.now() + REORDER_ANIMATION_MS + 80;
  drinkList.classList.add("is-reordering");

  const promise = Promise.all(animations).finally(() => {
    animatedCards.forEach((card) => {
      card.classList.remove("is-reordering-card", "is-reordering-focus");
    });
    drinkList.classList.remove("is-reordering");
    state.reorderAnimationUntil = 0;
  });

  return { movedFocus, promise };
}

function performNormalDrinkTap(drink, activity) {
  if (activity.state === "waiting" || activity.state === "danger") {
    openIntervalWarningDialog(drink.id);
    return;
  }

  registerDrinkAt(drink.id, Date.now());
}

function attachDrinkInteractions(mainButton, drink) {
  let longPressTimer = null;
  let feedbackTimer = null;
  let doubleTapFeedbackTimer = null;
  let startX = 0;
  let startY = 0;
  let activePointerId = null;
  let longPressTriggered = false;

  const clearPressTimers = () => {
    clearTimeout(longPressTimer);
    clearTimeout(feedbackTimer);
    longPressTimer = null;
    feedbackTimer = null;
    mainButton.classList.remove("is-long-pressing");
  };

  const cancelPress = () => {
    clearPressTimers();
    activePointerId = null;
  };

  const showFirstTapFeedback = () => {
    clearTimeout(doubleTapFeedbackTimer);
    mainButton.classList.add("is-awaiting-second-tap");
    doubleTapFeedbackTimer = setTimeout(() => {
      mainButton.classList.remove("is-awaiting-second-tap");
    }, DOUBLE_TAP_FEEDBACK_MS);
  };

  mainButton.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    clearPressTimers();
    longPressTriggered = false;
    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;

    feedbackTimer = setTimeout(() => {
      if (activePointerId === event.pointerId) {
        mainButton.classList.add("is-long-pressing");
      }
    }, LONG_PRESS_FEEDBACK_MS);

    longPressTimer = setTimeout(() => {
      if (activePointerId !== event.pointerId) return;

      longPressTriggered = true;
      state.pendingDoubleTap = null;
      clearPressTimers();
      mainButton.classList.remove("is-awaiting-second-tap");

      if (typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(30);
        } catch (error) {
          // Vibração é apenas feedback opcional; alguns browsers a bloqueiam.
        }
      }

      openLogDialog(drink.id);
    }, LONG_PRESS_MS);
  });

  mainButton.addEventListener("pointermove", (event) => {
    if (activePointerId !== event.pointerId) return;

    const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
    if (distance > LONG_PRESS_MOVE_TOLERANCE) cancelPress();
  }, { passive: true });

  mainButton.addEventListener("pointerup", (event) => {
    if (activePointerId === event.pointerId) cancelPress();
  });

  mainButton.addEventListener("pointercancel", (event) => {
    if (activePointerId === event.pointerId) cancelPress();
  });

  mainButton.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  mainButton.addEventListener("click", (event) => {
    if (longPressTriggered) {
      event.preventDefault();
      event.stopPropagation();
      longPressTriggered = false;
      return;
    }

    const now = performance.now();
    const previousTap = state.pendingDoubleTap;
    const isSecondTap = Boolean(
      previousTap &&
      previousTap.drinkId === drink.id &&
      now - previousTap.at <= DOUBLE_TAP_MAX_DELAY_MS
    );

    if (!isSecondTap) {
      state.pendingDoubleTap = { drinkId: drink.id, at: now };
      showFirstTapFeedback();
      return;
    }

    state.pendingDoubleTap = null;
    clearTimeout(doubleTapFeedbackTimer);
    mainButton.classList.remove("is-awaiting-second-tap");

    performNormalDrinkTap(drink, getDrinkActivity(drink));
  });
}

function render() {
  drinkList.innerHTML = "";
  emptyState.hidden = state.drinks.length > 0;

  getSortedDrinks().forEach((drink) => {
    const fragment = cardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".drink-card");
    const mainButton = fragment.querySelector(".drink-main");
    const historyButton = fragment.querySelector(".drink-history-button");
    const menuButton = fragment.querySelector(".more-button");
    const icon = fragment.querySelector(".drink-icon");
    const name = fragment.querySelector(".drink-name");
    const stateLabel = fragment.querySelector(".drink-state");
    const status = fragment.querySelector(".drink-status");
    const time = fragment.querySelector(".drink-time");

    card.dataset.drinkId = drink.id;
    icon.textContent = drink.icon;
    name.textContent = drink.name;

    const activity = getDrinkActivity(drink);
    card.classList.add(activity.state);

    if (activity.state === "new") {
      stateLabel.textContent = "SEM REGISTRO";
      status.textContent = `Intervalo configurado: ${formatInterval(drink.intervalMinutes)}`;
      time.textContent = "Anotar primeira dose";
      mainButton.setAttribute("aria-label", `Anotar ${drink.name} agora com dois toques rápidos. Toque e segure para anotar outra dose.`);
    } else if (activity.state === "waiting") {
      stateLabel.hidden = true;
      setClockStatus(status, "Tomou às", activity.latestEvent.consumedAt, getDoseStatusSuffix(activity.latestEvent));
      time.textContent = `⛔ Aguarde: ${formatTime(activity.remainingMs)}`;
      mainButton.setAttribute(
        "aria-label",
        `${drink.name}: intervalo em andamento. ${formatTime(activity.remainingMs)} restantes. Toque duas vezes para abrir as opções de anotação ou toque e segure para anotar outra dose.`
      );
    } else if (activity.state === "danger") {
      stateLabel.textContent = "⚠ TOMOU DOSE POR CIMA DA OUTRA";
      setClockStatus(
        status,
        "Tomou às",
        activity.latestEvent.consumedAt,
        `${getDoseStatusSuffix(activity.latestEvent)} · ${activity.violationClusterCount} registros em sequência`
      );
      time.textContent = `⛔ Aguarde: ${formatTime(activity.remainingMs)}`;
      mainButton.setAttribute(
        "aria-label",
        `${drink.name}: atenção. ${activity.violationClusterCount} anotações em sequência antes do intervalo terminar. ${formatTime(activity.remainingMs)} restantes. Toque duas vezes para abrir as opções ou toque e segure para anotar outra dose.`
      );
    } else {
      stateLabel.textContent = "✓ INTERVALO CONCLUÍDO";
      setClockStatus(status, "Anterior:", activity.latestEvent.consumedAt, getDoseStatusSuffix(activity.latestEvent));
      time.textContent = "Anotar nova dose";
      mainButton.setAttribute("aria-label", `Anotar nova dose de ${drink.name} agora com dois toques rápidos. Toque e segure para anotar outra dose.`);
    }

    attachDrinkInteractions(mainButton, drink);

    historyButton.setAttribute("aria-label", `Ver histórico de ${drink.name}`);
    historyButton.addEventListener("click", () => openHistoryView(drink.id));

    menuButton.setAttribute("aria-label", `Mais opções para ${drink.name}`);
    menuButton.addEventListener("click", () => openDrinkMenuDialog(drink.id));

    drinkList.appendChild(fragment);
  });
}

function renderHistory() {
  historyList.innerHTML = "";

  const filterDrink = state.historyDrinkId
    ? state.drinks.find((drink) => drink.id === state.historyDrinkId) || null
    : null;

  const entries = state.events
    .filter((event) => !state.historyDrinkId || event.drinkId === state.historyDrinkId)
    .map((event) => ({ event, drink: getEventDrinkIdentity(event) }))
    .sort((a, b) => b.event.consumedAt - a.event.consumedAt || b.event.id.localeCompare(a.event.id));

  historyCount.textContent = `${entries.length} registro${entries.length === 1 ? "" : "s"}`;
  historyDescription.textContent = filterDrink
    ? `${filterDrink.icon} ${filterDrink.name} · toque em um registro para corrigir o horário ou excluí-lo.`
    : "Toque em um registro para corrigir o horário ou excluí-lo.";
  historyEmptyState.hidden = entries.length > 0;

  if (!entries.length) return;

  const groups = new Map();

  entries.forEach((entry) => {
    const key = getLocalDateKey(entry.event.consumedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });

  groups.forEach((groupEntries) => {
    const daySection = document.createElement("section");
    daySection.className = "history-day";

    const title = document.createElement("h2");
    title.className = "history-day-title";
    title.textContent = formatHistoryDay(groupEntries[0].event.consumedAt);

    const timeline = document.createElement("div");
    timeline.className = "history-timeline";

    groupEntries.forEach(({ event, drink }) => {
      const context = getEventContext(event.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-event";
      if (context?.isViolation) button.classList.add("violation");
      button.setAttribute("aria-label", `Editar anotação de ${drink.name}, tomada às ${formatClock(event.consumedAt)}h, ${formatHistoryElapsed(event.consumedAt)}`);

      const marker = document.createElement("span");
      marker.className = "history-marker";
      marker.setAttribute("aria-hidden", "true");

      const time = document.createElement("span");
      time.className = "history-event-time";
      setHistoryClockLabel(time, event.consumedAt);

      const body = document.createElement("span");
      body.className = "history-event-body";

      const heading = document.createElement("span");
      heading.className = "history-event-heading";

      const icon = document.createElement("span");
      icon.className = "history-event-icon";
      icon.textContent = drink.icon;
      icon.setAttribute("aria-hidden", "true");

      const name = document.createElement("strong");
      name.textContent = drink.name;

      const mobileTime = document.createElement("span");
      mobileTime.className = "history-event-mobile-time";
      setHistoryClockLabel(mobileTime, event.consumedAt);

      const chevron = document.createElement("span");
      chevron.className = "history-event-chevron";
      chevron.textContent = "›";
      chevron.setAttribute("aria-hidden", "true");

      heading.append(icon, name, mobileTime, chevron);
      body.appendChild(heading);

      const elapsed = document.createElement("span");
      elapsed.className = "history-event-elapsed";
      elapsed.dataset.consumedAt = String(event.consumedAt);
      elapsed.textContent = formatHistoryElapsed(event.consumedAt);
      elapsed.setAttribute("aria-label", `Tempo desde o consumo: ${elapsed.textContent}`);
      body.appendChild(elapsed);

      if (event.doseSize) {
        const doseBadge = document.createElement("span");
        doseBadge.className = `history-dose-badge ${event.doseSize}`;
        doseBadge.textContent = getDoseLabel(event.doseSize);
        body.appendChild(doseBadge);
      }

      if (drink.isDeleted) {
        const deletedBadge = document.createElement("span");
        deletedBadge.className = "history-event-deleted";
        deletedBadge.textContent = "Bebida excluída · registro mantido";
        body.appendChild(deletedBadge);
      }

      if (context?.isViolation) {
        const alert = document.createElement("span");
        alert.className = "history-event-alert";
        alert.textContent = "⚠ Tomou dose por cima da outra";

        const detail = document.createElement("span");
        detail.className = "history-event-detail";
        detail.textContent = `${formatElapsed(context.elapsedMs)} após o registro anterior · faltavam ${formatElapsed(context.remainingAtConsumptionMs)}`;

        body.append(alert, detail);
      } else {
        const detail = document.createElement("span");
        detail.className = "history-event-detail";
        detail.textContent = `Intervalo da dose: ${formatInterval(event.intervalMinutes)}`;
        body.appendChild(detail);
      }

      button.append(marker, time, body);
      button.addEventListener("click", () => openEventDialog(event.id));
      timeline.appendChild(button);
    });

    daySection.append(title, timeline);
    historyList.appendChild(daySection);
  });
}

function refreshDataViews() {
  render();
  if (state.currentView === "history") renderHistory();
}

function openHistoryView(drinkId = null) {
  const drink = drinkId ? state.drinks.find((item) => item.id === drinkId) : null;
  state.historyDrinkId = drink?.id || null;
  state.currentView = "history";

  if (drink) {
    historyHeaderEyebrow.textContent = "Histórico";
    historyHeaderTitle.textContent = drink.name;
  } else {
    historyHeaderEyebrow.textContent = "Registros";
    historyHeaderTitle.textContent = "Histórico";
  }

  homeHeader.hidden = true;
  homeView.hidden = true;
  historyHeader.hidden = false;
  historyView.hidden = false;
  renderHistory();
  window.scrollTo(0, 0);
}

function closeHistoryView() {
  state.currentView = "home";
  state.historyDrinkId = null;
  historyHeader.hidden = true;
  historyView.hidden = true;
  homeHeader.hidden = false;
  homeView.hidden = false;
  render();
  window.scrollTo(0, 0);
}

function registerDrinkAt(id, timestamp) {
  const drink = state.drinks.find((item) => item.id === id);
  if (!drink) return;

  // Capturamos as posições antes de alterar os dados. Depois do render,
  // usamos FLIP para mostrar visualmente a bebida mudando de posição.
  const previousPositions = state.currentView === "home"
    ? captureDrinkCardPositions()
    : null;

  const event = {
    id: createId(),
    drinkId: id,
    drinkName: drink.name,
    drinkIcon: drink.icon,
    consumedAt: timestamp,
    intervalMinutes: drink.intervalMinutes,
    doseSize: drink.askDoseSize ? "full" : null,
  };

  state.events.push(event);
  saveData();
  refreshDataViews();

  const reorder = state.currentView === "home"
    ? animateDrinkReorder(previousPositions, drink.id)
    : { movedFocus: false, promise: Promise.resolve() };

  if (drink.askDoseSize) {
    // Se o card realmente mudou de lugar, deixamos o usuário enxergar o
    // movimento antes de abrir a escolha de meia/inteira. O registro já foi
    // salvo como inteiro, então a espera é apenas visual.
    if (reorder.movedFocus) {
      reorder.promise.finally(() => openDoseSizeDialog(event.id));
    } else {
      openDoseSizeDialog(event.id);
    }
    return;
  }

  showRegistrationToast(event);
}

function showRegistrationToast(event) {
  const drink = getEventDrinkIdentity(event);
  const doseLabel = getDoseLabel(event.doseSize);
  const doseText = doseLabel ? ` · ${doseLabel}` : "";

  showToast(`Consumo de ${drink.name} anotado às ${formatClock(event.consumedAt)}${doseText}.`, {
    type: "add-event",
    eventId: event.id,
  });
}

function openDoseSizeDialog(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;

  const drink = getEventDrinkIdentity(event);
  state.pendingDoseEventId = eventId;
  doseSizeDrinkName.textContent = `${drink.icon} ${drink.name}`;
  updateDoseDialogSelection(event.doseSize || "full");
  doseSizeDialog.showModal();
}

function updateDoseDialogSelection(value) {
  const isHalf = value === "half";
  doseHalfButton.classList.toggle("is-selected", isHalf);
  doseFullButton.classList.toggle("is-selected", !isHalf);
  doseHalfButton.setAttribute("aria-pressed", String(isHalf));
  doseFullButton.setAttribute("aria-pressed", String(!isHalf));
}

function choosePendingDoseSize(value) {
  const event = state.events.find((item) => item.id === state.pendingDoseEventId);
  if (!event) {
    closeDoseSizeDialog({ showResult: false });
    return;
  }

  event.doseSize = value === "half" ? "half" : "full";
  saveData();
  refreshDataViews();
  updateDoseDialogSelection(event.doseSize);
  closeDoseSizeDialog();
}

function closeDoseSizeDialog({ showResult = true } = {}) {
  const eventId = state.pendingDoseEventId;
  const event = state.events.find((item) => item.id === eventId);
  state.pendingDoseEventId = null;

  if (doseSizeDialog.open) doseSizeDialog.close();

  // O registro nasce como dose inteira. Fechar o popup sem escolher mantém esse padrão.
  if (showResult && event) showRegistrationToast(event);
}

function undoLastRegistration() {
  if (!state.undo || state.undo.type !== "add-event") return;

  state.events = state.events.filter((event) => event.id !== state.undo.eventId);
  saveData();
  refreshDataViews();
  state.undo = null;
  hideToast();
}

function showToast(message, undo = null) {
  clearTimeout(state.toastTimerId);
  state.undo = undo;
  toastMessage.textContent = message;
  toastUndo.hidden = !undo;
  toast.hidden = false;

  state.toastTimerId = setTimeout(() => {
    state.undo = null;
    hideToast();
  }, 7000);
}

function hideToast() {
  clearTimeout(state.toastTimerId);
  toast.hidden = true;
  toastUndo.hidden = false;
}

function openDrinkDialog() {
  state.editingDrinkId = null;
  drinkForm.reset();
  setDurationPicker(1, 0);
  formError.hidden = true;
  drinkDialogEyebrow.textContent = "Nova bebida";
  drinkDialogTitle.textContent = "Cadastrar";
  drinkSubmitButton.textContent = "Salvar";
  deleteDrinkFromEditorButton.hidden = true;
  drinkDangerZone.hidden = true;
  drinkIntervalEditNote.hidden = true;
  askDoseSizeInput.checked = false;

  buildIconPicker(DEFAULT_ICON);

  drinkDialog.showModal();
  requestAnimationFrame(() => {
    setDurationPicker(1, 0);
    nameInput.focus();
  });
}

function openEditDrinkDialog(drinkId) {
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  state.editingDrinkId = drinkId;
  drinkForm.reset();
  formError.hidden = true;
  drinkDialogEyebrow.textContent = "Editar bebida";
  drinkDialogTitle.textContent = drink.name;
  drinkSubmitButton.textContent = "Salvar alterações";
  deleteDrinkFromEditorButton.hidden = false;
  drinkDangerZone.hidden = false;
  drinkIntervalEditNote.hidden = false;

  nameInput.value = drink.name;
  askDoseSizeInput.checked = Boolean(drink.askDoseSize);
  setDurationPicker(Math.floor(drink.intervalMinutes / 60), drink.intervalMinutes % 60);

  buildIconPicker(drink.icon);

  drinkDialog.showModal();
  requestAnimationFrame(() => {
    setDurationPicker(Math.floor(drink.intervalMinutes / 60), drink.intervalMinutes % 60);
    nameInput.focus();
  });
}

function openDeleteDrinkDialog(drinkId, { returnToEditorOnCancel = false } = {}) {
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  state.deleteDrinkId = drinkId;
  state.deleteReturnToEditor = returnToEditorOnCancel;
  const eventCount = state.events.filter((event) => event.drinkId === drinkId).length;

  deleteDrinkName.textContent = drink.name;
  deleteDrinkSummary.textContent = eventCount > 0
    ? `Existem ${eventCount} registro${eventCount === 1 ? "" : "s"} desta bebida no histórico.`
    : "Esta bebida ainda não possui registros no histórico.";

  if (drinkDialog.open) drinkDialog.close();
  deleteDrinkDialog.showModal();
}

function closeDeleteDrinkDialog({ returnToEditor = state.deleteReturnToEditor } = {}) {
  const drinkId = state.deleteDrinkId;
  state.deleteDrinkId = null;
  state.deleteReturnToEditor = false;
  deleteDrinkDialog.close();

  if (returnToEditor && drinkId && state.drinks.some((drink) => drink.id === drinkId)) {
    openEditDrinkDialog(drinkId);
  }
}

function deleteDrinkKeepingHistory() {
  const drinkId = state.deleteDrinkId;
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  state.events = state.events.map((event) => {
    if (event.drinkId !== drinkId) return event;
    return {
      ...event,
      drinkName: drink.name,
      drinkIcon: drink.icon,
    };
  });

  state.drinks = state.drinks.filter((item) => item.id !== drinkId);
  state.editingDrinkId = null;
  saveData();
  closeDeleteDrinkDialog();
  refreshDataViews();
  showToast(`${drink.name} foi excluída da lista. O histórico foi mantido.`);
}

function deleteDrinkWithHistory() {
  const drinkId = state.deleteDrinkId;
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  state.drinks = state.drinks.filter((item) => item.id !== drinkId);
  state.events = state.events.filter((event) => event.drinkId !== drinkId);
  state.editingDrinkId = null;
  saveData();
  closeDeleteDrinkDialog();
  refreshDataViews();
  showToast(`${drink.name} e seus registros foram excluídos.`);
}

function closeDrinkDialog() {
  state.editingDrinkId = null;
  drinkDialog.close();
}

function openDrinkMenuDialog(drinkId) {
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  state.menuDrinkId = drinkId;
  drinkMenuName.textContent = `${drink.icon} ${drink.name}`;
  drinkMenuDialog.showModal();
}

function closeDrinkMenuDialog() {
  state.menuDrinkId = null;
  if (drinkMenuDialog.open) drinkMenuDialog.close();
}

function openOtherTimeFromDrinkMenu() {
  const drinkId = state.menuDrinkId;
  closeDrinkMenuDialog();
  if (drinkId) openLogDialog(drinkId);
}

function editDrinkFromDrinkMenu() {
  const drinkId = state.menuDrinkId;
  closeDrinkMenuDialog();
  if (drinkId) openEditDrinkDialog(drinkId);
}

function deleteDrinkFromDrinkMenu() {
  const drinkId = state.menuDrinkId;
  closeDrinkMenuDialog();
  if (drinkId) openDeleteDrinkDialog(drinkId);
}

function openIntervalWarningDialog(drinkId) {
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  const activity = getDrinkActivity(drink);

  if (activity.state !== "waiting" && activity.state !== "danger") {
    openLogDialog(drinkId);
    return;
  }

  state.pendingDrinkId = drinkId;
  intervalWarningDrinkName.textContent = drink.name;
  intervalWarningDialog.showModal();
  updateIntervalWarningDialog();
}

function updateIntervalWarningDialog() {
  if (!state.pendingDrinkId || !intervalWarningDialog.open) return;

  const drink = state.drinks.find((item) => item.id === state.pendingDrinkId);
  if (!drink) return;

  const activity = getDrinkActivity(drink);

  if (activity.remainingMs > 0) {
    intervalWarningRemaining.textContent = `Ainda faltam ${formatTime(activity.remainingMs)} do intervalo atual.`;
  } else {
    intervalWarningRemaining.textContent = "O intervalo terminou enquanto esta tela estava aberta.";
  }

  if (activity.state === "danger") {
    intervalWarningContext.hidden = false;
    intervalWarningContext.textContent = `${activity.violationClusterCount} registros já ocorreram em sequência antes de completar o intervalo configurado.`;
    intervalWarningMessage.textContent = "Se houve outro consumo, anote-o. O app manterá os registros anteriores e atualizará o alerta com base na sequência real.";
  } else {
    intervalWarningContext.hidden = true;
    intervalWarningMessage.textContent = "Se você já consumiu novamente, anote o horário. O registro anterior será mantido e o card passará a sinalizar que houve consumo antes do intervalo terminar.";
  }
}

function closeIntervalWarningDialog() {
  state.pendingDrinkId = null;
  intervalWarningDialog.close();
}

function continueFromIntervalWarning() {
  if (!state.pendingDrinkId) return;

  const drinkId = state.pendingDrinkId;
  intervalWarningDialog.close();
  state.pendingDrinkId = null;
  openLogDialog(drinkId);
}

function openLogDialog(drinkId) {
  const drink = state.drinks.find((item) => item.id === drinkId);
  if (!drink) return;

  const activity = getDrinkActivity(drink);

  state.selectedDrinkId = drinkId;
  logDrinkName.textContent = drink.name;
  setLogDurationPicker(0, 0);
  logFormError.hidden = true;

  if (activity.state === "waiting" || activity.state === "danger") {
    activeIntervalWarning.hidden = false;
    activeIntervalWarningTitle.textContent = "O registro anterior será mantido";
    activeIntervalWarningText.textContent = "Este consumo será adicionado ao histórico. O app não substitui nem apaga os registros anteriores.";
  } else {
    activeIntervalWarning.hidden = true;
  }

  logDialog.showModal();
}

function closeLogDialog() {
  state.selectedDrinkId = null;
  logDialog.close();
}

function registerMinutesAgo(minutesAgo) {
  if (!state.selectedDrinkId) return;

  const timestamp = Date.now() - minutesAgo * 60 * 1000;
  const id = state.selectedDrinkId;
  closeLogDialog();
  registerDrinkAt(id, timestamp);
}

function openEventDialog(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;

  const drink = getEventDrinkIdentity(event);

  state.selectedEventId = eventId;
  eventDrinkName.textContent = `${drink.icon} ${drink.name}`;
  eventDeletedNote.hidden = !drink.isDeleted;
  eventDateInput.value = toLocalDateInputValue(event.consumedAt);
  eventTimeInput.value = toLocalTimeInputValue(event.consumedAt);
  eventInterval.textContent = formatInterval(event.intervalMinutes);
  eventFormError.hidden = true;

  eventDoseField.hidden = !event.doseSize;
  eventForm.querySelectorAll('input[name="eventDoseSize"]').forEach((input) => {
    input.checked = input.value === event.doseSize;
  });

  const context = getEventContext(eventId);
  if (context?.isViolation) {
    eventWarning.hidden = false;
    eventWarningText.textContent = `Você tomou ${formatElapsed(context.elapsedMs)} após o anterior, quando ainda faltava ${formatElapsed(context.remainingAtConsumptionMs)}.`;
  } else {
    eventWarning.hidden = true;
  }

  eventDialog.showModal();
}

function closeEventDialog() {
  state.selectedEventId = null;
  eventDialog.close();
}

function handleEventSubmit(event) {
  event.preventDefault();

  const selectedEvent = state.events.find((item) => item.id === state.selectedEventId);
  if (!selectedEvent) {
    showEventFormError("Este registro não foi encontrado.");
    return;
  }

  const dateValue = eventDateInput.value;
  const timeValue = eventTimeInput.value;

  if (!dateValue || !timeValue) {
    showEventFormError("Informe a data e o horário do registro.");
    return;
  }

  const timestamp = new Date(`${dateValue}T${timeValue}:00`).getTime();

  if (!Number.isFinite(timestamp)) {
    showEventFormError("A data ou o horário informado é inválido.");
    return;
  }

  if (timestamp > Date.now() + 60000) {
    showEventFormError("O registro não pode ficar no futuro.");
    return;
  }

  selectedEvent.consumedAt = timestamp;

  if (!eventDoseField.hidden) {
    const selectedDose = eventForm.querySelector('input[name="eventDoseSize"]:checked')?.value;
    selectedEvent.doseSize = normalizeDoseSize(selectedDose) || selectedEvent.doseSize || "full";
  }

  saveData();
  closeEventDialog();
  refreshDataViews();
  showToast("Anotação atualizada. Os intervalos foram recalculados.");
}

function deleteSelectedEvent() {
  const selectedEvent = state.events.find((item) => item.id === state.selectedEventId);
  if (!selectedEvent) return;

  const drink = getEventDrinkIdentity(selectedEvent);
  const drinkName = drink.name || "esta bebida";
  const confirmed = window.confirm(`Excluir o registro de ${drinkName} das ${formatClock(selectedEvent.consumedAt)}? Os intervalos serão recalculados.`);
  if (!confirmed) return;

  state.events = state.events.filter((item) => item.id !== selectedEvent.id);
  saveData();
  closeEventDialog();
  refreshDataViews();
  showToast("Anotação excluída. Os intervalos foram recalculados.");
}

function createWheelPicker(element, input, maxValue) {
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
  };

  element._wheelState = wheelState;

  const updateFromScroll = () => {
    wheelState.scrollRaf = null;
    const maxIndex = track.children.length - 1;
    const index = Math.max(0, Math.min(maxIndex, Math.round(element.scrollTop / WHEEL_ITEM_HEIGHT)));
    const item = track.children[index];
    if (!item) return;

    const value = Number(item.dataset.value);
    input.value = String(value);
    element.setAttribute("aria-valuenow", String(value));
    element.setAttribute("aria-valuetext", String(value).padStart(2, "0"));

    if (wheelState.selectedIndex !== index) {
      if (wheelState.selectedIndex >= 0 && track.children[wheelState.selectedIndex]) {
        track.children[wheelState.selectedIndex].classList.remove("is-selected");
      }
      item.classList.add("is-selected");
      wheelState.selectedIndex = index;
    }

    if (element === intervalHoursWheel) {
      updateMinuteWheelAvailability(value);
    }
  };

  const settle = () => {
    const index = Math.round(element.scrollTop / WHEEL_ITEM_HEIGHT);
    const repeat = Math.floor(index / valueCount);
    const value = Number(input.value);

    if (repeat <= 1 || repeat >= WHEEL_REPEAT_COUNT - 2) {
      const middleIndex = WHEEL_MIDDLE_REPEAT * valueCount + value;
      element.scrollTo({ top: middleIndex * WHEEL_ITEM_HEIGHT, behavior: "auto" });
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
      top: Number(item.dataset.index) * WHEEL_ITEM_HEIGHT,
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
    const currentIndex = Math.round(element.scrollTop / WHEEL_ITEM_HEIGHT);
    element.scrollTo({
      top: (currentIndex + direction) * WHEEL_ITEM_HEIGHT,
      behavior: "smooth",
    });
  });

  setWheelPickerValue(element, Number(input.value) || 0);
}

function setWheelPickerValue(element, rawValue, behavior = "auto") {
  const wheelState = element._wheelState;
  if (!wheelState) return;

  const value = Math.max(0, Math.min(wheelState.maxValue, Number(rawValue) || 0));
  const targetIndex = WHEEL_MIDDLE_REPEAT * wheelState.valueCount + value;

  wheelState.input.value = String(value);
  element.setAttribute("aria-valuenow", String(value));
  element.setAttribute("aria-valuetext", String(value).padStart(2, "0"));
  element.scrollTo({ top: targetIndex * WHEEL_ITEM_HEIGHT, behavior });

  if (wheelState.selectedIndex >= 0 && wheelState.track.children[wheelState.selectedIndex]) {
    wheelState.track.children[wheelState.selectedIndex].classList.remove("is-selected");
  }
  wheelState.selectedIndex = targetIndex;
  wheelState.track.children[targetIndex]?.classList.add("is-selected");

  if (element === intervalHoursWheel) {
    updateMinuteWheelAvailability(value);
  }
}

function updateMinuteWheelAvailability(hours = Number(intervalHoursInput.value)) {
  const isMaxHours = Number(hours) === 24;
  const wasDisabled = intervalMinutesWheel.classList.contains("is-disabled");

  if (isMaxHours && !wasDisabled) {
    intervalMinutesWheel.dataset.valueBeforeMax = intervalMinutesInput.value;
    setWheelPickerValue(intervalMinutesWheel, 0);
  } else if (!isMaxHours && wasDisabled) {
    const restoreValue = Number(intervalMinutesWheel.dataset.valueBeforeMax || 0);
    setWheelPickerValue(intervalMinutesWheel, restoreValue);
    delete intervalMinutesWheel.dataset.valueBeforeMax;
  }

  intervalMinutesWheel.classList.toggle("is-disabled", isMaxHours);
  intervalMinutesWheel.setAttribute("aria-disabled", String(isMaxHours));
  intervalMinutesWheel.tabIndex = isMaxHours ? -1 : 0;
}

function setLogDurationPicker(hours, minutes) {
  const safeHours = Math.max(0, Math.min(48, Number(hours) || 0));
  const safeMinutes = Math.max(0, Math.min(59, Number(minutes) || 0));

  logHoursAgoInput.value = String(safeHours);
  logMinutesAgoInput.value = String(safeMinutes);
  setWheelPickerValue(logHoursWheel, safeHours);
  setWheelPickerValue(logMinutesWheel, safeMinutes);
}

function initializeLogDurationPickers() {
  createWheelPicker(logHoursWheel, logHoursAgoInput, 48);
  createWheelPicker(logMinutesWheel, logMinutesAgoInput, 59);
  setLogDurationPicker(0, 0);
}

function setDurationPicker(hours, minutes) {
  const safeHours = Math.max(0, Math.min(24, Number(hours) || 0));
  const safeMinutes = safeHours === 24 ? 0 : Math.max(0, Math.min(59, Number(minutes) || 0));

  delete intervalMinutesWheel.dataset.valueBeforeMax;
  intervalMinutesWheel.classList.remove("is-disabled");
  intervalMinutesWheel.setAttribute("aria-disabled", "false");
  intervalMinutesWheel.tabIndex = 0;

  intervalHoursInput.value = String(safeHours);
  intervalMinutesInput.value = String(safeMinutes);
  setWheelPickerValue(intervalMinutesWheel, safeMinutes);
  setWheelPickerValue(intervalHoursWheel, safeHours);
}

function initializeDurationPickers() {
  createWheelPicker(intervalHoursWheel, intervalHoursInput, 24);
  createWheelPicker(intervalMinutesWheel, intervalMinutesInput, 59);
  setDurationPicker(1, 0);
}

function buildIconPicker(selectedIcon = DEFAULT_ICON) {
  iconOptions.innerHTML = "";

  const normalizedSelectedIcon = normalizeIcon(selectedIcon);
  const icons = PICKER_ICONS.includes(normalizedSelectedIcon)
    ? [...PICKER_ICONS]
    : [normalizedSelectedIcon, ...PICKER_ICONS];

  icons.forEach((icon) => {
    const label = document.createElement("label");
    label.className = "icon-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "icon";
    input.value = icon;
    input.checked = icon === normalizedSelectedIcon;

    const visual = document.createElement("span");
    visual.textContent = icon;
    visual.setAttribute("aria-hidden", "true");

    label.append(input, visual);
    iconOptions.appendChild(label);
  });
}

function handleDrinkSubmit(event) {
  event.preventDefault();

  const formData = new FormData(drinkForm);
  const name = String(formData.get("name") || "").trim();
  const currentDrink = state.editingDrinkId
    ? state.drinks.find((item) => item.id === state.editingDrinkId)
    : null;
  const icon = normalizeIcon(formData.get("icon"), currentDrink?.icon || DEFAULT_ICON);
  const hours = Number(formData.get("intervalHours"));
  const minutes = Number(formData.get("intervalMinutes"));
  const askDoseSize = formData.get("askDoseSize") === "on";

  if (!name) {
    showFormError("Informe um nome para a bebida.");
    return;
  }

  if (!Number.isInteger(hours) || hours < 0 || hours > 24) {
    showFormError("Use um valor de horas entre 0 e 24.");
    return;
  }

  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    showFormError("Use um valor de minutos entre 0 e 59.");
    return;
  }

  const totalMinutes = hours * 60 + minutes;

  if (totalMinutes < 1 || totalMinutes > 1440) {
    showFormError("O intervalo deve ficar entre 1 minuto e 24 horas.");
    return;
  }

  if (state.editingDrinkId) {
    const drink = currentDrink;

    if (!drink) {
      showFormError("Esta bebida não foi encontrada.");
      return;
    }

    drink.name = name;
    drink.icon = icon;
    drink.intervalMinutes = totalMinutes;
    drink.askDoseSize = askDoseSize;

    // Nome e ícone representam a identidade da bebida e acompanham correções.
    // O intervalo histórico NÃO é alterado: cada evento mantém seu snapshot.
    state.events = state.events.map((event) => {
      if (event.drinkId !== drink.id) return event;
      return {
        ...event,
        drinkName: name,
        drinkIcon: icon,
      };
    });

    saveData();
    closeDrinkDialog();
    refreshDataViews();
    showToast(`${name} atualizada. Novas anotações usarão o novo intervalo.`);
    return;
  }

  state.drinks.push({
    id: createId(),
    name,
    icon,
    intervalMinutes: totalMinutes,
    askDoseSize,
  });

  saveData();
  closeDrinkDialog();
  refreshDataViews();
}

function handleLogSubmit(event) {
  event.preventDefault();

  const hours = Number(logHoursAgoInput.value);
  const minutes = Number(logMinutesAgoInput.value);

  if (!Number.isInteger(hours) || hours < 0 || hours > 48) {
    showLogFormError("Use um valor de horas entre 0 e 48.");
    return;
  }

  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    showLogFormError("Use um valor de minutos entre 0 e 59.");
    return;
  }

  const totalMinutesAgo = hours * 60 + minutes;
  registerMinutesAgo(totalMinutesAgo);
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function showLogFormError(message) {
  logFormError.textContent = message;
  logFormError.hidden = false;
}

function showEventFormError(message) {
  eventFormError.textContent = message;
  eventFormError.hidden = false;
}

function closeDialogOnBackdrop(dialogElement, event, closeFunction) {
  const rect = dialogElement.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;

  if (!inside) closeFunction();
}

function startClock() {
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    if (state.currentView === "home" && Date.now() >= state.reorderAnimationUntil) {
      render();
    } else if (state.currentView === "history") {
      updateHistoryElapsedLabels();
    }
    updateIntervalWarningDialog();
  }, 1000);
}

document.querySelector("#open-history").addEventListener("click", () => openHistoryView());
document.querySelector("#close-history").addEventListener("click", closeHistoryView);

document.querySelector("#open-add-dialog").addEventListener("click", openDrinkDialog);
document.querySelector("#empty-add-button").addEventListener("click", openDrinkDialog);
document.querySelector("#close-dialog").addEventListener("click", closeDrinkDialog);
document.querySelector("#cancel-dialog").addEventListener("click", closeDrinkDialog);
deleteDrinkFromEditorButton.addEventListener("click", () => {
  if (state.editingDrinkId) openDeleteDrinkDialog(state.editingDrinkId, { returnToEditorOnCancel: true });
});
drinkForm.addEventListener("submit", handleDrinkSubmit);

document.querySelector("#cancel-delete-drink").addEventListener("click", () => closeDeleteDrinkDialog());
document.querySelector("#delete-drink-keep-history").addEventListener("click", deleteDrinkKeepingHistory);
document.querySelector("#delete-drink-with-history").addEventListener("click", deleteDrinkWithHistory);

document.querySelector("#close-interval-warning-dialog").addEventListener("click", closeIntervalWarningDialog);
document.querySelector("#cancel-interval-warning-dialog").addEventListener("click", closeIntervalWarningDialog);
document.querySelector("#confirm-interval-warning").addEventListener("click", continueFromIntervalWarning);

document.querySelector("#close-drink-menu-dialog").addEventListener("click", closeDrinkMenuDialog);
document.querySelector("#drink-menu-other-time").addEventListener("click", openOtherTimeFromDrinkMenu);
document.querySelector("#drink-menu-edit").addEventListener("click", editDrinkFromDrinkMenu);
document.querySelector("#drink-menu-delete").addEventListener("click", deleteDrinkFromDrinkMenu);

document.querySelector("#close-log-dialog").addEventListener("click", closeLogDialog);
document.querySelector("#cancel-log-dialog").addEventListener("click", closeLogDialog);
logForm.addEventListener("submit", handleLogSubmit);

document.querySelector("#close-dose-size-dialog").addEventListener("click", closeDoseSizeDialog);
doseHalfButton.addEventListener("click", () => choosePendingDoseSize("half"));
doseFullButton.addEventListener("click", () => choosePendingDoseSize("full"));

document.querySelector("#close-event-dialog").addEventListener("click", closeEventDialog);
document.querySelector("#cancel-event-dialog").addEventListener("click", closeEventDialog);
document.querySelector("#delete-event").addEventListener("click", deleteSelectedEvent);
eventForm.addEventListener("submit", handleEventSubmit);

document.querySelectorAll(".quick-time-button").forEach((button) => {
  button.addEventListener("click", () => {
    const minutesAgo = Number(button.dataset.minutesAgo);
    registerMinutesAgo(minutesAgo);
  });
});

toastUndo.addEventListener("click", undoLastRegistration);

drinkDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(drinkDialog, event, closeDrinkDialog);
});

deleteDrinkDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(deleteDrinkDialog, event, () => closeDeleteDrinkDialog());
});

deleteDrinkDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDeleteDrinkDialog();
});

intervalWarningDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(intervalWarningDialog, event, closeIntervalWarningDialog);
});

drinkMenuDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(drinkMenuDialog, event, closeDrinkMenuDialog);
});

drinkMenuDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDrinkMenuDialog();
});

logDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(logDialog, event, closeLogDialog);
});

doseSizeDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(doseSizeDialog, event, closeDoseSizeDialog);
});

doseSizeDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDoseSizeDialog();
});

eventDialog.addEventListener("click", (event) => {
  closeDialogOnBackdrop(eventDialog, event, closeEventDialog);
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    if (state.currentView === "home") {
      render();
    } else {
      renderHistory();
    }
    updateIntervalWarningDialog();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Falha ao ativar o Service Worker.", error);
    });
  });
}

initializeDurationPickers();
initializeLogDurationPickers();
buildIconPicker(DEFAULT_ICON);
render();
startClock();
