(function () {
  const ns = (window.hfsDashboard = window.hfsDashboard || {});
  const PROFILE_CACHE_KEY = 'hfs_profile_cache_v1';
  const SIDEBAR_COLLAPSED_KEY = 'hfs_sidebar_collapsed_v1';
  const PENDING_REGISTER_SYNC_KEY = 'hfs_register_pending_sync_v1';
  let pendingSyncRetryTimer = null;

  function readInitialSidebarCollapsedState() {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  if (readInitialSidebarCollapsedState()) {
    document.documentElement.classList.add('hfs-sidebar-precollapsed');
  } else {
    document.documentElement.classList.add('hfs-sidebar-preexpanded');
  }

  function readSidebarCollapsedState() {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function writeSidebarCollapsedState(collapsed) {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch (_) {
    }
  }

  ns.bindSidebarToggle = function bindSidebarToggle() {
    const appShell = document.querySelector('.app-shell');
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (!sidebarToggle || !appShell) return;
    if (sidebarToggle.dataset.sidebarBound === '1') return;
    sidebarToggle.dataset.sidebarBound = '1';

    function applySidebarState(collapsed) {
      appShell.classList.toggle('sidebar-collapsed', !!collapsed);
      sidebarToggle.textContent = collapsed ? '☰' : '✕';
      sidebarToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    applySidebarState(readSidebarCollapsedState());
    appShell.classList.add('sidebar-state-ready');
    document.documentElement.classList.remove('hfs-sidebar-precollapsed');
    document.documentElement.classList.remove('hfs-sidebar-preexpanded');

    sidebarToggle.addEventListener('click', () => {
      const willCollapse = !appShell.classList.contains('sidebar-collapsed');
      applySidebarState(willCollapse);
      writeSidebarCollapsedState(willCollapse);
    });
  };

  ns.bindUserMenu = function bindUserMenu() {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenu = document.getElementById('userMenu');
    if (!userMenuBtn || !userMenu) return;
    if (userMenuBtn.dataset.userMenuBound === '1') return;
    userMenuBtn.dataset.userMenuBound = '1';

    function closeMenu() {
      userMenu.classList.remove('open');
      userMenu.setAttribute('aria-hidden', 'true');
      userMenuBtn.setAttribute('aria-expanded', 'false');
    }

    userMenuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = userMenu.classList.toggle('open');
      userMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      userMenuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', (event) => {
      if (!userMenu.contains(event.target) && !userMenuBtn.contains(event.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
  };

  ns.setTopbarName = function setTopbarName(name) {
    const userMenuBtn = document.getElementById('userMenuBtn');
    if (!userMenuBtn) return;
    userMenuBtn.innerHTML = `${name} <span class="caret">▼</span>`;
  };

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function readProfileCacheStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || '{}');
      return {
        byUid: parsed && parsed.byUid && typeof parsed.byUid === 'object' ? parsed.byUid : {},
        byEmail: parsed && parsed.byEmail && typeof parsed.byEmail === 'object' ? parsed.byEmail : {}
      };
    } catch (_) {
      return { byUid: {}, byEmail: {} };
    }
  }

  function writeProfileCacheStore(store) {
    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(store || { byUid: {}, byEmail: {} }));
    } catch (_) {
    }
  }

  function readPendingRegisterSyncMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PENDING_REGISTER_SYNC_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writePendingRegisterSyncMap(map) {
    try {
      localStorage.setItem(PENDING_REGISTER_SYNC_KEY, JSON.stringify(map || {}));
    } catch (_) {
    }
  }

  function clearPendingRegisterSync(uid) {
    const key = String(uid || '').trim();
    if (!key) return;
    const map = readPendingRegisterSyncMap();
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      delete map[key];
      writePendingRegisterSyncMap(map);
    }
  }

  async function withTimeout(promise, timeoutMs, timeoutMessage) {
    const ms = Math.max(1000, Number(timeoutMs) || 4000);
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(String(timeoutMessage || 'Request timed out.'));
        err.code = 'deadline-exceeded';
        reject(err);
      }, ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function flushPendingRegisterSyncForCurrentUser() {
    const usersDb = window.usersDatabase;
    const auth = usersDb && usersDb.auth ? usersDb.auth : null;
    const authUser = auth && auth.currentUser ? auth.currentUser : null;
    const uid = String(authUser && authUser.uid ? authUser.uid : '').trim();
    if (!uid) return;

    const map = readPendingRegisterSyncMap();
    const item = map[uid];
    if (!item || typeof item !== 'object') return;

    try {
      if (item.needsPasswordUpdate && item.password && typeof authUser.updatePassword === 'function') {
        await withTimeout(
          authUser.updatePassword(String(item.password || '')),
          3000,
          'Updating password timed out.'
        );
      }

      if (item.profilePayload && usersDb && typeof usersDb.updateUserProfile === 'function') {
        await withTimeout(
          usersDb.updateUserProfile(uid, item.profilePayload),
          3000,
          'Saving profile timed out.'
        );
        ns.saveProfileCache(item.profilePayload, authUser);
      }

      clearPendingRegisterSync(uid);
    } catch (_) {
    }
  }

  function schedulePendingRegisterSyncRetries() {
    if (pendingSyncRetryTimer) return;

    let attempts = 0;
    pendingSyncRetryTimer = setInterval(() => {
      attempts += 1;
      void flushPendingRegisterSyncForCurrentUser();
      if (attempts >= 20) {
        clearInterval(pendingSyncRetryTimer);
        pendingSyncRetryTimer = null;
      }
    }, 1200);
  }

  ns.saveProfileCache = function saveProfileCache(profile, authUser) {
    const uid = String((profile && (profile.uid || profile.id)) || (authUser && authUser.uid) || '').trim();
    const email = normalizeEmail((profile && profile.email) || (authUser && authUser.email) || '');
    if (!uid && !email) return;

    const store = readProfileCacheStore();
    const record = {
      uid,
      email,
      first_name: String(profile && profile.first_name ? profile.first_name : '').trim(),
      middle_name: String(profile && profile.middle_name ? profile.middle_name : '').trim(),
      last_name: String(profile && profile.last_name ? profile.last_name : '').trim(),
      birthdate: String(profile && profile.birthdate ? profile.birthdate : '').trim(),
      mobile_e164: String(profile && profile.mobile_e164 ? profile.mobile_e164 : '').trim(),
      role: String(profile && profile.role ? profile.role : '').trim(),
      updatedAt: Date.now()
    };

    if (uid) store.byUid[uid] = record;
    if (email) store.byEmail[email] = record;
    writeProfileCacheStore(store);
  };

  ns.getCachedProfile = function getCachedProfile(authUserOrUid, maybeEmail) {
    const uid = typeof authUserOrUid === 'string'
      ? String(authUserOrUid || '').trim()
      : String(authUserOrUid && authUserOrUid.uid ? authUserOrUid.uid : '').trim();

    const emailFromUser = typeof authUserOrUid === 'object' && authUserOrUid
      ? normalizeEmail(authUserOrUid.email)
      : '';
    const emailFromArg = normalizeEmail(maybeEmail);
    const email = emailFromUser || emailFromArg;

    const store = readProfileCacheStore();
    const byUid = uid ? store.byUid[uid] : null;
    const byEmail = !byUid && email ? store.byEmail[email] : null;
    const record = byUid || byEmail;

    return record ? Object.assign({}, record) : null;
  };

  ns.getDisplayName = function getDisplayName(profile, authUser) {
    if (profile && profile.first_name) {
      const first = String(profile.first_name || '').trim();
      if (first) return first;
    }
    if (profile && profile.firstName) {
      const firstCamel = String(profile.firstName || '').trim();
      if (firstCamel) return firstCamel;
    }
    if (profile && profile.last_name) {
      const last = String(profile.last_name || '').trim();
      if (last) return last;
    }
    if (authUser && authUser.displayName) {
      const display = String(authUser.displayName || '').trim();
      if (display) return display.split(/\s+/)[0];
    }

    const email = String(authUser && authUser.email ? authUser.email : '').trim();
    if (email && email.includes('@')) {
      const local = email.split('@')[0];
      const token = String(local || '').split(/[._\-\s]+/)[0] || '';
      const clean = token.replace(/[^A-Za-z0-9']/g, '');
      if (clean) {
        return clean.charAt(0).toUpperCase() + clean.slice(1);
      }
    }

    const uid = String(authUser && authUser.uid ? authUser.uid : '').trim();
    if (uid) return 'Customer';

    return 'User';
  };

  ns.bindNavByHref = function bindNavByHref(href) {
    const link = document.querySelector(`.sidebar a[href="${href}"]`);
    if (!link) return;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = href;
    });
  };

  function initSidePanelEarly() {
    ns.bindSidebarToggle();
    ns.bindUserMenu();
    void flushPendingRegisterSyncForCurrentUser();
    schedulePendingRegisterSyncRetries();

    const usersDb = window.usersDatabase;
    const auth = usersDb && usersDb.auth ? usersDb.auth : null;
    if (auth && typeof auth.onAuthStateChanged === 'function') {
      auth.onAuthStateChanged(() => {
        void flushPendingRegisterSyncForCurrentUser();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidePanelEarly);
  } else {
    initSidePanelEarly();
  }
})();
