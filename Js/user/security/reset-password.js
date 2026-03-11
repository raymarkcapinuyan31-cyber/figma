document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('resetPasswordForm');
  const emailInput = document.getElementById('resetEmail');
  const newPassword = document.getElementById('resetNewPassword');
  const confirmPassword = document.getElementById('resetConfirmPassword');
  const message = document.getElementById('resetMessage');

  const passwordRuleLength = document.getElementById('passwordRuleLength');
  const passwordRuleLower = document.getElementById('passwordRuleLower');
  const passwordRuleUpper = document.getElementById('passwordRuleUpper');
  const passwordRuleDigit = document.getElementById('passwordRuleDigit');
  const passwordRuleSpecial = document.getElementById('passwordRuleSpecial');

  const usersDb = window.usersDatabase || window.homefixDB || window.userProfileDatabase || null;
  const passwordRegex = /^(?=.{8,12}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s])\S+$/;

  function setMessage(text, type) {
    if (!message) return;
    message.textContent = text || '';
    message.classList.remove('error', 'success');
    if (type) message.classList.add(type);
  }

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

  function getActionCode() {
    const url = new URL(window.location.href);
    let code = String(url.searchParams.get('oobCode') || '').trim();

    if (!code) {
      const nested = String(url.searchParams.get('link') || '').trim();
      if (nested) {
        try {
          const nestedUrl = new URL(nested);
          code = String(nestedUrl.searchParams.get('oobCode') || '').trim();
        } catch (_) {}
      }
    }

    return code;
  }

  function validatePasswordFormat(value) {
    const text = String(value || '');
    if (!text) return 'New password is required.';
    if (text.length < 8) return 'New password must be at least 8 characters.';
    if (text.length > 12) return 'New password must be no more than 12 characters.';
    if (!passwordRegex.test(text)) return 'Please meet all password requirements.';
    return null;
  }

  if (!usersDb || !usersDb.auth || usersDb.mode !== 'firebase') {
    setMessage('Password reset is only available in Firebase mode.', 'error');
    if (form) form.style.display = 'none';
    return;
  }

  const auth = usersDb.auth;
  const actionCode = getActionCode();

  updatePasswordRules('');

  if (!actionCode) {
    setMessage('This reset link is missing a valid code. Request a new reset link.', 'error');
    if (form) form.style.display = 'none';
    return;
  }

  auth.verifyPasswordResetCode(actionCode)
    .then((email) => {
      if (emailInput) emailInput.value = String(email || '').trim().toLowerCase();
    })
    .catch(() => {
      setMessage('This reset link is invalid or has expired. Request a new link.', 'error');
      if (form) form.style.display = 'none';
    });

  if (newPassword) {
    newPassword.addEventListener('input', () => {
      const value = String(newPassword.value || '');
      const confirmValue = String((confirmPassword && confirmPassword.value) || '');

      updatePasswordRules(value);
      clearFieldError(newPassword);

      if (!value) {
        clearFieldValid(newPassword);
      } else if (!validatePasswordFormat(value)) {
        setFieldValid(newPassword);
      } else {
        clearFieldValid(newPassword);
      }

      if (confirmPassword && confirmValue) {
        if (confirmValue === value) {
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
      const value = String(confirmPassword.value || '');
      const newValue = String((newPassword && newPassword.value) || '');

      clearFieldError(confirmPassword);
      if (!value) {
        clearFieldValid(confirmPassword);
        return;
      }

      if (value === newValue) {
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

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage('');
      clearFieldError(newPassword);
      clearFieldError(confirmPassword);
      clearFieldValid(newPassword);
      clearFieldValid(confirmPassword);

      const newValue = String(newPassword && newPassword.value ? newPassword.value : '');
      const confirmValue = String(confirmPassword && confirmPassword.value ? confirmPassword.value : '');

      if (!newValue || !confirmValue) {
        if (!newValue) setFieldError(newPassword);
        if (!confirmValue) setFieldError(confirmPassword);
        setMessage('Both password fields are required.', 'error');
        return;
      }

      const formatError = validatePasswordFormat(newValue);
      if (formatError) {
        setFieldError(newPassword);
        setMessage(formatError, 'error');
        return;
      }

      if (newValue !== confirmValue) {
        setFieldError(confirmPassword);
        setMessage('New password and confirm password do not match.', 'error');
        return;
      }

      try {
        await auth.confirmPasswordReset(actionCode, newValue);
        setFieldValid(newPassword);
        setFieldValid(confirmPassword);
        setMessage('Password changed successfully. You can now log in with your new password.', 'success');
        setTimeout(() => {
          window.location.href = '../../login.html';
        }, 1200);
      } catch (error) {
        if (error && (error.code === 'auth/expired-action-code' || error.code === 'auth/invalid-action-code')) {
          setMessage('This reset link is invalid or expired. Request a new reset link.', 'error');
          return;
        }
        if (error && error.code === 'auth/weak-password') {
          setFieldError(newPassword);
          setMessage('New password is too weak.', 'error');
          return;
        }
        setMessage('Unable to reset password right now. Please try again.', 'error');
      }
    });
  }
});
