(function () {
  const ns = (window.hfsDashboard = window.hfsDashboard || {});
  const usersDb = window.usersDatabase || window.homefixDB || window.userProfileDatabase || null;
  const ENSURE_USER_NODE_CACHE_KEY = 'hfs_user_node_last_upsert_v1';
  const LOGIN_NOTICE_KEY = 'hfs_login_notice';
  const DISABLED_ACCOUNT_MESSAGE = 'Your account has been disabled. Please contact the administrator for assistance.';

  let stopDisabledStateWatcher = null;

  async function writeSessionLog(payload) {
    try {
      if (!usersDb || typeof usersDb.logSessionEvent !== 'function') return;
      await usersDb.logSessionEvent(payload || {});
    } catch (_) {
    }
  }

  function getRealtimeDb() {
    if (usersDb && usersDb.firebase && typeof usersDb.firebase.database === 'function') {
      return usersDb.firebase.database();
    }
    if (window.firebase && typeof window.firebase.database === 'function') {
      return window.firebase.database();
    }
    return null;
  }

  function rememberDisabledAccountNotice() {
    try {
      sessionStorage.setItem(LOGIN_NOTICE_KEY, JSON.stringify({
        type: 'error',
        message: DISABLED_ACCOUNT_MESSAGE,
        createdAt: Date.now()
      }));
    } catch (_) {
    }
  }

  function clearDisabledStateWatcher() {
    if (typeof stopDisabledStateWatcher === 'function') {
      try {
        stopDisabledStateWatcher();
      } catch (_) {
      }
    }
    stopDisabledStateWatcher = null;
  }

  async function forceDisabledAccountLogout() {
    rememberDisabledAccountNotice();
    try {
      if (usersDb && typeof usersDb.signOut === 'function') {
        await usersDb.signOut();
      }
    } catch (_) {
    }
    ns.redirectToLogin();
  }

  function bindDisabledStateWatcher(user) {
    clearDisabledStateWatcher();

    const uid = String(user && user.uid ? user.uid : '').trim();
    const rtdb = getRealtimeDb();
    if (!uid || !rtdb) return;

    const refs = [
      rtdb.ref(`customers/${uid}`),
      rtdb.ref(`users/${uid}`),
      rtdb.ref(`technicians/${uid}`)
    ];
    const listeners = [];
    const state = { customers: null, users: null, technicians: null };
    let handlingDisabled = false;

    const evaluate = async () => {
      if (handlingDisabled) return;
      const records = [state.customers, state.users, state.technicians].filter(Boolean);
      if (!records.some((record) => record && record.isActive === false)) return;
      handlingDisabled = true;
      await forceDisabledAccountLogout();
    };

    ['customers', 'users', 'technicians'].forEach((key, index) => {
      const ref = refs[index];
      const listener = (snapshot) => {
        state[key] = snapshot && typeof snapshot.exists === 'function' && snapshot.exists()
          ? (snapshot.val() || {})
          : null;
        void evaluate();
      };
      listeners.push(listener);
      ref.on('value', listener);
    });

    stopDisabledStateWatcher = function stopWatcher() {
      refs.forEach((ref, index) => {
        const listener = listeners[index];
        if (!ref || typeof ref.off !== 'function' || typeof listener !== 'function') return;
        ref.off('value', listener);
      });
    };
  }

  ns.redirectToLogin = function redirectToLogin() {
    window.location.href = '../../login.html';
  };

  ns.bindAuthState = function bindAuthState() {
    if (ns.__authStateBound) return;
    ns.__authStateBound = true;
    if (!(usersDb && usersDb.auth)) return;

    let redirectTimer = null;

    function scheduleRedirectIfStillSignedOut() {
      if (redirectTimer) return;
      redirectTimer = setTimeout(() => {
        redirectTimer = null;
        const active = usersDb && usersDb.auth ? usersDb.auth.currentUser : null;
        if (!active) ns.redirectToLogin();
      }, 3500);
    }

    function clearRedirectTimer() {
      if (!redirectTimer) return;
      clearTimeout(redirectTimer);
      redirectTimer = null;
    }

    function readEnsureCache() {
      try {
        const parsed = JSON.parse(localStorage.getItem(ENSURE_USER_NODE_CACHE_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_) {
        return {};
      }
    }

    function writeEnsureCache(cache) {
      try {
        localStorage.setItem(ENSURE_USER_NODE_CACHE_KEY, JSON.stringify(cache || {}));
      } catch (_) {
      }
    }

    async function ensureUserNodeRecord(user) {
      const uid = String(user && user.uid ? user.uid : '').trim();
      if (!uid) return;

      const now = Date.now();
      const cache = readEnsureCache();
      const last = Number(cache[uid] || 0);
      if (Number.isFinite(last) && now - last < 30000) return;

      try {
        if (window.firebase && typeof window.firebase.database === 'function') {
          const db = window.firebase.database();
          const serverTs = window.firebase.database.ServerValue && window.firebase.database.ServerValue.TIMESTAMP
            ? window.firebase.database.ServerValue.TIMESTAMP
            : now;
          const cleanEmail = String(user && user.email ? user.email : '').trim().toLowerCase();
          const cachedProfile = typeof ns.getCachedProfile === 'function' ? (ns.getCachedProfile(user) || {}) : {};
          const profileData = {
            uid,
            email: cleanEmail,
            role: 'customer',
            isVerified: !!(user && user.emailVerified),
            emailVerified: !!(user && user.emailVerified),
            updatedAt: serverTs
          };

          if (cachedProfile && cachedProfile.first_name) profileData.first_name = String(cachedProfile.first_name).trim();
          if (cachedProfile && cachedProfile.middle_name) profileData.middle_name = String(cachedProfile.middle_name).trim();
          if (cachedProfile && cachedProfile.last_name) profileData.last_name = String(cachedProfile.last_name).trim();
          if (cachedProfile && cachedProfile.birthdate) profileData.birthdate = String(cachedProfile.birthdate).trim();
          if (cachedProfile && cachedProfile.mobile_e164) profileData.mobile_e164 = String(cachedProfile.mobile_e164).trim();

          await Promise.all([
            db.ref(`customers/${uid}`).update(profileData)
          ]);
        } else if (usersDb && typeof usersDb.updateUserProfile === 'function') {
          await usersDb.updateUserProfile(uid, {
            uid,
            email: String(user && user.email ? user.email : '').trim().toLowerCase(),
            role: 'customer',
            isVerified: !!(user && user.emailVerified),
            emailVerified: !!(user && user.emailVerified)
          });
        }

        cache[uid] = now;
        writeEnsureCache(cache);
      } catch (_) {
      }
    }

    usersDb.auth.onAuthStateChanged(async (user) => {
      if (!user) {
        clearDisabledStateWatcher();
        scheduleRedirectIfStillSignedOut();
        return;
      }

      clearRedirectTimer();
      bindDisabledStateWatcher(user);
      void ensureUserNodeRecord(user);

      let profile = null;
      try {
        profile = await usersDb.getUserById(user.uid);
        if (profile && typeof ns.saveProfileCache === 'function') {
          ns.saveProfileCache(profile, user);
        }
      } catch {
      }

      if (!profile && typeof ns.getCachedProfile === 'function') {
        profile = ns.getCachedProfile(user);
      }

      if (profile && profile.isActive === false) {
        await forceDisabledAccountLogout();
        return;
      }

      ns.setTopbarName(ns.getDisplayName(profile, user));
    });
  };

  ns.bindSignOut = function bindSignOut() {
    if (ns.__signOutBound) return;
    ns.__signOutBound = true;
    if (!(usersDb && usersDb.auth)) return;
    const signOutLinks = document.querySelectorAll('[data-logout="true"]');
    if (!signOutLinks.length) return;

    signOutLinks.forEach((signOutLink) => {
      signOutLink.setAttribute('href', '#');
      signOutLink.addEventListener('click', async (event) => {
        event.preventDefault();
        const authUser = usersDb && usersDb.auth ? usersDb.auth.currentUser : null;
        const uid = String(authUser && authUser.uid ? authUser.uid : '').trim();
        const email = String(authUser && authUser.email ? authUser.email : '').trim().toLowerCase();
        const cachedProfile = typeof ns.getCachedProfile === 'function' ? (ns.getCachedProfile(authUser) || {}) : {};
        const displayName = [cachedProfile && cachedProfile.first_name, cachedProfile && cachedProfile.last_name]
          .filter(Boolean)
          .join(' ')
          .trim() || email;

        if (usersDb && typeof usersDb.endRoleSession === 'function') {
          await usersDb.endRoleSession({
            role: 'customer',
            uid,
            email,
            name: displayName,
            source: 'user-dashboard'
          });
        } else {
          await writeSessionLog({
            role: 'customer',
            action: 'logout',
            uid,
            email,
            name: displayName,
            source: 'user-dashboard'
          });
        }

        try {
          await usersDb.signOut();
        } finally {
          ns.redirectToLogin();
        }
      });
    });
  };

  function initAuthBindings() {
    ns.bindAuthState();
    ns.bindSignOut();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthBindings);
  } else {
    initAuthBindings();
  }
})();
