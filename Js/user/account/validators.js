(function () {
  const ns = (window.hfsAccount = window.hfsAccount || {});
  const ALLOWED_SUFFIXES = ['', 'Jr', 'Sr', 'II', 'III', 'IV'];

  ns.validateName = function validateName(value) {
    const raw = String(value || '');
    if (!raw.trim()) return null;

    if (/^\s+|\s+$/.test(raw)) return 'Remove extra spaces.';
    if (/\s{2,}/.test(raw)) return 'One space only.';
    if (/--/.test(raw)) return 'One hyphen only.';

    const clean = raw.trim();
    if (clean.length < 2 || clean.length > 15) return 'Use 2 to 15 letters.';

    const parts = clean.split(' ').filter(Boolean);
    if (parts.length > 1 && parts.every((part) => part.length === 1)) {
      return 'Enter full name.';
    }

    if (/\d/.test(clean)) return 'No numbers.';

    const allowedPattern = /^[A-Za-z\s-]+$/;
    if (!allowedPattern.test(clean)) return 'No special characters (e.g., Anne-Marie).';

    if (!ns.nameRegex.test(clean)) return 'Enter a valid name.';
    return null;
  };

  ns.normalizeMiddleInitial = function normalizeMiddleInitial(value) {
    const lettersOnly = String(value || '').replace(/[^A-Za-z]/g, '').toUpperCase();
    return lettersOnly ? lettersOnly.charAt(0) : '';
  };

  ns.validateMiddleInitial = function validateMiddleInitial(value) {
    const raw = String(value || '');
    if (!raw.trim()) return null;
    const normalized = ns.normalizeMiddleInitial(raw);
    if (!normalized) return 'Middle initial must be one letter only.';
    if (normalized.length !== 1) return 'Middle initial must be one letter only.';
    return null;
  };

  ns.validateSuffix = function validateSuffix(value) {
    const normalized = ns.normalizeSuffix(value);
    if (ALLOWED_SUFFIXES.includes(normalized)) return null;
    return 'Choose a valid suffix option.';
  };

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

  ns.validateBirthdate = function validateBirthdate(value) {
    if (!value) return null;
    const picked = ns.parseStrictBirthdate(value);
    if (!picked) return 'Use MM/DD/YYYY.';
    if (picked > new Date()) return 'Birthdate cannot be in the future.';
    if (ns.calculateAgeYears(picked) < ns.MIN_AGE_YEARS) return 'You must be 16 or older.';
    return null;
  };

  ns.validateMobile = function validateMobile(value) {
    const clean = String(value || '').trim();
    if (!clean) return null;
    const normalized = clean.startsWith('09') ? '+63' + clean.slice(1) : clean;
    if (!ns.mobileRegex.test(normalized)) return 'Please enter a valid Philippine number (e.g., 09XXXXXXXXX or +639XXXXXXXXX).';
    return null;
  };
})();
