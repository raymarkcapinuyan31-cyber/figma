(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.validatePasswordField = function validatePasswordField(el) {
    const v = String((el && el.value) || '');
    if (!v) return 'Password is required.';
    if (v.length < 8) return 'Password is too short.';
    if (v.length > 12) return 'Password is too long.';
    if (!ns.passwordRegex.test(v)) return 'Please meet all password requirements.';
    return null;
  };
})();
