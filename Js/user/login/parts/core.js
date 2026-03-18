document.addEventListener('DOMContentLoaded', () => {
  const ns = window.hfsLogin || {};
  const loginForm = document.getElementById('loginForm');
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
      loginBtn.textContent = 'Logging In...';
    }

    try {
      await ns.handleLogin(emailInput, passwordInput);
    } finally {
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Log In';
      }
    }
  }

  if (loginForm) {
    loginForm.addEventListener('submit', submitLogin);
  } else if (loginBtn) {
    loginBtn.addEventListener('click', submitLogin);
  }

  if (loginForm) return;

  [emailInput, passwordInput].forEach((input) => {
    if (!input) return;
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      submitLogin(event);
    });
  });
});
