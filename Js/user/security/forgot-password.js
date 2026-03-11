document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forgotPasswordForm');
  const emailInput = document.getElementById('forgotEmail');
  const message = document.getElementById('forgotMessage');

  const usersDb = window.usersDatabase || window.homefixDB || window.userProfileDatabase || null;

  function setMessage(text, type) {
    if (!message) return;
    message.textContent = text || '';
    message.classList.remove('error', 'success');
    if (type) message.classList.add(type);
  }

  function setInputError() {
    if (!emailInput) return;
    emailInput.classList.add('input-error');
    emailInput.setAttribute('aria-invalid', 'true');
  }

  function clearInputError() {
    if (!emailInput) return;
    emailInput.classList.remove('input-error');
    emailInput.removeAttribute('aria-invalid');
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function resolveResetUrl() {
    const config = window.HOMEFIX_FIREBASE_CONFIG || {};
    const authDomainRaw = String(config.authDomain || '').trim();
    if (authDomainRaw) {
      const host = authDomainRaw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
      return `https://${host}/html/user/reset-password.html`;
    }

    try {
      const current = new URL(window.location.href);
      if (/^https?:$/i.test(current.protocol)) {
        return `${current.origin}/html/user/reset-password.html`;
      }
    } catch (_) {}

    return '';
  }

  if (!usersDb || !usersDb.auth || usersDb.mode !== 'firebase') {
    setMessage('Forgot password is only available in Firebase mode.', 'error');
    return;
  }

  const auth = usersDb.auth;

  const queryEmail = normalizeEmail(new URLSearchParams(window.location.search).get('email'));
  if (emailInput) emailInput.value = queryEmail;

  auth.onAuthStateChanged(async (user) => {
    if (!emailInput) return;
    if (normalizeEmail(emailInput.value)) return;

    let resolvedEmail = normalizeEmail(user && user.email ? user.email : '');

    if (!resolvedEmail && user && user.uid && typeof usersDb.getUserById === 'function') {
      try {
        const profile = await usersDb.getUserById(user.uid);
        resolvedEmail = normalizeEmail(profile && profile.email ? profile.email : '');
      } catch (_) {}
    }

    if (resolvedEmail) {
      emailInput.value = resolvedEmail;
    }
  });

  if (emailInput) {
    emailInput.addEventListener('input', () => {
      clearInputError();
      setMessage('');
    });
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage('');
      clearInputError();

      const email = normalizeEmail(emailInput ? emailInput.value : '');
      if (!email) {
        setInputError();
        setMessage('Email is required.', 'error');
        return;
      }

      const resetUrl = resolveResetUrl();
      if (!resetUrl) {
        setMessage('Reset link setup is incomplete. Please configure your Firebase auth domain.', 'error');
        return;
      }

      try {
        await auth.sendPasswordResetEmail(email, { url: resetUrl });
        setMessage('Reset link sent. Check your email.', 'success');
      } catch (error) {
        const code = error && error.code ? error.code : '';

        if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri' || code === 'auth/missing-continue-uri') {
          setMessage('Reset link setup is incomplete. Add your app domain in Firebase Auth Authorized domains, then enable Firebase Auth Password Policy (8-12, uppercase, lowercase, number, special character).', 'error');
          return;
        }

        if (error && (error.code === 'auth/invalid-email' || error.code === 'auth/user-not-found')) {
          setInputError();
          setMessage('Please enter a valid registered email.', 'error');
          return;
        }
        if (error && error.code === 'auth/too-many-requests') {
          setMessage('Too many requests. Please try again later.', 'error');
          return;
        }
        if (error && error.code === 'auth/network-request-failed') {
          setMessage('Network error. Check your internet and try again.', 'error');
          return;
        }

        setMessage('Unable to send reset link right now. Please try again.', 'error');
      }
    });
  }
});
