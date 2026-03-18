(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.validateEmailField = function validateEmailField(el) {
    const v = String((el && el.value) || '').trim();
    if (!v) return 'Email is required.';
    if (!ns.emailRegex.test(v)) return 'Enter a valid email (e.g., yourname@gmail.com or yourname@school.edu).';
    return null;
  };
})();
