(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.validateFirstNameField = function validateFirstNameField(el) {
    const v = String((el && el.value) || '').trim().replace(/\s+/g, ' ');
    if (!v) return 'First name is required.';
    if (v.length < 2 || v.length > 15) return 'Must be 2–15 characters.';
    if (/--/.test(v)) return 'Use only one hyphen between letters.';
    if (!ns.nameRegex.test(v)) return 'Please enter a valid first name.';
    return null;
  };
})();
