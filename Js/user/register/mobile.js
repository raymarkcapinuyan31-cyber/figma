(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.validateMobileField = function validateMobileField(el) {
    const v = String((el && el.value) || '').trim();
    if (!v) return 'Mobile number is required.';
    const normalized = v.startsWith('09') ? '+63' + v.slice(1) : v;
    if (!ns.mobileRegex.test(normalized)) return 'Enter a valid PH mobile number: 09XXXXXXXXX or +639XXXXXXXXX.';
    return null;
  };
})();
