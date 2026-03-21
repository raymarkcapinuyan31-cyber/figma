(function () {
  const ns = (window.hfsLogin = window.hfsLogin || {});
  const LOGIN_NOTICE_KEY = 'hfs_login_notice';
  const DEFAULT_DISABLED_MESSAGE = 'Your account has been disabled. Please contact the administrator for assistance.';

  ns.setError = function setError(el, msg) {
    if (!el) return;
    el.classList.add('input-error');
    el.setAttribute('aria-invalid', 'true');
    const err = document.getElementById('error-' + el.id);
    if (err) {
      err.textContent = msg;
      err.style.display = 'block';
    }
  };

  ns.clearError = function clearError(el) {
    if (!el) return;
    el.classList.remove('input-error');
    el.removeAttribute('aria-invalid');
    const err = document.getElementById('error-' + el.id);
    if (err) {
      err.textContent = '';
      err.style.display = 'none';
    }
  };

  ns.showNotice = function showNotice(msg, type) {
    const notice = document.getElementById('loginNotice');
    if (!notice) return;
    notice.textContent = msg || '';
    notice.hidden = !msg;
    notice.classList.remove('error', 'success');
    if (type) notice.classList.add(type);
  };

  ns.clearNotice = function clearNotice() {
    const notice = document.getElementById('loginNotice');
    if (!notice) return;
    notice.textContent = '';
    notice.hidden = true;
    notice.classList.remove('error', 'success');
  };

  ns.consumeLoginNotice = function consumeLoginNotice() {
    try {
      const raw = sessionStorage.getItem(LOGIN_NOTICE_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(LOGIN_NOTICE_KEY);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        type: String(parsed.type || 'error').trim() || 'error',
        message: String(parsed.message || DEFAULT_DISABLED_MESSAGE).trim() || DEFAULT_DISABLED_MESSAGE
      };
    } catch (_) {
      return { type: 'error', message: DEFAULT_DISABLED_MESSAGE };
    }
  };

  ns.bindPasswordToggles = function bindPasswordToggles() {
    const toggles = document.querySelectorAll('.password-toggle');
    toggles.forEach((btn) => {
      const targetSelector = btn.dataset.target;
      const input = document.querySelector(targetSelector);
      const img = btn.querySelector('img');
      if (!input || !img) return;

      btn.setAttribute('aria-pressed', input.type === 'text' ? 'true' : 'false');
      btn.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
      img.alt = input.type === 'password' ? 'Show password' : 'Hide password';

      btn.addEventListener('click', () => {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        img.src = isHidden ? 'images/icons/eye-open.svg' : 'images/icons/eye-closed.svg';
        img.alt = isHidden ? 'Hide password' : 'Show password';
        btn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
        btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      });
    });
  };

  ns.normalizeMobile = function normalizeMobile(input) {
    const value = String(input || '').trim();
    return value.startsWith('09') ? '+63' + value.slice(1) : value;
  };

  ns.toAuthEmailFromMobile = function toAuthEmailFromMobile(mobileE164) {
    const digits = String(mobileE164 || '').replace(/\D/g, '');
    return `m${digits}@mobile.homefix.local`;
  };
})();
