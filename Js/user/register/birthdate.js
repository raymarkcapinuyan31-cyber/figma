(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.validateBirthdateField = function validateBirthdateField(el) {
    if (el && el.validity && el.validity.badInput) return 'Enter a valid birthdate.';
    const v = String((el && el.value) || '').trim();
    if (!v) return 'Birthdate is required.';
    const picked = ns.parseStrictBirthdate(v);
    if (!picked) return 'Enter a valid birthdate.';
    if (picked > new Date()) return 'Birthdate cannot be in the future.';
    if (ns.calculateAgeYears(picked) < ns.MIN_AGE_YEARS) return 'You must be at least 16 years old.';
    return null;
  };

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('birthdate');
    const field = document.getElementById('birthdateField');
    const display = document.getElementById('birthdateDisplay');
    const displayText = document.getElementById('birthdateDisplayText');
    if (!input || !field || !display || !displayText) return;

    function toDisplayDate(isoValue) {
      const raw = String(isoValue || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
      const parts = raw.split('-');
      return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }

    function syncBirthdateUi() {
      const hasValue = !!String(input.value || '').trim();
      field.classList.toggle('has-value', hasValue);
      displayText.textContent = hasValue ? toDisplayDate(input.value) : 'Select birthdate';
    }

    function openPicker() {
      input.focus();
      if (typeof input.showPicker === 'function') {
        try {
          input.showPicker();
        } catch (_) {
        }
      }
    }

    input.addEventListener('input', syncBirthdateUi);
    input.addEventListener('change', syncBirthdateUi);

    display.addEventListener('click', openPicker);
    display.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPicker();
      }
    });

    syncBirthdateUi();
  });
})();
