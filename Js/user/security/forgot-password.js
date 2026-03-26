document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forgotPasswordForm');
  const emailInput = document.getElementById('forgotEmail');
  const message = document.getElementById('forgotMessage');

  const usersDb = window.usersDatabase || window.homefixDB || window.userProfileDatabase || null;

  function setMessage(text, type) {
    if (!message) return;
    message.textContent = text || '';
    message.hidden = !text;
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
    const customPath = String(document.body && document.body.dataset && document.body.dataset.resetPath || '').trim();
    const resetPath = customPath || '/html/user/reset-password.html';
    const config = window.HOMEFIX_FIREBASE_CONFIG || {};
    const authDomainRaw = String(config.authDomain || '').trim();
    if (authDomainRaw) {
      const host = authDomainRaw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
      return `https://${host}${resetPath}`;
    }

    try {
      const current = new URL(window.location.href);
      if (/^https?:$/i.test(current.protocol)) {
        return `${current.origin}${resetPath}`;
      }
    } catch (_) {}

    return '';
  }

  async function createSecondaryAuthClient() {
    const config = window.HOMEFIX_FIREBASE_CONFIG || null;
    if (!config || !window.firebase || typeof window.firebase.initializeApp !== 'function') {
      return null;
    }

    const appName = `hfs-forgot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      const app = window.firebase.initializeApp(config, appName);
      const appAuth = app && typeof app.auth === 'function' ? app.auth() : null;
      if (!appAuth) {
        try { await app.delete(); } catch (_) {}
        return null;
      }
      return { app, auth: appAuth };
    } catch (_) {
      return null;
    }
  }

  function buildProvisionTempPassword(email) {
    const seed = normalizeEmail(email).replace(/[^a-z0-9]/g, '');
    const body = (seed + Date.now().toString(36)).slice(-4) || 'hfs1';
    // Must satisfy common Firebase policy (8-12 chars, mixed classes).
    return `Hf#${body}a1`;
  }

  async function ensureAuthIdentity(email) {
    const secondary = await createSecondaryAuthClient();
    if (!secondary || !secondary.auth || typeof secondary.auth.createUserWithEmailAndPassword !== 'function') {
      return;
    }

    try {
      const tempPassword = buildProvisionTempPassword(email);
      await secondary.auth.createUserWithEmailAndPassword(email, tempPassword);
      await secondary.auth.signOut().catch(() => {});
    } catch (error) {
      const code = error && error.code ? error.code : '';
      if (code !== 'auth/email-already-in-use' && code !== 'auth/operation-not-allowed') {
        throw error;
      }
    } finally {
      try { await secondary.app.delete(); } catch (_) {}
    }
  }

  async function sendReset(authClient, email, resetUrl) {
    if (!authClient || typeof authClient.sendPasswordResetEmail !== 'function') {
      const err = new Error('Reset email service is unavailable.');
      err.code = 'auth/unavailable';
      throw err;
    }

    if (resetUrl) {
      await authClient.sendPasswordResetEmail(email, { url: resetUrl });
      return;
    }

    await authClient.sendPasswordResetEmail(email);
  }

  async function sendResetViaRest(email) {
    const config = window.HOMEFIX_FIREBASE_CONFIG || {};
    const apiKey = String(config.apiKey || '').trim();
    if (!apiKey || typeof fetch !== 'function') return false;

    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email
        })
      });

      return response.ok;
    } catch (_) {
      return false;
    }
  }

  async function sendResetFast(email, resetUrl) {
    const config = window.HOMEFIX_FIREBASE_CONFIG || {};
    const apiKey = String(config.apiKey || '').trim();
    if (!apiKey || typeof fetch !== 'function') {
      const err = new Error('Reset email service is unavailable.');
      err.code = 'auth/unavailable';
      throw err;
    }

    const payload = {
      requestType: 'PASSWORD_RESET',
      email
    };

    if (resetUrl) {
      payload.continueUrl = resetUrl;
      payload.canHandleCodeInApp = false;
    }

    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) return true;

    let remoteCode = '';
    try {
      const data = await response.json();
      remoteCode = String(data && data.error && data.error.message ? data.error.message : '').trim().toUpperCase();
    } catch (_) {
      remoteCode = '';
    }

    const err = new Error('Password reset request failed.');
    if (remoteCode.includes('INVALID_EMAIL')) err.code = 'auth/invalid-email';
    else if (remoteCode.includes('EMAIL_NOT_FOUND')) err.code = 'auth/user-not-found';
    else if (remoteCode.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) err.code = 'auth/too-many-requests';
    else if (remoteCode.includes('INVALID_CONTINUE_URI')) err.code = 'auth/invalid-continue-uri';
    else if (remoteCode.includes('UNAUTHORIZED_CONTINUE_URI')) err.code = 'auth/unauthorized-continue-uri';
    else err.code = 'auth/internal-error';
    throw err;
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
      try {
        try {
          await sendResetFast(email, resetUrl);
        } catch (fastError) {
          const fastCode = fastError && fastError.code ? fastError.code : '';
          if (fastCode === 'auth/user-not-found') {
            await ensureAuthIdentity(email);
            await sendResetFast(email, resetUrl);
          } else {
            throw fastError;
          }
        }
        setMessage('Reset link has been sent to your email.', 'success');
      } catch (error) {
        let code = error && error.code ? error.code : '';

        if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri' || code === 'auth/missing-continue-uri') {
          try {
            // Fall back to Firebase default reset flow when custom continue URL is rejected.
            await sendReset(auth, email, '');
            setMessage('Reset link has been sent to your email.', 'success');
            return;
          } catch (fallbackError) {
            code = fallbackError && fallbackError.code ? fallbackError.code : code;
          }
        }

        if (code === 'auth/internal-error' || code === 'auth/network-request-failed' || code === 'auth/unavailable') {
          const secondary = await createSecondaryAuthClient();
          if (secondary && secondary.auth) {
            try {
              try {
                await sendReset(secondary.auth, email, resetUrl);
              } catch (secondaryError) {
                const secondaryCode = secondaryError && secondaryError.code ? secondaryError.code : '';
                if (secondaryCode === 'auth/unauthorized-continue-uri' || secondaryCode === 'auth/invalid-continue-uri' || secondaryCode === 'auth/missing-continue-uri') {
                  await sendReset(secondary.auth, email, '');
                } else {
                  throw secondaryError;
                }
              }

              setMessage('Reset link has been sent to your email.', 'success');
              return;
            } catch (secondaryError) {
              code = secondaryError && secondaryError.code ? secondaryError.code : code;
            } finally {
              try { await secondary.app.delete(); } catch (_) {}
            }
          }
        }

        if (code === 'auth/invalid-email' || code === 'auth/user-not-found') {
          setInputError();
          setMessage('Please enter a valid registered email.', 'error');
          return;
        }
        if (code === 'auth/too-many-requests') {
          setMessage('Too many requests. Please try again later.', 'error');
          return;
        }

        const sentViaRest = await sendResetViaRest(email);
        if (sentViaRest) {
          setMessage('Reset link has been sent to your email.', 'success');
          return;
        }

        if (code === 'auth/network-request-failed') {
          setMessage('Network error. Check your internet and try again.', 'error');
          return;
        }

        setMessage('Unable to send reset link right now. Please try again.', 'error');
      }
    });
  }
});
