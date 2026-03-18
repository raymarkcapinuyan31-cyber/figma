(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.normalizeMiddleInitial = function normalizeMiddleInitial(value) {
    const lettersOnly = String(value || '').replace(/[^A-Za-z]/g, '').toUpperCase();
    return lettersOnly ? lettersOnly.charAt(0) : '';
  };

  ns.validateMiddleNameField = function validateMiddleNameField(el) {
    const raw = String((el && el.value) || '');
    if (!raw.trim()) return null;
    if (/\d/.test(raw)) return 'No numbers.';
    if (/[^A-Za-z\s]/.test(raw)) return 'Letters only.';
    const normalized = ns.normalizeMiddleInitial(raw);
    if (!normalized) return 'Enter one letter only.';
    if (normalized.length !== 1) return 'Enter one letter only.';
    return null;
  };
})();
