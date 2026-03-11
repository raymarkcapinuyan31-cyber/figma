(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.validateOtpField = function validateOtpField(el) {
    const v = String((el && el.value) || '').trim();
    if (!v) return 'Verification code is required.';
    if (v.length < 6) return 'Enter the 6-digit verification code.';
    return null;
  };
})();
