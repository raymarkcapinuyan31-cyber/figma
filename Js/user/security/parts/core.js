document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('changePasswordForm');
  const currentPassword = document.getElementById('currentPassword');
  const newPassword = document.getElementById('newPassword');
  const confirmPassword = document.getElementById('confirmPassword');
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  const securityMessage = document.getElementById('securityMessage');
  const securityNoticeModal = document.getElementById('securityNoticeModal');
  const securityNoticeMessage = document.getElementById('securityNoticeMessage');
  const securityNoticeOkBtn = document.getElementById('securityNoticeOkBtn');
  const passwordRegex = /^(?=.{8,12}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s])\S+$/;
  const passwordRuleLength = document.getElementById('passwordRuleLength');
  const passwordRuleLower = document.getElementById('passwordRuleLower');
  const passwordRuleUpper = document.getElementById('passwordRuleUpper');
  const passwordRuleDigit = document.getElementById('passwordRuleDigit');
  const passwordRuleSpecial = document.getElementById('passwordRuleSpecial');

  let activeAuthUser = null;
  let activeEmail = '';
  const usersDb = window.usersDatabase || window.homefixDB || window.userProfileDatabase || null;

  function setFieldError(el) {
    if (!el) return;
    el.classList.add('input-error');
    el.classList.remove('input-valid');
    el.setAttribute('aria-invalid', 'true');
  }

  function clearFieldError(el) {
    if (!el) return;
    el.classList.remove('input-error');
    el.removeAttribute('aria-invalid');
  }

  function setFieldValid(el) {
    if (!el) return;
    clearFieldError(el);
    el.classList.add('input-valid');
  }

  function clearFieldValid(el) {
    if (!el) return;
    el.classList.remove('input-valid');
  }

  function clearFieldStates() {
    [currentPassword, newPassword, confirmPassword].forEach((el) => {
      clearFieldError(el);
      clearFieldValid(el);
    });
  }

  function updatePasswordRules(value) {
    const text = String(value || '');
    const checks = {
      length: text.length >= 8 && text.length <= 12,
      lower: /[a-z]/.test(text),
      upper: /[A-Z]/.test(text),
      digit: /\d/.test(text),
      special: /[^\w\s]/.test(text)
    };

    if (passwordRuleLength) passwordRuleLength.classList.toggle('met', checks.length);
    if (passwordRuleLower) passwordRuleLower.classList.toggle('met', checks.lower);
    if (passwordRuleUpper) passwordRuleUpper.classList.toggle('met', checks.upper);
    if (passwordRuleDigit) passwordRuleDigit.classList.toggle('met', checks.digit);
    if (passwordRuleSpecial) passwordRuleSpecial.classList.toggle('met', checks.special);
  }

  function validatePasswordFormat(value) {
    const text = String(value || '');
    if (!text) return 'New password is required.';
    if (text.length < 8) return 'New password must be at least 8 characters.';
    if (text.length > 12) return 'New password must be no more than 12 characters.';
    if (!passwordRegex.test(text)) return 'Please meet all password requirements.';
    return null;
  }

  function setMessage(text, type) {
    if (!securityMessage) return;
    securityMessage.textContent = text || '';
    securityMessage.classList.remove('error', 'success');
    if (type) securityMessage.classList.add(type);
  }

  function redirectToLogin() {
    window.location.href = '../../login.html';
  }

  function showSuccessNotice(message) {
    if (!securityNoticeModal || !securityNoticeMessage || !securityNoticeOkBtn) {
      return Promise.resolve();
    }

    function closeNotice() {
      securityNoticeModal.hidden = true;
      securityNoticeModal.setAttribute('aria-hidden', 'true');
      if (showSuccessNotice._resolver) {
        showSuccessNotice._resolver();
        showSuccessNotice._resolver = null;
      }
    }

    if (securityNoticeModal.dataset.noticeBound !== '1') {
      securityNoticeModal.dataset.noticeBound = '1';
      securityNoticeOkBtn.addEventListener('click', closeNotice);
      securityNoticeModal.addEventListener('click', (event) => {
        if (event.target === securityNoticeModal) closeNotice();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !securityNoticeModal.hidden) closeNotice();
      });
    }

    securityNoticeMessage.textContent = String(message || 'Done.');
    securityNoticeModal.hidden = false;
    securityNoticeModal.setAttribute('aria-hidden', 'false');
    securityNoticeOkBtn.focus();

    return new Promise((resolve) => {
      showSuccessNotice._resolver = resolve;
    });
  }

  if (!usersDb || !usersDb.auth) {
    setMessage('Security settings are unavailable right now.', 'error');
    return;
  }

  updatePasswordRules('');

  if (currentPassword) {
    currentPassword.addEventListener('input', () => {
      clearFieldError(currentPassword);
      clearFieldValid(currentPassword);
    });
  }

  if (newPassword) {
    newPassword.addEventListener('input', () => {
      const newValue = String(newPassword.value || '');
      const confirmValue = String((confirmPassword && confirmPassword.value) || '');

      updatePasswordRules(newValue);
      clearFieldError(newPassword);

      if (!newValue) {
        clearFieldValid(newPassword);
      } else if (!validatePasswordFormat(newValue)) {
        setFieldValid(newPassword);
      } else {
        clearFieldValid(newPassword);
      }

      if (confirmPassword && confirmValue) {
        if (confirmValue === newValue) {
          clearFieldError(confirmPassword);
          setFieldValid(confirmPassword);
        } else {
          clearFieldValid(confirmPassword);
        }
      }
    });
  }

  if (confirmPassword) {
    confirmPassword.addEventListener('input', () => {
      const confirmValue = String(confirmPassword.value || '');
      const newValue = String((newPassword && newPassword.value) || '');

      clearFieldError(confirmPassword);
      if (!confirmValue) {
        clearFieldValid(confirmPassword);
        return;
      }

      if (confirmValue === newValue) {
        setFieldValid(confirmPassword);
      } else {
        clearFieldValid(confirmPassword);
      }
    });
  }

  document.querySelectorAll('.password-toggle').forEach((btn) => {
    const target = document.querySelector(btn.dataset.target);
    const img = btn.querySelector('img');
    if (!target || !img) return;
    btn.addEventListener('click', () => {
      const hidden = target.type === 'password';
      target.type = hidden ? 'text' : 'password';
      img.src = hidden ? '../../images/icons/eye-open.svg' : '../../images/icons/eye-closed.svg';
      img.alt = hidden ? 'Hide password' : 'Show password';
      btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      btn.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
    });
  });

  usersDb.auth.onAuthStateChanged(async (user) => {
    if (!user) {
      redirectToLogin();
      return;
    }

    activeAuthUser = user;
    activeEmail = user.email || '';

    try {
      const profile = await usersDb.getUserById(user.uid);
      activeEmail = profile && profile.email ? profile.email : activeEmail;
    } catch (_) {}
  });

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage('');
      clearFieldStates();

      const currentValue = String(currentPassword && currentPassword.value ? currentPassword.value : '');
      const newValue = String(newPassword && newPassword.value ? newPassword.value : '');
      const confirmValue = String(confirmPassword && confirmPassword.value ? confirmPassword.value : '');

      if (!currentValue || !newValue || !confirmValue) {
        if (!currentValue) setFieldError(currentPassword);
        if (!newValue) setFieldError(newPassword);
        if (!confirmValue) setFieldError(confirmPassword);
        setMessage('All password fields are required.', 'error');
        return;
      }

      if (usersDb.mode !== 'firebase') {
        setMessage('Password change requires Firebase mode.', 'error');
        return;
      }

      const auth = usersDb.auth;
      const user = auth && auth.currentUser ? auth.currentUser : activeAuthUser;
      if (!user || !user.email || !window.firebase || !window.firebase.auth) {
        setMessage('Cannot change password right now. Please sign in again.', 'error');
        return;
      }

      try {
        const credential = window.firebase.auth.EmailAuthProvider.credential(user.email, currentValue);
        await user.reauthenticateWithCredential(credential);
        setFieldValid(currentPassword);
      } catch (error) {
        if (error && (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-login-credentials')) {
          setFieldError(currentPassword);
          setMessage('Current password is incorrect.', 'error');
          return;
        }
        setMessage('Failed to verify current password. Please try again.', 'error');
        return;
      }

      const formatError = validatePasswordFormat(newValue);
      if (formatError) {
        setFieldError(newPassword);
        updatePasswordRules(newValue);
        setMessage(formatError, 'error');
        return;
      }

      if (newValue !== confirmValue) {
        setFieldError(confirmPassword);
        setMessage('New password and confirm password do not match.', 'error');
        return;
      }

      setFieldValid(newPassword);
      setFieldValid(confirmPassword);

      try {
        await user.updatePassword(newValue);
        if (currentPassword) currentPassword.value = '';
        if (newPassword) newPassword.value = '';
        if (confirmPassword) confirmPassword.value = '';
        clearFieldStates();
        updatePasswordRules('');
        setMessage('Password updated successfully.', 'success');
        await showSuccessNotice('Password updated successfully.');
      } catch (error) {
        if (error && (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-login-credentials')) {
          setFieldError(currentPassword);
          setMessage('Current password is incorrect.', 'error');
          return;
        }
        if (error && error.code === 'auth/weak-password') {
          setFieldError(newPassword);
          setMessage('New password is too weak.', 'error');
          return;
        }
        setMessage('Failed to change password. Please try again.', 'error');
      }
    });
  }

  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', () => {
      const auth = usersDb.auth;
      const email = String(activeEmail || (auth && auth.currentUser ? auth.currentUser.email : '') || '').trim().toLowerCase();
      const target = email ? `forgot-password.html?email=${encodeURIComponent(email)}` : 'forgot-password.html';
      window.location.href = target;
    });
  }
});
