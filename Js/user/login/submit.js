(function () {
  const ns = (window.hfsLogin = window.hfsLogin || {});
  const TECHNICIAN_DEMO_EMAIL = 'technician@gmail.com';
  const TECHNICIAN_DEMO_PASSWORD = '@Sample123';
  const TECHNICIAN_DEMO_SESSION_KEY = 'hfs_technician_demo_session';
  const ADMIN_DEMO_USERNAME = 'admin';
  const ADMIN_DEMO_PASSWORD = 'admin123';
  const ADMIN_DEMO_SESSION_KEY = 'hfs_admin_demo_session';
  const ADMIN_DEMO_AUTH_KEY = 'hfs_admin_demo_firebase_auth_v1';
  const PROFILE_CACHE_KEY = 'hfs_profile_cache_v1';
  const DISABLED_ACCOUNT_MESSAGE = 'Your account has been disabled. Please contact the administrator for assistance.';
  const FORCED_TECHNICIAN_EMAILS = new Set(['kingsnever721@gmail.com']);

  function normalizeLower(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeCacheEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeSpaces(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function parseTechnicianSkills(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => normalizeSpaces(entry).toLowerCase()).filter(Boolean);
    }

    return String(value || '')
      .split(/[,/|]/g)
      .map((entry) => normalizeSpaces(entry).toLowerCase())
      .filter(Boolean);
  }

  function hasValidTechnicianMobile(profile) {
    const mobileRaw = String(profile && (profile.mobile || profile.mobile_e164) || '').replace(/[\s\-()]/g, '').trim();
    return /^(\+639\d{9}|09\d{9})$/.test(mobileRaw);
  }

  function hasValidTechnicianLocation(profile) {
    const town = normalizeSpaces(profile && profile.town);
    const city = normalizeSpaces(profile && profile.city);
    const province = normalizeSpaces(profile && profile.province);
    if (town && city && province) return true;

    const location = normalizeSpaces(profile && (profile.location || profile.address));
    if (!location) return false;

    const parts = location
      .split(',')
      .map((entry) => normalizeSpaces(entry))
      .filter(Boolean);
    return parts.length >= 3;
  }

  function isTechnicianProfileComplete(profile) {
    const data = profile && typeof profile === 'object' ? profile : {};
    if (data.onboardingCompleted === true || data.profileCompleted === true) return true;

    const skillCandidates = [
      data.skills,
      data.specialties,
      data.serviceCategories,
      data.fields,
      data.field,
      data.primarySkill
    ];

    const skills = new Set();
    skillCandidates.forEach((entry) => {
      parseTechnicianSkills(entry).forEach((skill) => skills.add(skill));
    });
    if (!skills.size) return false;
    if (!hasValidTechnicianMobile(data)) return false;
    if (!hasValidTechnicianLocation(data)) return false;
    return true;
  }

  function getTechnicianLandingPath(profile) {
    return 'html/technician/dashboard.html';
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

  function readAdminDemoAuth() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ADMIN_DEMO_AUTH_KEY) || '{}');
      return {
        email: String(parsed && parsed.email ? parsed.email : '').trim().toLowerCase(),
        password: String(parsed && parsed.password ? parsed.password : '').trim()
      };
    } catch (_) {
      return { email: '', password: '' };
    }
  }

  function writeAdminDemoAuth(email, password) {
    try {
      localStorage.setItem(ADMIN_DEMO_AUTH_KEY, JSON.stringify({
        email: String(email || '').trim().toLowerCase(),
        password: String(password || '')
      }));
    } catch (_) {
    }
  }

  function clearAdminDemoAuth() {
    try {
      localStorage.removeItem(ADMIN_DEMO_AUTH_KEY);
    } catch (_) {
    }
  }

  function generateAdminDemoEmail() {
    return `admin.demo.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}@homefixsolution.app`;
  }

  function generateAdminDemoPassword() {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const symbols = '!@#$%^&*';
    const all = upper + lower + digits + symbols;

    const pick = (source) => source.charAt(Math.floor(Math.random() * source.length));
    const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];

    while (chars.length < 14) {
      chars.push(pick(all));
    }

    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = chars[i];
      chars[i] = chars[j];
      chars[j] = tmp;
    }

    return chars.join('');
  }

  function buildAdminPasswordCandidates() {
    const ts = Date.now().toString();
    return [
      generateAdminDemoPassword(),
      `HomeFixAdmin#${ts.slice(-6)}Aa1!`,
      `HFSecure${ts.slice(-8)}Aa11!!`,
      `Admin${ts.slice(-5)}Aa11@@##`
    ];
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
      birthdate: String(profile && profile.birthdate ? profile.birthdate : '').trim(),
      mobile_e164: String(profile && profile.mobile_e164 ? profile.mobile_e164 : '').trim(),
      role: String(profile && profile.role ? profile.role : '').trim(),
      updatedAt: Date.now()
    };

    if (uid) store.byUid[uid] = record;
    if (email) store.byEmail[email] = record;
    writeProfileCacheStore(store);
  }

  async function writeSessionLog(payload) {
    try {
      if (!window.usersDatabase || typeof window.usersDatabase.logSessionEvent !== 'function') return;
      await window.usersDatabase.logSessionEvent(payload || {});
    } catch (_) {
    }
  }

  async function startRoleSession(payload) {
    const db = window.usersDatabase;
    if (!db) return;
    if (typeof db.startRoleSession === 'function') {
      await db.startRoleSession(payload || {});
      return;
    }
    await writeSessionLog(payload || {});
  }

  async function enforceTechnicianAccount(uid, email, profile) {
    const cleanUid = String(uid || '').trim();
    const cleanEmail = normalizeLower(email);
    const source = profile && typeof profile === 'object' ? profile : {};

    if (!cleanUid || !cleanEmail || !FORCED_TECHNICIAN_EMAILS.has(cleanEmail)) {
      return source;
    }

    let hydrated = Object.assign({}, source);
    try {
      if (window.usersDatabase && typeof window.usersDatabase.getUserById === 'function') {
        const byId = await window.usersDatabase.getUserById(cleanUid);
        if (byId && typeof byId === 'object') {
          hydrated = Object.assign({}, hydrated, byId);
        }
      }
    } catch (_) {
    }

    if ((!hydrated.first_name || !String(hydrated.first_name).trim()) && window.usersDatabase && typeof window.usersDatabase.getUserByEmail === 'function') {
      try {
        const byEmail = await window.usersDatabase.getUserByEmail(cleanEmail);
        if (byEmail && typeof byEmail === 'object') {
          hydrated = Object.assign({}, hydrated, byEmail);
        }
      } catch (_) {
      }
    }

    const firstName = String(hydrated.first_name || '').trim();
    const middleName = String(hydrated.middle_name || '').trim();
    const lastName = String(hydrated.last_name || '').trim();

    const updates = {
      uid: cleanUid,
      email: cleanEmail,
      role: 'technician',
      isActive: hydrated.isActive !== false,
      isVerified: true,
      emailVerified: true,
      updatedAt: Date.now()
    };

    if (firstName) updates.first_name = firstName;
    if (middleName) updates.middle_name = middleName;
    if (lastName) updates.last_name = lastName;

    try {
      if (window.usersDatabase && typeof window.usersDatabase.updateUserProfile === 'function') {
        await window.usersDatabase.updateUserProfile(cleanUid, updates);
      }

      const rtdb = window.usersDatabase && window.usersDatabase.firebase && typeof window.usersDatabase.firebase.database === 'function'
        ? window.usersDatabase.firebase.database()
        : null;
      if (rtdb) {
        await rtdb.ref(`technicians/${cleanUid}`).update(updates);
        try {
          await rtdb.ref(`users/${cleanUid}`).remove();
        } catch (_) {
        }
        try {
          await rtdb.ref(`customers/${cleanUid}`).remove();
        } catch (_) {
        }
      }
    } catch (_) {
    }

    return Object.assign({}, hydrated, updates, { role: 'technician' });
  }

  async function ensureDemoAdminFirebaseSession() {
    if (!window.usersDatabase || typeof window.usersDatabase.signInWithEmail !== 'function') {
      const err = new Error('Firebase auth is unavailable.');
      err.code = 'auth/unavailable';
      throw err;
    }

    let authUser = window.usersDatabase.auth && window.usersDatabase.auth.currentUser
      ? window.usersDatabase.auth.currentUser
      : null;

    if (!authUser) {
      const saved = readAdminDemoAuth();
      if (saved.email && saved.password) {
        try {
          authUser = await window.usersDatabase.signInWithEmail(saved.email, saved.password);
        } catch (_) {
          clearAdminDemoAuth();
          authUser = null;
        }
      }
    }

    if (!authUser) {
      if (!window.usersDatabase.auth || typeof window.usersDatabase.auth.createUserWithEmailAndPassword !== 'function') {
        const err = new Error('Firebase create user is unavailable.');
        err.code = 'auth/unavailable';
        throw err;
      }

      const email = generateAdminDemoEmail();
      const passwordCandidates = buildAdminPasswordCandidates();
      let selectedPassword = '';
      let lastCreateError = null;

      for (let i = 0; i < passwordCandidates.length; i += 1) {
        const candidate = String(passwordCandidates[i] || '').trim();
        if (!candidate) continue;
        try {
          const credential = await window.usersDatabase.auth.createUserWithEmailAndPassword(email, candidate);
          authUser = credential && credential.user ? credential.user : null;
          selectedPassword = candidate;
          break;
        } catch (error) {
          lastCreateError = error;
          const code = String(error && error.code ? error.code : '').toLowerCase();
          const isPasswordPolicyError = code.includes('weak-password') || code.includes('password-does-not-meet-requirements');
          if (!isPasswordPolicyError) throw error;
        }
      }

      if (!authUser || !selectedPassword) {
        throw (lastCreateError || new Error('Unable to create demo admin auth user.'));
      }

      writeAdminDemoAuth(email, selectedPassword);
    }

    const email = String((authUser && authUser.email) || '').trim().toLowerCase();
    const uid = String((authUser && authUser.uid) || '').trim();
    if (!uid) return;

    if (typeof window.usersDatabase.updateUserProfile === 'function') {
      await window.usersDatabase.updateUserProfile(uid, {
        uid,
        email,
        first_name: 'Admin',
        middle_name: '',
        last_name: 'User',
        role: 'admin',
        isActive: true,
        isVerified: true,
        emailVerified: true,
        updatedAt: Date.now()
      });
    }
  }

  async function tryBootstrapExistingTechnician(email, password) {
    if (!window.usersDatabase || typeof window.usersDatabase.getUserByEmail !== 'function') return null;
    if (!window.usersDatabase.auth || typeof window.usersDatabase.auth.createUserWithEmailAndPassword !== 'function') return null;

    const existing = await window.usersDatabase.getUserByEmail(email);
    const existingRole = String(existing && existing.role ? existing.role : '').toLowerCase();
    if (!existing || existingRole !== 'technician') return null;

    const credential = await window.usersDatabase.auth.createUserWithEmailAndPassword(email, password);
    const authUser = credential && credential.user ? credential.user : null;
    if (!authUser || !authUser.uid) return null;

    if (typeof window.usersDatabase.updateUserProfile === 'function') {
      await window.usersDatabase.updateUserProfile(authUser.uid, {
        uid: authUser.uid,
        email,
        first_name: String(existing.first_name || '').trim(),
        middle_name: String(existing.middle_name || '').trim(),
        last_name: String(existing.last_name || '').trim(),
        role: 'technician',
        isActive: existing.isActive !== false,
        isVerified: true,
        emailVerified: true
      });
    }

    return {
      authUser,
      profile: Object.assign({}, existing, {
        uid: authUser.uid,
        email,
        role: 'technician'
      })
    };
  }

  async function resolveProfileFromRealtimeRoots(uid, email) {
    const cleanUid = String(uid || '').trim();
    const cleanEmail = normalizeLower(email);
    const db = window.usersDatabase;
    const rtdb = db && db.firebase && typeof db.firebase.database === 'function'
      ? db.firebase.database()
      : null;

    if (!rtdb || !cleanUid) return null;

    const [techSnap, customerSnap, userSnap] = await Promise.all([
      rtdb.ref(`technicians/${cleanUid}`).once('value'),
      rtdb.ref(`customers/${cleanUid}`).once('value'),
      rtdb.ref(`users/${cleanUid}`).once('value')
    ]);

    if (techSnap && techSnap.exists()) {
      const techData = techSnap.val() || {};
      return Object.assign({}, techData, { uid: cleanUid, email: cleanEmail || techData.email || '', role: 'technician' });
    }

    if (userSnap && userSnap.exists()) {
      const userData = userSnap.val() || {};
      const role = String(userData.role || '').trim().toLowerCase();
      if (role === 'technician' || role === 'admin' || role === 'customer') {
        return Object.assign({}, userData, { uid: cleanUid, email: cleanEmail || userData.email || '', role });
      }
    }

    if (customerSnap && customerSnap.exists()) {
      const customerData = customerSnap.val() || {};
      return Object.assign({}, customerData, { uid: cleanUid, email: cleanEmail || customerData.email || '', role: 'customer' });
    }

    return null;
  }

  async function resolveProfileFast(uid, email) {
    const db = window.usersDatabase;
    const tasks = [
      db && typeof db.getUserById === 'function'
        ? db.getUserById(uid).catch(() => null)
        : Promise.resolve(null),
      db && typeof db.getUserByEmail === 'function'
        ? db.getUserByEmail(email).catch(() => null)
        : Promise.resolve(null),
      resolveProfileFromRealtimeRoots(uid, email).catch(() => null)
    ];

    const [byId, byEmail, byRoots] = await Promise.all(tasks);
    return {
      profile: byId || byEmail || byRoots || null,
      byEmail: byEmail || null
    };
  }

  async function ensureIdentityEnabled(uid, email) {
    if (!window.usersDatabase || typeof window.usersDatabase.isAccountDisabledByIdentity !== 'function') {
      return true;
    }

    const disabled = await window.usersDatabase.isAccountDisabledByIdentity(uid, email);
    if (disabled) {
      try {
        await window.usersDatabase.signOut();
      } catch (_) {
      }
      return false;
    }

    return true;
  }

  ns.handleLogin = async function handleLogin(emailInput, passwordInput) {
    const identifier = (emailInput && emailInput.value ? emailInput.value : '').trim();
    const password = passwordInput && passwordInput.value ? passwordInput.value : '';
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

    if (emailInput) ns.clearError(emailInput);
    if (passwordInput) ns.clearError(passwordInput);

    if (!identifier) {
      ns.setError(emailInput, 'Email or admin username is required.');
      if (emailInput) emailInput.focus();
      return;
    }
    if (!password) {
      ns.setError(passwordInput, 'Password is required.');
      if (passwordInput) passwordInput.focus();
      return;
    }

    const normalizedIdentifier = identifier.toLowerCase();

    if (normalizedIdentifier === ADMIN_DEMO_USERNAME) {
      if (password !== ADMIN_DEMO_PASSWORD) {
        ns.setError(passwordInput, 'Invalid admin password.');
        if (passwordInput) passwordInput.focus();
        return;
      }

      // Non-blocking: admin demo access should still proceed even when Firebase auth bootstrap fails.
      ensureDemoAdminFirebaseSession().catch(() => {});

      try {
        sessionStorage.setItem(ADMIN_DEMO_SESSION_KEY, JSON.stringify({
          username: ADMIN_DEMO_USERNAME,
          role: 'admin',
          source: 'demo'
        }));
      } catch (_) {
      }

      startRoleSession({
        role: 'admin',
        email: ADMIN_DEMO_USERNAME,
        name: ADMIN_DEMO_USERNAME,
        source: 'demo-login'
      }).catch(() => {});

      window.location.href = 'html/admin/dashboard.html';
      return;
    }

    const isEmail = emailRegex.test(identifier);
    if (!isEmail) {
      ns.setError(emailInput, 'Please enter a valid email (sample@gmail.com or sample@yahoo.com).');
      if (emailInput) emailInput.focus();
      return;
    }

    const authEmail = normalizedIdentifier;

    if (authEmail === TECHNICIAN_DEMO_EMAIL && password === TECHNICIAN_DEMO_PASSWORD) {
      if (!(await ensureIdentityEnabled('', TECHNICIAN_DEMO_EMAIL))) {
        ns.setError(passwordInput, DISABLED_ACCOUNT_MESSAGE);
        if (passwordInput) passwordInput.focus();
        return;
      }

      let demoProfile = null;
      try {
        if (window.usersDatabase && typeof window.usersDatabase.getUserByEmail === 'function') {
          demoProfile = await window.usersDatabase.getUserByEmail(TECHNICIAN_DEMO_EMAIL);
        }
      } catch (_) {
      }

      if (demoProfile && demoProfile.isActive === false) {
        ns.setError(passwordInput, DISABLED_ACCOUNT_MESSAGE);
        if (passwordInput) passwordInput.focus();
        return;
      }

      try {
        sessionStorage.setItem(TECHNICIAN_DEMO_SESSION_KEY, JSON.stringify({
          email: TECHNICIAN_DEMO_EMAIL,
          role: 'technician',
          source: 'demo'
        }));
      } catch (_) {
      }

      startRoleSession({
        role: 'technician',
        email: TECHNICIAN_DEMO_EMAIL,
        name: 'Technician',
        source: 'demo-login'
      }).catch(() => {});

      window.location.href = getTechnicianLandingPath({
        email: TECHNICIAN_DEMO_EMAIL,
        role: 'technician'
      });
      return;
    }

    try {
      if (!window.usersDatabase || typeof window.usersDatabase.signInWithEmail !== 'function') {
        alert('Sign in is not available right now — database module not loaded.');
        return;
      }

      const user = await window.usersDatabase.signInWithEmail(authEmail, password);
      const authUser = (window.usersDatabase && window.usersDatabase.auth && window.usersDatabase.auth.currentUser)
        ? window.usersDatabase.auth.currentUser
        : user;
      const authUid = String(authUser && authUser.uid ? authUser.uid : '').trim();
      const effectiveEmail = String(authUser && authUser.email ? authUser.email : authEmail);

      if (!(await ensureIdentityEnabled(authUid, effectiveEmail))) {
        ns.setError(passwordInput, DISABLED_ACCOUNT_MESSAGE);
        if (passwordInput) passwordInput.focus();
        return;
      }

      const resolvedProfile = await resolveProfileFast(authUid, effectiveEmail);
      let profile = resolvedProfile.profile;

      if (resolvedProfile.byEmail && typeof window.usersDatabase.updateUserProfile === 'function') {
        const byEmail = resolvedProfile.byEmail;
        const resolvedRole = String(byEmail.role || '').toLowerCase();
        if (resolvedRole === 'technician' || resolvedRole === 'admin') {
          window.usersDatabase.updateUserProfile(authUid, {
            uid: authUid,
            email: effectiveEmail,
            first_name: String(byEmail.first_name || '').trim(),
            middle_name: String(byEmail.middle_name || '').trim(),
            last_name: String(byEmail.last_name || '').trim(),
            role: resolvedRole,
            isActive: byEmail.isActive !== false,
            isVerified: true,
            emailVerified: true
          }).catch(() => {});
        }
      }

      if (!profile) {
        try {
          await window.usersDatabase.signOut();
        } catch (_) {
        }
        ns.setError(passwordInput, 'Account profile is not ready yet. Please try again in a few seconds, or contact admin.');
        if (passwordInput) passwordInput.focus();
        return;
      }

      const normalizedLoginEmail = normalizeLower(effectiveEmail);
      const currentRole = String(profile && profile.role ? profile.role : '').toLowerCase();
      if (FORCED_TECHNICIAN_EMAILS.has(normalizedLoginEmail) && currentRole !== 'technician') {
        profile = await enforceTechnicianAccount(authUid, effectiveEmail, profile);
      } else if (FORCED_TECHNICIAN_EMAILS.has(normalizedLoginEmail)) {
        enforceTechnicianAccount(authUid, effectiveEmail, profile).catch(() => {});
      }

      saveProfileCache(profile, authUser);

      const role = String(profile && profile.role ? profile.role : '').toLowerCase();
      const isActive = !(profile && profile.isActive === false);

      if (!isActive || !(await ensureIdentityEnabled(authUid, effectiveEmail))) {
        ns.setError(passwordInput, DISABLED_ACCOUNT_MESSAGE);
        if (passwordInput) passwordInput.focus();
        return;
      }

      if (!role) {
        try {
          await window.usersDatabase.signOut();
        } catch (_) {
        }
        ns.setError(passwordInput, 'Account role is missing. Please contact admin to repair this account.');
        if (passwordInput) passwordInput.focus();
        return;
      }

      if (role !== 'technician' && !authUser.emailVerified) {
        try {
          await authUser.sendEmailVerification();
        } catch (_) {
        }
        await window.usersDatabase.signOut();
        ns.setError(passwordInput, 'Please verify your email first. We sent a new verification email.');
        if (passwordInput) passwordInput.focus();
        return;
      }

      if (profile && !profile.emailVerified && typeof window.usersDatabase.updateUserProfile === 'function') {
        window.usersDatabase.updateUserProfile(authUid, {
          emailVerified: true,
          isVerified: true
        }).catch(() => {});
      }

      if (role === 'admin') {
        startRoleSession({
          role: 'admin',
          uid: authUid,
          email: effectiveEmail,
          name: [profile && profile.first_name, profile && profile.last_name].filter(Boolean).join(' ').trim() || effectiveEmail,
          source: 'firebase-login'
        }).catch(() => {});
        window.location.href = 'html/admin/dashboard.html';
        return;
      }

      if (role === 'technician') {
        startRoleSession({
          role: 'technician',
          uid: authUid,
          email: effectiveEmail,
          name: [profile && profile.first_name, profile && profile.last_name].filter(Boolean).join(' ').trim() || effectiveEmail,
          source: 'firebase-login'
        }).catch(() => {});
        window.location.href = getTechnicianLandingPath(profile);
        return;
      }

      startRoleSession({
        role: 'customer',
        uid: authUid,
        email: effectiveEmail,
        name: [profile && profile.first_name, profile && profile.last_name].filter(Boolean).join(' ').trim() || effectiveEmail,
        source: 'firebase-login'
      }).catch(() => {});

      window.location.href = 'html/user/dashboard.html';
    } catch (err) {
      let msg = 'Sign in failed. Check your credentials.';
      if (err && err.code) {
        switch (err.code) {
          case 'auth/wrong-password':
            msg = 'Incorrect password.';
            ns.setError(passwordInput, msg);
            break;
          case 'auth/user-disabled':
            msg = DISABLED_ACCOUNT_MESSAGE;
            ns.setError(passwordInput, msg);
            break;
          case 'auth/user-not-found':
            try {
              const bootstrapped = await tryBootstrapExistingTechnician(authEmail, password);
              if (bootstrapped && bootstrapped.authUser) {
                if (bootstrapped.profile && bootstrapped.profile.isActive === false) {
                  try {
                    await window.usersDatabase.signOut();
                  } catch (_) {
                  }
                  ns.setError(passwordInput, DISABLED_ACCOUNT_MESSAGE);
                  if (passwordInput) passwordInput.focus();
                  return;
                }
                if (!(await ensureIdentityEnabled(bootstrapped.authUser.uid, authEmail))) {
                  ns.setError(passwordInput, DISABLED_ACCOUNT_MESSAGE);
                  if (passwordInput) passwordInput.focus();
                  return;
                }
                saveProfileCache(bootstrapped.profile, bootstrapped.authUser);
                startRoleSession({
                  role: 'technician',
                  uid: bootstrapped.authUser.uid,
                  email: authEmail,
                  name: [bootstrapped.profile && bootstrapped.profile.first_name, bootstrapped.profile && bootstrapped.profile.last_name].filter(Boolean).join(' ').trim() || authEmail,
                  source: 'bootstrap-login'
                }).catch(() => {});
                window.location.href = getTechnicianLandingPath(bootstrapped.profile);
                return;
              }
            } catch (_) {
            }
            msg = 'Invalid email or password.';
            ns.setError(passwordInput, msg);
            break;
          case 'auth/invalid-credential':
          case 'auth/invalid-login-credentials':
            msg = 'Invalid email or password.';
            ns.setError(passwordInput, msg);
            break;
          case 'auth/too-many-requests':
            msg = 'Too many attempts. Try again later.';
            ns.setError(passwordInput, msg);
            break;
          case 'auth/invalid-email':
            msg = 'Please enter a valid email (sample@gmail.com or sample@yahoo.com).';
            ns.setError(emailInput, msg);
            break;
          case 'permission-denied':
          case 'firestore/permission-denied':
            try {
              await window.usersDatabase.signOut();
            } catch (_) {
            }
            msg = DISABLED_ACCOUNT_MESSAGE;
            ns.setError(passwordInput, msg);
            break;
          default:
            msg = err.message || msg;
            ns.setError(passwordInput, msg);
        }
      } else {
        msg = err.message || msg;
        ns.setError(passwordInput, msg);
      }
    }
  };
})();
