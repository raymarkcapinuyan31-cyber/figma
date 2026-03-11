document.addEventListener('DOMContentLoaded', () => {
  const ns = window.hfsDashboard || {};
  if (typeof ns.bindNavByHref !== 'function') return;
  ns.bindNavByHref('book.html');
});
