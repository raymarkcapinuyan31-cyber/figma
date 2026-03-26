document.addEventListener('DOMContentLoaded', async () => {
  const reg = window.hfsRegister || {};
  const db = window.usersDatabase || window.userProfileDatabase;
  const isHttpContext = /^https?:$/i.test(String(window.location.protocol || ''));

  const form = document.querySelector('.register-form');
  const fields = {
    first: document.getElementById('first'),
    middle: document.getElementById('middle'),
    last: document.getElementById('last'),
    suffix: document.getElementById('suffix'),
    birthdate: document.getElementById('birthdate'),
    email: document.getElementById('reg-email'),
    mobile: document.getElementById('reg-mobile'),
    otp: document.getElementById('reg-otp'),
    password: document.getElementById('reg-password'),
    password2: document.getElementById('reg-password2')
  };
  const passwordRuleItems = {
    length: document.getElementById('pwd-rule-length'),
    uppercase: document.getElementById('pwd-rule-uppercase'),
    lowercase: document.getElementById('pwd-rule-lowercase'),
    number: document.getElementById('pwd-rule-number'),
    special: document.getElementById('pwd-rule-special')
  };
  const suffixOptions = Array.from(document.querySelectorAll('input[name="suffixOption"]'));

  if (!form) return;
  let accountPrepared = false;
  let verificationSent = false;
  let hasSentVerificationLink = false;
  let emailVerified = false;
  let verificationPending = false;
  let verificationBaselineVerified = false;
  let verificationRequestedEmail = '';
  let activeVerificationRequestId = '';
  let requestTrackingEnabled = true;
  let orphanAuthRecovery = false;
  let trackingUnavailableNoticeShown = false;
  let fallbackAwaitingReturn = false;
  let fallbackHiddenAfterSend = false;
  let fallbackReturnedFromExternal = false;
  let verificationSendAt = 0;
  let verifiedEmail = '';
  let preparedAccountUid = '';
  let preparedWithTempPassword = false;
  const RESEND_COOLDOWN_SECONDS = 120;
  const PREPARE_ACCOUNT_TIMEOUT_MS = 15000;
  const SEND_VERIFICATION_TIMEOUT_MS = 15000;
  const FINALIZE_ACCOUNT_TIMEOUT_MS = 15000;
  const PROFILE_WRITE_TIMEOUT_MS = 12000;
  const FAST_PROFILE_WRITE_TIMEOUT_MS = 12000;
  const FINALIZE_PREPARE_TIMEOUT_MS = 7000;
  const SEND_PREPARE_WAIT_TIMEOUT_MS = 10000;
  const SEND_LINK_WAIT_TIMEOUT_MS = 10000;
  const RESEND_COOLDOWN_UNTIL_KEY = 'hfs_register_resend_cooldown_until';
  const VERIFICATION_REQUEST_KEY = 'hfs_register_verification_request';
  const VERIFIED_REQUEST_ID_KEY = 'hfs_register_verified_request_id';
  const PROFILE_CACHE_KEY = 'hfs_profile_cache_v1';
  const PENDING_REGISTER_SYNC_KEY = 'hfs_register_pending_sync_v1';
  const REGISTER_WELCOME_FLAG_KEY = 'hfs_show_welcome_on_dashboard';
  let resendCooldownTimer = null;
  let verificationWatcherTimer = null;
  let resendRemaining = 0;
  let prepareAccountPromise = null;
  let prepareAccountEmail = '';
  let prepareAccountFailed = null;
  let prepareAccountDebounceTimer = null;
  let lastProfileWriteError = null;
  const TEMP_PASSWORD_STORAGE_KEY = 'hfs_register_temp_passwords';

  function normalizeCacheEmail(value) {
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

  function saveProfileCache(profile, authUser) {
    const uid = String((profile && (profile.uid || profile.id)) || (authUser && authUser.uid) || '').trim();
    const email = normalizeCacheEmail((profile && profile.email) || (authUser && authUser.email) || '');
    if (!uid && !email) return;

    const store = readProfileCacheStore();
    const record = {
      uid,
      email,
      first_name: String(profile && profile.first_name ? profile.first_name : '').trim(),
      middle_name: String(profile && profile.middle_name ? profile.middle_name : '').trim(),
      last_name: String(profile && profile.last_name ? profile.last_name : '').trim(),
      suffix: String(profile && profile.suffix ? profile.suffix : '').trim(),
      birthdate: String(profile && profile.birthdate ? profile.birthdate : '').trim(),
      mobile_e164: String(profile && profile.mobile_e164 ? profile.mobile_e164 : '').trim(),
      role: String(profile && profile.role ? profile.role : '').trim(),
      updatedAt: Date.now()
    };

    if (uid) store.byUid[uid] = record;
    if (email) store.byEmail[email] = record;
    writeProfileCacheStore(store);
  }

  function setResendCooldownUntil(untilMs) {
    try {
      sessionStorage.setItem(RESEND_COOLDOWN_UNTIL_KEY, String(untilMs || 0));
    } catch (_) {
    }
  }

  function getResendCooldownUntil() {
    try {
      const raw = sessionStorage.getItem(RESEND_COOLDOWN_UNTIL_KEY);
      const value = Number(raw);
      return Number.isFinite(value) ? value : 0;
    } catch (_) {
      return 0;
    }
  }

  function clearResendCooldownUntil() {
    try {
      sessionStorage.removeItem(RESEND_COOLDOWN_UNTIL_KEY);
    } catch (_) {
    }
  }

  function readVerificationRequest() {
    try {
      const raw = sessionStorage.getItem(VERIFICATION_REQUEST_KEY);
      const parsed = JSON.parse(raw || '{}');
      return {
        requestId: String(parsed && parsed.requestId ? parsed.requestId : ''),
        email: String(parsed && parsed.email ? parsed.email : '').trim().toLowerCase(),
        createdAt: Number(parsed && parsed.createdAt ? parsed.createdAt : 0) || 0
      };
    } catch (_) {
      return { requestId: '', email: '', createdAt: 0 };
    }
  }

  function saveVerificationRequest(requestId, email) {
    try {
      sessionStorage.setItem(VERIFICATION_REQUEST_KEY, JSON.stringify({
        requestId: String(requestId || ''),
        email: String(email || '').trim().toLowerCase(),
        createdAt: Date.now()
      }));
    } catch (_) {
    }
  }

  function clearVerificationRequest() {
    try {
      sessionStorage.removeItem(VERIFICATION_REQUEST_KEY);
    } catch (_) {
    }
  }

  function markOpenedVerificationRequest(requestId) {
    const value = String(requestId || '').trim();
    if (!value) return;
    try {
      sessionStorage.setItem(VERIFIED_REQUEST_ID_KEY, value);
    } catch (_) {
    }
  }

  function getOpenedVerificationRequest() {
    try {
      return String(sessionStorage.getItem(VERIFIED_REQUEST_ID_KEY) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function clearOpenedVerificationRequest() {
    try {
      sessionStorage.removeItem(VERIFIED_REQUEST_ID_KEY);
    } catch (_) {
    }
  }

  function buildVerificationRequestId() {
    return 'vr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function getVerificationParamsFromUrl() {
    try {
      const url = new URL(window.location.href);
      let rid = String(url.searchParams.get('rid') || '').trim();
      let oobCode = String(url.searchParams.get('oobCode') || '').trim();

      const continueUrl = String(url.searchParams.get('continueUrl') || '').trim();
      if (continueUrl) {
        const nested = new URL(continueUrl);
        if (!rid) rid = String(nested.searchParams.get('rid') || '').trim();
        if (!oobCode) oobCode = String(nested.searchParams.get('oobCode') || '').trim();
      }

      return { rid, oobCode };
    } catch (_) {
      return { rid: '', oobCode: '' };
    }
  }

  function consumeVerificationParamsFromCurrentUrl() {
    const params = getVerificationParamsFromUrl();
    if (params.rid) {
      markOpenedVerificationRequest(params.rid);
    }

    return params;
  }

  function clearVerificationParamsFromCurrentUrl() {
    try {
      const clean = new URL(window.location.href);
      clean.searchParams.delete('rid');
      clean.searchParams.delete('oobCode');
      clean.searchParams.delete('mode');
      clean.searchParams.delete('apiKey');
      clean.searchParams.delete('lang');
      if (clean.searchParams.has('continueUrl')) {
        clean.searchParams.delete('continueUrl');
      }
      window.history.replaceState({}, document.title, clean.pathname + clean.search + clean.hash);
    } catch (_) {
    }
  }

  function resetVerificationState() {
    accountPrepared = false;
    verificationSent = false;
    hasSentVerificationLink = false;
    emailVerified = false;
    verificationPending = false;
    verificationBaselineVerified = false;
    verificationRequestedEmail = '';
    activeVerificationRequestId = '';
    requestTrackingEnabled = true;
    orphanAuthRecovery = false;
    trackingUnavailableNoticeShown = false;
    fallbackAwaitingReturn = false;
    fallbackHiddenAfterSend = false;
    fallbackReturnedFromExternal = false;
    verificationSendAt = 0;
    verifiedEmail = '';
    preparedAccountUid = '';
    preparedWithTempPassword = false;
    if (resendCooldownTimer) {
      clearInterval(resendCooldownTimer);
      resendCooldownTimer = null;
    }
    if (verificationWatcherTimer) {
      clearInterval(verificationWatcherTimer);
      verificationWatcherTimer = null;
    }
    resendRemaining = 0;
    prepareAccountPromise = null;
    prepareAccountEmail = '';
    prepareAccountFailed = null;
    if (prepareAccountDebounceTimer) {
      clearTimeout(prepareAccountDebounceTimer);
      prepareAccountDebounceTimer = null;
    }
    clearResendCooldownUntil();
    clearVerificationRequest();
    clearOpenedVerificationRequest();
    if (sendOtpBtn) {
      sendOtpBtn.disabled = false;
      sendOtpBtn.textContent = 'SEND LINK';
    }
  }

  function buildTempPassword(email = '') {
    const seed = String(email || '').trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) >>> 0;
    }
    const token = (hash || 0).toString(36).padStart(6, '0').slice(-6);
    return `T${token}a1!`;
  }

  function readTempPasswordMap() {
    try {
      return JSON.parse(localStorage.getItem(TEMP_PASSWORD_STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function writeTempPasswordMap(map) {
    try {
      localStorage.setItem(TEMP_PASSWORD_STORAGE_KEY, JSON.stringify(map || {}));
    } catch (_) {
    }
  }

  function saveTempPassword(email, password) {
    const key = String(email || '').trim().toLowerCase();
    if (!key || !password) return;
    const map = readTempPasswordMap();
    map[key] = String(password);
    writeTempPasswordMap(map);
  }

  function getTempPassword(email) {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return '';
    const map = readTempPasswordMap();
    return String(map[key] || '');
  }

  function clearTempPassword(email) {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return;
    const map = readTempPasswordMap();
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      delete map[key];
      writeTempPasswordMap(map);
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

  function savePendingRegisterSync(uid, item) {
    const key = String(uid || '').trim();
    if (!key) return;
    const map = readPendingRegisterSyncMap();
    map[key] = Object.assign({}, item || {}, {
      uid: key,
      updatedAt: Date.now()
    });
    writePendingRegisterSyncMap(map);
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

  async function flushPendingRegisterSyncForCurrentUser() {
    const auth = window.usersDatabase && window.usersDatabase.auth ? window.usersDatabase.auth : null;
    const authUser = auth && auth.currentUser ? auth.currentUser : null;
    const uid = String(authUser && authUser.uid ? authUser.uid : '').trim();
    if (!uid) return;

    const map = readPendingRegisterSyncMap();
    const item = map[uid];
    if (!item || typeof item !== 'object') return;

    const hasProfile = !!(item.profilePayload && typeof item.profilePayload === 'object');
    const needsPassword = !!item.needsPasswordUpdate;

    try {
      if (needsPassword && typeof authUser.updatePassword === 'function' && item.password) {
        await withTimeout(
          authUser.updatePassword(String(item.password || '')),
          3000,
          'Updating password timed out. Please try again.'
        );
      }

      if (hasProfile && window.usersDatabase && typeof window.usersDatabase.updateUserProfile === 'function') {
        await withTimeout(
          window.usersDatabase.updateUserProfile(uid, item.profilePayload),
          3000,
          'Saving profile timed out. Please continue; profile will sync shortly.'
        );
      }

      clearPendingRegisterSync(uid);
      clearTempPassword(String(item && item.email ? item.email : ''));
    } catch (_) {
    }
  }

  async function writeUserProfileFastToCustomersNode(uid, profilePayload) {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid || !profilePayload) return false;
    lastProfileWriteError = null;

    if (!(window.firebase && typeof window.firebase.database === 'function')) {
      const err = new Error('Firebase Realtime Database SDK is unavailable.');
      err.code = 'database/not-available';
      lastProfileWriteError = err;
      return false;
    }

    try {
      const authSvc = window.firebase && window.firebase.auth ? window.firebase.auth() : null;
      let activeAuthUser = authSvc && authSvc.currentUser ? authSvc.currentUser : null;
      if (!activeAuthUser && authSvc && typeof authSvc.onAuthStateChanged === 'function') {
        activeAuthUser = await new Promise((resolve) => {
          let settled = false;
          let unsub = null;
          const done = (user) => {
            if (settled) return;
            settled = true;
            if (typeof unsub === 'function') {
              try { unsub(); } catch (_) {}
            }
            resolve(user || null);
          };

          const timer = setTimeout(() => {
            done(authSvc.currentUser || null);
          }, 3500);

          unsub = authSvc.onAuthStateChanged((user) => {
            if (!user) return;
            clearTimeout(timer);
            done(user);
          });
        });
      }

      if (!activeAuthUser || !activeAuthUser.uid) {
        const err = new Error('Authentication session not ready for profile write.');
        err.code = 'auth/unauthenticated';
        lastProfileWriteError = err;
        return false;
      }

      const db = window.firebase.database();
      const serverTs = window.firebase.database.ServerValue && window.firebase.database.ServerValue.TIMESTAMP
        ? window.firebase.database.ServerValue.TIMESTAMP
        : Date.now();

      const data = Object.assign({}, profilePayload, {
        uid: cleanUid,
        role: 'customer',
        isActive: true,
        isVerified: true,
        emailVerified: true,
        updatedAt: serverTs,
        createdAt: serverTs
      });

      await db.ref(`customers/${cleanUid}`).update(data);
      try {
        await db.ref(`users/${cleanUid}`).remove();
      } catch (_) {
      }
      return true;
    } catch (err) {
      lastProfileWriteError = err || null;
      return false;
    }
  }

  async function getAuthUserForSave(timeoutMs = 1200) {
    const auth = getAuthService();
    if (!auth) return null;
    if (auth.currentUser && auth.currentUser.uid) return auth.currentUser;

    return new Promise((resolve) => {
      let settled = false;
      let unsubscribe = null;
      const done = (user) => {
        if (settled) return;
        settled = true;
        if (unsubscribe) {
          try { unsubscribe(); } catch (_) {}
        }
        resolve(user || null);
      };

      const timer = setTimeout(() => {
        done(auth.currentUser && auth.currentUser.uid ? auth.currentUser : null);
      }, Math.max(600, Number(timeoutMs) || 1200));

      if (typeof auth.onAuthStateChanged === 'function') {
        unsubscribe = auth.onAuthStateChanged((user) => {
          if (user && user.uid) {
            clearTimeout(timer);
            done(user);
          }
        });
      }
    });
  }

  async function attachUnverifiedExistingAccount(email, passwordCandidates) {
    if (!db || typeof db.signInWithEmail !== 'function') return false;

    const tried = new Set();
    for (const candidateRaw of (passwordCandidates || [])) {
      const candidate = String(candidateRaw || '');
      if (!candidate || tried.has(candidate)) continue;
      tried.add(candidate);

      try {
        const user = await db.signInWithEmail(email, candidate);
        const authUser = (window.usersDatabase && window.usersDatabase.auth && window.usersDatabase.auth.currentUser)
          ? window.usersDatabase.auth.currentUser
          : user;

        if (authUser && authUser.emailVerified) {
          const completedProfile = await hasCompletedProfileForUser(authUser.uid);
          if (completedProfile) {
            if (db && typeof db.signOut === 'function') await db.signOut();
            return false;
          }
        }

        accountPrepared = true;
        verifiedEmail = email;
        preparedAccountUid = String(authUser && authUser.uid ? authUser.uid : '').trim();
        preparedWithTempPassword = candidate === getTempPassword(email) || candidate === buildTempPassword(email);
        return true;
      } catch (_) {
      }
    }

    return false;
  }

  async function removeUnverifiedExistingAccount(email, passwordCandidates) {
    if (!db || typeof db.signInWithEmail !== 'function') return false;

    const tried = new Set();
    for (const candidateRaw of (passwordCandidates || [])) {
      const candidate = String(candidateRaw || '');
      if (!candidate || tried.has(candidate)) continue;
      tried.add(candidate);

      try {
        const user = await db.signInWithEmail(email, candidate);
        const authUser = (window.usersDatabase && window.usersDatabase.auth && window.usersDatabase.auth.currentUser)
          ? window.usersDatabase.auth.currentUser
          : user;

        if (!authUser || authUser.emailVerified) {
          if (db && typeof db.signOut === 'function') await db.signOut();
          return false;
        }

        if (typeof authUser.delete === 'function') {
          await authUser.delete();
        }
        if (db && typeof db.signOut === 'function') await db.signOut();
        clearTempPassword(email);
        return true;
      } catch (_) {
      }
    }

    return false;
  }

  function extractVerificationCode(value) {
    const text = String(value || '').trim();
    if (!text) return '';

    try {
      const url = new URL(text);
      const fromQuery = url.searchParams.get('oobCode');
      if (fromQuery) return fromQuery.trim();
    } catch (_) {
    }

    const queryMatch = text.match(/[?&]oobCode=([^&]+)/i);
    if (queryMatch && queryMatch[1]) {
      try {
        return decodeURIComponent(queryMatch[1]).trim();
      } catch (_) {
        return String(queryMatch[1]).trim();
      }
    }

    return text;
  }

  function getFriendlyError(err, fallback, context = 'verification') {
    const rawCode = String((err && err.code) || '').toLowerCase();
    const rawMsg = String((err && err.message) || '');
    const scope = String(context || 'verification').toLowerCase();

    if (rawCode.includes('internal') || /^internal$/i.test(rawMsg.trim())) return 'Verification service is temporarily unavailable. Please try again.';
    if (rawCode.includes('resource-exhausted')) {
      return 'Please wait before requesting another code.';
    }
    if (rawCode.includes('deadline-exceeded')) {
      if (scope === 'verification') {
        return 'Verification code expired. Please request a new code.';
      }
      return 'Request timed out. Please try again.';
    }
    if (rawCode.includes('permission-denied') && scope === 'verification') {
      return 'Invalid verification code. Please check and try again.';
    }
    if (rawCode.includes('permission-denied') && scope === 'send') {
      return 'Unable to send verification link right now. Please try again.';
    }
    if (rawCode.includes('too-many-requests')) {
      if (scope === 'send') {
        return 'Too many attempts on this device. Please wait a few minutes and try again.';
      }
      return 'Too many attempts. Please wait a few minutes and try again.';
    }
    if (rawCode.includes('invalid-action-code') && scope === 'verification') {
      return 'Invalid or expired email verification code.';
    }
    if (rawCode.includes('unauthenticated') && scope === 'verification') {
      return 'Please send a verification link first.';
    }
    if (rawCode.includes('operation-not-allowed') && scope === 'send') {
      return 'Email link sending is not enabled in Firebase Authentication settings.';
    }
    if (rawCode.includes('operation-not-allowed') && scope === 'registration') {
      return 'Email/Password sign-in is disabled in Firebase Auth. Enable it to register new accounts.';
    }
    if (rawCode.includes('network-request-failed')) {
      return 'Network error. Please check your internet connection and try again.';
    }
    if (rawCode.includes('api-key-not-valid')) {
      return 'Firebase API key is invalid for this app configuration.';
    }
    if (rawCode.includes('quota-exceeded') && scope === 'send') {
      return 'Daily email quota reached. Please try again tomorrow or use a different Firebase project for testing.';
    }
    if (rawCode.includes('unavailable') || rawCode.includes('not-found') || rawCode.includes('unimplemented')) {
      return 'Verification service is unavailable right now.';
    }

    return rawMsg || fallback;
  }

  async function withTimeout(promise, timeoutMs, timeoutMessage) {
    const ms = Math.max(1000, Number(timeoutMs) || 8000);
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

  function isTimeoutLikeError(err) {
    const code = String((err && err.code) || '').toLowerCase();
    const msg = String((err && err.message) || '').toLowerCase();
    return code.includes('deadline-exceeded') || msg.includes('timed out') || msg.includes('timeout');
  }

  Object.values(fields).forEach((f) => {
    if (!f) return;
    if (f === fields.birthdate || f === fields.otp) return;
    f.addEventListener('input', () => reg.clearError(f));
  });

  reg.applyBirthdateConstraints(fields.birthdate);
  reg.bindBirthdateAutoFormat(fields.birthdate);
  fields.birthdate.addEventListener('input', () => {
    const liveErr = (fields.birthdate.validity && fields.birthdate.validity.badInput)
      ? 'Please enter a valid birthdate.'
      : reg.validateBirthdateLive(fields.birthdate.value);
    if (liveErr) reg.setError(fields.birthdate, liveErr);
    else reg.clearError(fields.birthdate);
  });

  fields.email.addEventListener('blur', () => {
    const value = String(fields.email.value || '').trim().toLowerCase();
    fields.email.value = value;
    const err = reg.validateEmailField(fields.email);
    if (err) {
      reg.setError(fields.email, err);
      return;
    }
    reg.clearError(fields.email);

    if (accountPrepared && value !== verifiedEmail) {
      resetVerificationState();
      reg.setError(fields.email, 'Email changed. Send a new verification link.');
    }

    // Keep blur lightweight; account preparation runs on explicit SEND LINK/CREATE actions.
  });

  fields.email.addEventListener('input', () => {
    const value = String(fields.email.value || '').trim().toLowerCase();
    if (prepareAccountDebounceTimer) {
      clearTimeout(prepareAccountDebounceTimer);
      prepareAccountDebounceTimer = null;
    }
    if (!value) {
      prepareAccountPromise = null;
      prepareAccountEmail = '';
      prepareAccountFailed = null;
      return;
    }
    prepareAccountDebounceTimer = setTimeout(() => {
      prepareAccountDebounceTimer = null;
      if (currentStep < 2) return;
      const emailErr = reg.validateEmailField(fields.email);
      if (emailErr) return;
      if (prepareAccountEmail === value && prepareAccountPromise) return;
      warmupPreparedAccountForEmail(value).catch(() => {});
    }, 280);
  });

  fields.first.addEventListener('blur', () => {
    const err = reg.validateFirstNameField(fields.first);
    if (!err) {
      fields.first.value = reg.titleCaseName(fields.first.value);
      reg.clearError(fields.first);
    } else {
      reg.setError(fields.first, err);
    }
  });

  fields.middle.addEventListener('blur', () => {
    const normalizedMiddle = typeof reg.normalizeMiddleInitial === 'function'
      ? reg.normalizeMiddleInitial(fields.middle.value)
      : String(fields.middle.value || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 1);
    fields.middle.value = normalizedMiddle;
    const err = reg.validateMiddleNameField(fields.middle);
    if (!err && (fields.middle.value || '').trim()) fields.middle.value = normalizedMiddle;
    else if (err) reg.setError(fields.middle, err);
  });

  fields.middle.addEventListener('input', () => {
    const normalizedMiddle = typeof reg.normalizeMiddleInitial === 'function'
      ? reg.normalizeMiddleInitial(fields.middle.value)
      : String(fields.middle.value || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 1);
    if (fields.middle.value !== normalizedMiddle) {
      fields.middle.value = normalizedMiddle;
    }
    if (normalizedMiddle) {
      reg.clearError(fields.middle);
    }
  });

  fields.last.addEventListener('blur', () => {
    const err = reg.validateLastNameField(fields.last);
    if (!err) {
      fields.last.value = reg.titleCaseName(fields.last.value);
      reg.clearError(fields.last);
    } else {
      reg.setError(fields.last, err);
    }
  });

  function syncSuffixFromRadio() {
    if (!fields.suffix) return;
    const selected = suffixOptions.find((opt) => opt && opt.checked);
    fields.suffix.value = selected ? String(selected.value || '').trim() : '';
  }

  function syncSuffixRadioFromField() {
    if (!suffixOptions.length || !fields.suffix) return;
    const normalized = typeof reg.normalizeSuffix === 'function'
      ? reg.normalizeSuffix(fields.suffix.value)
      : String(fields.suffix.value || '').trim();
    const target = normalized == null ? '' : normalized;

    if (!String(target || '').trim()) {
      suffixOptions.forEach((opt) => {
        opt.checked = false;
      });
      fields.suffix.value = '';
      return;
    }

    let matched = false;
    suffixOptions.forEach((opt) => {
      const isMatch = String(opt.value || '') === String(target || '');
      opt.checked = isMatch;
      if (isMatch) matched = true;
    });
    if (!matched) {
      suffixOptions.forEach((opt) => {
        opt.checked = false;
      });
      fields.suffix.value = '';
    }
  }

  if (fields.suffix) {
    syncSuffixRadioFromField();
  }

  if (suffixOptions.length) {
    suffixOptions.forEach((opt) => {
      opt.addEventListener('change', () => {
        syncSuffixFromRadio();
        const err = reg.validateSuffixField(fields.suffix);
        if (err) reg.setError(fields.suffix, err);
        else reg.clearError(fields.suffix);
      });
    });
  }

  fields.suffix.addEventListener('blur', () => {
    const normalized = typeof reg.normalizeSuffix === 'function'
      ? reg.normalizeSuffix(fields.suffix.value)
      : String(fields.suffix.value || '').trim();
    fields.suffix.value = normalized == null ? '' : normalized;
    syncSuffixRadioFromField();
    const err = reg.validateSuffixField(fields.suffix);
    if (err) reg.setError(fields.suffix, err);
    else reg.clearError(fields.suffix);
  });

  fields.birthdate.addEventListener('blur', () => {
    const normalizedBirthdate = reg.normalizeBirthdateValue(fields.birthdate.value);
    if (normalizedBirthdate && fields.birthdate.value !== normalizedBirthdate) {
      fields.birthdate.value = normalizedBirthdate;
    }
    const err = reg.validateBirthdateField(fields.birthdate);
    if (err) reg.setError(fields.birthdate, err);
    else {
      fields.birthdate.value = reg.normalizeBirthdateValue(fields.birthdate.value);
      reg.clearError(fields.birthdate);
    }
  });

  fields.mobile.addEventListener('blur', () => {
    const v = (fields.mobile.value || '').trim();
    if (v.startsWith('09')) fields.mobile.value = '+63' + v.slice(1);
    const err = reg.validateMobileField(fields.mobile);
    if (err) reg.setError(fields.mobile, err);
    else reg.clearError(fields.mobile);
  });

  if (fields.otp) {
    fields.otp.addEventListener('blur', () => {
      const value = String(fields.otp.value || '').trim();
      if (!value) {
        reg.clearError(fields.otp);
        return;
      }
      const err = reg.validateOtpField(fields.otp);
      if (err) reg.setError(fields.otp, err);
      else reg.clearError(fields.otp);
    });
  }

  document.querySelectorAll('.password-toggle').forEach((btn) => {
    const target = document.querySelector(btn.dataset.target);
    const img = btn.querySelector('img');
    if (!target || !img) return;
    btn.addEventListener('click', () => {
      const hidden = target.type === 'password';
      target.type = hidden ? 'text' : 'password';
      img.src = hidden ? '../../images/icons/eye-open.svg' : '../../images/icons/eye-closed.svg';
      img.alt = hidden ? 'Hide password' : 'Show password';
      btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      btn.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
    });
  });

  function updatePasswordRuleHighlights(value) {
    const password = String(value || '');
    const checks = {
      length: password.length >= 8 && password.length <= 12,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[^\w\s]/.test(password)
    };

    Object.keys(passwordRuleItems).forEach((key) => {
      const el = passwordRuleItems[key];
      if (!el) return;
      el.classList.toggle('met', !!checks[key]);
    });
  }

  if (fields.password) {
    updatePasswordRuleHighlights(fields.password.value);
    fields.password.addEventListener('input', () => {
      updatePasswordRuleHighlights(fields.password.value);
    });
  }

  const stepTitle = document.getElementById('stepTitle');
  const stepChips = Array.from(document.querySelectorAll('[data-step-chip]'));
  const stepPanels = Array.from(document.querySelectorAll('.form-step'));
  const nextToStep2Btn = document.getElementById('nextToStep2Btn');
  const createAccountBtn = document.getElementById('createAccountBtn');
  const backBtnStep1 = document.getElementById('backBtnStep1');
  const backToStep1Btn = document.getElementById('backToStep1Btn');
  const backToStep2Btn = document.getElementById('backToStep2Btn');
  const successPanel = document.getElementById('successPanel');
  const successCard = successPanel ? successPanel.querySelector('.success-card') : null;
  const notifyPanel = document.getElementById('notifyPanel');
  const notifyMessage = document.getElementById('notifyMessage');
  const sendOtpBtn = document.getElementById('sendOtpBtn');
  let currentStep = 1;
  let notifyTimer = null;

  const step1Sequence = [
    { el: fields.first, fn: reg.validateFirstNameField },
    { el: fields.middle, fn: reg.validateMiddleNameField },
    { el: fields.last, fn: reg.validateLastNameField },
    { el: fields.suffix, fn: reg.validateSuffixField },
    { el: fields.birthdate, fn: reg.validateBirthdateField },
    { el: fields.mobile, fn: reg.validateMobileField }
  ];
  const step3Sequence = [
    { el: fields.password, fn: reg.validatePasswordField },
    { el: fields.password2, fn: (el) => reg.validateConfirmField(el, fields.password) }
  ];

  function startResendCooldown(initialSeconds = RESEND_COOLDOWN_SECONDS) {
    if (!sendOtpBtn) return;

    if (resendCooldownTimer) {
      clearInterval(resendCooldownTimer);
      resendCooldownTimer = null;
    }

    resendRemaining = Math.max(1, Math.ceil(Number(initialSeconds) || RESEND_COOLDOWN_SECONDS));
    const cooldownUntil = Date.now() + (resendRemaining * 1000);
    setResendCooldownUntil(cooldownUntil);
    sendOtpBtn.disabled = true;
    sendOtpBtn.textContent = `RESEND IN ${resendRemaining}s`;

    resendCooldownTimer = setInterval(() => {
      resendRemaining -= 1;
      if (resendRemaining <= 0) {
        clearInterval(resendCooldownTimer);
        resendCooldownTimer = null;
        clearResendCooldownUntil();
        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = hasSentVerificationLink ? 'RESEND LINK' : 'SEND LINK';
        return;
      }
      sendOtpBtn.textContent = `RESEND IN ${resendRemaining}s`;
    }, 1000);
  }

  function getResendCooldownRemainingSeconds() {
    const cooldownUntil = getResendCooldownUntil();
    if (!cooldownUntil) return 0;
    const remainingMs = cooldownUntil - Date.now();
    if (remainingMs <= 0) return 0;
    return Math.max(1, Math.ceil(remainingMs / 1000));
  }

  function getSendLinkButtonText() {
    return hasSentVerificationLink ? 'RESEND LINK' : 'SEND LINK';
  }

  function setVerificationError(message) {
    const target = fields.otp || fields.email;
    reg.setError(target, message);
  }

  function showNotification(message) {
    if (!notifyPanel || !notifyMessage) return;
    notifyMessage.textContent = String(message || '');
    notifyPanel.hidden = false;
    if (notifyTimer) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
    notifyTimer = setTimeout(() => {
      notifyPanel.hidden = true;
    }, 2200);
  }

  async function applyIncomingVerificationLink(params = {}) {
    if (!db) return false;

    const savedRequest = readVerificationRequest();
    const emailFromRequest = String(savedRequest && savedRequest.email ? savedRequest.email : '').trim().toLowerCase();
    const requestIdFromRequest = String(savedRequest && savedRequest.requestId ? savedRequest.requestId : '').trim();
    const requestIdFromLink = String(params && params.rid ? params.rid : '').trim();
    const fullLink = String(window.location.href || '').trim();

    const finalizeVerifiedState = () => {
      if (emailFromRequest) {
        verificationRequestedEmail = emailFromRequest;
        if (fields.email) fields.email.value = emailFromRequest;
      }

      emailVerified = true;
      verificationSent = true;
      verificationPending = false;
      verifiedEmail = emailFromRequest || String(fields.email && fields.email.value ? fields.email.value : '').trim().toLowerCase();

      if (resendCooldownTimer) {
        clearInterval(resendCooldownTimer);
        resendCooldownTimer = null;
      }
      if (verificationWatcherTimer) {
        clearInterval(verificationWatcherTimer);
        verificationWatcherTimer = null;
      }

      clearResendCooldownUntil();
      clearVerificationRequest();
      clearOpenedVerificationRequest();
      clearVerificationParamsFromCurrentUrl();

      if (sendOtpBtn) {
        sendOtpBtn.disabled = true;
        sendOtpBtn.textContent = 'VERIFIED';
      }

      showStep(3);
      if (fields.password) fields.password.focus();
    };

    if (requestTrackingEnabled && requestIdFromRequest && requestIdFromLink && requestIdFromRequest !== requestIdFromLink) {
      setVerificationError('This is not the latest verification link. Please use the newest link sent to your email.');
      return false;
    }

    try {
      if (typeof db.isEmailSignInLink === 'function' && typeof db.completeEmailSignInLink === 'function') {
        const isSignInLink = await db.isEmailSignInLink(fullLink);
        if (isSignInLink) {
          const emailForSignIn = emailFromRequest || String(fields.email && fields.email.value ? fields.email.value : '').trim().toLowerCase();
          if (!emailForSignIn) {
            setVerificationError('Missing email for verification link. Please send a new link.');
            return false;
          }

          await db.completeEmailSignInLink(emailForSignIn, fullLink);
          finalizeVerifiedState();
          return true;
        }
      }
    } catch (_) {
      return false;
    }

    const cleanCode = String(params && params.oobCode ? params.oobCode : '').trim();
    if (!cleanCode || typeof db.verifyEmailVerificationCode !== 'function') return false;

    try {
      await db.verifyEmailVerificationCode(cleanCode);
      finalizeVerifiedState();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function checkEmailVerifiedAndAdvance() {
    if (!verificationPending) return false;

    const auth = getAuthService();
    if (!auth) return false;

    const expectedEmail = String(fields.email && fields.email.value ? fields.email.value : '').trim().toLowerCase();
    if (!expectedEmail || verificationRequestedEmail !== expectedEmail) return false;

    let activeUser = auth.currentUser;
    let currentEmail = String(activeUser && activeUser.email ? activeUser.email : '').trim().toLowerCase();
    if (!activeUser || currentEmail !== expectedEmail) {
      const candidates = [getTempPassword(expectedEmail), buildTempPassword(expectedEmail), String(fields.password.value || '')].filter(Boolean);
      if (db && typeof db.signInWithEmail === 'function') {
        const tried = new Set();
        for (const candidate of candidates) {
          if (tried.has(candidate)) continue;
          tried.add(candidate);
          try {
            await db.signInWithEmail(expectedEmail, candidate);
            activeUser = auth.currentUser;
            currentEmail = String(activeUser && activeUser.email ? activeUser.email : '').trim().toLowerCase();
            if (activeUser && currentEmail === expectedEmail) break;
          } catch (_) {
          }
        }
      }
    }

    if (!activeUser || currentEmail !== expectedEmail) return false;

    if (requestTrackingEnabled) {
      const latestRequest = readVerificationRequest();
      const openedRequestId = getOpenedVerificationRequest();
      const requiredRequestId = String(activeVerificationRequestId || latestRequest.requestId || '').trim();
      if (requiredRequestId && openedRequestId && openedRequestId !== requiredRequestId) return false;
      if (requiredRequestId && openedRequestId === requiredRequestId) {
        activeVerificationRequestId = requiredRequestId;
      }
    }

    try {
      await activeUser.reload();
      if (!activeUser.emailVerified) return false;

      emailVerified = true;
      verificationSent = true;
      verificationPending = false;
      verifiedEmail = expectedEmail;
      fallbackAwaitingReturn = false;
      fallbackHiddenAfterSend = false;
      fallbackReturnedFromExternal = false;
      reg.clearError(fields.email);

      if (resendCooldownTimer) {
        clearInterval(resendCooldownTimer);
        resendCooldownTimer = null;
      }
      if (verificationWatcherTimer) {
        clearInterval(verificationWatcherTimer);
        verificationWatcherTimer = null;
      }
      clearResendCooldownUntil();
      clearVerificationRequest();
      clearOpenedVerificationRequest();

      if (sendOtpBtn) {
        sendOtpBtn.disabled = true;
        sendOtpBtn.textContent = 'VERIFIED';
      }

      showStep(3);
      if (fields.password) fields.password.focus();
      return true;
    } catch (_) {
      return false;
    }
  }

  function startVerificationWatcher() {
    if (!verificationPending) return;
    if (verificationWatcherTimer) return;
    verificationWatcherTimer = setInterval(() => {
      checkEmailVerifiedAndAdvance();
    }, 1500);
  }

  function setupVerificationReturnChecks() {
    window.addEventListener('focus', () => {
      if (!verificationPending) return;
      if (fallbackAwaitingReturn && fallbackHiddenAfterSend) {
        fallbackReturnedFromExternal = true;
      }
      void checkEmailVerifiedAndAdvance();
    });

    document.addEventListener('visibilitychange', () => {
      if (!verificationPending) return;
      if (document.visibilityState === 'hidden') {
        if (fallbackAwaitingReturn) fallbackHiddenAfterSend = true;
        return;
      }
      if (fallbackAwaitingReturn && fallbackHiddenAfterSend) {
        fallbackReturnedFromExternal = true;
      }
      void checkEmailVerifiedAndAdvance();
    });
  }

  function updateStepTitle(step) {
    if (!stepTitle) return;
    stepTitle.textContent = `Step ${step} of 3`;
  }

  function updateStepIndicator(step) {
    stepChips.forEach((chip) => {
      const chipStep = Number(chip.dataset.stepChip) || 0;
      chip.classList.toggle('is-active', chipStep === step);
      chip.classList.toggle('is-complete', chipStep > 0 && chipStep < step);
    });
  }

  function showStep(step) {
    const nextStep = Number(step) || 1;
    currentStep = nextStep;
    stepPanels.forEach((panel) => {
      panel.hidden = Number(panel.dataset.step) !== nextStep;
    });
    updateStepTitle(nextStep);
    updateStepIndicator(nextStep);
  }

  function validateSequence(sequence) {
    let firstInvalid = null;

    for (const item of (sequence || [])) {
      const msg = item.fn(item.el);
      if (msg) {
        reg.setError(item.el, msg);
        if (!firstInvalid) firstInvalid = item.el;
        continue;
      }
      reg.clearError(item.el);
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return false;
    }

    return true;
  }

  showStep(1);
  const incomingVerificationParams = consumeVerificationParamsFromCurrentUrl();
  const hasIncomingVerificationParams = !!(incomingVerificationParams && (incomingVerificationParams.oobCode || incomingVerificationParams.rid));
  if (incomingVerificationParams && (incomingVerificationParams.oobCode || incomingVerificationParams.rid)) {
    await applyIncomingVerificationLink(incomingVerificationParams);
  }
  setupVerificationReturnChecks();

  if (sendOtpBtn) {
    if (!hasIncomingVerificationParams) {
      clearResendCooldownUntil();
      clearVerificationRequest();
      clearOpenedVerificationRequest();
      hasSentVerificationLink = false;
      verificationSent = false;
      verificationPending = false;
      verificationRequestedEmail = '';
      activeVerificationRequestId = '';
      requestTrackingEnabled = true;
      if (fields.email) {
        fields.email.value = '';
      }
      sendOtpBtn.disabled = false;
      sendOtpBtn.textContent = 'SEND LINK';
    } else if (sendOtpBtn.textContent === 'SENDING...') {
      sendOtpBtn.textContent = getSendLinkButtonText();
    }
  }

  function collectPayload() {
    const mobileVal = (fields.mobile.value || '').trim();
    const mobileE164 = mobileVal ? (mobileVal.startsWith('09') ? '+63' + mobileVal.slice(1) : mobileVal) : null;

    return {
      first_name: reg.titleCaseName(fields.first.value),
      middle_name: typeof reg.normalizeMiddleInitial === 'function'
        ? reg.normalizeMiddleInitial(fields.middle.value)
        : String(fields.middle.value || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 1),
      last_name: reg.titleCaseName(fields.last.value),
      suffix: String(fields.suffix.value || '').trim().replace(/\s+/g, ' '),
      birthdate: reg.normalizeBirthdateValue(fields.birthdate.value),
      email: String(fields.email.value || '').trim().toLowerCase(),
      mobile_e164: mobileE164
    };
  }

  function validateEmailOnlyForSendCode() {
    const msg = reg.validateEmailField(fields.email);
    if (msg) {
      reg.setError(fields.email, msg);
      fields.email.focus();
      return false;
    }
    reg.clearError(fields.email);
    return true;
  }

  function getAuthService() {
    if (window.usersDatabase && window.usersDatabase.auth) return window.usersDatabase.auth;
    if (window.userProfileDatabase && window.userProfileDatabase.auth) return window.userProfileDatabase.auth;
    if (window.homefixUsersCore && window.homefixUsersCore.auth) return window.homefixUsersCore.auth;
    return null;
  }

  function getEmailAuthProvider() {
    if (window.firebase && window.firebase.auth && window.firebase.auth.EmailAuthProvider) {
      return window.firebase.auth.EmailAuthProvider;
    }
    return null;
  }

  async function tryRecoverAuthSessionForEmail(email) {
    const targetEmail = String(email || '').trim().toLowerCase();
    if (!targetEmail || !db || typeof db.signInWithEmail !== 'function') return false;

    const candidates = [
      getTempPassword(targetEmail),
      buildTempPassword(targetEmail),
      String(fields.password.value || '')
    ].filter(Boolean);

    const tried = new Set();
    for (const candidate of candidates) {
      if (tried.has(candidate)) continue;
      tried.add(candidate);
      try {
        await db.signInWithEmail(targetEmail, candidate);
        const auth = getAuthService();
        const currentEmail = String(auth && auth.currentUser && auth.currentUser.email ? auth.currentUser.email : '').trim().toLowerCase();
        if (currentEmail === targetEmail) return true;
      } catch (_) {
      }
    }

    return false;
  }

  async function hasCompletedProfileForUser(uid) {
    if (!uid || !db || typeof db.getUserById !== 'function') return false;
    try {
      const profile = await db.getUserById(uid);
      if (!profile) return false;
      return !!(
        String(profile.first_name || '').trim() ||
        String(profile.last_name || '').trim() ||
        String(profile.suffix || '').trim() ||
        String(profile.birthdate || '').trim() ||
        String(profile.mobile_e164 || '').trim()
      );
    } catch (_) {
      return false;
    }
  }

  async function deleteVerifiedDraftForReverification(email) {
    const auth = getAuthService();
    const targetEmail = String(email || '').trim().toLowerCase();
    if (!targetEmail) return false;

    const candidates = [getTempPassword(targetEmail), buildTempPassword(targetEmail), String(fields.password.value || '')].filter(Boolean);
    const emailAuthProvider = getEmailAuthProvider();

    let activeUser = auth && auth.currentUser ? auth.currentUser : null;
    let activeEmail = String(activeUser && activeUser.email ? activeUser.email : '').trim().toLowerCase();

    if (!activeUser || activeEmail !== targetEmail) {
      for (const candidate of candidates) {
        try {
          if (!db || typeof db.signInWithEmail !== 'function') break;
          await db.signInWithEmail(targetEmail, candidate);
          activeUser = auth && auth.currentUser ? auth.currentUser : null;
          activeEmail = String(activeUser && activeUser.email ? activeUser.email : '').trim().toLowerCase();
          if (activeUser && activeEmail === targetEmail) break;
        } catch (_) {
        }
      }
    }

    if (!activeUser || activeEmail !== targetEmail) return false;

    try {
      if (typeof activeUser.reload === 'function') {
        await activeUser.reload();
      }
    } catch (_) {
    }

    try {
      if (typeof activeUser.delete === 'function') {
        await activeUser.delete();
      }
      if (db && typeof db.signOut === 'function') {
        await db.signOut();
      }
      clearTempPassword(targetEmail);
      return true;
    } catch (deleteErr) {
      const deleteCode = String((deleteErr && deleteErr.code) || '').toLowerCase();
      if (!deleteCode.includes('requires-recent-login')) {
        return false;
      }
    }

    if (typeof activeUser.reauthenticateWithCredential === 'function' && emailAuthProvider && typeof emailAuthProvider.credential === 'function') {
      let reauthed = false;
      for (const candidate of candidates) {
        try {
          const credential = emailAuthProvider.credential(targetEmail, candidate);
          await activeUser.reauthenticateWithCredential(credential);
          reauthed = true;
          break;
        } catch (_) {
        }
      }
      if (!reauthed) {
        return false;
      }
    }

    try {
      if (typeof activeUser.delete === 'function') {
        await activeUser.delete();
      }
      if (db && typeof db.signOut === 'function') {
        await db.signOut();
      }
      clearTempPassword(targetEmail);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function ensurePreparedAccount(payload, options = {}) {
    const allowMinimal = !!options.allowMinimal;
    const auth = getAuthService();
    if (!auth || typeof auth.createUserWithEmailAndPassword !== 'function') {
      throw new Error('Registration is not available right now — auth module not loaded.');
    }
    orphanAuthRecovery = false;

    const currentAuthUser = auth.currentUser;
    if (currentAuthUser && !currentAuthUser.emailVerified) {
      const currentEmail = String(currentAuthUser.email || '').toLowerCase();
      const targetEmail = String(payload.email || '').toLowerCase();
      if (currentEmail && targetEmail && currentEmail !== targetEmail) {
        try {
          if (typeof currentAuthUser.delete === 'function') {
            await currentAuthUser.delete();
          }
        } catch (_) {
        }
        try {
          if (db && typeof db.signOut === 'function') await db.signOut();
        } catch (_) {
        }
      }
    }

    if (currentAuthUser && String(currentAuthUser.email || '').toLowerCase() === String(payload.email || '').toLowerCase()) {
      if (currentAuthUser.emailVerified) {
        const completedProfile = await hasCompletedProfileForUser(currentAuthUser.uid);
        if (completedProfile) {
          const err = new Error('That email is already in use.');
          err.code = 'auth/email-already-in-use';
          throw err;
        }
        accountPrepared = true;
        verifiedEmail = String(payload.email || '').toLowerCase();
        preparedAccountUid = String(currentAuthUser && currentAuthUser.uid ? currentAuthUser.uid : '').trim();
        return;
      } else {
        accountPrepared = true;
        verifiedEmail = String(payload.email || '').toLowerCase();
        preparedAccountUid = String(currentAuthUser && currentAuthUser.uid ? currentAuthUser.uid : '').trim();
        return;
      }
    }

    if (accountPrepared) {
      if (payload.email !== verifiedEmail) {
        throw new Error('Email changed. Send a new verification link.');
      }
      const authUserNow = auth && auth.currentUser ? auth.currentUser : null;
      if (authUserNow && authUserNow.uid) {
        preparedAccountUid = String(authUserNow.uid || '').trim();
      }
      return;
    }

    let createPassword = String(fields.password.value || '');

    if (allowMinimal) {
      const hasStrongPassword = !reg.validatePasswordField(fields.password);
      const hasMatchingPassword = !reg.validateConfirmField(fields.password2, fields.password);
      if (!(hasStrongPassword && hasMatchingPassword)) {
        createPassword = buildTempPassword(payload.email);
        preparedWithTempPassword = true;
      } else {
        preparedWithTempPassword = false;
      }
    }

    try {
      const credential = await withTimeout(
        auth.createUserWithEmailAndPassword(payload.email, createPassword),
        PREPARE_ACCOUNT_TIMEOUT_MS,
        'Preparing account timed out. Please try again.'
      );
      const createdUser = credential && credential.user ? credential.user : (auth && auth.currentUser ? auth.currentUser : null);
      if (createdUser && createdUser.uid) {
        preparedAccountUid = String(createdUser.uid || '').trim();
      }
    } catch (err) {
      const code = String((err && err.code) || '').toLowerCase();
      if (isTimeoutLikeError(err)) {
        const recoveredUser = await getAuthUserForSave(4500);
        const recoveredEmail = String(recoveredUser && recoveredUser.email ? recoveredUser.email : '').trim().toLowerCase();
        if (recoveredUser && recoveredUser.uid && recoveredEmail === String(payload.email || '').toLowerCase()) {
          preparedAccountUid = String(recoveredUser.uid || '').trim();
        } else {
          throw err;
        }
      } else if (code === 'auth/email-already-in-use') {
        const activeUser = auth.currentUser;
        const activeEmail = String(activeUser && activeUser.email ? activeUser.email : '').toLowerCase();
        if (activeUser && activeEmail === String(payload.email || '').toLowerCase() && !activeUser.emailVerified) {
          accountPrepared = true;
          verifiedEmail = payload.email;
          preparedAccountUid = String(activeUser && activeUser.uid ? activeUser.uid : '').trim();
          return;
        }

        const inUseErr = new Error('That email is already in use. Please use a different email.');
        inUseErr.code = 'auth/email-already-in-use';
        throw inUseErr;
      } else {
        throw err;
      }
    }

    if (allowMinimal && preparedWithTempPassword) {
      saveTempPassword(payload.email, createPassword);
    }

    accountPrepared = true;
    verifiedEmail = payload.email;
    preparedAccountUid = String(auth && auth.currentUser && auth.currentUser.uid ? auth.currentUser.uid : '').trim();
  }

  async function warmupPreparedAccountForEmail(email) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) return;
    if (accountPrepared && cleanEmail === verifiedEmail) return;

    if (prepareAccountPromise && prepareAccountEmail === cleanEmail) {
      return prepareAccountPromise;
    }

    prepareAccountEmail = cleanEmail;
    prepareAccountFailed = null;
    prepareAccountPromise = (async () => {
      try {
        await ensurePreparedAccount({ email: cleanEmail }, { allowMinimal: true });
      } catch (err) {
        prepareAccountFailed = err;
      }
    })();

    try {
      await prepareAccountPromise;
    } finally {
      prepareAccountPromise = null;
    }
  }

  if (sendOtpBtn) {
    const initialCooldownSeconds = getResendCooldownRemainingSeconds();
    if (initialCooldownSeconds > 0) {
      startResendCooldown(initialCooldownSeconds);
    }

    sendOtpBtn.addEventListener('click', async () => {
      reg.clearError(fields.otp);

      const remainingCooldownSeconds = getResendCooldownRemainingSeconds();
      if (remainingCooldownSeconds > 0) {
        startResendCooldown(remainingCooldownSeconds);
        setVerificationError(`Please wait ${remainingCooldownSeconds}s before requesting another link.`);
        return;
      }

      if (!validateEmailOnlyForSendCode()) {
        return;
      }

      const payload = {
        email: String(fields.email.value || '').trim().toLowerCase()
      };

      if (!db || typeof db.sendEmailVerificationCode !== 'function') {
        reg.setError(fields.otp, 'Email verification service is not available right now.');
        return;
      }

      sendOtpBtn.disabled = true;
      sendOtpBtn.textContent = 'SENDING...';
      try {
        const alreadyPreparedForEmail = !!(
          accountPrepared
          && preparedAccountUid
          && verifiedEmail
          && verifiedEmail === payload.email
        );

        if (alreadyPreparedForEmail) {
          // Fast path: skip re-preparing when the account is already staged for this email.
        } else {
          prepareAccountPromise = null;
          prepareAccountEmail = '';
          prepareAccountFailed = null;

          try {
            await ensurePreparedAccount(payload, { allowMinimal: true });
          } catch (prepErr) {
            if (!isTimeoutLikeError(prepErr)) throw prepErr;
            await ensurePreparedAccount(payload, { allowMinimal: true });
          }
        }

        const requestId = buildVerificationRequestId();
        activeVerificationRequestId = requestId;
        verificationRequestedEmail = payload.email;
        verificationBaselineVerified = false;

        let sendResult = null;
        let sendError = null;

        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            sendResult = await db.sendEmailVerificationCode({ requestId });
            sendError = null;
            break;
          } catch (firstErr) {
            sendError = firstErr;
            if (!isTimeoutLikeError(firstErr) || attempt === 1) {
              break;
            }
          }
        }

        if (!sendResult) {
          throw sendError || new Error('Failed to send verification link.');
        }

        requestTrackingEnabled = isHttpContext && !(sendResult && sendResult.requestTrackingEnabled === false);
        clearOpenedVerificationRequest();
        saveVerificationRequest(requestId, payload.email);
        if (!requestTrackingEnabled) {
          activeVerificationRequestId = '';
          trackingUnavailableNoticeShown = false;
        }

        verificationSendAt = Date.now();
        fallbackAwaitingReturn = !requestTrackingEnabled;
        fallbackHiddenAfterSend = false;
        fallbackReturnedFromExternal = false;

        verificationSent = true;
        hasSentVerificationLink = true;
        emailVerified = false;
        verificationPending = true;

        startResendCooldown(RESEND_COOLDOWN_SECONDS);
        startVerificationWatcher();
        showNotification('Email verification link has been sent!');
        void checkEmailVerifiedAndAdvance();
      } catch (err) {
        const rawCode = String((err && err.code) || '').toLowerCase();
        if (rawCode.includes('too-many-requests')) {
          startResendCooldown(RESEND_COOLDOWN_SECONDS);
        }
        const msg = getFriendlyError(err, 'Failed to send verification link.', 'send');
        setVerificationError(msg);
        if (!rawCode.includes('too-many-requests')) {
          sendOtpBtn.disabled = false;
          sendOtpBtn.textContent = getSendLinkButtonText();
        }
      } finally {
        if (!resendCooldownTimer && sendOtpBtn.textContent === 'SENDING...') {
          sendOtpBtn.disabled = false;
          sendOtpBtn.textContent = getSendLinkButtonText();
        }
      }
    });
  }

  if (nextToStep2Btn) {
    nextToStep2Btn.addEventListener('click', () => {
      if (!validateSequence(step1Sequence)) return;
      showStep(2);
      if (fields.email) fields.email.focus();
    });
  }

  if (backBtnStep1) {
    backBtnStep1.addEventListener('click', () => window.history.back());
  }

  if (backToStep1Btn) {
    backToStep1Btn.addEventListener('click', () => showStep(1));
  }

  if (backToStep2Btn) {
    backToStep2Btn.addEventListener('click', () => showStep(2));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (currentStep !== 3) {
      return;
    }

    if (!validateSequence(step1Sequence)) {
      showStep(1);
      return;
    }

    if (!emailVerified) {
      const verifiedNow = await checkEmailVerifiedAndAdvance();
      if (!verifiedNow && !emailVerified) {
        setVerificationError('Verify your email first.');
        showStep(2);
        if (fields.email) fields.email.focus();
        return;
      }
    }

    if (!validateSequence(step3Sequence)) return;

    const payload = collectPayload();

    if (createAccountBtn) {
      createAccountBtn.disabled = true;
      createAccountBtn.textContent = 'CREATING...';
    }

    try {
      const auth = getAuthService();
      const activeUser = auth && auth.currentUser ? auth.currentUser : null;
      const activeEmail = String(activeUser && activeUser.email ? activeUser.email : '').trim().toLowerCase();
      const payloadEmail = String(payload.email || '').trim().toLowerCase();
      const hasPreparedVerifiedAccount = !!(emailVerified && preparedAccountUid && verifiedEmail === payloadEmail);
      const canUseInstantCreatePath = !!(
        (emailVerified && activeUser && activeEmail && activeEmail === payloadEmail)
        || hasPreparedVerifiedAccount
      );

      if (canUseInstantCreatePath) {
        accountPrepared = true;
        verifiedEmail = payloadEmail;
        if (activeUser && activeUser.uid) {
          preparedAccountUid = String(activeUser.uid || '').trim();
        }
      } else {
        await ensurePreparedAccount(payload);
      }

      if (payload.email !== verifiedEmail) {
        resetVerificationState();
        reg.setError(fields.email, 'Email changed. Send a new verification link.');
        fields.email.focus();
        showStep(2);
        return;
      }

      const authUser = (auth && auth.currentUser && auth.currentUser.uid)
        ? auth.currentUser
        : await getAuthUserForSave(5000);
      const targetUid = String((authUser && authUser.uid) || preparedAccountUid || '').trim();
      if (!targetUid) {
        throw new Error('Unable to finalize account session. Please try again.');
      }
      if (targetUid) {
        let writeAuthUser = (auth && auth.currentUser && auth.currentUser.uid)
          ? auth.currentUser
          : null;

        if (!writeAuthUser || String(writeAuthUser.uid || '').trim() !== targetUid) {
          const signInCandidates = [
            String(fields.password.value || ''),
            getTempPassword(payload.email),
            buildTempPassword(payload.email)
          ].filter(Boolean);

          const tried = new Set();
          if (db && typeof db.signInWithEmail === 'function') {
            for (const candidate of signInCandidates) {
              if (tried.has(candidate)) continue;
              tried.add(candidate);
              try {
                await db.signInWithEmail(payload.email, candidate);
                const signedInNow = (auth && auth.currentUser && auth.currentUser.uid) ? auth.currentUser : null;
                if (signedInNow && String(signedInNow.uid || '').trim() === targetUid) {
                  writeAuthUser = signedInNow;
                  break;
                }
              } catch (_) {
              }
            }
          }
        }

        if (!writeAuthUser || String(writeAuthUser.uid || '').trim() !== targetUid) {
          const err = new Error('Unable to restore your authenticated session for Realtime Database write. Please verify email and try again.');
          err.code = 'auth/unauthenticated';
          throw err;
        }

        const baseProfilePayload = {
          uid: targetUid,
          first_name: payload.first_name,
          middle_name: payload.middle_name,
          last_name: payload.last_name,
          suffix: payload.suffix,
          birthdate: payload.birthdate,
          mobile_e164: payload.mobile_e164,
          isVerified: true,
          emailVerified: true
        };

        const profileWritePayload = Object.assign({}, baseProfilePayload, {
          role: 'customer',
          email: payload.email
        });

        saveProfileCache(profileWritePayload, authUser);

        const wroteDirectlyToCustomersNode = await writeUserProfileFastToCustomersNode(targetUid, profileWritePayload);
        if (!wroteDirectlyToCustomersNode) {
          const err = lastProfileWriteError || new Error('Unable to save account data to Firebase Realtime Database customers node.');
          if (!err.code) err.code = 'permission-denied';
          throw err;
        }

        const pendingNeedsPasswordUpdate = !!preparedWithTempPassword;
        const pendingProfilePayload = null;

        savePendingRegisterSync(targetUid, {
          email: payload.email,
          password: pendingNeedsPasswordUpdate ? String(fields.password.value || '') : '',
          needsPasswordUpdate: pendingNeedsPasswordUpdate,
          profilePayload: pendingProfilePayload,
          createdAt: Date.now()
        });
        try {
          await withTimeout(
            flushPendingRegisterSyncForCurrentUser(),
            3500,
            'Finalizing account sync timed out. Your account will continue syncing in the background.'
          );
        } catch (_) {
        }
        preparedWithTempPassword = false;
      }

      resetVerificationState();
      try {
        sessionStorage.setItem(REGISTER_WELCOME_FLAG_KEY, '1');
      } catch (_) {
      }
      window.location.href = 'dashboard.html';
    } catch (err) {
      let msg = 'Registration failed. Please try again.';
      if (err && err.code) {
        switch (err.code) {
          case 'auth/email-already-in-use':
            msg = 'That email is already in use.';
            reg.setError(fields.email, msg);
            fields.email.focus();
            break;
          case 'auth/weak-password':
            msg = 'Password is too weak.';
            reg.setError(fields.password, msg);
            fields.password.focus();
            break;
          case 'profile/invalid-birthdate':
            msg = 'Please enter a valid birthdate.';
            reg.setError(fields.birthdate, msg);
            fields.birthdate.focus();
            break;
          case 'permission-denied':
            msg = 'Unable to finish creating your account right now. Please try again.';
            break;
          default:
            msg = getFriendlyError(err, msg, 'registration');
        }
      } else {
        msg = getFriendlyError(err, msg, 'registration');
      }
      setVerificationError(msg);
      alert(msg);
    } finally {
      if (createAccountBtn) {
        createAccountBtn.disabled = false;
        createAccountBtn.textContent = 'CREATE';
      }
    }
  });
});
