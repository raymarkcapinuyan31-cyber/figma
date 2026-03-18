(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.validateLastNameField = function validateLastNameField(el) {
    const value = String((el && el.value) || '').replace(/\s+/g, ' ');
    return typeof ns.validatePersonName === 'function'
      ? ns.validatePersonName(value, { label: 'Last name', required: true })
      : null;
  };
})();
