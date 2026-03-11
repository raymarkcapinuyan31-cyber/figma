(function () {
  const ns = (window.hfsAccount = window.hfsAccount || {});

  ns.MIN_BIRTH_YEAR = 1900;
  ns.MAX_BIRTH_YEAR = 2010;
  ns.MIN_AGE_YEARS = 16;
  ns.nameRegex = /^[A-Za-z]+(?:-[A-Za-z]+)?(?:\s[A-Za-z]+)*$/;
  ns.mobileRegex = /^(09\d{9}|\+639\d{9})$/;

  ns.displayValue = function displayValue(value) {
    const clean = String(value || '').trim();
    return clean ? clean : 'Add';
  };

  ns.titleCaseName = function titleCaseName(value) {
    return String(value || '').toLowerCase().trim().replace(/\s+/g, ' ').split(' ').filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  ns.formatBirthdateForDisplay = function formatBirthdateForDisplay(value) {
    const formatted = ns.toDateInputValue(value);
    return formatted || 'Add';
  };

  ns.toDateInputValue = function toDateInputValue(value) {
    if (!value) return '';
    if (typeof value === 'string') {
      const slashMatch = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (slashMatch) {
        const mm = String(Number(slashMatch[1])).padStart(2, '0');
        const dd = String(Number(slashMatch[2])).padStart(2, '0');
        const yyyy = String(Number(slashMatch[3]));
        return `${mm}/${dd}/${yyyy}`;
      }

      const isoMatch = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) {
        return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
      }

      return '';
    }
    if (value && typeof value.toDate === 'function') {
      const d = value.toDate();
      const y = String(d.getFullYear());
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${m}/${day}/${y}`;
    }
    return '';
  };

  ns.toDateIsoValue = function toDateIsoValue(value) {
    if (!value) return '';
    if (typeof value === 'string') {
      const slashMatch = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (slashMatch) {
        const mm = String(Number(slashMatch[1])).padStart(2, '0');
        const dd = String(Number(slashMatch[2])).padStart(2, '0');
        const yyyy = String(Number(slashMatch[3]));
        return `${yyyy}-${mm}-${dd}`;
      }

      const isoMatch = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      }

      return '';
    }
    if (value && typeof value.toDate === 'function') {
      const d = value.toDate();
      const y = String(d.getFullYear());
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return '';
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

  ns.parseStrictBirthdate = function parseStrictBirthdate(value) {
    const text = String(value || '').trim();
    const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!slashMatch && !isoMatch) {
      return null;
    }

    let month;
    let day;
    let year;

    if (slashMatch) {
      month = Number(slashMatch[1]);
      day = Number(slashMatch[2]);
      year = Number(slashMatch[3]);
    } else {
      year = Number(isoMatch[1]);
      month = Number(isoMatch[2]);
      day = Number(isoMatch[3]);
    }

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    if (year < ns.MIN_BIRTH_YEAR) return null;
    if (year > ns.MAX_BIRTH_YEAR) return null;
    if (month < 1 || month > 12) return null;

    const maxDay = ns.getDaysInMonth(month);
    if (day < 1 || day > maxDay) return null;

    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime())) return null;
    if (parsed.getFullYear() !== year || (parsed.getMonth() + 1) !== month || parsed.getDate() !== day) return null;

    return parsed;
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

  ns.normalizeBirthdateValue = function normalizeBirthdateValue(value) {
    const parsed = ns.parseStrictBirthdate(value);
    if (!parsed) return String(value || '').trim();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    const yyyy = String(parsed.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
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
      el.setAttribute('min', `${ns.MIN_BIRTH_YEAR}-01-01`);
      el.setAttribute('max', `${ns.MAX_BIRTH_YEAR}-12-31`);
      if (typeof el.showPicker === 'function') {
        el.addEventListener('click', () => {
          try {
            el.showPicker();
          } catch (_) {
          }
        });
      }
      return;
    }

    el.setAttribute('maxlength', '10');
    el.setAttribute('placeholder', '__/__/____');
    el.setAttribute('pattern', '^(\\d{2})\\/(\\d{2})\\/(\\d{4})$');
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
      if (!parsedIso) return 'Please enter a valid birthdate.';
      return null;
    }

    if (!/^\d{0,2}(\/\d{0,2}(\/\d{0,4})?)?$/.test(text) && !/^\d{0,4}(-\d{0,2}(-\d{0,2})?)?$/.test(text)) {
      return 'Use MM/DD/YYYY format only.';
    }

    const parts = text.split('/');
    const mmText = parts[0] || '';
    const ddText = parts[1] || '';
    const yyyyText = parts[2] || '';

    if (mmText.length === 2) {
      const mm = Number(mmText);
      if (mm < 1 || mm > 12) return 'Month must be 01 to 12.';
    }

    if (ddText.length === 2) {
      const dd = Number(ddText);
      if (dd < 1 || dd > 31) return 'Day is out of range for calendar days.';
    }

    if (yyyyText.length === 4) {
      const yyyy = Number(yyyyText);
      if (yyyy < ns.MIN_BIRTH_YEAR || yyyy > ns.MAX_BIRTH_YEAR) {
        return `Year must be between ${ns.MIN_BIRTH_YEAR} and ${ns.MAX_BIRTH_YEAR}.`;
      }
    }

    if (mmText.length === 2 && ddText.length === 2) {
      const mm = Number(mmText);
      const dd = Number(ddText);
      const maxDay = ns.getDaysInMonth(mm);
      if (dd > maxDay) return 'Day is out of range for selected month.';
    }

    if (text.length === 10) {
      if (!ns.parseStrictBirthdate(text)) return 'Please enter a valid birthdate.';
    }

    return null;
  };
})();
