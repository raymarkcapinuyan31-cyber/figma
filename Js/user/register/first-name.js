(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.validateFirstNameField = function validateFirstNameField(el) {
    const value = String((el && el.value) || '').replace(/\s+/g, ' ');
    return typeof ns.validatePersonName === 'function'
      ? ns.validatePersonName(value, { label: 'First name', required: true })
      : null;
  };
})();
