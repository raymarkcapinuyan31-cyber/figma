document.addEventListener('DOMContentLoaded', () => {
  const ns = window.hfsLogin || {};
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn') || document.querySelector('.btn');

  if (emailInput && typeof ns.clearError === 'function') {
    emailInput.addEventListener('input', () => ns.clearError(emailInput));
  }
  if (passwordInput && typeof ns.clearError === 'function') {
    passwordInput.addEventListener('input', () => ns.clearError(passwordInput));
  }

  if (typeof ns.bindPasswordToggles === 'function') {
    ns.bindPasswordToggles();
  }

  async function submitLogin(ev) {
    if (ev) ev.preventDefault();
    if (typeof ns.handleLogin !== 'function') return;

    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.textContent = 'LOGGING IN...';
    }

    try {
      await ns.handleLogin(emailInput, passwordInput);
    } finally {
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'LOG IN';
      }
    }
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', submitLogin);
  }

  [emailInput, passwordInput].forEach((input) => {
    if (!input) return;
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      submitLogin(event);
    });
  });
});
