(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.nameRegex = /^[A-Za-z]+(?:-[A-Za-z]+)?(?:\s[A-Za-z]+)*$/;
  ns.emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  ns.mobileRegex = /^(09\d{9}|\+639\d{9})$/;
  ns.passwordRegex = /^(?=.{8,}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s])\S+$/;
  ns.MIN_BIRTH_YEAR = 1900;
  ns.MAX_BIRTH_YEAR = 2010;
  ns.MIN_AGE_YEARS = 16;

  ns.titleCaseName = function titleCaseName(s) {
    return String(s || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  ns.getDaysInMonth = function getDaysInMonth(month) {
    const monthMaxDays = {
      1: 31,
      2: 28,
      3: 31,
      4: 30,
      5: 31,
      6: 30,
      7: 31,
      8: 31,
      9: 30,
      10: 31,
      11: 30,
      12: 31
    };
    return monthMaxDays[month] || 0;
  };

  ns.isCalendarBirthdatePartsValid = function isCalendarBirthdatePartsValid(month, day, year) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
    if (year < ns.MIN_BIRTH_YEAR || year > ns.MAX_BIRTH_YEAR) return false;
    if (month < 1 || month > 12) return false;
    const maxDay = ns.getDaysInMonth(month);
    if (day < 1 || day > maxDay) return false;
    return true;
  };

  ns.calculateAgeYears = function calculateAgeYears(birthdate, today = new Date()) {
    const birth = new Date(birthdate.getFullYear(), birthdate.getMonth(), birthdate.getDate());
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let years = now.getFullYear() - birth.getFullYear();
    const monthDelta = now.getMonth() - birth.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
      years -= 1;
    }
    return years;
  };

  ns.extractBirthdateParts = function extractBirthdateParts(value) {
    const text = String(value || '').trim();
    if (!text) return null;

    const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      return {
        month: Number(slashMatch[1]),
        day: Number(slashMatch[2]),
        year: Number(slashMatch[3]),
        format: 'slash'
      };
    }

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return {
        month: Number(isoMatch[2]),
        day: Number(isoMatch[3]),
        year: Number(isoMatch[1]),
        format: 'iso'
      };
    }

    return null;
  };

  ns.coerceBirthdateParts = function coerceBirthdateParts(parts) {
    if (!parts) return null;
    let month = Number(parts.month);
    let day = Number(parts.day);
    let year = Number(parts.year);

    if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return null;

    month = Math.min(Math.max(Math.trunc(month), 1), 12);
    year = Math.min(Math.max(Math.trunc(year), ns.MIN_BIRTH_YEAR), ns.MAX_BIRTH_YEAR);
    const maxDay = ns.getDaysInMonth(month);
    day = Math.min(Math.max(Math.trunc(day), 1), maxDay);

    return { month, day, year, format: parts.format || 'slash' };
  };

  ns.partsToBirthdateString = function partsToBirthdateString(parts) {
    const mm = String(parts.month).padStart(2, '0');
    const dd = String(parts.day).padStart(2, '0');
    const yyyy = String(parts.year);
    return parts.format === 'iso' ? `${yyyy}-${mm}-${dd}` : `${mm}/${dd}/${yyyy}`;
  };

  ns.parseStrictBirthdate = function parseStrictBirthdate(value) {
    const parts = ns.extractBirthdateParts(value);
    if (!parts) return null;

    const month = parts.month;
    const day = parts.day;
    const year = parts.year;

    if (!ns.isCalendarBirthdatePartsValid(month, day, year)) return null;

    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime())) return null;
    if (parsed.getFullYear() !== year || (parsed.getMonth() + 1) !== month || parsed.getDate() !== day) return null;

    return parsed;
  };

  ns.normalizeBirthdateValue = function normalizeBirthdateValue(value) {
    const parts = ns.extractBirthdateParts(value);
    if (!parts) return String(value || '').trim();
    const coerced = ns.coerceBirthdateParts(parts);
    if (!coerced) return String(value || '').trim();
    return ns.partsToBirthdateString(coerced);
  };

  ns.toIsoDateString = function toIsoDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  ns.applyBirthdateConstraints = function applyBirthdateConstraints(el) {
    if (!el) return;
    if (String(el.type || '').toLowerCase() === 'date') {
      el.setAttribute('title', 'Choose your birthdate');
      el.setAttribute('min', `${ns.MIN_BIRTH_YEAR}-01-01`);
      el.setAttribute('max', `${ns.MAX_BIRTH_YEAR}-12-31`);
    } else {
      el.setAttribute('placeholder', 'Choose your birthdate');
      el.setAttribute('inputmode', 'numeric');
      el.setAttribute('maxlength', '10');
      el.setAttribute('pattern', '^(\\d{2})\\/(\\d{2})\\/(\\d{4})$');
    }
  };

  ns.formatBirthdateInputValue = function formatBirthdateInputValue(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
    if (!digits) return '';

    const monthRaw = digits.slice(0, 2);
    const dayRaw = digits.slice(2, 4);
    const yearRaw = digits.slice(4, 8);

    function toPadded(num) {
      return String(num).padStart(2, '0');
    }

    function normalizeMonth(raw) {
      if (!raw) return '';
      if (raw.length < 2) return raw;
      const n = Number(raw);
      if (!Number.isFinite(n)) return raw;
      if (n < 1) return '01';
      if (n > 12) {
        if (n >= 40) {
          const tail = n % 10;
          return toPadded(Math.min(Math.max(tail, 1), 12));
        }
        return '12';
      }
      return toPadded(n);
    }

    function normalizeDay(raw, monthValue) {
      if (!raw) return '';
      if (raw.length < 2) return raw;
      const n = Number(raw);
      if (!Number.isFinite(n)) return raw;
      const monthNum = Number(monthValue);
      const maxDay = Number.isInteger(monthNum) && monthNum >= 1 && monthNum <= 12
        ? ns.getDaysInMonth(monthNum)
        : 31;

      if (n < 1) return '01';
      if (n > maxDay) {
        if (n >= 40) {
          const tail = n % 10;
          return toPadded(Math.min(Math.max(tail, 1), maxDay));
        }
        return toPadded(maxDay);
      }
      return toPadded(n);
    }

    function normalizeYear(raw) {
      if (!raw) return '';
      if (raw.length < 4) return raw;
      const y = Number(raw);
      if (!Number.isFinite(y)) return raw;
      if (y < ns.MIN_BIRTH_YEAR) return String(ns.MIN_BIRTH_YEAR);
      if (y > ns.MAX_BIRTH_YEAR) return String(ns.MAX_BIRTH_YEAR);
      return String(y);
    }

    const month = normalizeMonth(monthRaw);
    const day = normalizeDay(dayRaw, month);
    const year = normalizeYear(yearRaw);

    if (digits.length <= 2) return `${month}/`;
    if (digits.length <= 4) return `${month}/${day}/`;
    return `${month}/${day}/${year}`;
  };

  ns.bindBirthdateAutoFormat = function bindBirthdateAutoFormat(el) {
    if (!el) return;
    if (String(el.type || '').toLowerCase() === 'date') {
      if (typeof el.showPicker === 'function') {
        el.addEventListener('click', () => {
          try {
            el.showPicker();
          } catch (_) {
            // no-op
          }
        });
      }
      el.addEventListener('change', () => {
        const normalized = ns.normalizeBirthdateValue(el.value);
        if (normalized && el.value !== normalized) {
          el.value = normalized;
        }
      });
      return;
    }
    el.addEventListener('input', () => {
      const formatted = ns.formatBirthdateInputValue(el.value);
      if (el.value !== formatted) el.value = formatted;
    });
  };

  ns.validateBirthdateLive = function validateBirthdateLive(value) {
    const text = String(value || '').trim();
    if (!text) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const parsedIso = ns.parseStrictBirthdate(text);
      if (!parsedIso) return 'Enter a valid birthdate.';
      if (parsedIso > new Date()) return 'Birthdate cannot be in the future.';
      if (ns.calculateAgeYears(parsedIso) < ns.MIN_AGE_YEARS) {
        return 'You must be at least 16 years old.';
      }
      return null;
    }

    if (!/^\d{0,2}(\/\d{0,2}(\/\d{0,4})?)?$/.test(text)) {
      return 'Use MM/DD/YYYY format.';
    }

    const parts = text.split('/');
    const mmText = parts[0] || '';
    const ddText = parts[1] || '';
    const yyyyText = parts[2] || '';

    if (mmText.length === 2) {
      const mm = Number(mmText);
      if (mm < 1 || mm > 12) return 'Month must be 01-12.';
    }

    if (ddText.length === 2) {
      const dd = Number(ddText);
      if (dd < 1 || dd > 31) return 'Day must be 01-31.';
    }

    if (yyyyText.length === 4) {
      const yyyy = Number(yyyyText);
      if (yyyy < ns.MIN_BIRTH_YEAR || yyyy > ns.MAX_BIRTH_YEAR) return `Year must be ${ns.MIN_BIRTH_YEAR}-${ns.MAX_BIRTH_YEAR}.`;
    }

    if (mmText.length === 2 && ddText.length === 2) {
      const mm = Number(mmText);
      const dd = Number(ddText);
      if (!Number.isInteger(mm) || mm < 1 || mm > 12) return 'Month must be 01-12.';
      const maxDay = ns.getDaysInMonth(mm);
      if (dd > maxDay) return 'Day is invalid for the selected month.';
    }

    if (text.length === 10) {
      const parsed = ns.parseStrictBirthdate(text);
      if (!parsed) return 'Enter a valid birthdate.';
      if (parsed > new Date()) return 'Birthdate cannot be in the future.';
      if (ns.calculateAgeYears(parsed) < ns.MIN_AGE_YEARS) {
        return 'You must be at least 16 years old.';
      }
    }

    return null;
  };
})();
