document.addEventListener('DOMContentLoaded', () => {
  const ns = window.hfsRequestDetails || {};
  if (typeof ns.init === 'function') ns.init();
});

