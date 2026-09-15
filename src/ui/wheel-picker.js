export function createDurationPicker({
  maxHours, hoursWheel, minutesWheel, hoursInput, minutesInput,
  capMinutesAtMaxHours = false, createWheelPicker, setWheelPickerValue,
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
    setWheelPickerValue(minutesWheel, safeMinutes);
    setWheelPickerValue(hoursWheel, safeHours);
  }

  function initialize(initialHours, initialMinutes) {
    createWheelPicker(hoursWheel, hoursInput, maxHours);
    createWheelPicker(minutesWheel, minutesInput, 59);
    set(initialHours, initialMinutes);
  }

  return { set, initialize };
}
