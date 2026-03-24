(function () {
  const usersDb = window.usersDatabase || window.homefixDB || null;
  const DEMO_SESSION_KEY = 'hfs_technician_demo_session';
  const DEMO_PROFILE_KEY = 'hfs_technician_demo_profile_v1';
  const FORCED_TECHNICIAN_EMAILS = new Set(['kingsnever721@gmail.com']);
  const LOGIN_NOTICE_KEY = 'hfs_login_notice';
  const DISABLED_ACCOUNT_MESSAGE = 'Your account has been disabled. Please contact the administrator for assistance.';
  const SKILL_OPTIONS = ['HVAC Technician', 'Appliance Repair Technician', 'Electrician', 'Plumber'];
  const PSGC_BASE_URL = 'https://psgc.gitlab.io/api';
  const NORTH_LUZON_PROVINCES = [
    { name: 'Abra', code: '140100000' },
    { name: 'Apayao', code: '148100000' },
    { name: 'Aurora', code: '037700000' },
    { name: 'Bataan', code: '030800000' },
    { name: 'Batanes', code: '020900000' },
    { name: 'Benguet', code: '141100000' },
    { name: 'Bulacan', code: '031400000' },
    { name: 'Cagayan', code: '021500000' },
    { name: 'Ifugao', code: '142700000' },
    { name: 'Ilocos Norte', code: '012800000' },
    { name: 'Ilocos Sur', code: '012900000' },
    { name: 'Isabela', code: '023100000' },
    { name: 'Kalinga', code: '143200000' },
    { name: 'La Union', code: '013300000' },
    { name: 'Mountain Province', code: '144400000' },
    { name: 'Nueva Ecija', code: '034900000' },
    { name: 'Nueva Vizcaya', code: '025000000' },
    { name: 'Pampanga', code: '035400000' },
    { name: 'Pangasinan', code: '015500000' },
    { name: 'Quirino', code: '025700000' },
    { name: 'Tarlac', code: '036900000' },
    { name: 'Zambales', code: '037100000' }
  ];

  const provinceCityCache = new Map();
  const cityTownCache = new Map();
  let onboardingLocationController = null;
  let stopDisabledStateWatcher = null;
  let disabledStatePollTimer = null;
  let currentDisabledStateUser = null;
  let disabledResumeChecksBound = false;

  function normalizeSpaces(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
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

  function clearDisabledStatePolling() {
    if (!disabledStatePollTimer) return;
    clearInterval(disabledStatePollTimer);
    disabledStatePollTimer = null;
  }

  async function forceDisabledAccountLogout() {
    rememberDisabledAccountNotice();
    if (usersDb && typeof usersDb.signOut === 'function') {
      try { await usersDb.signOut(); } catch (_) {}
    }
    window.location.href = '../../login.html';
  }

  async function isDisabledIdentity(uid, email) {
    if (!uid || !usersDb || typeof usersDb.isAccountDisabledByIdentity !== 'function') return false;
    try {
      return await usersDb.isAccountDisabledByIdentity(uid, email || '');
    } catch (_) {
      return false;
    }
  }

  async function runDisabledStateCheckNow() {
    const activeUser = currentDisabledStateUser || (usersDb && usersDb.auth ? usersDb.auth.currentUser : null);
    if (!activeUser || !activeUser.uid) return;
    if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState === 'hidden') return;
    if (await isDisabledIdentity(activeUser.uid, activeUser.email || '')) {
      clearDisabledStatePolling();
      await forceDisabledAccountLogout();
    }
  }

  function bindDisabledStateResumeChecks() {
    if (disabledResumeChecksBound) return;
    disabledResumeChecksBound = true;
    window.addEventListener('focus', () => {
      void runDisabledStateCheckNow();
    });
    window.addEventListener('pageshow', () => {
      void runDisabledStateCheckNow();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      void runDisabledStateCheckNow();
    });
  }

  function startDisabledStatePolling(uid, email) {
    clearDisabledStatePolling();
    const cleanUid = String(uid || '').trim();
    if (!cleanUid) return;
    disabledStatePollTimer = setInterval(async () => {
      if (await isDisabledIdentity(cleanUid, email || '')) {
        clearDisabledStatePolling();
        await forceDisabledAccountLogout();
      }
    }, 4000);
  }

  function bindDisabledStateWatcher(uid) {
    clearDisabledStateWatcher();

    const cleanUid = String(uid || '').trim();
    const rtdb = getRealtimeDb();
    if (!cleanUid || !rtdb) return;

    const refs = [
      rtdb.ref(`accountStatus/${cleanUid}`),
      rtdb.ref(`technicians/${cleanUid}`),
      rtdb.ref(`users/${cleanUid}`),
      rtdb.ref(`customers/${cleanUid}`)
    ];
    const listeners = [];
    const state = { accountStatus: null, technicians: null, users: null, customers: null };
    let handlingDisabled = false;

    const handlePermissionLoss = async (error) => {
      if (handlingDisabled) return;
      const code = String(error && error.code ? error.code : '').toLowerCase();
      if (!code.includes('permission-denied')) return;
      handlingDisabled = true;
      await forceDisabledAccountLogout();
    };

    const evaluate = async () => {
      if (handlingDisabled) return;
      const records = [state.accountStatus, state.technicians, state.users, state.customers].filter(Boolean);
      const disabledInRecords = records.some((record) => record && record.isActive === false);
      const disabledByIdentity = disabledInRecords ? true : await isDisabledIdentity(cleanUid, '');
      if (!disabledInRecords && !disabledByIdentity) return;
      handlingDisabled = true;
      await forceDisabledAccountLogout();
    };

    ['accountStatus', 'technicians', 'users', 'customers'].forEach((key, index) => {
      const ref = refs[index];
      const listener = (snapshot) => {
        state[key] = snapshot && typeof snapshot.exists === 'function' && snapshot.exists()
          ? (snapshot.val() || {})
          : null;
        void evaluate();
      };
      listeners.push(listener);
      ref.on('value', listener, handlePermissionLoss);
    });

    stopDisabledStateWatcher = function stopWatcher() {
      refs.forEach((ref, index) => {
        const listener = listeners[index];
        if (!ref || typeof ref.off !== 'function') return;
        if (typeof listener === 'function') {
          ref.off('value', listener);
          return;
        }
        ref.off('value');
      });
    };
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeSkillLabel(value) {
    const normalized = normalizeText(value);
    if (!normalized) return '';
    if (normalized.includes('hvac') || normalized.includes('aircon')) return 'HVAC Technician';
    if (normalized.includes('appliance')) return 'Appliance Repair Technician';
    if (normalized.includes('electrical') || normalized === 'electrician') return 'Electrician';
    if (normalized.includes('plumb')) return 'Plumber';
    return '';
  }

  function parseSkills(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => normalizeSkillLabel(entry)).filter(Boolean);
    }
    return String(value || '')
      .split(/[,/|]/g)
      .map((entry) => normalizeSkillLabel(entry))
      .filter(Boolean);
  }

  function getSelectedSkillValues(controlId) {
    const control = document.getElementById(controlId);
    if (!control) return [];

    if (control.tagName === 'SELECT' && control.selectedOptions && control.selectedOptions.length) {
      return Array.from(control.selectedOptions)
        .map((option) => normalizeSkillLabel(option.value))
        .filter(Boolean);
    }

    const checked = control.querySelectorAll('input[type="checkbox"]:checked');
    if (checked.length) {
      return Array.from(checked)
        .map((entry) => normalizeSkillLabel(entry.value))
        .filter(Boolean);
    }

    return parseSkills(control.value);
  }

  function setSelectedSkillValues(controlId, values) {
    const control = document.getElementById(controlId);
    if (!control) return;

    const normalized = new Set(parseSkills(values));

    if (control.tagName === 'SELECT') {
      Array.from(control.options || []).forEach((option) => {
        option.selected = normalized.has(normalizeSkillLabel(option.value));
      });
      return;
    }

    Array.from(control.querySelectorAll('input[type="checkbox"]')).forEach((entry) => {
      entry.checked = normalized.has(normalizeSkillLabel(entry.value));
    });
  }

  function normalizeMobileForSave(rawMobile) {
    const cleaned = String(rawMobile || '').replace(/[\s\-()]/g, '').trim();
    if (!cleaned) return { error: 'Mobile number is required.' };
    if (!/^(\+639\d{9}|09\d{9})$/.test(cleaned)) {
      return { error: 'Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).' };
    }
    const e164 = cleaned.startsWith('09') ? `+63${cleaned.slice(1)}` : cleaned;
    return { e164, local: cleaned.startsWith('+63') ? `0${cleaned.slice(3)}` : cleaned };
  }

  function validateLocationPart(value, label) {
    const normalized = normalizeSpaces(value);
    if (!normalized) return `${label} is required.`;
    if (normalized.length < 2 || normalized.length > 60) return `${label} must be 2-60 characters.`;
    if (!/^[A-Za-z0-9 ,.#\-\/()'&]+$/.test(normalized)) return `${label} contains invalid characters.`;
    return null;
  }

  function splitLocationParts(value) {
    const normalized = normalizeSpaces(value);
    if (!normalized) return { town: '', city: '', province: '' };

    const parts = normalized
      .split(',')
      .map((entry) => normalizeSpaces(entry))
      .filter(Boolean);

    if (parts.length >= 2) {
      if (parts.length >= 3) {
        return {
          town: parts.slice(0, -2).join(', '),
          city: parts[parts.length - 2],
          province: parts[parts.length - 1]
        };
      }

      return {
        town: parts[0],
        city: parts[1],
        province: ''
      };
    }

    return { town: '', city: normalized, province: '' };
  }

  function composeLocation(town, city, province) {
    const normalizedTown = normalizeSpaces(town);
    const normalizedCity = normalizeSpaces(city);
    const normalizedProvince = normalizeSpaces(province);
    return [normalizedTown, normalizedCity, normalizedProvince].filter(Boolean).join(', ');
  }

  function setSelectOptions(selectEl, placeholder, entries, selectedName) {
    if (!selectEl) return;

    const options = [`<option value="">${placeholder}</option>`];
    entries.forEach((entry) => {
      const selected = normalizeSpaces(selectedName) === normalizeSpaces(entry.name) ? ' selected' : '';
      options.push(`<option value="${entry.name}" data-code="${entry.code || ''}"${selected}>${entry.name}</option>`);
    });

    selectEl.innerHTML = options.join('');
    selectEl.disabled = false;
  }

  function setSelectLoading(selectEl, label) {
    if (!selectEl) return;
    selectEl.innerHTML = `<option value="">${label}</option>`;
    selectEl.disabled = true;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    return response.json();
  }

  async function getProvinceCities(provinceCode) {
    if (!provinceCode) return [];
    if (provinceCityCache.has(provinceCode)) return provinceCityCache.get(provinceCode);

    const data = await fetchJson(`${PSGC_BASE_URL}/provinces/${provinceCode}/cities-municipalities/`);
    const items = Array.isArray(data)
      ? data.map((item) => ({ name: normalizeSpaces(item.name), code: String(item.code || '') })).filter((item) => item.name)
      : [];
    items.sort((a, b) => a.name.localeCompare(b.name));
    provinceCityCache.set(provinceCode, items);
    return items;
  }

  async function getCityBarangays(cityCode) {
    if (!cityCode) return [];
    if (cityTownCache.has(cityCode)) return cityTownCache.get(cityCode);

    const data = await fetchJson(`${PSGC_BASE_URL}/cities-municipalities/${cityCode}/barangays/`);
    const items = Array.isArray(data)
      ? data.map((item) => ({ name: normalizeSpaces(item.name), code: String(item.code || '') })).filter((item) => item.name)
      : [];
    items.sort((a, b) => a.name.localeCompare(b.name));
    cityTownCache.set(cityCode, items);
    return items;
  }

  function getCityProperName(cityName) {
    const normalized = normalizeSpaces(cityName);
    if (!normalized) return '';

    let candidate = normalized
      .replace(/^city\s+of\s+/i, '')
      .replace(/\s+city$/i, '')
      .replace(/\s+municipality$/i, '')
      .trim();

    if (!candidate) candidate = normalized;
    return candidate;
  }

  function mergeTownEntries(cityName, towns) {
    const normalizedCity = normalizeSpaces(cityName);
    const cityProper = getCityProperName(normalizedCity);
    const merged = [];
    const seen = new Set();

    [cityProper, normalizedCity].forEach((name) => {
      const key = normalizeSpaces(name).toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push({ name: normalizeSpaces(name), code: '' });
    });

    (towns || []).forEach((entry) => {
      const name = normalizeSpaces(entry && entry.name ? entry.name : '');
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return;
      seen.add(key);
      merged.push({ name, code: String((entry && entry.code) || '') });
    });

    return merged;
  }

  function createLocationController(ids) {
    const provinceEl = document.getElementById(ids.provinceId);
    const cityEl = document.getElementById(ids.cityId);
    const townEl = document.getElementById(ids.townId);

    if (!provinceEl || !cityEl || !townEl) return null;

    let activeCities = [];
    let activeTowns = [];

    function getSelectedCode(selectEl) {
      const selected = selectEl && selectEl.options ? selectEl.options[selectEl.selectedIndex] : null;
      return selected ? String(selected.getAttribute('data-code') || '').trim() : '';
    }

    async function loadCities(selectedCityName, selectedTownName) {
      const provinceCode = getSelectedCode(provinceEl);
      if (!provinceCode) {
        setSelectOptions(cityEl, 'Select city/municipality', [], '');
        setSelectOptions(townEl, 'Select town/barangay', [], '');
        return;
      }

      setSelectLoading(cityEl, 'Loading cities...');
      setSelectLoading(townEl, 'Select city first');

      try {
        activeCities = await getProvinceCities(provinceCode);
      } catch (_) {
        activeCities = [];
      }

      setSelectOptions(cityEl, 'Select city/municipality', activeCities, selectedCityName || '');
      await loadTowns(selectedTownName || '');
    }

    async function loadTowns(selectedTownName) {
      const cityCode = getSelectedCode(cityEl);
      const cityName = normalizeSpaces(cityEl.value);
      if (!cityCode) {
        setSelectOptions(townEl, 'Select town/barangay', [], '');
        return;
      }

      setSelectLoading(townEl, 'Loading towns...');

      try {
        activeTowns = await getCityBarangays(cityCode);
      } catch (_) {
        activeTowns = [];
      }

      activeTowns = mergeTownEntries(cityName, activeTowns);

      setSelectOptions(townEl, 'Select town/barangay', activeTowns, selectedTownName || '');
    }

    async function init() {
      const provinces = [...NORTH_LUZON_PROVINCES].sort((a, b) => a.name.localeCompare(b.name));
      setSelectOptions(provinceEl, 'Select province', provinces, '');
      setSelectOptions(cityEl, 'Select city/municipality', [], '');
      setSelectOptions(townEl, 'Select town/barangay', [], '');

      provinceEl.addEventListener('change', async () => {
        await loadCities('', '');
      });

      cityEl.addEventListener('change', async () => {
        await loadTowns('');
      });
    }

    async function setValues(value) {
      const normalized = value || {};
      const parts = splitLocationParts(normalized.location || '');
      const province = normalizeSpaces(normalized.province || parts.province || '');
      const city = normalizeSpaces(normalized.city || parts.city || '');
      const town = normalizeSpaces(normalized.town || parts.town || '');

      const provinces = [...NORTH_LUZON_PROVINCES].sort((a, b) => a.name.localeCompare(b.name));
      setSelectOptions(provinceEl, 'Select province', provinces, province);
      await loadCities(city, town);
    }

    function getValues() {
      const province = normalizeSpaces(provinceEl.value);
      const city = normalizeSpaces(cityEl.value);
      const town = normalizeSpaces(townEl.value);
      return {
        province,
        city,
        town,
        location: composeLocation(town, city, province)
      };
    }

    return { init, setValues, getValues };
  }

  function setMessage(text, type) {
    const node = document.getElementById('onboardMessage');
    if (!node) return;
    node.textContent = text || '';
    node.classList.remove('error', 'success');
    if (type) node.classList.add(type);
  }

  function readDemoSession() {
    try {
      const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function readDemoProfile() {
    try {
      const raw = sessionStorage.getItem(DEMO_PROFILE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function writeDemoProfile(data) {
    try {
      sessionStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(data || {}));
    } catch (_) {
    }
  }

  function isProfileComplete(profile) {
    if (profile && (profile.onboardingCompleted === true || profile.profileCompleted === true)) {
      return true;
    }

    const skillList = parseSkills(profile && (profile.skills || profile.primarySkill));
    if (!skillList.length || !skillList.some((skill) => SKILL_OPTIONS.includes(skill))) return false;

    const mobile = String(profile && (profile.mobile || profile.mobile_e164) || '').trim();
    const mobileResult = normalizeMobileForSave(mobile);
    if (mobileResult.error) return false;

    const savedLocation = profile && (profile.location || profile.address || '');
    const locationParts = splitLocationParts(savedLocation);
    const town = normalizeSpaces(profile && profile.town ? profile.town : locationParts.town);
    const city = normalizeSpaces(profile && profile.city ? profile.city : locationParts.city);
    const province = normalizeSpaces(profile && profile.province ? profile.province : locationParts.province);
    return !validateLocationPart(town, 'Town/Barangay') &&
      !validateLocationPart(city, 'City/Municipality') &&
      !validateLocationPart(province, 'Province');
  }

  async function fillForm(profile) {
    const details = profile || {};
    const title = document.getElementById('onboardTitle');
    const firstName = normalizeSpaces(details.first_name || 'Technician') || 'Technician';
    if (title) title.textContent = `Welcome ${firstName} to HFS`;

    const rawMobile = String(details.mobile || details.mobile_e164 || '').trim();
    const displayMobile = rawMobile.startsWith('+63') && rawMobile.length === 13
      ? `0${rawMobile.slice(3)}`
      : rawMobile;

    const skillValues = parseSkills(details.skills || details.primarySkill);

    const mobileInput = document.getElementById('onboardMobile');
    const certInput = document.getElementById('onboardCertifications');

    if (mobileInput) mobileInput.value = displayMobile;
    setSelectedSkillValues('onboardSkill', skillValues);
    if (onboardingLocationController) {
      await onboardingLocationController.setValues({
        location: details.location || details.address || '',
        province: details.province || '',
        city: details.city || '',
        town: details.town || ''
      });
    }
    if (certInput) certInput.value = details.certifications || details.certification || '';
  }

  function redirectDashboard() {
    window.location.href = 'dashboard.html';
  }

  async function waitForAuthUser() {
    if (!usersDb || !usersDb.auth) return null;
    const auth = usersDb.auth;
    if (auth.currentUser && auth.currentUser.uid) {
      return auth.currentUser;
    }
    if (typeof auth.onAuthStateChanged !== 'function') {
      return auth.currentUser || null;
    }

    return new Promise((resolve) => {
      let settled = false;
      let timerId = null;
      let unsubscribe = null;
      const finish = (user) => {
        if (settled) return;
        settled = true;
        clearTimeout(timerId);
        try {
          if (typeof unsubscribe === 'function') unsubscribe();
        } catch (_) {
        }
        resolve(user || null);
      };

      timerId = setTimeout(() => {
        finish(auth.currentUser || null);
      }, 2500);

      unsubscribe = auth.onAuthStateChanged((user) => {
        finish(user || null);
      }, () => {
        finish(auth.currentUser || null);
      });
    });
  }

  async function loadContext() {
    const demoSession = readDemoSession();

    const authUser = await waitForAuthUser();
    if (authUser && authUser.uid) {
      const user = authUser;
      const uid = String(user.uid || '').trim();
      let profile = { uid, email: user.email || '' };
      try {
        if (typeof usersDb.getUserById === 'function') {
          const loaded = await usersDb.getUserById(uid);
          if (loaded) profile = Object.assign({}, loaded, profile);
        }
      } catch (_) {
      }

      const needsNameHydration = !String(profile && profile.first_name ? profile.first_name : '').trim() && user.email;
      if ((needsNameHydration || !profile || !profile.role) && user.email && typeof usersDb.getUserByEmail === 'function') {
        try {
          const byEmail = await usersDb.getUserByEmail(user.email);
          if (byEmail) {
            const currentFirst = String(profile && profile.first_name ? profile.first_name : '').trim();
            const currentMiddle = String(profile && profile.middle_name ? profile.middle_name : '').trim();
            const currentLast = String(profile && profile.last_name ? profile.last_name : '').trim();
            profile = Object.assign({}, profile, byEmail, { uid, email: user.email || byEmail.email || '' });
            if (currentFirst && !String(byEmail.first_name || '').trim()) profile.first_name = currentFirst;
            if (currentMiddle && !String(byEmail.middle_name || '').trim()) profile.middle_name = currentMiddle;
            if (currentLast && !String(byEmail.last_name || '').trim()) profile.last_name = currentLast;

            const byEmailRole = String(byEmail.role || '').trim().toLowerCase();
            if ((byEmailRole === 'technician' || byEmailRole === 'admin') && typeof usersDb.updateUserProfile === 'function') {
              await usersDb.updateUserProfile(uid, {
                uid,
                email: String(user.email || byEmail.email || '').trim().toLowerCase(),
                first_name: String(profile && profile.first_name ? profile.first_name : '').trim(),
                middle_name: String(profile && profile.middle_name ? profile.middle_name : '').trim(),
                last_name: String(profile && profile.last_name ? profile.last_name : '').trim(),
                role: byEmailRole,
                isActive: byEmail.isActive !== false,
                isVerified: true,
                emailVerified: true
              });
            }
          }
        } catch (_) {
        }
      }

      const role = String(profile && profile.role ? profile.role : '').toLowerCase();
      const normalizedEmail = String((profile && profile.email) || user.email || '').trim().toLowerCase();
      const isActive = !(profile && profile.isActive === false);

      if (!isActive || await isDisabledIdentity(uid, normalizedEmail)) {
        await forceDisabledAccountLogout();
        return null;
      }

      if (normalizedEmail && FORCED_TECHNICIAN_EMAILS.has(normalizedEmail) && role !== 'technician') {
        try {
          if (typeof usersDb.updateUserProfile === 'function') {
            await usersDb.updateUserProfile(uid, {
              uid,
              email: normalizedEmail,
              first_name: String(profile && profile.first_name ? profile.first_name : '').trim(),
              middle_name: String(profile && profile.middle_name ? profile.middle_name : '').trim(),
              last_name: String(profile && profile.last_name ? profile.last_name : '').trim(),
              role: 'technician',
              isActive: profile && Object.prototype.hasOwnProperty.call(profile, 'isActive') ? profile.isActive : true,
              isVerified: true,
              emailVerified: true
            });
          }
          if (usersDb && usersDb.firebase && typeof usersDb.firebase.database === 'function') {
            const rtdb = usersDb.firebase.database();
            await rtdb.ref(`technicians/${uid}`).update(Object.assign({}, profile || {}, {
              uid,
              email: normalizedEmail,
              role: 'technician',
              isActive: profile && Object.prototype.hasOwnProperty.call(profile, 'isActive') ? profile.isActive : true,
              isVerified: true,
              emailVerified: true,
              updatedAt: Date.now()
            }));
            try { await rtdb.ref(`users/${uid}`).remove(); } catch (_) {}
            try { await rtdb.ref(`customers/${uid}`).remove(); } catch (_) {}
          }
        } catch (_) {
        }

        return { mode: 'firebase', profile: Object.assign({}, profile, { uid, email: normalizedEmail, role: 'technician' }) };
      }

      if (role && role !== 'technician') {
        if (usersDb && typeof usersDb.signOut === 'function') {
          try { await usersDb.signOut(); } catch (_) {}
        }
        window.location.href = '../../login.html';
        return null;
      }

      if (!role) {
        // Avoid logging out valid sessions when role fetch is still settling.
        return { mode: 'firebase', profile: Object.assign({}, profile, { role: 'technician' }) };
      }

      return { mode: 'firebase', profile };
    }

    if (demoSession && String(demoSession.role || '').toLowerCase() === 'technician') {
      const saved = readDemoProfile();
      const profile = Object.assign({}, saved, {
        email: demoSession.email || saved.email || 'technician@gmail.com',
        role: 'technician'
      });
      return { mode: 'demo', profile };
    }

    window.location.href = '../../login.html';
    return null;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindDisabledStateResumeChecks();
    const ctx = await loadContext();
    if (!ctx) return;

    if (ctx.mode === 'firebase' && ctx.profile && ctx.profile.uid) {
      currentDisabledStateUser = usersDb && usersDb.auth ? usersDb.auth.currentUser : null;
      bindDisabledStateWatcher(ctx.profile.uid);
      startDisabledStatePolling(ctx.profile.uid, ctx.profile.email || '');
    }

    if (isProfileComplete(ctx.profile)) {
      redirectDashboard();
      return;
    }

    onboardingLocationController = createLocationController({
      provinceId: 'onboardProvince',
      cityId: 'onboardCity',
      townId: 'onboardTown'
    });
    if (onboardingLocationController) {
      await onboardingLocationController.init();
    }

    await fillForm(ctx.profile);

    const form = document.getElementById('techOnboardPageForm');
    const button = document.getElementById('onboardContinueBtn');
    if (!form || !button) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage('');
      button.disabled = true;

      try {
        const mobileRaw = document.getElementById('onboardMobile') ? document.getElementById('onboardMobile').value : '';
        const selectedSkills = getSelectedSkillValues('onboardSkill');
        const locationValues = onboardingLocationController
          ? onboardingLocationController.getValues()
          : { province: '', city: '', town: '', location: '' };
        const certRaw = document.getElementById('onboardCertifications') ? document.getElementById('onboardCertifications').value : '';

        const mobile = normalizeMobileForSave(mobileRaw);
        if (mobile.error) {
          setMessage(mobile.error, 'error');
          return;
        }

        if (!selectedSkills.length) {
          setMessage('Please choose at least one technician skill.', 'error');
          return;
        }

        const skills = Array.from(new Set(selectedSkills.filter((skill) => SKILL_OPTIONS.includes(skill))));
        if (!skills.length) {
          setMessage('Please choose at least one technician skill.', 'error');
          return;
        }

        const primarySkill = skills[0];

        const town = normalizeSpaces(locationValues.town);
        const city = normalizeSpaces(locationValues.city);
        const province = normalizeSpaces(locationValues.province);

        const townError = validateLocationPart(town, 'Town/Barangay');
        if (townError) {
          setMessage(townError, 'error');
          return;
        }

        const cityError = validateLocationPart(city, 'City/Municipality');
        if (cityError) {
          setMessage(cityError, 'error');
          return;
        }

        const provinceError = validateLocationPart(province, 'Province');
        if (provinceError) {
          setMessage(provinceError, 'error');
          return;
        }

        const location = composeLocation(town, city, province);

        const certifications = normalizeSpaces(certRaw);

        const updates = {
          mobile: mobile.local,
          mobile_e164: mobile.e164,
          province,
          town,
          city,
          location,
          skills,
          primarySkill,
          onboardingCompleted: true,
          profileCompleted: true,
          onboardingCompletedAt: Date.now(),
          updatedAt: Date.now()
        };

        if (certifications) updates.certifications = certifications;

        if (ctx.mode === 'firebase') {
          const uid = String(ctx.profile && ctx.profile.uid ? ctx.profile.uid : '').trim();
          if (!uid || !(usersDb && typeof usersDb.updateUserProfile === 'function')) {
            setMessage('Unable to save profile for this account.', 'error');
            return;
          }
          await usersDb.updateUserProfile(uid, updates);
        } else {
          writeDemoProfile(Object.assign({}, ctx.profile || {}, updates));
        }

        setMessage('Saved. Redirecting...', 'success');
        setTimeout(() => {
          redirectDashboard();
        }, 350);
      } catch (_) {
        setMessage('Failed to save profile. Please try again.', 'error');
      } finally {
        button.disabled = false;
      }
    });
  });
})();
