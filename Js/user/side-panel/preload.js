(function () {
  var key = 'hfs_sidebar_collapsed_v1';
  var html = document.documentElement;
  if (!html) return;

  try {
    var isCollapsed = localStorage.getItem(key) === '1';
    if (isCollapsed) {
      html.classList.add('hfs-sidebar-precollapsed');
    } else {
      html.classList.add('hfs-sidebar-preexpanded');
    }
  } catch (_) {
    html.classList.add('hfs-sidebar-preexpanded');
  }
})();
