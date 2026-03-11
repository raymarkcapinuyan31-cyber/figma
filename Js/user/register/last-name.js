(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.validateLastNameField = function validateLastNameField(el) {
    const v = String((el && el.value) || '').trim().replace(/\s+/g, ' ');
    if (!v) return 'Last name is required.';
    if (v.length < 2 || v.length > 15) return 'Must be 2–15 characters.';
    if (/--/.test(v)) return 'Use only one hyphen between letters.';
    if (!ns.nameRegex.test(v)) return 'Please enter a valid last name.';
    return null;
  };
})();
