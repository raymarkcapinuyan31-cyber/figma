(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.validateEmailField = function validateEmailField(el) {
    const v = String((el && el.value) || '').trim();
    if (!v) return 'Email is required.';
    if (!ns.emailRegex.test(v)) return 'Please enter a valid email. Example: yourname@gmail.com or yourname@yahoo.com.';
    return null;
  };
})();
