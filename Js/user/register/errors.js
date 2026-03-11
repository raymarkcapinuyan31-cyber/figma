(function () {
  const ns = (window.hfsRegister = window.hfsRegister || {});

  ns.setError = function setError(el, msg) {
    if (!el) return;
    el.classList.add('input-error');
    el.setAttribute('aria-invalid', 'true');
    const err = document.getElementById('error-' + el.id);
    if (err) {
      err.textContent = msg;
      err.style.display = 'block';
    }
  };

  ns.clearError = function clearError(el) {
    if (!el) return;
    el.classList.remove('input-error');
    el.removeAttribute('aria-invalid');
    const err = document.getElementById('error-' + el.id);
    if (err) {
      err.textContent = '';
      err.style.display = 'none';
    }
  };
})();
