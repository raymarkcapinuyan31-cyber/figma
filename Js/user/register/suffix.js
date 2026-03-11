(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});
  const ALLOWED_SUFFIXES = ['', 'Jr', 'Sr', 'II', 'III', 'IV'];

  ns.normalizeSuffix = function normalizeSuffix(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (lower === 'jr' || lower === 'jr.') return 'Jr';
    if (lower === 'sr' || lower === 'sr.') return 'Sr';
    if (raw === 'II' || raw === 'III' || raw === 'IV') return raw;
    if (lower === 'ii') return 'II';
    if (lower === 'iii') return 'III';
    if (lower === 'iv') return 'IV';
    return null;
  };

  ns.validateSuffixField = function validateSuffixField(el) {
    const raw = String((el && el.value) || '').trim();
    const normalized = typeof ns.normalizeSuffix === 'function' ? ns.normalizeSuffix(raw) : raw;
    if (normalized == null || !ALLOWED_SUFFIXES.includes(normalized)) {
      return 'Choose a valid suffix option.';
    }
    return null;
  };
})();
