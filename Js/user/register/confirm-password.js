(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.validateConfirmField = function validateConfirmField(el, pwdEl) {
    const v = String((el && el.value) || '');
    if (!v) return 'Confirm password is required.';
    if (v !== String((pwdEl && pwdEl.value) || '')) return 'Passwords do not match.';
    return null;
  };
})();
