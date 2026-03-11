document.addEventListener('DOMContentLoaded', () => {
  const initialPage = new URLSearchParams(window.location.search).get('page') || 'dashboard.html';
  window.location.replace(initialPage);
});
