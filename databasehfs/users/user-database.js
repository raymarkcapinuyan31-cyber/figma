/*
  databasehfs/users/user-database.js
  Compatibility wrapper over modular user databases.
  Requires:
  - databasehfs/users/core.js
  - databasehfs/users/user-profile-database.js
  - databasehfs/users/booking-database.js
*/
(function () {
  const core = window.homefixUsersCore;
  const profile = window.userProfileDatabase;
  const booking = window.bookingDatabase;

  if (!core || !profile || !booking) {
    console.error('user-database.js requires modular scripts to load first.');
    return;
  }

  const SESSION_LOGS_PATH = 'sessionLogs';
  const ACTION_ROLE_LOG_PATHS = {
    login: {
      customer: `${SESSION_LOGS_PATH}/login/customers`,
      technician: `${SESSION_LOGS_PATH}/login/technicians`,
      admin: `${SESSION_LOGS_PATH}/login/admins`
    },
    logout: {
      customer: `${SESSION_LOGS_PATH}/logout/customers`,
      technician: `${SESSION_LOGS_PATH}/logout/technicians`,
      admin: `${SESSION_LOGS_PATH}/logout/admins`
    }
  };
  const ROLE_SESSION_KEYS = {
    customer: {
      id: 'hfs_customer_session_id',
      logId: 'hfs_customer_login_log_id'
    },
    technician: {
      id: 'hfs_technician_session_id',
      logId: 'hfs_technician_login_log_id'
    },
    admin: {
      id: 'hfs_admin_session_id',
      logId: 'hfs_admin_login_log_id'
    }
  };

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function normalizeLower(value) {
    return normalizeText(value).toLowerCase();
  }

  function getRealtimeDatabase() {
    if (!core || core.mode !== 'firebase') return null;
    if (!core.firebase || typeof core.firebase.database !== 'function') return null;
    return core.firebase.database();
  }

  function getRoleSessionKeys(role) {
    const key = normalizeLower(role);
    return ROLE_SESSION_KEYS[key] || null;
  }

  function getActionRoleLogPath(action, role) {
    const cleanAction = normalizeLower(action) === 'logout' ? 'logout' : 'login';
    const key = normalizeLower(role);
    const actionMap = ACTION_ROLE_LOG_PATHS[cleanAction] || ACTION_ROLE_LOG_PATHS.login;
    return actionMap[key] || actionMap.customer;
  }

  function setSessionStorageValue(key, value) {
    if (!key) return;
    try {
      if (!value) {
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, String(value));
      }
    } catch (_) {
    }
  }

  function getSessionStorageValue(key) {
    if (!key) return '';
    try {
      return String(sessionStorage.getItem(key) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function toLogTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^\d{10,}$/.test(trimmed)) {
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) return numeric;
      }
      const parsed = Date.parse(trimmed);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  function getLogTimestamp(item) {
    if (!item || typeof item !== 'object') return 0;
    return toLogTimestamp(item.createdAt || item.timestamp || item.time || item.created_at);
  }

  async function logSessionEvent(payload) {
    const rtdb = getRealtimeDatabase();
    if (!rtdb) return '';

    const role = normalizeLower(payload && payload.role) || 'customer';
    const action = normalizeLower(payload && payload.action) || 'login';
    const path = getActionRoleLogPath(action, role);
    const uid = normalizeText(payload && payload.uid);
    const sessionId = normalizeText(payload && payload.sessionId);
    const timestamp = Date.now();

    const data = {
      role,
      action,
      uid,
      sessionId,
      createdAt: timestamp,
      timestamp,
      date: new Date(timestamp).toLocaleDateString('en-US'),
      time: new Date(timestamp).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      })
    };

    try {
      const ref = rtdb.ref(path).push();
      await ref.set(data);
      return String(ref && ref.key ? ref.key : '').trim();
    } catch (_) {
      return '';
    }
  }

  async function startRoleSession(payload) {
    const rtdb = getRealtimeDatabase();
    if (!rtdb) return { sessionId: '', logId: '' };

    const role = normalizeLower(payload && payload.role);
    const keys = getRoleSessionKeys(role);
    if (!keys) return { sessionId: '', logId: '' };

    const uid = normalizeText(payload && payload.uid);

    try {
      const seedRef = rtdb.ref(getActionRoleLogPath('login', role)).push();
      const sessionId = String(seedRef && seedRef.key ? seedRef.key : '').trim();
      const logId = await logSessionEvent({
        role,
        action: 'login',
        uid,
        sessionId
      });

      setSessionStorageValue(keys.id, sessionId);
      setSessionStorageValue(keys.logId, logId);

      return { sessionId, logId };
    } catch (_) {
      return { sessionId: '', logId: '' };
    }
  }

  async function endRoleSession(payload) {
    const role = normalizeLower(payload && payload.role);
    const keys = getRoleSessionKeys(role);
    if (!keys) return false;

    const sessionId = normalizeText(payload && payload.sessionId) || normalizeText(keys && getSessionStorageValue(keys.id));
    const uid = normalizeText(payload && payload.uid);
    const hasDb = !!getRealtimeDatabase();
    if (!hasDb) return false;

    await logSessionEvent({
      role,
      action: 'logout',
      uid,
      sessionId
    });

    setSessionStorageValue(keys.id, '');
    setSessionStorageValue(keys.logId, '');

    return true;
  }

  function getActiveRoleSession(role) {
    const keys = getRoleSessionKeys(role);
    if (!keys) return { sessionId: '', logId: '' };
    return {
      sessionId: getSessionStorageValue(keys.id),
      logId: getSessionStorageValue(keys.logId)
    };
  }

  function subscribeSessionLogs(onData, onError, limit) {
    const rtdb = getRealtimeDatabase();
    if (!rtdb) return function () {};

    const maxItems = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 300;
    const ref = rtdb.ref(SESSION_LOGS_PATH).limitToLast(maxItems);

    const success = (snapshot) => {
      const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
      const items = Object.keys(value).map((id) => {
        const data = value[id] && typeof value[id] === 'object' ? value[id] : {};
        return Object.assign({ id }, data);
      }).sort((left, right) => getLogTimestamp(right) - getLogTimestamp(left));

      if (typeof onData === 'function') {
        onData(items);
      }
    };

    const failure = (error) => {
      if (typeof onError === 'function') {
        onError(error);
      }
    };

    ref.on('value', success, failure);
    return function unsubscribe() {
      ref.off('value', success);
    };
  }

  function subscribeSessionLogsByRoleAction(role, action, onData, onError, limit) {
    const rtdb = getRealtimeDatabase();
    if (!rtdb) return function () {};

    const safeOnData = typeof onData === 'function' ? onData : function () {};
    const safeOnError = typeof onError === 'function' ? onError : function () {};
    const maxItems = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 300;
    const path = getActionRoleLogPath(action, role);
    const ref = rtdb.ref(path).limitToLast(maxItems);

    const success = (snapshot) => {
      const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
      const items = Object.keys(value).map((id) => {
        const data = value[id] && typeof value[id] === 'object' ? value[id] : {};
        return Object.assign({ id }, data);
      }).sort((left, right) => getLogTimestamp(right) - getLogTimestamp(left));
      safeOnData(items);
    };

    const failure = (error) => {
      safeOnError(error);
    };

    ref.on('value', success, failure);
    return function unsubscribe() {
      ref.off('value', success);
    };
  }

  function subscribeSessionLogsByRole(role, onData, onError, limit) {
    const safeOnData = typeof onData === 'function' ? onData : function () {};
    const safeOnError = typeof onError === 'function' ? onError : function () {};
    const loginItems = [];
    const logoutItems = [];

    function emitMerged() {
      const merged = loginItems.concat(logoutItems)
        .sort((left, right) => getLogTimestamp(right) - getLogTimestamp(left));
      safeOnData(merged);
    }

    const unsubscribeLogin = subscribeSessionLogsByRoleAction(role, 'login', (items) => {
      loginItems.length = 0;
      Array.prototype.push.apply(loginItems, Array.isArray(items) ? items : []);
      emitMerged();
    }, safeOnError, limit);

    const unsubscribeLogout = subscribeSessionLogsByRoleAction(role, 'logout', (items) => {
      logoutItems.length = 0;
      Array.prototype.push.apply(logoutItems, Array.isArray(items) ? items : []);
      emitMerged();
    }, safeOnError, limit);

    return function unsubscribe() {
      if (typeof unsubscribeLogin === 'function') unsubscribeLogin();
      if (typeof unsubscribeLogout === 'function') unsubscribeLogout();
    };
  }

  const usersDatabase = {
    mode: core.mode,
    firebase: core.firebase,
    auth: core.auth,

    createUserWithEmail: profile.createUserWithEmail.bind(profile),
    getUserById: profile.getUserById.bind(profile),
    getUserByEmail: profile.getUserByEmail.bind(profile),
    updateUserProfile: profile.updateUserProfile.bind(profile),
    saveAddress: profile.saveAddress.bind(profile),
    getAddresses: profile.getAddresses.bind(profile),
    updateAddress: profile.updateAddress.bind(profile),
    deleteAddress: profile.deleteAddress.bind(profile),
    signInWithEmail: profile.signInWithEmail.bind(profile),
    signOut: profile.signOut.bind(profile),
    sendEmailVerificationCode: profile.sendEmailVerificationCode.bind(profile),
    verifyEmailVerificationCode: profile.verifyEmailVerificationCode.bind(profile),
    isEmailSignInLink: profile.isEmailSignInLink.bind(profile),
    completeEmailSignInLink: profile.completeEmailSignInLink.bind(profile),

    addBookingRequest: booking.addBookingRequest.bind(booking),
    formatRequestCode: booking.formatRequestCode.bind(booking),
    getBookingsForUser: booking.getBookingsForUser.bind(booking),
    getAllRequests: booking.getAllRequests.bind(booking),
    subscribeBookingsForUser: booking.subscribeBookingsForUser.bind(booking),
    subscribeAllRequests: booking.subscribeAllRequests.bind(booking),
    updateBookingRequestStatus: booking.updateBookingRequestStatus.bind(booking),
    cancelBookingRequest: booking.cancelBookingRequest.bind(booking),
    syncScheduleLockForRequest: booking.syncScheduleLockForRequest.bind(booking),

    logSessionEvent,
    subscribeSessionLogs,
    subscribeSessionLogsByRole,
    subscribeSessionLogsByRoleAction,
    startRoleSession,
    endRoleSession,
    getActiveRoleSession
  };

  window.usersDatabase = usersDatabase;
  window.homefixDB = usersDatabase;
  console.log('usersDatabase initialized in ' + core.mode + ' mode (modular).');
})();
