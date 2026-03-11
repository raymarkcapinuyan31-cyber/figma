/*
  databasehfs/users/core.js
  Shared user data core: Firebase bootstrap, local fallback helpers, and common utilities.
*/
(function () {
  const firebaseConfig = window.HOMEFIX_FIREBASE_CONFIG || null;

  const STORAGE_KEYS = {
    users: 'hfs_users',
    requests: 'hfs_requests',
    authUid: 'hfs_auth_uid'
  };

  const forceFirebaseOnly = true;

  function isPlaceholderValue(value) {
    const text = String(value || '').trim();
    return !text ||
      text.includes('REPLACE_WITH_') ||
      text.includes('DfJfJfJf') ||
      text.includes('abcdef123456') ||
      text.includes('G-XXXXXXX');
  }

  function hasLikelyValidFirebaseConfig(config) {
    if (!config) return false;
    if (isPlaceholderValue(config.apiKey)) return false;
    if (!String(config.apiKey).startsWith('AIza')) return false;
    if (isPlaceholderValue(config.authDomain)) return false;
    if (isPlaceholderValue(config.projectId)) return false;
    if (isPlaceholderValue(config.appId)) return false;
    return true;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function makeUid() {
    return 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function buildFirebaseRequiredError() {
    const err = new Error('Firebase is not configured. Update firebase/config/firebase-config.js with your real Firebase web config.');
    err.code = 'firebase/not-configured';
    return err;
  }

  const localAuthListeners = [];

  function getCurrentLocalUser() {
    const uid = localStorage.getItem(STORAGE_KEYS.authUid);
    if (!uid) return null;
    const users = readJson(STORAGE_KEYS.users, {});
    const user = users[uid];
    if (!user) return null;
    return { uid: user.uid, email: user.email, emailVerified: !!user.isVerified };
  }

  function notifyLocalAuthListeners() {
    const user = getCurrentLocalUser();
    localAuthListeners.forEach((listener) => {
      try { listener(user); } catch (_) {}
    });
  }

  const localAuth = {
    onAuthStateChanged(callback) {
      if (typeof callback !== 'function') return function () {};
      localAuthListeners.push(callback);
      setTimeout(() => callback(getCurrentLocalUser()), 0);
      return function unsubscribe() {
        const index = localAuthListeners.indexOf(callback);
        if (index >= 0) localAuthListeners.splice(index, 1);
      };
    },

    async createUserWithEmailAndPassword(email, password) {
      const cleanEmail = normalizeEmail(email);
      const cleanPassword = String(password || '');
      if (!cleanEmail) {
        const err = new Error('Email is required.');
        err.code = 'auth/invalid-email';
        throw err;
      }
      if (cleanPassword.length < 8) {
        const err = new Error('Password is too weak.');
        err.code = 'auth/weak-password';
        throw err;
      }

      const users = readJson(STORAGE_KEYS.users, {});
      const existing = Object.values(users).find((u) => normalizeEmail(u.email) === cleanEmail);
      if (existing) {
        const err = new Error('Email already in use.');
        err.code = 'auth/email-already-in-use';
        throw err;
      }

      const uid = makeUid();
      users[uid] = {
        uid,
        email: cleanEmail,
        password: cleanPassword,
        role: 'customer',
        isVerified: true,
        isActive: true,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      writeJson(STORAGE_KEYS.users, users);
      localStorage.setItem(STORAGE_KEYS.authUid, uid);
      notifyLocalAuthListeners();
      return { user: { uid, email: cleanEmail, emailVerified: true } };
    },

    async signInWithEmailAndPassword(email, password) {
      const cleanEmail = normalizeEmail(email);
      const cleanPassword = String(password || '');
      const users = readJson(STORAGE_KEYS.users, {});
      const match = Object.values(users).find((u) => normalizeEmail(u.email) === cleanEmail);

      if (!match) {
        const err = new Error('User not found.');
        err.code = 'auth/user-not-found';
        throw err;
      }
      if (String(match.password || '') !== cleanPassword) {
        const err = new Error('Wrong password.');
        err.code = 'auth/wrong-password';
        throw err;
      }

      localStorage.setItem(STORAGE_KEYS.authUid, match.uid);
      notifyLocalAuthListeners();
      return { user: { uid: match.uid, email: match.email, emailVerified: !!match.isVerified } };
    },

    async signOut() {
      localStorage.removeItem(STORAGE_KEYS.authUid);
      notifyLocalAuthListeners();
      return true;
    }
  };

  let mode = 'local';
  let firebaseRef = null;
  let auth = localAuth;

  if (typeof window.firebase !== 'undefined' && hasLikelyValidFirebaseConfig(firebaseConfig)) {
    try {
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(firebaseConfig);
      }
      firebaseRef = window.firebase;
      auth = firebaseRef.auth();
      try {
        if (firebaseRef.auth && firebaseRef.auth.Auth && firebaseRef.auth.Auth.Persistence && firebaseRef.auth.Auth.Persistence.LOCAL && typeof auth.setPersistence === 'function') {
          auth.setPersistence(firebaseRef.auth.Auth.Persistence.LOCAL).catch(() => {});
        }
      } catch (_) {
      }

      try {
        if (auth && typeof auth.onAuthStateChanged === 'function') {
          const originalOnAuthStateChanged = auth.onAuthStateChanged.bind(auth);
          auth.onAuthStateChanged = function patchedOnAuthStateChanged(callback, error, completed) {
            if (typeof callback !== 'function') {
              return originalOnAuthStateChanged(callback, error, completed);
            }

            let initialDecisionMade = false;
            let pendingNullTimer = null;
            const wrapped = (user) => {
              if (user) {
                if (pendingNullTimer) {
                  clearTimeout(pendingNullTimer);
                  pendingNullTimer = null;
                }
                initialDecisionMade = true;
                callback(user);
                return;
              }

              if (!initialDecisionMade) {
                if (pendingNullTimer) return;
                pendingNullTimer = setTimeout(() => {
                  pendingNullTimer = null;
                  if (!initialDecisionMade) {
                    initialDecisionMade = true;
                    callback(null);
                  }
                }, 900);
                return;
              }

              callback(null);
            };

            const unsubscribe = originalOnAuthStateChanged(wrapped, error, completed);
            return function () {
              if (pendingNullTimer) {
                clearTimeout(pendingNullTimer);
                pendingNullTimer = null;
              }
              if (typeof unsubscribe === 'function') unsubscribe();
            };
          };
        }
      } catch (_) {
      }
      mode = 'firebase';
    } catch (error) {
      mode = 'local';
      auth = localAuth;
      console.warn('Firebase init failed; using local fallback mode.', error && error.message ? error.message : error);
    }
  } else {
    if (forceFirebaseOnly) {
      mode = 'firebase-required';
      auth = null;
      console.error('Firebase config is missing/placeholder. Firebase-only mode is enabled.');
    } else {
      console.warn('Firebase config is missing/placeholder; using local fallback mode.');
    }
  }

  window.homefixUsersCore = {
    STORAGE_KEYS,
    forceFirebaseOnly,
    readJson,
    writeJson,
    nowIso,
    normalizeEmail,
    buildFirebaseRequiredError,
    localAuth,
    mode,
    firebase: firebaseRef,
    auth
  };
})();
