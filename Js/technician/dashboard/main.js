document.addEventListener('DOMContentLoaded', () => {
  const ns = window.hfsTechDashboard || {};
  const usersDb = window.usersDatabase || window.homefixDB || null;
  const DEMO_TECH_EMAIL = 'technician@gmail.com';
  const DEMO_TECH_PROFILE_KEY = 'hfs_technician_demo_profile_v1';
  const FORCE_SAMPLE_REQUESTS = false;
  const SHOP_OPEN_HOUR = 9;
  const SHOP_CLOSE_HOUR = 18;
  const LUNCH_BREAK_HOUR = 12;
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const NAME_REGEX = /^[A-Za-z]+(?:-[A-Za-z]+)?(?:\s[A-Za-z]+)*$/;
  const MOBILE_PH_REGEX = /^(\+639\d{9}|09\d{9})$/;
  const PASSWORD_REGEX = /^(?=.{8,12}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s])\S+$/;
  const LOCATION_REGEX = /^[A-Za-z0-9 ,.#\-\/()'&]+$/;
  const FORGOT_PASSWORD_COOLDOWN_MS = 60 * 1000;
  const FORGOT_PASSWORD_COOLDOWN_KEY = 'hfs_tech_forgot_password_cooldown';
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

  let scheduleWeekStart = getWeekStart(new Date());
  let scheduleMonthAnchor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedScheduleDate = null;
  let scheduleSourceItems = [];
  let activeTechnicianProfile = null;
  let technicianRequestLookup = new Map();
  let sampleRequestOverrides = new Map();
  let activeDetailRequestId = '';
  let unsubscribeTechRequests = null;
  let cachedRealtimeRequests = null;
  let accountLocationController = null;
  let modalLocationController = null;
  let isAccountEditMode = false;
  const TECH_DECLINED_REQUESTS_KEY = 'hfs_technician_declined_requests_v1';
  let unsubscribeRequestChat = null;
  let unsubscribeMessagesChat = null;
  let unsubscribeOwnPresence = null;
  let unsubscribePeerPresence = null;
  let locationControllersInitialized = false;
  let presenceTrackingDisabled = false;
  let forgotPasswordCooldownTimer = null;
  let activePeerPresenceUid = '';
  let activeMessagesRequestId = '';
  let activeAcceptedMessageRequests = [];
  const peerPresenceByUid = Object.create(null);
  const customerNameByUid = Object.create(null);
  const customerNameByEmail = Object.create(null);

  const provinceCityCache = new Map();
  const cityTownCache = new Map();
  const MAX_CHAT_ATTACHMENT_BYTES = 6 * 1024 * 1024;
  const TECH_QUICK_UPDATE_TEMPLATES = [
    { label: "I'm on my way", text: "I'm on my way to your location." },
    { label: 'I have arrived', text: 'I have arrived at your location.' },
    { label: 'Running 10-15 mins late', text: 'Running around 10-15 minutes late due to traffic. Thank you for your patience.' },
    { label: 'Service completed', text: 'Service is completed. Please check and confirm. Thank you.' }
  ];

  const STATUS_CLASSES = {
    pending: 'pending',
    offered: 'offered',
    accepted: 'accepted',
    confirmed: 'accepted',
    'in-progress': 'accepted',
    ongoing: 'accepted',
    completed: 'finished',
    finished: 'finished',
    declined: 'declined',
    rejected: 'declined',
    cancelled: 'declined'
  };

  function buildSampleRequests(profile) {
    const uid = String(profile && profile.uid ? profile.uid : 'tech_demo_001');
    const email = String(profile && profile.email ? profile.email : DEMO_TECH_EMAIL);
    const now = new Date();

    const tomorrowAt10 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0, 0, 0);
    const tomorrowAt14 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 14, 0, 0, 0);
    const nextDaysAt11 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 11, 0, 0, 0);
    const nextWeekAt9 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 9, 0, 0, 0);

    const toScheduleLabel = (date) => {
      const month = date.toLocaleDateString(undefined, { month: 'short' });
      const day = date.getDate();
      const year = date.getFullYear();
      const start = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      const endDate = new Date(date.getTime() + (60 * 60 * 1000));
      const end = endDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return `${month} ${day}, ${year} ${start} - ${end}`;
    };

    const items = [
      {
        id: 'sample_pending_001',
        customerName: 'Maria Santos',
        customerEmail: 'maria.santos@gmail.com',
        serviceType: 'Repair',
        serviceName: 'Kitchen Sink Leak',
        category: 'plumbing',
        repairConcern: 'Water leak below sink trap',
        bookingType: 'technician',
        requestMode: 'home-service',
        status: 'pending',
        preferred_datetime: toScheduleLabel(tomorrowAt10),
        preferredSchedule: toScheduleLabel(tomorrowAt10),
        createdAt: tomorrowAt10.toISOString(),
        issue: 'Water dripping under kitchen sink cabinet when faucet is opened.',
        description: 'Leak under kitchen sink cabinet. Needs seal replacement.',
        details: 'Leak starts when faucet pressure is medium to high. User already turned off under-sink valve at night.',
        location: 'Bonuan Gueset, Dagupan City',
        mediaAttachments: ['sink-leak-photo-1.jpg', 'sink-leak-video-1.mp4'],
        assignedTechnicianId: uid,
        assignedTechnicianEmail: email
      },
      {
        id: 'sample_approved_001',
        customerName: 'John Reyes',
        customerEmail: 'john.reyes@gmail.com',
        serviceType: 'Repair',
        serviceName: 'Bathroom Pipe Replacement',
        category: 'plumbing',
        repairConcern: 'Cracked bathroom pipe with weak pressure',
        bookingType: 'technician',
        requestMode: 'home-service',
        status: 'accepted',
        preferred_datetime: toScheduleLabel(tomorrowAt14),
        preferredSchedule: toScheduleLabel(tomorrowAt14),
        createdAt: tomorrowAt14.toISOString(),
        issue: 'Cracked bathroom pipe causing low water pressure.',
        description: 'Main bathroom pipe replacement approved by admin.',
        details: 'Pipe crack is near wall elbow connection. Existing pipe is old GI line needing replacement.',
        location: 'Tapuac District, Dagupan City',
        mediaAttachments: ['bathroom-pipe-crack.jpg'],
        assignedTechnicianId: uid,
        assignedTechnicianEmail: email,
        rating: 4.8
      },
      {
        id: 'sample_pending_002',
        customerName: 'Anne Cruz',
        customerEmail: 'anne.cruz@gmail.com',
        serviceType: 'Repair',
        serviceName: 'Toilet Flush Repair',
        category: 'plumbing',
        repairConcern: 'Weak flush and delayed tank refill',
        bookingType: 'technician',
        requestMode: 'home-service',
        status: 'pending',
        preferred_datetime: toScheduleLabel(nextDaysAt11),
        preferredSchedule: toScheduleLabel(nextDaysAt11),
        createdAt: nextDaysAt11.toISOString(),
        issue: 'Toilet flush is weak and sometimes does not refill.',
        description: 'Flush tank not refilling. Needs inspection and repair.',
        details: 'Possible issue in fill valve and flapper seal. Problem occurs more in the morning.',
        location: 'Poblacion Oeste, Dagupan City',
        mediaAttachments: ['toilet-flush-issue.jpg'],
        assignedTechnicianId: uid,
        assignedTechnicianEmail: email
      },
      {
        id: 'sample_approved_002',
        customerName: 'Peter Lim',
        customerEmail: 'peter.lim@gmail.com',
        serviceType: 'Inspection',
        serviceName: 'Water Line Inspection',
        category: 'plumbing',
        repairConcern: 'Possible hidden leak in water line',
        bookingType: 'technician',
        requestMode: 'home-service',
        status: 'accepted',
        preferred_datetime: toScheduleLabel(nextWeekAt9),
        preferredSchedule: toScheduleLabel(nextWeekAt9),
        createdAt: nextWeekAt9.toISOString(),
        issue: 'Routine inspection requested for possible hidden leaks.',
        description: 'Scheduled preventive inspection for residential water line.',
        details: 'User noticed a slight increase in water bill for the last 2 months without visible leaks.',
        location: 'Lucao, Dagupan City',
        mediaAttachments: ['meter-reading-photo.jpg'],
        assignedTechnicianId: uid,
        assignedTechnicianEmail: email
      },
      {
        id: 'sample_today_001',
        customerName: 'Paolo Dizon',
        customerEmail: 'paolo.dizon@gmail.com',
        serviceType: 'Repair',
        serviceName: 'Emergency Drain Clog',
        category: 'plumbing',
        repairConcern: 'Kitchen drain backup and slow flow',
        bookingType: 'technician',
        requestMode: 'home-service',
        status: 'accepted',
        preferred_datetime: toScheduleLabel(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0)),
        preferredSchedule: toScheduleLabel(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0)),
        createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0).toISOString(),
        issue: 'Drain water backing up in kitchen sink.',
        description: 'On-site unclogging and line flush currently in progress.',
        details: 'Drain starts backing up after 2-3 minutes of running water. Grease buildup suspected.',
        location: 'Arellano Street, Dagupan City',
        mediaAttachments: ['kitchen-drain-backup.jpg', 'sink-gurgling-audio.m4a'],
        assignedTechnicianId: uid,
        assignedTechnicianEmail: email
      }
    ];

    return items.map((item) => {
      const override = sampleRequestOverrides.get(String(item.id));
      return override ? Object.assign({}, item, override) : item;
    });
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
  }

  function setGreeting(profile) {
    const greetingElement = document.getElementById('techGreeting');
    if (!greetingElement) return;

    const firstName = String(profile && profile.first_name ? profile.first_name : '').trim();
    let label = firstName;

    if (!label) {
      label = 'Technician';
    }

    greetingElement.textContent = `Welcome, ${label}`;
  }

  function setAccountMessage(text, type) {
    const message = document.getElementById('techAccountMessage');
    if (!message) return;
    message.textContent = text || '';
    message.classList.remove('error', 'success');
    if (type) message.classList.add(type);
  }

  function setPasswordMessage(text, type) {
    const message = document.getElementById('techPasswordMessage');
    if (!message) return;
    message.textContent = text || '';
    message.classList.remove('error', 'success');
    if (type) message.classList.add(type);
  }

  function getForgotPasswordCooldownMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(FORGOT_PASSWORD_COOLDOWN_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function setForgotPasswordCooldownExpiry(email, expiry) {
    const key = normalizeText(email);
    if (!key) return;

    const map = getForgotPasswordCooldownMap();
    map[key] = Number(expiry) || 0;
    try {
      localStorage.setItem(FORGOT_PASSWORD_COOLDOWN_KEY, JSON.stringify(map));
    } catch (_) {
    }
  }

  function getForgotPasswordCooldownRemaining(email) {
    const key = normalizeText(email);
    if (!key) return 0;

    const map = getForgotPasswordCooldownMap();
    const expiry = Number(map[key] || 0);
    if (!Number.isFinite(expiry) || expiry <= 0) return 0;

    const remaining = expiry - Date.now();
    if (remaining <= 0) return 0;
    return remaining;
  }

  function clearForgotPasswordCooldownTimer() {
    if (forgotPasswordCooldownTimer) {
      window.clearInterval(forgotPasswordCooldownTimer);
      forgotPasswordCooldownTimer = null;
    }
  }

  function updateForgotPasswordButtonState(email) {
    const forgotBtn = document.getElementById('techForgotPasswordBtn');
    if (!forgotBtn) return;

    const remaining = getForgotPasswordCooldownRemaining(email);
    if (remaining <= 0) {
      forgotBtn.disabled = false;
      forgotBtn.textContent = 'Forgot Password';
      return;
    }

    const seconds = Math.ceil(remaining / 1000);
    forgotBtn.disabled = true;
    forgotBtn.textContent = `Forgot Password (${seconds}s)`;
  }

  function startForgotPasswordCooldownWatcher(email) {
    clearForgotPasswordCooldownTimer();
    updateForgotPasswordButtonState(email);

    forgotPasswordCooldownTimer = window.setInterval(() => {
      const remaining = getForgotPasswordCooldownRemaining(email);
      updateForgotPasswordButtonState(email);
      if (remaining <= 0) {
        clearForgotPasswordCooldownTimer();
      }
    }, 1000);
  }

  function normalizeSpaces(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function looksLikeEmail(value) {
    const text = normalizeSpaces(value).toLowerCase();
    if (!text) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
  }

  function safeText(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return normalizeSpaces(value);
    }
    return '';
  }

  function getDeclinedRequestMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TECH_DECLINED_REQUESTS_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveDeclinedRequestMap(map) {
    try {
      localStorage.setItem(TECH_DECLINED_REQUESTS_KEY, JSON.stringify(map && typeof map === 'object' ? map : {}));
    } catch (_) {
    }
  }

  function markRequestDeclinedForTechnician(requestId, profile) {
    const id = String(requestId || '').trim();
    const uid = String(profile && profile.uid ? profile.uid : '').trim();
    if (!id || !uid) return;

    const map = getDeclinedRequestMap();
    const bucket = map[uid] && typeof map[uid] === 'object' ? map[uid] : {};
    bucket[id] = Date.now();
    map[uid] = bucket;
    saveDeclinedRequestMap(map);
  }

  function clearDeclinedMarkForTechnician(requestId, profile) {
    const id = String(requestId || '').trim();
    const uid = String(profile && profile.uid ? profile.uid : '').trim();
    if (!id || !uid) return;

    const map = getDeclinedRequestMap();
    const bucket = map[uid] && typeof map[uid] === 'object' ? map[uid] : null;
    if (!bucket || !Object.prototype.hasOwnProperty.call(bucket, id)) return;

    delete bucket[id];
    if (!Object.keys(bucket).length) {
      delete map[uid];
    } else {
      map[uid] = bucket;
    }
    saveDeclinedRequestMap(map);
  }

  function hasTechnicianDeclinedRequest(requestId, profile) {
    const id = String(requestId || '').trim();
    const uid = String(profile && profile.uid ? profile.uid : '').trim();
    if (!id || !uid) return false;

    const map = getDeclinedRequestMap();
    const bucket = map[uid] && typeof map[uid] === 'object' ? map[uid] : null;
    return !!(bucket && Object.prototype.hasOwnProperty.call(bucket, id));
  }

  function setSelectOptions(selectEl, placeholder, entries, selectedName) {
    if (!selectEl) return;

    const options = [`<option value="">${placeholder}</option>`];
    entries.forEach((entry) => {
      const selected = normalizeSpaces(selectedName) === normalizeSpaces(entry.name) ? ' selected' : '';
      options.push(`<option value="${entry.name}" data-code="${entry.code || ''}"${selected}>${entry.name}</option>`);
    });

    selectEl.innerHTML = options.join('');
    const forcedDisabled = String(selectEl.getAttribute('data-force-disabled') || '').toLowerCase() === 'true';
    selectEl.disabled = forcedDisabled;
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

      let cities = [];
      try {
        cities = await getProvinceCities(provinceCode);
      } catch (_) {
        cities = [];
      }

      setSelectOptions(cityEl, 'Select city/municipality', cities, selectedCityName || '');
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

      let towns = [];
      try {
        towns = await getCityBarangays(cityCode);
      } catch (_) {
        towns = [];
      }

      towns = mergeTownEntries(cityName, towns);

      setSelectOptions(townEl, 'Select town/barangay', towns, selectedTownName || '');
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

  function setFieldInvalid(fieldId, isInvalid) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    field.classList.toggle('invalid', !!isInvalid);
  }

  function clearPersonalFieldErrors() {
    ['techFirstName', 'techMiddleName', 'techLastName', 'techMobile', 'techProvince', 'techCity', 'techTown', 'techSkillsInput']
      .forEach((id) => setFieldInvalid(id, false));
  }

  function parseSkillsFromInput(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => normalizeSkill(entry)).filter(Boolean);
    }
    return String(value || '')
      .split(/[,/|]/g)
      .map((entry) => normalizeSkill(entry))
      .filter(Boolean);
  }

  function normalizeSkillsForInput(value) {
    const skills = parseSkillsFromInput(value);
    return skills.join(', ');
  }

  function getSelectedSkills(controlId) {
    const control = document.getElementById(controlId);
    if (!control) return [];

    if (control.tagName === 'SELECT' && control.selectedOptions && control.selectedOptions.length) {
      return Array.from(control.selectedOptions)
        .map((option) => normalizeSkill(option.value))
        .filter(Boolean);
    }

    const checked = control.querySelectorAll('input[type="checkbox"]:checked');
    if (checked.length) {
      return Array.from(checked)
        .map((entry) => normalizeSkill(entry.value))
        .filter(Boolean);
    }

    return parseSkillsFromInput(control.value);
  }

  function setSelectedSkills(controlId, values) {
    const control = document.getElementById(controlId);
    if (!control) return;

    const normalized = new Set(parseSkillsFromInput(values));

    if (control.tagName === 'SELECT') {
      Array.from(control.options || []).forEach((option) => {
        option.selected = normalized.has(normalizeSkill(option.value));
      });
      return;
    }

    Array.from(control.querySelectorAll('input[type="checkbox"]')).forEach((entry) => {
      entry.checked = normalized.has(normalizeSkill(entry.value));
    });
  }

  function getSkillAliases(skill) {
    const normalized = normalizeSkill(skill);
    if (!normalized) return [];
    const aliases = new Set([normalized]);

    const isHvac = /\bhvac\b|\bair\s*con\b|\bair\s*conditioning\b|\bairconditioner\b|\bac\b/.test(normalized);
    const isAppliance = /\bappliance\b|\brefrigerator\b|\bref\b|\bwasher\b|\bwashing\b|\bmicrowave\b|\boven\b/.test(normalized);
    const isElectrical = /\belectric\b|\belectrical\b|\belectrician\b|\bwiring\b|\bcircuit\b|\boutlet\b/.test(normalized);
    const isPlumbing = /\bplumb\b|\bplumber\b|\bpipe\b|\bdrain\b|\bfaucet\b|\btoilet\b|\bsink\b|\bleak\b/.test(normalized);

    if (isHvac) {
      aliases.add('hvac');
      aliases.add('hvac technician');
      aliases.add('aircon');
      aliases.add('air conditioning');
      aliases.add('air conditioner');
      aliases.add('ac');
    }

    if (isAppliance) {
      aliases.add('appliance');
      aliases.add('appliance repair');
      aliases.add('appliance repair technician');
    }

    if (isElectrical) {
      aliases.add('electrical');
      aliases.add('electric');
      aliases.add('electrician');
    }

    if (isPlumbing) {
      aliases.add('plumbing');
      aliases.add('plumber');
      aliases.add('plumbing technician');
    }

    return Array.from(aliases);
  }

  function toSkillSelectValue(value) {
    const normalized = normalizeSkill(value);
    if (!normalized) return '';
    if (/\bhvac\b|\bair\s*con\b|\bair\s*conditioning\b|\bairconditioner\b|\bac\b/.test(normalized)) return 'HVAC Technician';
    if (/\bappliance\b|\brefrigerator\b|\bref\b|\bwasher\b|\bwashing\b|\bmicrowave\b|\boven\b/.test(normalized)) return 'Appliance Repair Technician';
    if (/\belectric\b|\belectrical\b|\belectrician\b|\bwiring\b|\bcircuit\b|\boutlet\b/.test(normalized)) return 'Electrician';
    if (/\bplumb\b|\bplumber\b|\bpipe\b|\bdrain\b|\bfaucet\b|\btoilet\b|\bsink\b|\bleak\b/.test(normalized)) return 'Plumber';
    return '';
  }

  function renderProfileCompletionPrompt(skills) {
    const alert = document.getElementById('techProfileAlert');
    if (alert && alert.parentNode) {
      alert.parentNode.removeChild(alert);
    }
  }

  function hasTechnicianProfileSetup(profile) {
    const data = profile || {};
    const rawSkillBuckets = [
      data && data.skills,
      data && data.specialties,
      data && data.serviceCategories,
      data && data.fields,
      data && data.field
    ];
    const storedSkills = new Set();

    rawSkillBuckets.forEach((bucket) => {
      if (Array.isArray(bucket)) {
        bucket.forEach((entry) => {
          getSkillAliases(entry).forEach((alias) => storedSkills.add(alias));
        });
        return;
      }

      if (typeof bucket === 'string') {
        getSkillAliases(bucket).forEach((alias) => storedSkills.add(alias));
      }
    });

    if (!storedSkills.size) return false;

    const rawMobile = String(data.mobile || data.mobile_e164 || '').trim();
    const mobileResult = normalizeMobileForSave(rawMobile);
    if (mobileResult.error) return false;

    const savedLocation = data.location || data.address || '';
    const locationParts = splitLocationParts(savedLocation);
    const town = normalizeSpaces(data.town || locationParts.town || '');
    const city = normalizeSpaces(data.city || locationParts.city || '');
    const province = normalizeSpaces(data.province || locationParts.province || '');
    return !validateLocationPart(town, 'Town/Barangay') &&
      !validateLocationPart(city, 'City/Municipality') &&
      !validateLocationPart(province, 'Province');
  }

  function setOnboardingMessage(text, type) {
    const message = document.getElementById('techOnboardingMessage');
    if (!message) return;
    message.textContent = text || '';
    message.classList.remove('error', 'success');
    if (type) message.classList.add(type);
  }

  function openTechnicianOnboarding(profile) {
    const modal = document.getElementById('techOnboardingModal');
    if (!modal) return;

    const details = profile || {};
    const welcomeName = String(details.first_name || details.last_name || 'Technician').trim() || 'Technician';
    const title = document.getElementById('techOnboardingTitle');
    if (title) title.textContent = `Welcome, ${welcomeName}`;

    const rawMobile = String(details.mobile || details.mobile_e164 || '').trim();
    const displayMobile = rawMobile.startsWith('+63') && rawMobile.length === 13
      ? `0${rawMobile.slice(3)}`
      : rawMobile;

    setInputValue('techOnboardMobile', displayMobile);
    const profileSkills = parseSkillsFromInput(details.skills || details.specialties || details.serviceCategories || details.fields || details.field || '');
    setSelectedSkills('techOnboardSkills', profileSkills);
    ensureLocationControllersInitialized({ includeAccount: false, includeModal: true });
    if (modalLocationController) {
      modalLocationController.setValues({
        location: details.location || details.address || '',
        province: details.province || '',
        city: details.city || '',
        town: details.town || ''
      });
    }
    setInputValue('techOnboardExperience', details.yearsExperience || details.experienceYears || '');
    setInputValue('techOnboardCertifications', details.certifications || details.certification || '');
    setOnboardingMessage('');

    modal.hidden = false;
  }

  function closeTechnicianOnboarding() {
    const modal = document.getElementById('techOnboardingModal');
    if (!modal) return;
    modal.hidden = true;
  }

  function maybeShowTechnicianOnboarding(profile) {
    if (hasTechnicianProfileSetup(profile)) return;
    renderProfileCompletionPrompt(getTechnicianSkills(profile, profile && profile.email));
  }

  function validateName(value, required, label) {
    const raw = String(value || '');
    if (!raw.trim()) {
      return required ? `${label} is required.` : null;
    }

    if (/^\s+|\s+$/.test(raw)) return 'Remove spaces at the start or end.';
    if (/\s{2,}/.test(raw)) return 'Use only one space between words.';

    const normalized = raw.trim();
    if (normalized.length < 2 || normalized.length > 15) {
      return 'Use 2 to 15 letters.';
    }

    const parts = normalized.split(' ').filter(Boolean);
    if (parts.length > 1 && parts.every((part) => part.length === 1)) {
      return 'Enter full name.';
    }

    if (/\d/.test(normalized)) {
      return 'No numbers.';
    }

    if (!/^[A-Za-z\s-]+$/.test(normalized)) {
      return 'No special characters (e.g., Anne-Marie).';
    }

    if (!NAME_REGEX.test(normalized)) {
      return `Please enter a valid ${label.toLowerCase()}.`;
    }
    return null;
  }

  function normalizeMobileForSave(rawMobile) {
    const cleaned = String(rawMobile || '').replace(/[\s\-()]/g, '').trim();
    if (!cleaned) {
      return { error: 'Mobile number is required.' };
    }
    if (!MOBILE_PH_REGEX.test(cleaned)) {
      return { error: 'Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).' };
    }
    const e164 = cleaned.startsWith('09') ? `+63${cleaned.slice(1)}` : cleaned;
    return { e164, local: cleaned.startsWith('+63') ? `0${cleaned.slice(3)}` : cleaned };
  }

  function validateLocationPart(value, label) {
    const normalized = normalizeSpaces(value);
    if (!normalized) return `${label} is required.`;
    if (normalized.length < 2 || normalized.length > 60) {
      return `${label} must be 2-60 characters.`;
    }
    if (!LOCATION_REGEX.test(normalized)) {
      return `${label} contains invalid characters.`;
    }
    return null;
  }

  function splitLocationParts(value) {
    const normalized = normalizeSpaces(value);
    if (!normalized) return { town: '', city: '', province: '' };

    const parts = normalized
      .split(',')
      .map((entry) => normalizeSpaces(entry))
      .filter(Boolean);

    if (parts.length >= 3) {
      return {
        town: parts.slice(0, -2).join(', '),
        city: parts[parts.length - 2],
        province: parts[parts.length - 1]
      };
    }

    if (parts.length === 2) {
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

  function setInputValue(id, value) {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = value == null ? '' : String(value);
  }

  function setSkillsInputDisabled(disabled) {
    const skillsWrap = document.getElementById('techSkillsInput');
    if (!skillsWrap) return;

    const checkboxes = skillsWrap.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((entry) => {
      entry.disabled = !!disabled;
    });

    skillsWrap.classList.toggle('read-only', !!disabled);
  }

  function setAccountLocationInputsDisabled(disabled) {
    ['techProvince', 'techCity', 'techTown'].forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.setAttribute('data-force-disabled', disabled ? 'true' : 'false');
      input.disabled = !!disabled;
    });
  }

  function toSimpleTechnicianId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    let hash = 0;
    for (let i = 0; i < raw.length; i += 1) {
      hash = ((hash * 33) + raw.charCodeAt(i)) >>> 0;
    }

    return `TECH-${String(hash % 100000).padStart(5, '0')}`;
  }

  function setAccountFormEnabled(enabled) {
    const canEdit = !!enabled;
    const editBtn = document.getElementById('techAccountEditBtn');
    const cancelBtn = document.getElementById('techAccountCancelBtn');
    const saveBtn = document.getElementById('techAccountSaveBtn');
    const editableIds = [
      'techFirstName',
      'techMiddleName',
      'techLastName',
      'techMobile',
      'techSkillsInput',
      'techProvince',
      'techTown',
      'techCity'
    ];

    isAccountEditMode = false;

    editableIds.forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.disabled = true;
    });

    setSkillsInputDisabled(true);
    setAccountLocationInputsDisabled(true);

    if (editBtn) {
      editBtn.hidden = false;
      editBtn.disabled = !canEdit;
    }
    if (cancelBtn) cancelBtn.hidden = true;
    if (saveBtn) {
      saveBtn.hidden = true;
      saveBtn.disabled = !canEdit;
    }
  }

  function setAccountEditMode(editing) {
    const canEdit = !!(activeTechnicianProfile && activeTechnicianProfile.uid);
    const isEditing = !!editing && canEdit;

    const editBtn = document.getElementById('techAccountEditBtn');
    const cancelBtn = document.getElementById('techAccountCancelBtn');
    const saveBtn = document.getElementById('techAccountSaveBtn');
    const editableIds = [
      'techFirstName',
      'techMiddleName',
      'techLastName',
      'techMobile',
      'techProvince',
      'techTown',
      'techCity'
    ];

    isAccountEditMode = isEditing;

    editableIds.forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.disabled = !isEditing;
    });

    setSkillsInputDisabled(!isEditing);
    setAccountLocationInputsDisabled(!isEditing);

    if (editBtn) {
      editBtn.hidden = isEditing;
      editBtn.disabled = !canEdit;
    }
    if (cancelBtn) cancelBtn.hidden = !isEditing;
    if (saveBtn) {
      saveBtn.hidden = !isEditing;
      saveBtn.disabled = !canEdit;
    }

    if (isEditing) {
      setAccountMessage('Editing personal information.', 'success');
    }
  }

  function validateNewPasswordFormat(value) {
    const text = String(value || '');
    if (!text) return 'New password is required.';
    if (text.length < 8) return 'New password must be at least 8 characters.';
    if (text.length > 12) return 'New password must be no more than 12 characters.';
    if (!PASSWORD_REGEX.test(text)) return 'Use 8-12 chars with uppercase, lowercase, number, and special character.';
    return null;

    if (saveBtn) saveBtn.disabled = false;
  }

  function fillAccountForm(profile) {
    const details = profile || {};

    setInputValue('techAccountId', toSimpleTechnicianId(details.uid || details.id || ''));
    setInputValue('techUsername', details.email || details.username || '');
    setInputValue('techFirstName', details.first_name || '');
    setInputValue('techMiddleName', details.middle_name || '');
    setInputValue('techLastName', details.last_name || '');

    const rawMobile = String(details.mobile || details.mobile_e164 || '').trim();
    const displayMobile = rawMobile.startsWith('+63') && rawMobile.length === 13
      ? `0${rawMobile.slice(3)}`
      : rawMobile;
    setInputValue('techMobile', displayMobile);

    const profileSkills = parseSkillsFromInput(details.skills || details.specialties || details.serviceCategories || details.fields || details.field || '');
    setSelectedSkills('techSkillsInput', profileSkills);
    if (accountLocationController) {
      accountLocationController.setValues({
        location: details.location || details.address || '',
        province: details.province || '',
        city: details.city || '',
        town: details.town || ''
      });
    }

    if (!isAccountEditMode) {
      setAccountFormEnabled(!!(details && details.uid));
    }
  }

  async function syncTechnicianProfileRealtime(uid, profileData) {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid || !(usersDb && usersDb.firebase && typeof usersDb.firebase.database === 'function')) return;

    const rtdb = usersDb.firebase.database();
    const source = profileData && typeof profileData === 'object' ? profileData : {};
    const payload = Object.assign({}, source, {
      uid: cleanUid,
      role: 'technician',
      email: String(source.email || '').trim().toLowerCase(),
      first_name: String(source.first_name || '').trim(),
      middle_name: String(source.middle_name || '').trim(),
      last_name: String(source.last_name || '').trim(),
      isActive: source.isActive !== false,
      isVerified: true,
      emailVerified: true,
      updatedAt: Date.now()
    });

    await rtdb.ref(`technicians/${cleanUid}`).update(payload);
    try { await rtdb.ref(`users/${cleanUid}`).remove(); } catch (_) {}
    try { await rtdb.ref(`customers/${cleanUid}`).remove(); } catch (_) {}
  }

  function bindAccountSection() {
    const form = document.getElementById('techAccountForm');
    if (!form) return;

    const editBtn = document.getElementById('techAccountEditBtn');
    const cancelBtn = document.getElementById('techAccountCancelBtn');

    if (editBtn) {
      editBtn.addEventListener('click', () => {
        setAccountMessage('');
        setAccountEditMode(true);
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        setAccountMessage('Changes cancelled.', 'success');
        fillAccountForm(activeTechnicianProfile || {});
        clearPersonalFieldErrors();
        setAccountEditMode(false);
      });
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setAccountMessage('');
      clearPersonalFieldErrors();

      if (!isAccountEditMode) {
        setAccountMessage('Click Edit Information first to update your profile.', 'error');
        return;
      }

      const profile = activeTechnicianProfile || {};
      if (!profile.uid || !(usersDb && typeof usersDb.updateUserProfile === 'function')) {
        setAccountMessage('Account updates are not available for this session.', 'error');
        return;
      }

      const saveBtn = document.getElementById('techAccountSaveBtn');
      if (saveBtn) saveBtn.disabled = true;

      try {
        const firstName = normalizeSpaces(document.getElementById('techFirstName') ? document.getElementById('techFirstName').value : '');
        const middleName = normalizeSpaces(document.getElementById('techMiddleName') ? document.getElementById('techMiddleName').value : '');
        const lastName = normalizeSpaces(document.getElementById('techLastName') ? document.getElementById('techLastName').value : '');
        const rawMobile = document.getElementById('techMobile') ? document.getElementById('techMobile').value : '';
        const selectedSkills = getSelectedSkills('techSkillsInput');
        const locationValues = accountLocationController
          ? accountLocationController.getValues()
          : { province: '', city: '', town: '', location: '' };
        const town = normalizeSpaces(locationValues.town);
        const city = normalizeSpaces(locationValues.city);
        const province = normalizeSpaces(locationValues.province);
        const location = composeLocation(town, city, province);
        const skills = selectedSkills;

        const firstNameError = validateName(firstName, true, 'First name');
        if (firstNameError) {
          setFieldInvalid('techFirstName', true);
          setAccountMessage(firstNameError, 'error');
          return;
        }

        const middleNameError = validateName(middleName, false, 'Middle name');
        if (middleNameError) {
          setFieldInvalid('techMiddleName', true);
          setAccountMessage(middleNameError, 'error');
          return;
        }

        const lastNameError = validateName(lastName, true, 'Last name');
        if (lastNameError) {
          setFieldInvalid('techLastName', true);
          setAccountMessage(lastNameError, 'error');
          return;
        }

        const mobileResult = normalizeMobileForSave(rawMobile);
        if (mobileResult.error) {
          setFieldInvalid('techMobile', true);
          setAccountMessage(mobileResult.error, 'error');
          return;
        }

        if (!skills.length) {
          setFieldInvalid('techSkillsInput', true);
          setAccountMessage('Please add at least one skill.', 'error');
          return;
        }

        const townError = validateLocationPart(town, 'Town/Barangay');
        if (townError) {
          setFieldInvalid('techTown', true);
          setAccountMessage(townError, 'error');
          return;
        }

        const cityError = validateLocationPart(city, 'City/Municipality');
        if (cityError) {
          setFieldInvalid('techCity', true);
          setAccountMessage(cityError, 'error');
          return;
        }

        const provinceError = validateLocationPart(province, 'Province');
        if (provinceError) {
          setFieldInvalid('techProvince', true);
          setAccountMessage(provinceError, 'error');
          return;
        }

        const updates = {
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          mobile: mobileResult.local,
          mobile_e164: mobileResult.e164,
          skills,
          province,
          town,
          city,
          location
        };

        await usersDb.updateUserProfile(profile.uid, updates);
        activeTechnicianProfile = Object.assign({}, profile, updates, { role: 'technician' });
        await syncTechnicianProfileRealtime(profile.uid, activeTechnicianProfile);
        setGreeting(activeTechnicianProfile);
        fillAccountForm(activeTechnicianProfile);
        renderProfileCompletionPrompt(skills);
        setAccountMessage('Profile saved.', 'success');
        setAccountEditMode(false);
      } catch (_) {
        setAccountMessage('Failed to save profile. Please try again.', 'error');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  }

  function bindPasswordSection() {
    const form = document.getElementById('techPasswordForm');
    const forgotBtn = document.getElementById('techForgotPasswordBtn');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setPasswordMessage('');

      if (!usersDb || !usersDb.auth || usersDb.mode !== 'firebase') {
        setPasswordMessage('Password change requires Firebase mode.', 'error');
        return;
      }

      const currentInput = document.getElementById('techCurrentPassword');
      const newInput = document.getElementById('techNewPassword');
      const confirmInput = document.getElementById('techConfirmPassword');
      const saveBtn = document.getElementById('techPasswordSaveBtn');

      const currentValue = String(currentInput && currentInput.value ? currentInput.value : '');
      const newValue = String(newInput && newInput.value ? newInput.value : '');
      const confirmValue = String(confirmInput && confirmInput.value ? confirmInput.value : '');

      if (!currentValue || !newValue || !confirmValue) {
        setPasswordMessage('All password fields are required.', 'error');
        return;
      }

      const formatError = validateNewPasswordFormat(newValue);
      if (formatError) {
        setPasswordMessage(formatError, 'error');
        return;
      }

      if (newValue !== confirmValue) {
        setPasswordMessage('New password and confirm password do not match.', 'error');
        return;
      }

      const auth = usersDb.auth;
      const user = auth && auth.currentUser ? auth.currentUser : null;
      if (!user || !user.email || !(window.firebase && window.firebase.auth && window.firebase.auth.EmailAuthProvider)) {
        setPasswordMessage('Cannot change password right now. Please sign in again.', 'error');
        return;
      }

      if (saveBtn) saveBtn.disabled = true;
      try {
        const credential = window.firebase.auth.EmailAuthProvider.credential(user.email, currentValue);
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(newValue);

        if (currentInput) currentInput.value = '';
        if (newInput) newInput.value = '';
        if (confirmInput) confirmInput.value = '';
        setPasswordMessage('Password updated successfully.', 'success');
      } catch (error) {
        if (error && (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-login-credentials')) {
          setPasswordMessage('Current password is incorrect.', 'error');
          return;
        }
        if (error && error.code === 'auth/weak-password') {
          setPasswordMessage('New password is too weak.', 'error');
          return;
        }
        setPasswordMessage('Failed to change password. Please try again.', 'error');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });

    if (forgotBtn) {
      const authForInit = usersDb && usersDb.auth ? usersDb.auth : null;
      const initialEmail = String((authForInit && authForInit.currentUser && authForInit.currentUser.email) || (activeTechnicianProfile && activeTechnicianProfile.email) || '').trim().toLowerCase();
      if (initialEmail) {
        updateForgotPasswordButtonState(initialEmail);
      }

      forgotBtn.addEventListener('click', async () => {
        setPasswordMessage('');

        if (!usersDb || !usersDb.auth || usersDb.mode !== 'firebase') {
          setPasswordMessage('Forgot password requires Firebase mode.', 'error');
          return;
        }

        const auth = usersDb.auth;
        const email = String((auth && auth.currentUser && auth.currentUser.email) || (activeTechnicianProfile && activeTechnicianProfile.email) || '').trim().toLowerCase();
        if (!email) {
          setPasswordMessage('No email found for this account.', 'error');
          return;
        }

        const remaining = getForgotPasswordCooldownRemaining(email);
        if (remaining > 0) {
          updateForgotPasswordButtonState(email);
          setPasswordMessage(`Please wait ${Math.ceil(remaining / 1000)}s before requesting another reset link.`, 'error');
          return;
        }

        const confirmed = window.confirm(`Send a password reset link to ${email}?`);
        if (!confirmed) {
          setPasswordMessage('Password reset request cancelled.', 'error');
          return;
        }

        try {
          await auth.sendPasswordResetEmail(email);
          setForgotPasswordCooldownExpiry(email, Date.now() + FORGOT_PASSWORD_COOLDOWN_MS);
          startForgotPasswordCooldownWatcher(email);
          setPasswordMessage('Password reset link sent to your email.', 'success');
        } catch (_) {
          setPasswordMessage('Failed to send reset link. Please try again.', 'error');
        }
      });
    }
  }

  function bindTechnicianOnboarding() {
    const saveBtn = document.getElementById('techOnboardingSaveBtn');
    const laterBtn = document.getElementById('techOnboardingLaterBtn');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', async () => {
      setOnboardingMessage('');

      const profile = activeTechnicianProfile || {};
      if (!profile.uid || !(usersDb && typeof usersDb.updateUserProfile === 'function')) {
        setOnboardingMessage('Profile setup is not available for this session.', 'error');
        return;
      }

      saveBtn.disabled = true;

      try {
        const rawMobile = document.getElementById('techOnboardMobile') ? document.getElementById('techOnboardMobile').value : '';
        const selectedSkills = getSelectedSkills('techOnboardSkills');
        const locationValues = modalLocationController
          ? modalLocationController.getValues()
          : { province: '', city: '', town: '', location: '' };
        const town = normalizeSpaces(locationValues.town);
        const city = normalizeSpaces(locationValues.city);
        const province = normalizeSpaces(locationValues.province);
        const location = composeLocation(town, city, province);
        const yearsExperienceRaw = normalizeSpaces(document.getElementById('techOnboardExperience') ? document.getElementById('techOnboardExperience').value : '');
        const certifications = normalizeSpaces(document.getElementById('techOnboardCertifications') ? document.getElementById('techOnboardCertifications').value : '');

        const mobileResult = normalizeMobileForSave(rawMobile);
        if (mobileResult.error) {
          setOnboardingMessage(mobileResult.error, 'error');
          return;
        }

        const skills = selectedSkills;
        if (!skills.length) {
          setOnboardingMessage('Please add at least one skill.', 'error');
          return;
        }

        const townError = validateLocationPart(town, 'Town/Barangay');
        if (townError) {
          setOnboardingMessage(townError, 'error');
          return;
        }

        const cityError = validateLocationPart(city, 'City/Municipality');
        if (cityError) {
          setOnboardingMessage(cityError, 'error');
          return;
        }

        const provinceError = validateLocationPart(province, 'Province');
        if (provinceError) {
          setOnboardingMessage(provinceError, 'error');
          return;
        }

        const yearsExperience = yearsExperienceRaw ? Math.max(0, Number(yearsExperienceRaw) || 0) : null;

        const updates = {
          mobile: mobileResult.local,
          mobile_e164: mobileResult.e164,
          skills,
          province,
          town,
          city,
          location,
          updatedAt: Date.now()
        };

        if (yearsExperience != null) {
          updates.yearsExperience = yearsExperience;
        }
        if (certifications) {
          updates.certifications = certifications;
        }

        await usersDb.updateUserProfile(profile.uid, updates);
        activeTechnicianProfile = Object.assign({}, profile, updates, { role: 'technician' });
        await syncTechnicianProfileRealtime(profile.uid, activeTechnicianProfile);
        setGreeting(activeTechnicianProfile);
        fillAccountForm(activeTechnicianProfile);
        renderSkillChips(getTechnicianSkills(activeTechnicianProfile, activeTechnicianProfile.email));
        renderProfileCompletionPrompt(getTechnicianSkills(activeTechnicianProfile, activeTechnicianProfile.email));
        setAccountMessage('Profile saved.', 'success');
        closeTechnicianOnboarding();
        await loadTechnicianOverview(activeTechnicianProfile || {}, cachedRealtimeRequests || undefined);
      } catch (_) {
        setOnboardingMessage('Failed to save profile. Please try again.', 'error');
      } finally {
        saveBtn.disabled = false;
      }
    });

    if (laterBtn) {
      laterBtn.addEventListener('click', () => {
        closeTechnicianOnboarding();
        showSection('personal-information');
      });
    }
  }

  function toTimeValue(value) {
    if (!value) return 0;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    if (value && typeof value.toDate === 'function') return value.toDate().getTime();
    return 0;
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeSkill(value) {
    return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isPermissionDeniedError(err) {
    const code = String(err && err.code ? err.code : '').toLowerCase();
    const message = String(err && err.message ? err.message : '').toLowerCase();
    return code.includes('permission-denied') ||
      code.includes('permission_denied') ||
      message.includes('permission denied') ||
      message.includes('permission_denied');
  }

  function getActiveSectionId() {
    const active = document.querySelector('.sidebar [data-section].active');
    return active && active.dataset ? String(active.dataset.section || '').trim() : 'request-list';
  }

  function isPersonalInfoPanelActive() {
    return getActiveSectionId() === 'personal-information';
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function getWeekStart(date) {
    const ref = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = ref.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    ref.setDate(ref.getDate() + diff);
    return ref;
  }

  function isSameCalendarDate(left, right) {
    return left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate();
  }

  function getTodayDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function toDateKey(value) {
    if (!(value instanceof Date)) return '';
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }

  function normalizeStatus(item) {
    const status = String(item && item.status ? item.status : 'pending').trim().toLowerCase();
    if (status === 'approved') return 'accepted';
    return status;
  }

  function formatStatus(status) {
    const value = String(status || 'pending').replace(/[-_]+/g, ' ');
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getChatDisplayName(profile) {
    const first = normalizeSpaces(profile && profile.first_name);
    const last = normalizeSpaces(profile && profile.last_name);
    const full = normalizeSpaces(`${first} ${last}`);
    if (full) return full;
    const email = normalizeSpaces(profile && profile.email);
    if (email) return email;
    return 'Technician';
  }

  function buildPersonFullName(record) {
    const source = record && typeof record === 'object' ? record : {};
    const first = normalizeSpaces(source.first_name || source.firstName || '');
    const last = normalizeSpaces(source.last_name || source.lastName || '');
    const full = normalizeSpaces(`${first} ${last}`);
    if (full) return full;

    const direct = normalizeSpaces(
      source.name
      || source.fullName
      || source.displayName
      || source.customerName
      || source.username
      || source.userName
      || ''
    );
    return direct;
  }

  function getRequestCustomerUid(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};
    return normalizeSpaces(item && (item.customerId || item.customerUid || details.customerId || details.customerUid));
  }

  function getRequestCustomerEmail(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};
    return normalizeText(item && (item.customerEmail || details.customerEmail)).toLowerCase();
  }

  function isGenericCustomerLabel(value) {
    const normalized = normalizeText(value).toLowerCase();
    return normalized === 'customer' || normalized === 'client' || normalized === 'user';
  }

  function getCustomerDisplayLabel(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};

    const direct = normalizeSpaces(item && item.customerName ? item.customerName : details.customerName);
    if (direct && !looksLikeEmail(direct) && !isGenericCustomerLabel(direct)) return direct;

    const uid = getRequestCustomerUid(item);
    if (uid && customerNameByUid[uid]) return customerNameByUid[uid];
    if (uid && customerNameByUid[normalizeText(uid)]) return customerNameByUid[normalizeText(uid)];

    const emailKey = getRequestCustomerEmail(item);
    if (emailKey && customerNameByEmail[emailKey]) return customerNameByEmail[emailKey];

    const explicitFullName = buildPersonFullName({
      first_name: item && (item.customerFirstName || item.first_name),
      last_name: item && (item.customerLastName || item.last_name)
    }) || buildPersonFullName({
      first_name: details.customerFirstName,
      last_name: details.customerLastName
    });
    if (explicitFullName) return explicitFullName;

    const email = normalizeSpaces(item && item.customerEmail ? item.customerEmail : details.customerEmail);
    if (email) return email;

    return 'Customer';
  }

  async function resolveCustomerNamesForRequests(items) {
    if (!(usersDb && (typeof usersDb.getUserById === 'function' || typeof usersDb.getUserByEmail === 'function'))) return;

    const list = Array.isArray(items) ? items : [];
    const uniqueUids = Array.from(new Set(list
      .map((entry) => getRequestCustomerUid(entry))
      .filter(Boolean)
      .filter((uid) => !customerNameByUid[uid])));
    const uniqueEmails = Array.from(new Set(list
      .map((entry) => getRequestCustomerEmail(entry))
      .filter(Boolean)
      .filter((email) => !customerNameByEmail[email])));

    if (!uniqueUids.length && !uniqueEmails.length) return;

    const uidTasks = uniqueUids.map(async (uid) => {
      try {
        if (typeof usersDb.getUserById !== 'function') return;
        const profile = await usersDb.getUserById(uid);
        const fullName = buildPersonFullName(profile);
        if (fullName) {
          customerNameByUid[uid] = fullName;
          customerNameByUid[normalizeText(uid)] = fullName;
          const email = normalizeText(profile && (profile.email || profile.emailAddress || profile.email_address)).toLowerCase();
          if (email) customerNameByEmail[email] = fullName;
        }
      } catch (_) {
      }
    });

    const emailTasks = uniqueEmails.map(async (email) => {
      try {
        if (typeof usersDb.getUserByEmail !== 'function') return;
        const profile = await usersDb.getUserByEmail(email);
        const fullName = buildPersonFullName(profile);
        if (fullName) {
          customerNameByEmail[email] = fullName;
          const uid = normalizeSpaces(profile && (profile.uid || profile.id));
          if (uid) customerNameByUid[uid] = fullName;
          if (uid) customerNameByUid[normalizeText(uid)] = fullName;
        }
      } catch (_) {
      }
    });

    await Promise.all([...uidTasks, ...emailTasks]);
  }

  function applyResolvedCustomerNames(items) {
    const list = Array.isArray(items) ? items : [];
    list.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const resolved = getCustomerDisplayLabel(entry);
      if (resolved && !looksLikeEmail(resolved) && !isGenericCustomerLabel(resolved)) {
        entry.customerName = resolved;
      }
    });
  }

  function canOpenChatByStatus(status) {
    return ['accepted', 'confirmed', 'in-progress', 'ongoing'].includes(String(status || '').toLowerCase());
  }

  function getRequestChatPath(requestId) {
    return `chats/${String(requestId || '').trim()}`;
  }

  function getMessageTimeLabel(value) {
    const time = toTimeValue(value);
    if (!time) return '';
    try {
      return new Date(time).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch (_) {
      return '';
    }
  }

  function formatElapsedSince(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return '';
    const seconds = Math.max(1, Math.floor((Date.now() - parsed) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function getPresenceLabel(presence) {
    if (!presence || typeof presence !== 'object') return 'Offline';
    const state = String(presence.state || '').trim().toLowerCase();
    if (state === 'online') return 'Online now';
    const elapsed = formatElapsedSince(presence.lastChanged);
    return elapsed ? `Offline ${elapsed}` : 'Offline';
  }

  function ensureQuickUpdateContainer(form, containerId) {
    if (!form || !form.parentElement) return null;
    const existing = document.getElementById(containerId);
    if (existing) return existing;

    const container = document.createElement('div');
    container.id = containerId;
    container.className = 'tech-quick-update-wrap';
    form.parentElement.insertBefore(container, form);
    return container;
  }

  function renderQuickUpdateButtons(container, canUse, onSelect) {
    if (!container) return;
    const handler = typeof onSelect === 'function' ? onSelect : async function () {};

    container.innerHTML = TECH_QUICK_UPDATE_TEMPLATES.map((template, index) => {
      return `<button type="button" class="tech-quick-update-btn" data-quick-update-index="${index}" ${canUse ? '' : 'disabled'}>${escapeHtml(template.label)}</button>`;
    }).join('');

    const buttons = Array.from(container.querySelectorAll('button[data-quick-update-index]'));
    buttons.forEach((button) => {
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        const index = Number(button.getAttribute('data-quick-update-index'));
        const selected = TECH_QUICK_UPDATE_TEMPLATES[index];
        if (!selected || !selected.text) return;
        await handler(String(selected.text));
      });
    });
  }

  function stopPeerPresenceSubscription() {
    if (typeof unsubscribePeerPresence === 'function') {
      unsubscribePeerPresence();
      unsubscribePeerPresence = null;
    }
    activePeerPresenceUid = '';
  }

  function stopOwnPresenceTracking() {
    if (typeof unsubscribeOwnPresence === 'function') {
      unsubscribeOwnPresence();
      unsubscribeOwnPresence = null;
    }
  }

  function startOwnPresenceTracking(profile) {
    stopOwnPresenceTracking();
    if (presenceTrackingDisabled) return;

    const uid = String(profile && profile.uid ? profile.uid : '').trim();
    if (!uid) return;

    const rtdb = usersDb && usersDb.firebase && typeof usersDb.firebase.database === 'function'
      ? usersDb.firebase.database()
      : null;
    if (!rtdb) return;

    const connectedRef = rtdb.ref('.info/connected');
    const presenceRef = rtdb.ref(`presence/${uid}`);
    const serverTimestamp = usersDb && usersDb.firebase && usersDb.firebase.database && usersDb.firebase.database.ServerValue
      ? usersDb.firebase.database.ServerValue.TIMESTAMP
      : Date.now();

    const onConnected = (snapshot) => {
      if (!snapshot || snapshot.val() !== true) return;

      presenceRef.onDisconnect().set({
        uid,
        role: 'technician',
        state: 'offline',
        lastChanged: serverTimestamp
      }).then(() => {
        return presenceRef.set({
          uid,
          role: 'technician',
          state: 'online',
          lastChanged: serverTimestamp
        });
      }).catch((err) => {
        if (!isPermissionDeniedError(err)) return;
        presenceTrackingDisabled = true;
        stopOwnPresenceTracking();
      });
    };

    connectedRef.on('value', onConnected, (err) => {
      if (!isPermissionDeniedError(err)) return;
      presenceTrackingDisabled = true;
      stopOwnPresenceTracking();
    });
    unsubscribeOwnPresence = () => {
      connectedRef.off('value', onConnected);
      if (presenceTrackingDisabled) return;
      presenceRef.set({
        uid,
        role: 'technician',
        state: 'offline',
        lastChanged: Date.now()
      }).catch(() => {});
    };
  }

  function getCustomerPresenceUid(item) {
    return String(item && item.customerId ? item.customerId : '').trim();
  }

  function updateMessagesPeerPresence(item) {
    const el = document.getElementById('techMessagesPeerPresence');
    if (!el) return;
    const uid = getCustomerPresenceUid(item);
    const presence = uid ? peerPresenceByUid[uid] : null;
    const statusLabel = getPresenceLabel(presence);
    el.textContent = `Customer status: ${statusLabel}`;
  }

  function bindPeerPresence(item) {
    const uid = getCustomerPresenceUid(item);
    updateMessagesPeerPresence(item);

    if (!uid) {
      stopPeerPresenceSubscription();
      return;
    }

    if (uid === activePeerPresenceUid && typeof unsubscribePeerPresence === 'function') {
      return;
    }

    stopPeerPresenceSubscription();

    const rtdb = usersDb && usersDb.firebase && typeof usersDb.firebase.database === 'function'
      ? usersDb.firebase.database()
      : null;
    if (!rtdb || presenceTrackingDisabled) return;

    activePeerPresenceUid = uid;
    const ref = rtdb.ref(`presence/${uid}`);
    const onValue = (snapshot) => {
      peerPresenceByUid[uid] = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || null) : null;
      updateMessagesPeerPresence(item);
    };

    ref.on('value', onValue, () => {
      peerPresenceByUid[uid] = null;
      updateMessagesPeerPresence(item);
    });

    unsubscribePeerPresence = () => {
      ref.off('value', onValue);
    };
  }

  function isImageMediaType(value) {
    return String(value || '').trim().toLowerCase().startsWith('image/');
  }

  function isVideoMediaType(value) {
    return String(value || '').trim().toLowerCase().startsWith('video/');
  }

  function isSupportedChatAttachment(file) {
    if (!file || typeof file !== 'object') return false;
    const mediaType = String(file.type || '').trim().toLowerCase();
    return isImageMediaType(mediaType) || isVideoMediaType(mediaType);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').trim());
      reader.onerror = () => reject(new Error('Failed to read attachment file'));
      reader.readAsDataURL(file);
    });
  }

  function renderTechChatMessageContent(entry) {
    const mediaUrl = String(entry && entry.mediaDataUrl ? entry.mediaDataUrl : '').trim();
    const mediaType = String(entry && entry.mediaType ? entry.mediaType : '').trim().toLowerCase();
    const text = normalizeSpaces(entry && entry.text);
    let mediaHtml = '';

    if (mediaUrl && isImageMediaType(mediaType)) {
      mediaHtml = `<div class="tech-chat-media-wrap"><img class="tech-chat-media" src="${escapeHtml(mediaUrl)}" alt="Chat image attachment" loading="lazy"></div>`;
    } else if (mediaUrl && isVideoMediaType(mediaType)) {
      mediaHtml = `<div class="tech-chat-media-wrap"><video class="tech-chat-media" src="${escapeHtml(mediaUrl)}" controls preload="metadata"></video></div>`;
    }

    return `${mediaHtml}${escapeHtml(text || (mediaHtml ? '' : '(empty message)'))}`;
  }

  function stopRequestChatSubscription() {
    if (typeof unsubscribeRequestChat === 'function') {
      unsubscribeRequestChat();
      unsubscribeRequestChat = null;
    }
  }

  function stopMessagesChatSubscription() {
    if (typeof unsubscribeMessagesChat === 'function') {
      unsubscribeMessagesChat();
      unsubscribeMessagesChat = null;
    }
  }

  function renderRequestChatMessages(messages, technicianUid) {
    const list = document.getElementById('techRequestChatList');
    if (!list) return;

    if (!Array.isArray(messages) || !messages.length) {
      list.innerHTML = '<div class="tech-chat-empty">No messages yet.</div>';
      return;
    }

    list.innerHTML = messages.map((entry) => {
      const senderUid = String(entry && entry.senderUid ? entry.senderUid : '').trim();
      const mine = technicianUid && senderUid === technicianUid;
      const senderName = normalizeSpaces(entry && entry.senderName) || (mine ? 'You' : 'Customer');
      const timeLabel = getMessageTimeLabel(entry && entry.createdAt);
      return `<div class="tech-chat-item${mine ? ' mine' : ''}">${renderTechChatMessageContent(entry)}<span class="tech-chat-meta">${escapeHtml(senderName)}${timeLabel ? ` • ${escapeHtml(timeLabel)}` : ''}</span></div>`;
    }).join('');

    list.scrollTop = list.scrollHeight;
  }

  function bindRequestChatForItem(item) {
    const wrap = document.getElementById('techRequestChatWrap');
    const form = document.getElementById('techRequestChatForm');
    const attachBtn = document.getElementById('techRequestChatAttachBtn');
    const attachInput = document.getElementById('techRequestChatAttachmentInput');
    const input = document.getElementById('techRequestChatInput');
    const sendBtn = document.getElementById('techRequestChatSendBtn');
    const hint = document.getElementById('techRequestChatHint');
    const list = document.getElementById('techRequestChatList');
    if (!wrap || !form || !attachBtn || !attachInput || !input || !sendBtn || !hint || !list) return;
    const quickWrap = ensureQuickUpdateContainer(form, 'techRequestChatQuickUpdates');

    stopRequestChatSubscription();

    const status = normalizeStatus(item);
    const canChat = canOpenChatByStatus(status);
    const requestId = String(item && item.id ? item.id : '').trim();
    const technicianUid = String(activeTechnicianProfile && activeTechnicianProfile.uid ? activeTechnicianProfile.uid : '').trim();
    const isMine = isAssignedToTech(item || {}, activeTechnicianProfile || {});
    const canUse = canChat && !!requestId && !!technicianUid && isMine;

    wrap.hidden = false;
    if (!canUse) {
      renderQuickUpdateButtons(quickWrap, false, null);
      input.value = '';
      input.disabled = true;
      sendBtn.disabled = true;
      attachBtn.disabled = true;
      hint.textContent = 'Chat is available only when this request is accepted and assigned to you.';
      list.innerHTML = '<div class="tech-chat-empty">Chat is not available for this request yet.</div>';
      return;
    }

    input.disabled = false;
    sendBtn.disabled = false;
    attachBtn.disabled = false;
    hint.textContent = 'Live chat with customer.';

    const rtdb = usersDb && usersDb.firebase && typeof usersDb.firebase.database === 'function'
      ? usersDb.firebase.database()
      : null;
    if (!rtdb) {
      renderQuickUpdateButtons(quickWrap, false, null);
      input.disabled = true;
      sendBtn.disabled = true;
      attachBtn.disabled = true;
      list.innerHTML = '<div class="tech-chat-empty">Realtime chat is unavailable.</div>';
      return;
    }

    const canStillUseChat = () => {
      const latest = technicianRequestLookup.get(requestId) || item || {};
      const latestStatus = normalizeStatus(latest);
      const mine = isAssignedStrictlyToTech(latest || {}, activeTechnicianProfile || {});
      return !!requestId && mine && canOpenChatByStatus(latestStatus);
    };

    const lockClosedChat = () => {
      input.disabled = true;
      sendBtn.disabled = true;
      attachBtn.disabled = true;
      renderQuickUpdateButtons(quickWrap, false, null);
      hint.textContent = 'Chat is closed because this job is already completed or no longer active.';
      list.innerHTML = '<div class="tech-chat-empty">Chat is now closed for this request.</div>';
    };

    const sendMessage = async (payload) => {
      if (!canStillUseChat()) {
        lockClosedChat();
        return;
      }

      const rawText = payload && typeof payload === 'object' ? payload.text : payload;
      const text = normalizeSpaces(rawText);
      const attachment = payload && typeof payload === 'object' ? payload.attachment : null;
      const hasAttachment = !!(attachment && String(attachment.mediaDataUrl || '').trim());
      if (!text && !hasAttachment) return;

      sendBtn.disabled = true;
      attachBtn.disabled = true;
      const quickButtons = quickWrap
        ? Array.from(quickWrap.querySelectorAll('button[data-quick-update-index]'))
        : [];
      quickButtons.forEach((button) => {
        button.disabled = true;
      });
      try {
        const messagePayload = {
          requestId,
          text: text || (isVideoMediaType(attachment && attachment.mediaType) ? 'Sent a video' : 'Sent a photo'),
          senderUid: technicianUid,
          senderRole: 'technician',
          senderName: getChatDisplayName(activeTechnicianProfile || {}),
          createdAt: Date.now()
        };

        if (hasAttachment) {
          messagePayload.mediaType = String(attachment.mediaType || '').trim().toLowerCase();
          messagePayload.mediaName = String(attachment.mediaName || '').trim();
          messagePayload.mediaDataUrl = String(attachment.mediaDataUrl || '').trim();
        }

        await rtdb.ref(getRequestChatPath(requestId)).push(messagePayload);

        if (normalizeSpaces(input.value) === text) {
          input.value = '';
        }
      } catch (_) {
        window.alert('Failed to send message. Please try again.');
      } finally {
        if (canStillUseChat()) {
          sendBtn.disabled = false;
          attachBtn.disabled = false;
          quickButtons.forEach((button) => {
            button.disabled = false;
          });
        } else {
          lockClosedChat();
        }
      }
    };

    renderQuickUpdateButtons(quickWrap, true, async (text) => {
      await sendMessage({ text });
    });

    const ref = rtdb.ref(getRequestChatPath(requestId)).limitToLast(200);
    const onValue = (snapshot) => {
      const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
      const items = Object.keys(value).map((id) => Object.assign({ id }, value[id] || {}));
      items.sort((a, b) => toTimeValue(a && a.createdAt) - toTimeValue(b && b.createdAt));
      renderRequestChatMessages(items, technicianUid);
    };
    const onError = () => {
      list.innerHTML = '<div class="tech-chat-empty">Unable to load chat messages.</div>';
    };

    ref.on('value', onValue, onError);
    unsubscribeRequestChat = () => {
      ref.off('value', onValue);
    };

    form.onsubmit = async (event) => {
      event.preventDefault();
      await sendMessage({ text: input.value });
    };

    attachBtn.onclick = () => {
      if (attachBtn.disabled) return;
      attachInput.click();
    };

    attachInput.onchange = async () => {
      const file = attachInput.files && attachInput.files[0] ? attachInput.files[0] : null;
      attachInput.value = '';
      if (!file) return;

      if (!isSupportedChatAttachment(file)) {
        window.alert('Only image and video files are supported.');
        return;
      }
      if (Number(file.size) > MAX_CHAT_ATTACHMENT_BYTES) {
        window.alert('Attachment is too large. Please select a file under 6 MB.');
        return;
      }

      try {
        const mediaDataUrl = await fileToDataUrl(file);
        if (!mediaDataUrl) throw new Error('No attachment data');
        await sendMessage({
          text: input.value,
          attachment: {
            mediaType: String(file.type || '').trim(),
            mediaName: String(file.name || '').trim(),
            mediaDataUrl
          }
        });
      } catch (_) {
        window.alert('Failed to attach this file. Please try another file.');
      }
    };
  }

  function isAcceptedThreadStatus(status) {
    const normalized = String(status || '').toLowerCase();
    return normalized === 'accepted' || normalized === 'confirmed' || normalized === 'in-progress' || normalized === 'ongoing';
  }

  function getLogicalRequestTitle(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};

    const serviceType = toTitleText(details.serviceType || (item && item.serviceType) || '');
    const category = toTitleText(details.category || (item && (item.category || item.adminApprovedSkillCategory)) || '');
    const selected = toTitleText(details.selectedOptionLabel || details.selectedOptionValue || (item && (item.serviceName || item.deviceType)) || '');

    if (category && serviceType) return `${category} - ${serviceType}`;
    if (category && selected && selected.length <= 42) return `${category} - ${selected}`;
    if (category) return category;
    if (serviceType) return serviceType;
    if (selected && selected.length <= 42) return selected;
    return 'Service Request';
  }

  function getLogicalMessageTitle(item) {
    return getLogicalRequestTitle(item);
  }

  function renderMessagesThreadList(items) {
    const container = document.getElementById('techMessagesThreadList');
    if (!container) return;

    if (!Array.isArray(items) || !items.length) {
      container.innerHTML = '<div class="tech-empty">No accepted requests yet.</div>';
      return;
    }

    container.innerHTML = items.map((item) => {
      const id = String(item && item.id ? item.id : '');
      const activeClass = id && id === activeMessagesRequestId ? ' active' : '';
      const label = getLogicalMessageTitle(item);
      const customer = getCustomerDisplayLabel(item);
      const schedule = getScheduleText(item) || 'No schedule set';
      const status = formatStatus(normalizeStatus(item));
      return `<button type="button" class="tech-thread-item${activeClass}" data-message-request-id="${escapeHtml(id)}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(customer)}</span><span>${escapeHtml(schedule)}</span><span>${escapeHtml(`Status: ${status}`)}</span></button>`;
    }).join('');
  }

  function renderMessagesConversationState(hasSelected) {
    const empty = document.getElementById('techMessagesMainEmpty');
    const conversation = document.getElementById('techMessagesConversation');
    const list = document.getElementById('techMessagesChatList');
    const input = document.getElementById('techMessagesChatInput');
    const sendBtn = document.getElementById('techMessagesChatSendBtn');
    const attachBtn = document.getElementById('techMessagesAttachBtn');
    const title = document.getElementById('techMessagesRequestTitle');
    const meta = document.getElementById('techMessagesRequestMeta');
    const presence = document.getElementById('techMessagesPeerPresence');

    if (empty) empty.hidden = true;
    if (!conversation) return;
    conversation.hidden = false;

    const enabled = !!hasSelected;
    if (input) input.disabled = !enabled;
    if (sendBtn) sendBtn.disabled = !enabled;
    if (attachBtn) attachBtn.disabled = !enabled;

    if (!enabled) {
      if (title) title.textContent = 'Request';
      if (meta) meta.textContent = 'Accepted request chat';
      if (presence) presence.textContent = 'Customer status: Offline';
      if (list) list.innerHTML = '<div class="tech-chat-empty">No messages yet.</div>';
    }
  }

  function bindMessagesChatThread(item) {
    const list = document.getElementById('techMessagesChatList');
    const attachBtn = document.getElementById('techMessagesAttachBtn');
    const attachInput = document.getElementById('techMessagesAttachmentInput');
    const input = document.getElementById('techMessagesChatInput');
    const sendBtn = document.getElementById('techMessagesChatSendBtn');
    const form = document.getElementById('techMessagesChatForm');
    const title = document.getElementById('techMessagesRequestTitle');
    const meta = document.getElementById('techMessagesRequestMeta');
    const presence = document.getElementById('techMessagesPeerPresence');
    if (!list || !attachBtn || !attachInput || !input || !sendBtn || !form || !title || !meta || !presence) return;
    const quickWrap = ensureQuickUpdateContainer(form, 'techMessagesQuickUpdates');

    stopMessagesChatSubscription();

    const requestId = String(item && item.id ? item.id : '').trim();
    const technicianUid = String(activeTechnicianProfile && activeTechnicianProfile.uid ? activeTechnicianProfile.uid : '').trim();
    const isMine = isAssignedStrictlyToTech(item || {}, activeTechnicianProfile || {});
    const status = normalizeStatus(item);
    const canUse = !!requestId && !!technicianUid && isMine && isAcceptedThreadStatus(status);

    title.textContent = getLogicalMessageTitle(item) || 'Request';
    meta.textContent = `${formatRequestCode(item)} • ${formatStatus(status)}`;
    bindPeerPresence(item);

    if (!canUse) {
      renderQuickUpdateButtons(quickWrap, false, null);
      renderMessagesConversationState(false);
      return;
    }

    renderMessagesConversationState(true);
    input.disabled = false;
    sendBtn.disabled = false;
    attachBtn.disabled = false;
    list.innerHTML = '<div class="tech-chat-empty">Loading messages...</div>';

    const rtdb = usersDb && usersDb.firebase && typeof usersDb.firebase.database === 'function'
      ? usersDb.firebase.database()
      : null;
    if (!rtdb) {
      renderQuickUpdateButtons(quickWrap, false, null);
      input.disabled = true;
      sendBtn.disabled = true;
      attachBtn.disabled = true;
      list.innerHTML = '<div class="tech-chat-empty">Realtime chat is unavailable.</div>';
      return;
    }

    const canStillUseChat = () => {
      const latest = technicianRequestLookup.get(requestId) || item || {};
      const latestStatus = normalizeStatus(latest);
      const mine = isAssignedStrictlyToTech(latest || {}, activeTechnicianProfile || {});
      return !!requestId && !!technicianUid && mine && isAcceptedThreadStatus(latestStatus);
    };

    const lockClosedChat = () => {
      input.disabled = true;
      sendBtn.disabled = true;
      attachBtn.disabled = true;
      renderQuickUpdateButtons(quickWrap, false, null);
      list.innerHTML = '<div class="tech-chat-empty">Chat is closed because this job is already completed or no longer active.</div>';
    };

    const sendMessage = async (payload) => {
      if (!canStillUseChat()) {
        lockClosedChat();
        return;
      }

      const rawText = payload && typeof payload === 'object' ? payload.text : payload;
      const text = normalizeSpaces(rawText);
      const attachment = payload && typeof payload === 'object' ? payload.attachment : null;
      const hasAttachment = !!(attachment && String(attachment.mediaDataUrl || '').trim());
      if (!text && !hasAttachment) return;

      sendBtn.disabled = true;
      attachBtn.disabled = true;
      const quickButtons = quickWrap
        ? Array.from(quickWrap.querySelectorAll('button[data-quick-update-index]'))
        : [];
      quickButtons.forEach((button) => {
        button.disabled = true;
      });
      try {
        const messagePayload = {
          requestId,
          text: text || (isVideoMediaType(attachment && attachment.mediaType) ? 'Sent a video' : 'Sent a photo'),
          senderUid: technicianUid,
          senderRole: 'technician',
          senderName: getChatDisplayName(activeTechnicianProfile || {}),
          createdAt: Date.now()
        };

        if (hasAttachment) {
          messagePayload.mediaType = String(attachment.mediaType || '').trim().toLowerCase();
          messagePayload.mediaName = String(attachment.mediaName || '').trim();
          messagePayload.mediaDataUrl = String(attachment.mediaDataUrl || '').trim();
        }

        await rtdb.ref(getRequestChatPath(requestId)).push(messagePayload);

        if (normalizeSpaces(input.value) === text) {
          input.value = '';
        }
      } catch (_) {
        window.alert('Failed to send message. Please try again.');
      } finally {
        if (canStillUseChat()) {
          sendBtn.disabled = false;
          attachBtn.disabled = false;
          quickButtons.forEach((button) => {
            button.disabled = false;
          });
        } else {
          lockClosedChat();
        }
      }
    };

    renderQuickUpdateButtons(quickWrap, true, async (text) => {
      await sendMessage({ text });
    });

    const ref = rtdb.ref(getRequestChatPath(requestId)).limitToLast(200);
    const onValue = (snapshot) => {
      const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
      const items = Object.keys(value).map((id) => Object.assign({ id }, value[id] || {}));
      items.sort((a, b) => toTimeValue(a && a.createdAt) - toTimeValue(b && b.createdAt));

      if (!items.length) {
        list.innerHTML = '<div class="tech-chat-empty">No messages yet.</div>';
      } else {
        list.innerHTML = items.map((entry) => {
          const senderUid = String(entry && entry.senderUid ? entry.senderUid : '').trim();
          const mine = technicianUid && senderUid === technicianUid;
          const senderName = normalizeSpaces(entry && entry.senderName) || (mine ? 'You' : 'Customer');
          const timeLabel = getMessageTimeLabel(entry && entry.createdAt);
          return `<div class="tech-chat-item${mine ? ' mine' : ''}">${renderTechChatMessageContent(entry)}<span class="tech-chat-meta">${escapeHtml(senderName)}${timeLabel ? ` • ${escapeHtml(timeLabel)}` : ''}</span></div>`;
        }).join('');
        list.scrollTop = list.scrollHeight;
      }
    };
    const onError = () => {
      list.innerHTML = '<div class="tech-chat-empty">Unable to load chat messages.</div>';
    };

    ref.on('value', onValue, onError);
    unsubscribeMessagesChat = () => {
      ref.off('value', onValue);
    };

    form.onsubmit = async (event) => {
      event.preventDefault();
      await sendMessage({ text: input.value });
    };

    attachBtn.onclick = () => {
      if (attachBtn.disabled) return;
      attachInput.click();
    };

    attachInput.onchange = async () => {
      const file = attachInput.files && attachInput.files[0] ? attachInput.files[0] : null;
      attachInput.value = '';
      if (!file) return;

      if (!isSupportedChatAttachment(file)) {
        window.alert('Only image and video files are supported.');
        return;
      }
      if (Number(file.size) > MAX_CHAT_ATTACHMENT_BYTES) {
        window.alert('Attachment is too large. Please select a file under 6 MB.');
        return;
      }

      try {
        const mediaDataUrl = await fileToDataUrl(file);
        if (!mediaDataUrl) throw new Error('No attachment data');
        await sendMessage({
          text: input.value,
          attachment: {
            mediaType: String(file.type || '').trim(),
            mediaName: String(file.name || '').trim(),
            mediaDataUrl
          }
        });
      } catch (_) {
        window.alert('Failed to attach this file. Please try another file.');
      }
    };
  }

  function renderMessagesPanel(technicianProfile, assignedItems) {
    const onlyAccepted = (Array.isArray(assignedItems) ? assignedItems : [])
      .filter((item) => isAssignedStrictlyToTech(item || {}, technicianProfile || {}))
      .filter((item) => isAcceptedThreadStatus(normalizeStatus(item)))
      .sort((left, right) => toTimeValue(right && right.createdAt) - toTimeValue(left && left.createdAt));

    activeAcceptedMessageRequests = onlyAccepted;

    if (!onlyAccepted.length) {
      activeMessagesRequestId = '';
      stopMessagesChatSubscription();
      stopPeerPresenceSubscription();
      renderMessagesThreadList([]);
      renderMessagesConversationState(false);
      const form = document.getElementById('techMessagesChatForm');
      if (form) form.onsubmit = null;
      return;
    }

    const selectedStillExists = onlyAccepted.some((item) => String(item && item.id ? item.id : '') === activeMessagesRequestId);
    if (!selectedStillExists) {
      activeMessagesRequestId = String(onlyAccepted[0] && onlyAccepted[0].id ? onlyAccepted[0].id : '');
    }

    renderMessagesThreadList(onlyAccepted);
    const selected = onlyAccepted.find((item) => String(item && item.id ? item.id : '') === activeMessagesRequestId) || onlyAccepted[0];
    if (selected) {
      activeMessagesRequestId = String(selected.id || '');
      bindMessagesChatThread(selected);
      renderMessagesThreadList(onlyAccepted);
    }
  }

  function bindMessagesPanelControls() {
    document.addEventListener('click', (event) => {
      const btn = event.target && event.target.closest
        ? event.target.closest('[data-message-request-id]')
        : null;
      if (!btn) return;

      const requestId = String(btn.getAttribute('data-message-request-id') || '').trim();
      if (!requestId) return;

      activeMessagesRequestId = requestId;
      const selected = activeAcceptedMessageRequests.find((item) => String(item && item.id ? item.id : '') === requestId);
      if (!selected) return;

      bindMessagesChatThread(selected);
      renderMessagesThreadList(activeAcceptedMessageRequests);
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatRequestCode(item) {
    const source = String(item && (item.requestId || item.id) ? (item.requestId || item.id) : '').trim();
    if (!source) return 'N/A';
    if (usersDb && typeof usersDb.formatRequestCode === 'function') {
      return usersDb.formatRequestCode(item, source);
    }

    const bookingType = String(item && item.bookingType ? item.bookingType : '').toLowerCase();
    const requestMode = String(item && item.requestMode ? item.requestMode : '').toLowerCase();
    const serviceMode = String(item && item.serviceMode ? item.serviceMode : '').toLowerCase();
    const prefix = (bookingType === 'appointment' || requestMode === 'drop-off-store' || serviceMode.includes('drop-off') || serviceMode.includes('store')) ? 'SD' : 'HS';
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
      hash = ((hash * 33) + source.charCodeAt(i)) >>> 0;
    }
    return `${prefix}-${String(hash % 100000).padStart(5, '0')}`;
  }

  function getRating(item) {
    const candidates = [item && item.rating, item && item.technicianRating, item && item.customerRating, item && item.reviewRating];
    for (const candidate of candidates) {
      const numeric = Number(candidate);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
    }
    return null;
  }

  function getRequestLabel(item) {
    return getLogicalRequestTitle(item);
  }

  function getRequestSubtext(item) {
    const customer = getCustomerDisplayLabel(item);
    const schedule = getScheduleText(item) || 'No schedule set';
    return `${customer} • ${schedule}`;
  }

  function toTitleText(value) {
    const normalized = normalizeSpaces(value);
    if (!normalized) return '';
    return normalized
      .split(' ')
      .map((word) => word ? (word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) : '')
      .join(' ');
  }

  function getServiceType(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};
    return toTitleText(details.serviceType || (item && (item.serviceType || item.type || item.requestType))) || 'Service';
  }

  function getCategoryLabel(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};
    return toTitleText(details.category || (item && item.category)) || 'Uncategorized';
  }

  function getRepairConcern(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};
    const concern = normalizeSpaces(details.selectedOptionValue || (item && (item.repairConcern || item.concern || item.issueTitle)));
    if (concern) return concern;
    const fallback = normalizeSpaces(details.issue || (item && (item.issue || item.serviceName || item.description)));
    return fallback || 'Not specified';
  }

  function getRequestDetailsText(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};
    const detail = normalizeSpaces(details.issue || (item && (item.details || item.description)));
    if (detail) return detail;
    const fallback = normalizeSpaces(item && item.issue);
    return fallback || 'No additional details provided';
  }

  function getMediaAttachmentSummary(item) {
    const candidates = [
      item && item.mediaAttachments,
      item && item.attachments,
      item && item.media,
      item && item.images,
      item && item.photos
    ];

    for (const bucket of candidates) {
      if (Array.isArray(bucket) && bucket.length) {
        const first = normalizeSpaces(bucket[0]);
        if (bucket.length === 1) return first || '1 attachment';
        return first ? `${first} (+${bucket.length - 1} more)` : `${bucket.length} attachments`;
      }
    }

    return 'No attachment';
  }

  function buildLocationFromAddressObject(value) {
    if (!value || typeof value !== 'object') return '';
    const parts = [
      value.label,
      value.line1,
      value.line2,
      value.houseUnit,
      value.street,
      value.streetName,
      value.purok,
      value.subdivision,
      value.barangay,
      value.district,
      value.city,
      value.province,
      value.additionalDetails
    ].map((entry) => normalizeSpaces(entry)).filter(Boolean);
    return normalizeSpaces(parts.join(', '));
  }

  function getRequestLocationText(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};

    const directStringCandidates = [
      item && item.location,
      item && item.address,
      item && item.fullAddress,
      item && item.customerAddress,
      item && item.addressText,
      item && item.serviceLocation,
      item && item.selectedAddressLabel,
      details.location,
      details.address,
      details.fullAddress,
      details.selectedAddressLabel
    ];

    const direct = directStringCandidates
      .map((entry) => safeText(entry))
      .find(Boolean);
    if (direct) return direct;

    const objectCandidates = [
      item && item.location,
      item && item.selectedAddress,
      item && item.addressDetails,
      item && item.serviceAddress,
      item && item.savedAddress,
      item && item.addressObject,
      details.selectedAddress,
      details.addressDetails,
      details.serviceAddress,
      details.addressObject,
      details.location,
      details.address
    ];

    for (const candidate of objectCandidates) {
      const parsed = buildLocationFromAddressObject(candidate);
      if (parsed) return parsed;
    }

    const composed = normalizeSpaces([
      item && item.street,
      item && item.barangay,
      item && item.city,
      item && item.province
    ].filter(Boolean).join(', '));

    return composed || '';
  }

  function getTechnicianNameCandidates(profile) {
    const source = profile && typeof profile === 'object' ? profile : {};
    const names = [
      buildPersonFullName(source),
      normalizeSpaces(source.name || source.fullName || source.displayName || ''),
      normalizeSpaces(source.first_name || source.firstName || ''),
      normalizeSpaces(source.last_name || source.lastName || '')
    ].filter(Boolean);

    return Array.from(new Set(names.map((entry) => normalizeText(entry)).filter(Boolean)));
  }

  function getRequestAssignedNameCandidates(item, details) {
    const request = item && typeof item === 'object' ? item : {};
    const info = details && typeof details === 'object' ? details : {};
    const names = [
      normalizeSpaces(request.assignedTechnicianName || request.technicianName || ''),
      normalizeSpaces(info.selectedTechnicianName || ''),
      normalizeSpaces(info.technicianName || ''),
      normalizeSpaces(info.assignedTechnicianName || '')
    ].filter(Boolean);

    return Array.from(new Set(names.map((entry) => normalizeText(entry)).filter(Boolean)));
  }

  function isDagupanLocation(locationText) {
    const normalized = normalizeText(locationText);
    return normalized.includes('dagupan city') || /\bdagupan\b/.test(normalized);
  }

  function isDagupanRequest(item) {
    return isDagupanLocation(getRequestLocationText(item));
  }

  function isAssignedToTech(item, technicianProfile) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};
    const uid = String(technicianProfile && technicianProfile.uid ? technicianProfile.uid : '').toLowerCase();
    const profileId = String(technicianProfile && technicianProfile.id ? technicianProfile.id : '').toLowerCase();
    const email = String(technicianProfile && technicianProfile.email ? technicianProfile.email : '').toLowerCase();

    const uidCandidates = [
      item.assignedTechnicianId,
      item.technicianId,
      item.assignedToUid,
      item.assignedTo,
      details.selectedTechnicianId
    ].map((v) => String(v || '').toLowerCase()).filter(Boolean);

    const emailCandidates = [
      item.assignedTechnicianEmail,
      item.technicianEmail,
      item.assignedToEmail,
      details.selectedTechnicianEmail
    ].map((v) => String(v || '').toLowerCase()).filter(Boolean);

    if (uid && uidCandidates.includes(uid)) return true;
    if (profileId && uidCandidates.includes(profileId)) return true;
    if (email && emailCandidates.includes(email)) return true;

    const techNames = getTechnicianNameCandidates(technicianProfile);
    const requestNames = getRequestAssignedNameCandidates(item, details);
    if (techNames.length && requestNames.some((name) => techNames.includes(name))) return true;

    return false;
  }

  function isAssignedStrictlyToTech(item, technicianProfile) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};
    const uid = normalizeText(technicianProfile && technicianProfile.uid ? technicianProfile.uid : '');
    const profileId = normalizeText(technicianProfile && technicianProfile.id ? technicianProfile.id : '');
    const email = normalizeText(technicianProfile && technicianProfile.email ? technicianProfile.email : '');

    const uidCandidates = [
      item.assignedTechnicianId,
      item.technicianId,
      item.assignedToUid,
      item.assignedTo,
      details.selectedTechnicianId
    ].map(normalizeText).filter(Boolean);

    const emailCandidates = [
      item.assignedTechnicianEmail,
      item.technicianEmail,
      item.assignedToEmail,
      details.selectedTechnicianEmail
    ].map(normalizeText).filter(Boolean);

    if (uid && uidCandidates.includes(uid)) return true;
    if (profileId && uidCandidates.includes(profileId)) return true;
    if (email && emailCandidates.includes(email)) return true;

    const techNames = getTechnicianNameCandidates(technicianProfile);
    const requestNames = getRequestAssignedNameCandidates(item, details);
    if (techNames.length && requestNames.some((name) => techNames.includes(name))) return true;

    return false;
  }

  function hasAnyAssignedTechnician(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};
    return [
      item && item.assignedTechnicianId,
      item && item.technicianId,
      item && item.assignedToUid,
      item && item.assignedTo,
      item && item.assignedTechnicianEmail,
      item && item.technicianEmail,
      item && item.assignedToEmail,
      details && details.selectedTechnicianId,
      details && details.selectedTechnicianEmail
    ].some((entry) => normalizeText(entry));
  }

  function getRequestCategory(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};
    return normalizeSkill(
      item.adminApprovedSkillCategory ||
      details.category ||
      item.category ||
      details.serviceType ||
      item.serviceType ||
      details.selectedOptionValue ||
      details.selectedOptionLabel ||
      item.serviceName ||
      details.serviceName ||
      item.deviceType ||
      ''
    );
  }

  function toCanonicalSkillLabel(value) {
    const normalized = normalizeSkill(value);
    if (!normalized) return '';
    if (/\bhvac\b|\bair\s*con\b|\bair\s*conditioning\b|\bairconditioner\b|\bac\b/.test(normalized)) return 'HVAC Technician';
    if (/\bappliance\b|\brefrigerator\b|\bref\b|\bwasher\b|\bwashing\b|\bmicrowave\b|\boven\b/.test(normalized)) return 'Appliance Repair Technician';
    if (/\belectric\b|\belectrical\b|\belectrician\b|\bwiring\b|\bcircuit\b|\boutlet\b/.test(normalized)) return 'Electrician';
    if (/\bplumb\b|\bplumber\b|\bpipe\b|\bdrain\b|\bfaucet\b|\btoilet\b|\bsink\b|\bleak\b/.test(normalized)) return 'Plumber';
    return toTitleText(value);
  }

  function getRequestSkillAliases(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};
    const candidates = [
      item && item.adminApprovedSkillCategory,
      details.category,
      item && item.category,
      details.serviceType,
      item && item.serviceType,
      details.selectedOptionValue,
      details.selectedOptionLabel,
      item && item.serviceName,
      details.serviceName,
      item && item.deviceType,
      item && item.repairConcern,
      details.issue
    ];

    const aliases = new Set();
    candidates.forEach((entry) => {
      getSkillAliases(entry).forEach((alias) => aliases.add(alias));
    });

    return Array.from(aliases);
  }

  function getTechnicianSkills(profile, fallbackEmail) {
    const buckets = [
      profile && profile.skills,
      profile && profile.specialties,
      profile && profile.serviceCategories,
      profile && profile.fields,
      profile && profile.field
    ];

    const skills = new Set();
    buckets.forEach((bucket) => {
      if (Array.isArray(bucket)) {
        bucket.forEach((entry) => {
          const label = toCanonicalSkillLabel(entry);
          if (label) skills.add(label);
        });
        return;
      }

      if (typeof bucket === 'string') {
        const singleLabel = toCanonicalSkillLabel(bucket);
        if (singleLabel) {
          skills.add(singleLabel);
          return;
        }

        bucket.split(/[,/|]/g).forEach((entry) => {
          const label = toCanonicalSkillLabel(entry);
          if (label) skills.add(label);
        });
      }
    });

    if (!skills.size && normalizeText(fallbackEmail) === DEMO_TECH_EMAIL) {
      skills.add('Plumber');
    }

    return Array.from(skills);
  }

  function matchesTechnicianSkill(item, technicianSkills) {
    if (!Array.isArray(technicianSkills) || !technicianSkills.length) return false;
    const requestAliases = getRequestSkillAliases(item);
    if (!requestAliases.length) {
      const category = getRequestCategory(item);
      if (!category) return false;
      requestAliases.push(category);
    }

    return technicianSkills.some((skill) => {
      const techAliases = getSkillAliases(skill);
      return techAliases.some((alias) => requestAliases.includes(alias));
    });
  }

  function isAdminReviewedRequestForTechnician(item) {
    const status = normalizeStatus(item);
    return [
      'offered',
      'accepted',
      'confirmed',
      'in-progress',
      'ongoing',
      'completed',
      'finished',
      'declined',
      'rejected',
      'cancelled'
    ].includes(status);
  }

  function getScheduleText(item) {
    const preferredDate = String(item && item.preferredDate ? item.preferredDate : '').trim();
    const preferredTime = String(item && item.preferredTime ? item.preferredTime : '').trim();
    if (preferredDate && preferredTime) {
      const parsedDate = new Date(`${preferredDate}T00:00:00`);
      const dateLabel = Number.isNaN(parsedDate.getTime())
        ? preferredDate
        : parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      return `${dateLabel} ${preferredTime}`;
    }

    return String(item.preferredSchedule || item.preferred_datetime || '').trim();
  }

  function parseDateFromSchedule(text) {
    if (!text) return null;

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }

    const monthDateYear = text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})/);
    if (monthDateYear) {
      const fallback = new Date(`${monthDateYear[1]} ${monthDateYear[2]}, ${monthDateYear[3]}`);
      if (!Number.isNaN(fallback.getTime())) {
        return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
      }
    }

    return null;
  }

  function parseHourFromSchedule(text) {
    const normalized = String(text || '').trim();
    if (!normalized) return null;

    const amPmMatch = normalized.match(/\b(1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(AM|PM)\b/i);
    if (amPmMatch) {
      const hour12 = Number(amPmMatch[1]);
      const period = String(amPmMatch[2] || '').toUpperCase();
      if (!hour12) return null;
      if (period === 'AM') return hour12 === 12 ? 0 : hour12;
      return hour12 === 12 ? 12 : hour12 + 12;
    }

    const twentyFourMatch = normalized.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
    if (twentyFourMatch) {
      const hour24 = Number(twentyFourMatch[1]);
      return Number.isInteger(hour24) ? hour24 : null;
    }

    return null;
  }

  function formatHourLabel(hour24) {
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:00 ${period}`;
  }

  function isWorkingHour(hour) {
    if (!Number.isInteger(hour)) return false;
    if (hour < SHOP_OPEN_HOUR || hour >= SHOP_CLOSE_HOUR) return false;
    return hour !== LUNCH_BREAK_HOUR;
  }

  function formatDayHeader(date) {
    const label = date.toLocaleDateString(undefined, { weekday: 'short' });
    const monthDay = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${label} <span class="day-num">${monthDay}</span>`;
  }

  function formatWeekTitle(weekStart) {
    const weekEnd = addDays(weekStart, 5);
    const startMonth = weekStart.toLocaleDateString(undefined, { month: 'long' });
    const endMonth = weekEnd.toLocaleDateString(undefined, { month: 'long' });
    const startYear = weekStart.getFullYear();
    const endYear = weekEnd.getFullYear();

    if (startYear !== endYear) {
      return `${startMonth} ${startYear} / ${endMonth} ${endYear}`;
    }

    if (startMonth !== endMonth) {
      return `${startMonth} / ${endMonth} ${startYear}`;
    }

    return `${startMonth} ${startYear}`;
  }

  function formatMonthTitle(date) {
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function setCalendarOpenState(isOpen) {
    const monthCard = document.getElementById('techMonthCard');
    const toggleCalendarBtn = document.getElementById('techToggleCalendar');
    if (!monthCard || !toggleCalendarBtn) return;
    monthCard.hidden = !isOpen;
    toggleCalendarBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggleCalendarBtn.textContent = isOpen ? 'Close Calendar' : 'Calendar';
  }

  function getRequestDate(item) {
    const preferredDate = String(item && item.preferredDate ? item.preferredDate : '').trim();
    if (preferredDate) {
      const directDate = new Date(`${preferredDate}T00:00:00`);
      if (!Number.isNaN(directDate.getTime())) {
        return new Date(directDate.getFullYear(), directDate.getMonth(), directDate.getDate());
      }
    }

    const direct = parseDateFromSchedule(String(item.preferred_datetime || '').trim());
    if (direct) return direct;

    const fromSchedule = parseDateFromSchedule(getScheduleText(item));
    if (fromSchedule) return fromSchedule;

    const createdValue = toTimeValue(item.createdAt);
    if (!createdValue) return null;
    const created = new Date(createdValue);
    return new Date(created.getFullYear(), created.getMonth(), created.getDate());
  }

  function getRequestDateTime(item) {
    const preferredDate = String(item && item.preferredDate ? item.preferredDate : '').trim();
    const preferredTime = String(item && item.preferredTime ? item.preferredTime : '').trim();
    if (preferredDate) {
      const parsedDate = new Date(`${preferredDate}T00:00:00`);
      if (!Number.isNaN(parsedDate.getTime())) {
        const hour = parseHourFromSchedule(preferredTime);
        const resolvedHour = Number.isInteger(hour) ? hour : SHOP_OPEN_HOUR;
        return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), resolvedHour, 0, 0, 0);
      }
    }

    const direct = new Date(String(item && item.preferred_datetime ? item.preferred_datetime : '').trim());
    if (!Number.isNaN(direct.getTime())) return direct;

    const date = getRequestDate(item);
    const hour = parseHourFromSchedule(getScheduleText(item));
    if (date instanceof Date && Number.isInteger(hour)) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0, 0);
    }

    const createdValue = toTimeValue(item && item.createdAt);
    return createdValue ? new Date(createdValue) : new Date(0);
  }

  function getScheduledStartDateTime(item) {
    const preferredDate = String(item && item.preferredDate ? item.preferredDate : '').trim();
    const preferredTime = String(item && item.preferredTime ? item.preferredTime : '').trim();
    if (preferredDate) {
      const parsedDate = new Date(`${preferredDate}T00:00:00`);
      if (!Number.isNaN(parsedDate.getTime())) {
        const parsedHour = parseHourFromSchedule(preferredTime);
        const hour = Number.isInteger(parsedHour) ? parsedHour : SHOP_OPEN_HOUR;
        return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), hour, 0, 0, 0);
      }
    }

    const rawPreferred = String(item && item.preferred_datetime ? item.preferred_datetime : '').trim();
    const direct = rawPreferred ? new Date(rawPreferred) : null;
    if (direct instanceof Date && !Number.isNaN(direct.getTime())) return direct;

    const scheduleText = getScheduleText(item);
    const scheduleDate = parseDateFromSchedule(scheduleText);
    if (!(scheduleDate instanceof Date)) return null;

    const scheduleHour = parseHourFromSchedule(scheduleText);
    const hour = Number.isInteger(scheduleHour) ? scheduleHour : SHOP_OPEN_HOUR;
    return new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), scheduleDate.getDate(), hour, 0, 0, 0);
  }

  function canStartTaskNow(item, now = new Date()) {
    const scheduledAt = getScheduledStartDateTime(item);
    // Allow legacy requests without a valid schedule to proceed instead of getting stuck.
    if (!(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.getTime())) return true;
    return now.getTime() >= scheduledAt.getTime();
  }

  function getQueueTimingMeta(item, now = new Date()) {
    const status = normalizeStatus(item);
    if (status === 'in-progress' || status === 'ongoing') {
      return { label: 'In Progress', className: 'in-progress', priority: 0 };
    }

    if (status === 'accepted' || status === 'confirmed') {
      const scheduledAt = getScheduledStartDateTime(item);
      if (!(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.getTime())) {
        return { label: 'Scheduled', className: 'upcoming', priority: 3 };
      }

      const diff = now.getTime() - scheduledAt.getTime();
      if (diff >= 30 * 60 * 1000) {
        return { label: 'Overdue', className: 'overdue', priority: 1 };
      }
      if (diff >= 0) {
        return { label: 'Ready to Start', className: 'ready', priority: 2 };
      }
      return { label: 'Upcoming', className: 'upcoming', priority: 3 };
    }

    return { label: '', className: '', priority: 4 };
  }

  async function getAllRequests() {
    if (Array.isArray(cachedRealtimeRequests)) {
      return cachedRealtimeRequests;
    }

    if (usersDb && typeof usersDb.getAllRequests === 'function') {
      try {
        const rows = await usersDb.getAllRequests();
        return Array.isArray(rows) ? rows : [];
      } catch (_) {
      }
    }

    return await getRequestsDirectFromRealtime();
  }

  async function getRequestsDirectFromRealtime() {
    const firebaseNs = usersDb && usersDb.firebase ? usersDb.firebase : window.firebase;
    if (!firebaseNs || typeof firebaseNs.database !== 'function') return [];

    try {
      const db = firebaseNs.database();
      const snapshot = await db.ref('requests').once('value');
      const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
      return Object.keys(value).map((id) => {
        const data = value[id] && typeof value[id] === 'object' ? value[id] : {};
        return Object.assign({ id, requestId: String(data.requestId || id) }, data);
      });
    } catch (_) {
      return [];
    }
  }

  function startRealtimeRequestsForProfile(profile) {
    if (!(usersDb && typeof usersDb.subscribeAllRequests === 'function')) {
      getRequestsDirectFromRealtime().then((rows) => {
        cachedRealtimeRequests = Array.isArray(rows) ? rows : [];
        loadTechnicianOverview(profile || activeTechnicianProfile || {}, cachedRealtimeRequests);
      }).catch(() => {
        cachedRealtimeRequests = null;
      });
      return;
    }

    if (typeof unsubscribeTechRequests === 'function') {
      unsubscribeTechRequests();
      unsubscribeTechRequests = null;
    }

    unsubscribeTechRequests = usersDb.subscribeAllRequests((items) => {
      cachedRealtimeRequests = Array.isArray(items) ? items : [];
      loadTechnicianOverview(profile || activeTechnicianProfile || {}, cachedRealtimeRequests);
    }, () => {
      cachedRealtimeRequests = null;
      getRequestsDirectFromRealtime().then((rows) => {
        cachedRealtimeRequests = Array.isArray(rows) ? rows : [];
        loadTechnicianOverview(profile || activeTechnicianProfile || {}, cachedRealtimeRequests);
      }).catch(() => {
      });
    });
  }

  function renderAssignedRequests(items) {
    const list = document.getElementById('techAssignedList');
    if (!list) return;

    if (!Array.isArray(items) || !items.length) {
      list.innerHTML = '<div class="tech-empty">No open jobs right now.</div>';
      return;
    }

    const html = items.map((item) => {
      const status = normalizeStatus(item);
      const statusClass = STATUS_CLASSES[status] || 'pending';
      const rating = getRating(item);
      const showRating = (status === 'completed' || status === 'finished') && Number.isFinite(rating) && rating > 0;
      const ratingHtml = showRating ? `<span class="tech-rating">★ ${rating.toFixed(1)}</span>` : '';
      let actionButtons = '';
      if (status === 'offered' || status === 'pending') {
        actionButtons = `<button type="button" class="tech-action-btn start" data-action="accept" data-request-id="${escapeHtml(item.id || '')}">Accept</button><button type="button" class="tech-action-btn" data-action="decline" data-request-id="${escapeHtml(item.id || '')}">Decline</button>`;
      } else if (status === 'accepted' || status === 'confirmed') {
        if (canStartTaskNow(item)) {
          actionButtons = `<button type="button" class="tech-action-btn start" data-action="start" data-request-id="${escapeHtml(item.id || '')}">Start</button>`;
        } else {
          actionButtons = '<button type="button" class="tech-action-btn start" disabled title="You can start this task at its scheduled time.">Scheduled</button>';
        }
      } else if (status === 'in-progress' || status === 'ongoing') {
        actionButtons = `<button type="button" class="tech-action-btn done" data-action="done" data-request-id="${escapeHtml(item.id || '')}">Done</button>`;
      }
      return `
        <article class="tech-assigned-item" data-request-id="${escapeHtml(item.id || '')}">
          <div class="tech-assigned-main">
            <strong>${escapeHtml(getRequestLabel(item))}</strong>
            <span>${escapeHtml(getRequestSubtext(item))}</span>
          </div>
          <div class="tech-assigned-meta">
            ${ratingHtml}
            <span class="status-badge ${statusClass}">${formatStatus(status)}</span>
            ${actionButtons}
            <button type="button" class="tech-view-btn" data-request-id="${escapeHtml(item.id || '')}">View</button>
          </div>
        </article>
      `;
    }).join('');

    list.innerHTML = html;
  }

  function renderSkillChips(skills) {
    const container = document.getElementById('techSkillList');
    if (!container) return;

    if (!Array.isArray(skills) || !skills.length) {
      container.innerHTML = '<span class="tech-skill-chip">No skills set</span>';
      return;
    }

    container.innerHTML = skills
      .map((skill) => `<span class="tech-skill-chip">${escapeHtml(skill)}</span>`)
      .join('');
  }

  function renderSimpleRequestRows(containerId, items, emptyText) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!Array.isArray(items) || !items.length) {
      container.innerHTML = `<div class="tech-empty">${emptyText}</div>`;
      return;
    }

    if (containerId === 'techActiveJobsList') {
      const now = new Date();
      const orderedItems = items
        .slice()
        .sort((left, right) => {
          const leftStatus = normalizeStatus(left);
          const rightStatus = normalizeStatus(right);
          const isOpenLeft = leftStatus === 'pending' || leftStatus === 'offered';
          const isOpenRight = rightStatus === 'pending' || rightStatus === 'offered';

          // On "Jobs for You", prioritize newest open requests first.
          if (isOpenLeft && isOpenRight) {
            return toTimeValue(right && right.createdAt) - toTimeValue(left && left.createdAt);
          }

          const leftMeta = getQueueTimingMeta(left, now);
          const rightMeta = getQueueTimingMeta(right, now);
          if (leftMeta.priority !== rightMeta.priority) {
            return leftMeta.priority - rightMeta.priority;
          }
          return getRequestDateTime(left).getTime() - getRequestDateTime(right).getTime();
        });

      container.innerHTML = orderedItems.map((item) => {
        const status = normalizeStatus(item);
        const statusClass = STATUS_CLASSES[status] || 'pending';
        const timingMeta = getQueueTimingMeta(item, now);
        const customer = getCustomerDisplayLabel(item);
        const schedule = getScheduleText(item) || 'No schedule set';
        const location = getRequestLocationText(item) || 'No location provided';
        const serviceType = getServiceType(item);
        const category = getCategoryLabel(item);
        const repairConcern = getRepairConcern(item);
        const detailsText = getRequestDetailsText(item);
        const mediaText = getMediaAttachmentSummary(item);

        let actionButtons = '';
        if (status === 'offered' || status === 'pending') {
          actionButtons = `<button type="button" class="tech-action-btn start" data-action="accept" data-request-id="${escapeHtml(item.id || '')}">Accept</button><button type="button" class="tech-action-btn" data-action="decline" data-request-id="${escapeHtml(item.id || '')}">Decline</button>`;
        } else if (status === 'accepted' || status === 'confirmed') {
          if (canStartTaskNow(item)) {
            actionButtons = `<button type="button" class="tech-action-btn start" data-action="start" data-request-id="${escapeHtml(item.id || '')}">Start</button>`;
          } else {
            actionButtons = '<button type="button" class="tech-action-btn start" disabled title="You can start this task at its scheduled time.">Scheduled</button>';
          }
        } else if (status === 'in-progress' || status === 'ongoing') {
          actionButtons = `<button type="button" class="tech-action-btn done" data-action="done" data-request-id="${escapeHtml(item.id || '')}">Done</button>`;
        }

        return `
          <article class="tech-today-item" data-request-id="${escapeHtml(item.id || '')}">
            <header class="tech-today-item-head">
              <h3>${escapeHtml(getRequestLabel(item))}</h3>
              <div class="tech-today-item-badges">
                ${timingMeta.label ? `<span class="tech-queue-chip ${escapeHtml(timingMeta.className)}">${escapeHtml(timingMeta.label)}</span>` : ''}
                <span class="status-badge ${statusClass}">${escapeHtml(formatStatus(status))}</span>
              </div>
            </header>
            <div class="tech-today-item-body">
              <p><strong>Customer:</strong> ${escapeHtml(customer)}</p>
              <p><strong>Service Type:</strong> ${escapeHtml(serviceType)}</p>
              <p><strong>Category:</strong> ${escapeHtml(category)}</p>
              <p><strong>Repair Concern:</strong> ${escapeHtml(repairConcern)}</p>
              <p><strong>Schedule:</strong> ${escapeHtml(schedule)}</p>
              <p><strong>Location:</strong> ${escapeHtml(location)}</p>
              <p><strong>Details:</strong> ${escapeHtml(detailsText)}</p>
              <p><strong>Media Attachment:</strong> ${escapeHtml(mediaText)}</p>
            </div>
            <div class="tech-today-item-actions">
              ${actionButtons}
              <button type="button" class="tech-view-btn" data-request-id="${escapeHtml(item.id || '')}">View</button>
            </div>
          </article>
        `;
      }).join('');
      return;
    }

    container.innerHTML = items.map((item) => {
      const status = normalizeStatus(item);
      const statusClass = STATUS_CLASSES[status] || 'pending';

      let actionButtons = '';
      if (containerId === 'techActiveJobsList') {
        if (status === 'accepted' || status === 'confirmed') {
          if (canStartTaskNow(item)) {
            actionButtons = `<button type="button" class="tech-action-btn start" data-action="start" data-request-id="${escapeHtml(item.id || '')}">Start</button>`;
          } else {
            actionButtons = '<button type="button" class="tech-action-btn start" disabled title="You can start this task at its scheduled time.">Scheduled</button>';
          }
        } else if (status === 'in-progress' || status === 'ongoing') {
          actionButtons = `<button type="button" class="tech-action-btn done" data-action="done" data-request-id="${escapeHtml(item.id || '')}">Done</button>`;
        }
      }

      return `
        <div class="request-row" data-request-id="${escapeHtml(item.id || '')}">
          <span class="request-name">${escapeHtml(getRequestLabel(item))} • ${escapeHtml(getCustomerDisplayLabel(item))}</span>
          <span>
            <span class="status-badge ${statusClass}">${escapeHtml(formatStatus(status))}</span>
            ${actionButtons}
            <button type="button" class="tech-view-btn" data-request-id="${escapeHtml(item.id || '')}">View</button>
          </span>
        </div>
      `;
    }).join('');
  }

  async function updateRequestStatus(requestId, nextStatus) {
    const id = String(requestId || '');
    if (!id || !nextStatus) return false;

    if (String(nextStatus).toLowerCase() === 'in-progress') {
      const currentItem = technicianRequestLookup.get(id);
      if (currentItem && !canStartTaskNow(currentItem)) {
        return false;
      }
    }

    if (id.startsWith('sample_')) {
      const previous = sampleRequestOverrides.get(id) || {};
      sampleRequestOverrides.set(id, Object.assign({}, previous, { status: nextStatus }));
      return true;
    }

    if (nextStatus === 'accepted') {
      const rtdb = usersDb && usersDb.firebase && typeof usersDb.firebase.database === 'function'
        ? usersDb.firebase.database()
        : null;
      const techUid = String(activeTechnicianProfile && activeTechnicianProfile.uid ? activeTechnicianProfile.uid : '').trim();
      const techEmail = String(activeTechnicianProfile && activeTechnicianProfile.email ? activeTechnicianProfile.email : '').trim().toLowerCase();

      if (rtdb && techUid) {
        let didClaim = false;
        try {
          const ref = rtdb.ref(`requests/${id}`);
          const result = await ref.transaction((current) => {
            if (!current || typeof current !== 'object') return current;

            const status = normalizeStatus(current);
            const details = current && current.requestDetails && typeof current.requestDetails === 'object'
              ? current.requestDetails
              : {};
            const assignedId = String(current.assignedTechnicianId || current.technicianId || '').trim();
            const assignedEmail = String(current.assignedTechnicianEmail || current.technicianEmail || '').trim().toLowerCase();
            const selectedId = String(details.selectedTechnicianId || '').trim();
            const selectedEmail = String(details.selectedTechnicianEmail || '').trim().toLowerCase();
            const alreadyAssigned = !!(assignedId || assignedEmail || selectedId || selectedEmail);
            const isAssignedToCurrentTech =
              (assignedId && assignedId === techUid) ||
              (assignedEmail && assignedEmail === techEmail) ||
              (selectedId && selectedId === techUid) ||
              (selectedEmail && selectedEmail === techEmail);

            if (alreadyAssigned && isAssignedToCurrentTech) {
              didClaim = true;
              if (status === 'offered' || status === 'pending') {
                current.status = 'accepted';
              }
              current.assignedTechnicianId = techUid;
              current.technicianId = techUid;
              current.assignedTechnicianEmail = techEmail;
              current.technicianEmail = techEmail;
              current.technicianUpdatedAt = Date.now();
              return current;
            }

            if (alreadyAssigned) {
              return;
            }

            if (!(status === 'offered' || status === 'pending')) {
              return;
            }

            didClaim = true;
            current.status = 'accepted';
            current.assignedTechnicianId = techUid;
            current.technicianId = techUid;
            current.assignedTechnicianEmail = techEmail;
            current.technicianEmail = techEmail;
            current.technicianUpdatedAt = Date.now();
            return current;
          });

          if (!didClaim || !result || !result.committed) {
            window.alert('Another technician accepted this request first.');
            return false;
          }

          if (usersDb && typeof usersDb.syncScheduleLockForRequest === 'function') {
            try {
              await usersDb.syncScheduleLockForRequest(id, 'accepted');
            } catch (_) {
            }
          }

          return true;
        } catch (_) {
          return false;
        }
      }
    }

    if (usersDb && typeof usersDb.updateBookingRequestStatus === 'function') {
      try {
        await usersDb.updateBookingRequestStatus(id, nextStatus);
        return true;
      } catch (_) {
        return false;
      }
    }

    const localItem = technicianRequestLookup.get(id);
    if (localItem) {
      localItem.status = nextStatus;
      return true;
    }

    return false;
  }

  function setDetailText(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = value || '-';
  }

  function openRequestDetails(requestId) {
    const modal = document.getElementById('techDetailModal');
    const doneBtn = document.getElementById('techDetailDoneBtn');
    const chatBtn = document.getElementById('techDetailChatBtn');
    const item = technicianRequestLookup.get(String(requestId || ''));
    if (!modal || !item) return;

    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};

    setDetailText('techDetailRequest', getRequestLabel(item));
    setDetailText('techDetailRequestId', formatRequestCode(item));
    setDetailText('techDetailStatus', formatStatus(normalizeStatus(item)));
    setDetailText('techDetailCustomer', getCustomerDisplayLabel(item));
    setDetailText('techDetailServiceType', getServiceType(item));
    setDetailText('techDetailCategory', getCategoryLabel(item));
    setDetailText('techDetailRepairConcern', getRepairConcern(item));
    setDetailText('techDetailSchedule', getScheduleText(item) || safeText(details.preferredSchedule) || safeText(details.preferred_datetime) || 'No schedule set');
    setDetailText('techDetailLocation', getRequestLocationText(item) || 'No location provided');
    setDetailText('techDetailDetails', getRequestDetailsText(item));
    setDetailText('techDetailMedia', getMediaAttachmentSummary(item));

    activeDetailRequestId = String(item.id || '');
    const status = normalizeStatus(item);
    const canDone = status === 'in-progress' || status === 'ongoing';
    const canChat = isAssignedStrictlyToTech(item || {}, activeTechnicianProfile || {}) && canOpenChatByStatus(status);
    if (doneBtn) doneBtn.hidden = !canDone;
    if (chatBtn) {
      chatBtn.hidden = !canChat;
      chatBtn.disabled = !canChat;
      chatBtn.setAttribute('data-request-id', canChat ? String(item.id || '') : '');
    }

    modal.hidden = false;
  }

  function closeRequestDetails() {
    const modal = document.getElementById('techDetailModal');
    if (!modal) return;
    modal.hidden = true;
    activeDetailRequestId = '';
  }

  function bindRequestDetailControls() {
    const closeBtn = document.getElementById('techDetailCloseBtn');
    const closeSecondaryBtn = document.getElementById('techDetailCloseSecondaryBtn');
    const doneBtn = document.getElementById('techDetailDoneBtn');
    const chatBtn = document.getElementById('techDetailChatBtn');
    const modal = document.getElementById('techDetailModal');

    document.addEventListener('click', (event) => {
      const viewBtn = event.target && event.target.closest ? event.target.closest('.tech-view-btn[data-request-id]') : null;
      if (viewBtn) {
        openRequestDetails(viewBtn.getAttribute('data-request-id'));
        return;
      }

      const row = event.target && event.target.closest
        ? event.target.closest('.tech-assigned-item[data-request-id], .request-row[data-request-id]')
        : null;
      if (row && !(event.target && event.target.closest && event.target.closest('.tech-action-btn, .tech-view-btn'))) {
        openRequestDetails(row.getAttribute('data-request-id'));
        return;
      }

      if (modal && !modal.hidden && event.target === modal) {
        closeRequestDetails();
      }
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        closeRequestDetails();
      });
    }

    if (closeSecondaryBtn) {
      closeSecondaryBtn.addEventListener('click', () => {
        closeRequestDetails();
      });
    }

    if (doneBtn) {
      doneBtn.addEventListener('click', async () => {
        if (!activeDetailRequestId) return;
        doneBtn.disabled = true;
        const ok = await updateRequestStatus(activeDetailRequestId, 'completed');
        doneBtn.disabled = false;
        if (!ok) return;
        closeRequestDetails();
        await loadTechnicianOverview(activeTechnicianProfile || {});
      });
    }

    if (chatBtn) {
      chatBtn.addEventListener('click', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

        const requestId = String(
          chatBtn.getAttribute('data-request-id')
          || activeDetailRequestId
          || ''
        ).trim();

        closeRequestDetails();
        showSection('messages-page');

        if (requestId) {
          activeMessagesRequestId = requestId;
        }

        renderMessagesPanel(activeTechnicianProfile || {}, Array.from(technicianRequestLookup.values()));
      });
    }
  }

  function bindRequestActionControls() {
    document.addEventListener('click', async (event) => {
      const actionBtn = event.target && event.target.closest
        ? event.target.closest('.tech-action-btn[data-action][data-request-id]')
        : null;
      if (!actionBtn) return;

      const action = String(actionBtn.getAttribute('data-action') || '').toLowerCase();
      const requestId = String(actionBtn.getAttribute('data-request-id') || '').trim();
      if (!requestId || !action) return;

      if (action === 'start') {
        const hasOtherActive = Array.from(technicianRequestLookup.values()).some((item) => {
          const id = String(item && item.id ? item.id : '');
          if (!id || id === requestId) return false;
          if (!isAssignedToTech(item || {}, activeTechnicianProfile || {})) return false;
          const status = normalizeStatus(item);
          return status === 'in-progress' || status === 'ongoing';
        });

        if (hasOtherActive) {
          window.alert('Finish your current in-progress job before starting another one.');
          return;
        }

        const targetItem = technicianRequestLookup.get(requestId);
        if (targetItem && !canStartTaskNow(targetItem)) {
          window.alert('This job can only be started at its scheduled time.');
          return;
        }
      }

      let nextStatus = '';
      if (action === 'accept') nextStatus = 'accepted';
      if (action === 'start') nextStatus = 'in-progress';
      if (action === 'done') nextStatus = 'completed';

      if (action === 'decline') {
        actionBtn.disabled = true;
        const ok = await updateRequestStatus(requestId, 'declined');
        actionBtn.disabled = false;
        if (!ok) return;
        markRequestDeclinedForTechnician(requestId, activeTechnicianProfile || {});
        await loadTechnicianOverview(activeTechnicianProfile || {});
        return;
      }

      if (!nextStatus) return;

      actionBtn.disabled = true;
      const ok = await updateRequestStatus(requestId, nextStatus);
      actionBtn.disabled = false;
      if (!ok) return;

      await loadTechnicianOverview(activeTechnicianProfile || {});
    });
  }

  function renderSampleOverview(profile) {
    const fallbackProfile = profile || { email: DEMO_TECH_EMAIL };
    const fallbackSkills = ['Plumber'];
    const sampleRequests = buildSampleRequests(fallbackProfile).filter((item) => isDagupanRequest(item));

    technicianRequestLookup = new Map();
    sampleRequests.forEach((item) => {
      if (item && item.id) technicianRequestLookup.set(String(item.id), item);
    });

    const sampleOpenPoolCount = sampleRequests.filter((item) => {
      const status = normalizeStatus(item);
      if (status !== 'pending' && status !== 'offered') return false;
      return !hasAnyAssignedTechnician(item || {});
    }).length;

    setText('techStatAssigned', String(sampleOpenPoolCount));
    setText('techStatInProgress', String(sampleRequests.filter((item) => {
      const status = normalizeStatus(item);
      return status === 'accepted' || status === 'confirmed' || status === 'in-progress' || status === 'ongoing';
    }).length));
    setText('techStatCompleted', String(sampleRequests.filter((item) => {
      const status = normalizeStatus(item);
      return status === 'completed' || status === 'finished';
    }).length));

    const ratings = sampleRequests.map(getRating).filter((value) => Number.isFinite(value));
    const average = ratings.length
      ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)
      : '--';
    setText('techStatRating', average === '--' ? '--' : `${average} ★`);

    renderSkillChips(fallbackSkills);
    const requestsForAcceptance = sampleRequests.filter((item) => {
      const status = normalizeStatus(item);
      return status === 'pending' || status === 'offered';
    });
    renderAssignedRequests(requestsForAcceptance);

    const jobsForYou = sampleRequests
      .filter((item) => {
        const status = normalizeStatus(item);
        if (status !== 'pending' && status !== 'offered') return false;
        return !hasAnyAssignedTechnician(item || {});
      })
      .sort((left, right) => toTimeValue(right && right.createdAt) - toTimeValue(left && left.createdAt));

    setText('techStatTotal', String(jobsForYou.length));

    const today = getTodayDate();
    const activeJobs = sampleRequests.filter((item) => {
      const status = normalizeStatus(item);
      if (!['accepted', 'confirmed', 'in-progress', 'ongoing'].includes(status)) return false;
      const requestDate = getRequestDate(item);
      if (status === 'in-progress' || status === 'ongoing') return true;
      return requestDate instanceof Date && isSameCalendarDate(requestDate, today);
    }).sort((left, right) => getRequestDateTime(left).getTime() - getRequestDateTime(right).getTime());

    renderSimpleRequestRows('techActiveJobsList', jobsForYou, 'No open jobs.');
    renderSimpleRequestRows('techHistoryJobsList', [], 'No history jobs yet.');

    const scheduleItems = sampleRequests.filter((item) => {
      const status = normalizeStatus(item);
      return status === 'accepted' || status === 'confirmed' || status === 'in-progress' || status === 'ongoing';
    });
    renderSchedule(scheduleItems);
  }

  function renderSchedule(items) {
    scheduleSourceItems = Array.isArray(items) ? items : [];

    const grid = document.getElementById('techScheduleGrid');
    const title = document.getElementById('techWeekTitle');
    if (!grid) return;

    if (title) title.textContent = formatWeekTitle(scheduleWeekStart);

    const weekDays = Array.from({ length: 6 }, (_, idx) => addDays(scheduleWeekStart, idx));
    const byCell = new Map();

    scheduleSourceItems.forEach((item) => {
      const date = getRequestDate(item);
      const hour = parseHourFromSchedule(getScheduleText(item));
      if (!date || !Number.isInteger(hour)) return;
      if (!isWorkingHour(hour)) return;

      const dayIndex = weekDays.findIndex((day) => isSameCalendarDate(day, date));
      if (dayIndex < 0) return;

      const key = `${dayIndex}_${hour}`;
      const list = byCell.get(key) || [];
      list.push(item);
      byCell.set(key, list);
    });

    let html = '<div class="tech-calendar-head-time">Time</div>';
    html += weekDays.map((day) => `<div class="tech-calendar-head-day">${formatDayHeader(day)}</div>`).join('');

    for (let hour = SHOP_OPEN_HOUR; hour < SHOP_CLOSE_HOUR; hour += 1) {
      if (!isWorkingHour(hour)) continue;
      html += `<div class="tech-calendar-time">${escapeHtml(formatHourLabel(hour))}</div>`;

      for (let dayIndex = 0; dayIndex < 6; dayIndex += 1) {
        const key = `${dayIndex}_${hour}`;
        const itemsInCell = byCell.get(key) || [];

        if (!itemsInCell.length) {
          html += '<div class="tech-calendar-cell empty"></div>';
          continue;
        }

        const cards = itemsInCell.slice(0, 2).map((item) => {
          const status = normalizeStatus(item);
          return `
            <article class="tech-event-card ${escapeHtml(status)}">
              <div class="tech-event-time">${escapeHtml(formatHourLabel(hour))}</div>
              <div class="tech-event-name">${escapeHtml(getRequestLabel(item))}</div>
              <div class="tech-event-user">${escapeHtml(getCustomerDisplayLabel(item) || 'Booked User')}</div>
              <div><button type="button" class="tech-view-btn" data-request-id="${escapeHtml(item.id || '')}">View</button></div>
            </article>
          `;
        }).join('');

        html += `<div class="tech-calendar-cell">${cards}</div>`;
      }
    }

    grid.innerHTML = html;
    renderMonthCalendar(scheduleSourceItems);
  }

  function renderMonthCalendar(items) {
    const monthGrid = document.getElementById('techMonthGrid');
    const monthTitle = document.getElementById('techMonthTitle');
    if (!monthGrid) return;

    if (monthTitle) monthTitle.textContent = formatMonthTitle(scheduleMonthAnchor);

    const dateWithRequest = new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => getRequestDate(item))
        .filter((date) => date instanceof Date)
        .map((date) => toDateKey(date))
    );

    const year = scheduleMonthAnchor.getFullYear();
    const month = scheduleMonthAnchor.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    let firstDisplayDate = new Date(monthStart);
    while (firstDisplayDate.getDay() === 0 && firstDisplayDate <= monthEnd) {
      firstDisplayDate.setDate(firstDisplayDate.getDate() + 1);
    }

    const firstDayColumn = ((firstDisplayDate.getDay() + 6) % 7);
    let html = MONTH_DAY_LABELS.map((label) => `<div class="tech-month-dow">${label}</div>`).join('');
    let cellCount = 0;

    for (let gap = 0; gap < firstDayColumn; gap += 1) {
      html += '<div class="tech-month-cell empty"></div>';
      cellCount += 1;
    }

    for (let day = new Date(firstDisplayDate); day <= monthEnd; day.setDate(day.getDate() + 1)) {
      if (day.getDay() === 0) continue;
      const key = toDateKey(day);
      const hasRequest = dateWithRequest.has(key);
      const selectedClass = selectedScheduleDate && isSameCalendarDate(selectedScheduleDate, day) ? 'selected-day' : '';
      html += `<button class="tech-month-cell ${hasRequest ? 'has-request' : ''} ${selectedClass}" type="button" data-date="${key}">${day.getDate()}</button>`;
      cellCount += 1;
    }

    const remainder = cellCount % 6;
    if (remainder !== 0) {
      for (let tail = 0; tail < 6 - remainder; tail += 1) {
        html += '<div class="tech-month-cell empty"></div>';
      }
    }

    monthGrid.innerHTML = html;
  }

  function bindScheduleControls() {
    const prevBtn = document.getElementById('techWeekPrev');
    const nextBtn = document.getElementById('techWeekNext');
    const toggleCalendarBtn = document.getElementById('techToggleCalendar');
    const monthCard = document.getElementById('techMonthCard');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        scheduleWeekStart = addDays(scheduleWeekStart, -7);
        renderSchedule(scheduleSourceItems);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        scheduleWeekStart = addDays(scheduleWeekStart, 7);
        renderSchedule(scheduleSourceItems);
      });
    }

    if (toggleCalendarBtn && monthCard) {
      toggleCalendarBtn.addEventListener('click', () => {
        setCalendarOpenState(monthCard.hidden);
      });
    }

    const monthPrevBtn = document.getElementById('techMonthPrev');
    const monthNextBtn = document.getElementById('techMonthNext');

    if (monthPrevBtn) {
      monthPrevBtn.addEventListener('click', () => {
        scheduleMonthAnchor = new Date(scheduleMonthAnchor.getFullYear(), scheduleMonthAnchor.getMonth() - 1, 1);
        renderMonthCalendar(scheduleSourceItems);
      });
    }

    if (monthNextBtn) {
      monthNextBtn.addEventListener('click', () => {
        scheduleMonthAnchor = new Date(scheduleMonthAnchor.getFullYear(), scheduleMonthAnchor.getMonth() + 1, 1);
        renderMonthCalendar(scheduleSourceItems);
      });
    }

    const monthGrid = document.getElementById('techMonthGrid');
    if (monthGrid) {
      monthGrid.addEventListener('click', (event) => {
        const target = event.target && event.target.closest ? event.target.closest('[data-date]') : null;
        if (!target) return;
        const raw = String(target.getAttribute('data-date') || '').trim();
        if (!raw) return;

        const chosen = new Date(`${raw}T00:00:00`);
        if (Number.isNaN(chosen.getTime())) return;

        selectedScheduleDate = new Date(chosen.getFullYear(), chosen.getMonth(), chosen.getDate());
        scheduleWeekStart = getWeekStart(selectedScheduleDate);
        scheduleMonthAnchor = new Date(selectedScheduleDate.getFullYear(), selectedScheduleDate.getMonth(), 1);

        renderSchedule(scheduleSourceItems);
        setCalendarOpenState(false);
      });
    }
  }

  async function loadTechnicianOverview(technicianProfile, sourceRequests) {
    try {
      activeTechnicianProfile = technicianProfile || {};
      setGreeting(activeTechnicianProfile);
      if (isPersonalInfoPanelActive() || isAccountEditMode) {
        fillAccountForm(activeTechnicianProfile);
        setAccountFormEnabled(!!(activeTechnicianProfile && activeTechnicianProfile.uid));
      }
      maybeShowTechnicianOnboarding(activeTechnicianProfile);
      const allRequests = Array.isArray(sourceRequests) ? sourceRequests : await getAllRequests();
      const techSkills = getTechnicianSkills(technicianProfile, technicianProfile && technicianProfile.email);
      const isDemoAccount = normalizeText(technicianProfile && technicianProfile.email) === DEMO_TECH_EMAIL;
      const effectiveSkills = techSkills.length ? techSkills : (isDemoAccount ? ['plumbing'] : []);
      const fromRealSource = Array.isArray(allRequests) ? allRequests : [];
      let qualified = fromRealSource
        .filter((item) => matchesTechnicianSkill(item || {}, effectiveSkills) || isAssignedToTech(item || {}, technicianProfile || {}))
        .filter((item) => {
          const status = normalizeStatus(item);
          const assignedToMe = isAssignedToTech(item || {}, technicianProfile || {});
          if (assignedToMe) {
            clearDeclinedMarkForTechnician(item && item.id, technicianProfile || {});
            return true;
          }

          // Only surface open queue jobs to non-assigned technicians.
          // Requests already accepted/assigned by another technician must not be counted in "Jobs for You".
          if (status === 'offered' || status === 'pending') {
            const details = item && item.requestDetails && typeof item.requestDetails === 'object'
              ? item.requestDetails
              : {};
            const hasAssignee = [
              item && item.assignedTechnicianId,
              item && item.technicianId,
              item && item.assignedToUid,
              item && item.assignedTo,
              item && item.assignedTechnicianEmail,
              item && item.technicianEmail,
              item && item.assignedToEmail,
              details && details.selectedTechnicianId,
              details && details.selectedTechnicianEmail
            ].some((entry) => normalizeText(entry));

            if (hasAssignee) return false;
            return !hasTechnicianDeclinedRequest(item && item.id, technicianProfile || {});
          }
          return false;
        });

      const sampleRequests = buildSampleRequests(activeTechnicianProfile);
      const sampleQualified = sampleRequests
        .filter((item) => matchesTechnicianSkill(item || {}, effectiveSkills) || isAssignedToTech(item || {}, technicianProfile || {}))
        .filter((item) => isDagupanRequest(item))
        ;
      if (FORCE_SAMPLE_REQUESTS) {
        qualified = [...qualified, ...sampleQualified];
      }

      await resolveCustomerNamesForRequests(qualified);
      applyResolvedCustomerNames(qualified);

      technicianRequestLookup = new Map();
      qualified.forEach((item) => {
        if (item && item.id) technicianRequestLookup.set(String(item.id), item);
      });

      let assigned = qualified.filter((item) => isAssignedToTech(item || {}, technicianProfile || {}));
      let strictlyAssigned = qualified.filter((item) => isAssignedStrictlyToTech(item || {}, technicianProfile || {}));

      const hasSampleItems = qualified.some((item) => String(item && item.id ? item.id : '').startsWith('sample_'));
      if (FORCE_SAMPLE_REQUESTS && hasSampleItems && !assigned.length) {
        assigned = qualified.slice();
      }
      if (FORCE_SAMPLE_REQUESTS && hasSampleItems && !strictlyAssigned.length) {
        strictlyAssigned = qualified.slice();
      }

      const sourceForJobs = strictlyAssigned.length ? strictlyAssigned : assigned;

      if (getActiveSectionId() === 'messages-page') {
        renderMessagesPanel(technicianProfile || {}, sourceForJobs);
      }

      renderSkillChips(effectiveSkills);
      renderProfileCompletionPrompt(effectiveSkills);

      const inProgressCount = assigned.filter((item) => {
        const status = normalizeStatus(item);
        return status === 'accepted' || status === 'confirmed' || status === 'in-progress' || status === 'ongoing';
      }).length;

      const completedCount = assigned.filter((item) => {
        const status = normalizeStatus(item);
        return status === 'completed' || status === 'finished';
      }).length;

      const ratings = assigned.map(getRating).filter((value) => Number.isFinite(value));
      const average = ratings.length
        ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)
        : '--';

      const openPoolCount = qualified.filter((item) => {
        const status = normalizeStatus(item);
        if (status !== 'pending' && status !== 'offered') return false;
        return !hasAnyAssignedTechnician(item || {});
      }).length;

      setText('techStatAssigned', String(openPoolCount));
      setText('techStatInProgress', String(inProgressCount));
      setText('techStatCompleted', String(completedCount));
      setText('techStatRating', average === '--' ? '--' : `${average} ★`);

        const today = getTodayDate();

        const requestsForAcceptance = qualified.filter((item) => {
          const status = normalizeStatus(item);
          const strictlyMine = isAssignedStrictlyToTech(item || {}, technicianProfile || {});

          if (status === 'offered' || status === 'pending') {
            return true;
          }

          if (!(status === 'accepted' || status === 'confirmed' || status === 'in-progress' || status === 'ongoing')) return false;
          if (!strictlyMine) return false;

          const requestDate = getRequestDate(item);
          if (!(requestDate instanceof Date)) return true;
          return requestDate.getTime() >= today.getTime();
        }).sort((left, right) => toTimeValue(right.createdAt) - toTimeValue(left.createdAt));
        if (getActiveSectionId() === 'request-list') {
          renderAssignedRequests(requestsForAcceptance);
        }

      const jobsForYou = qualified.filter((item) => {
        const status = normalizeStatus(item);
        const assignedToMe = isAssignedToTech(item || {}, technicianProfile || {});
        if (status !== 'offered' && status !== 'pending') return false;
        if (assignedToMe) return true;
        if (hasAnyAssignedTechnician(item || {})) return false;
        return true;
      }).sort((left, right) => toTimeValue(right && right.createdAt) - toTimeValue(left && left.createdAt));

      setText('techStatTotal', String(jobsForYou.length));

      const activeJobs = sourceForJobs.filter((item) => {
        const status = normalizeStatus(item);
        if (!['accepted', 'confirmed', 'in-progress', 'ongoing'].includes(status)) return false;

        const requestDate = getRequestDate(item);
        if (status === 'in-progress' || status === 'ongoing') return true;
        if (!(requestDate instanceof Date)) return false;
        return isSameCalendarDate(requestDate, today);
      }).sort((left, right) => getRequestDateTime(left).getTime() - getRequestDateTime(right).getTime());

      const activeIds = new Set(activeJobs.map((item) => String(item && item.id ? item.id : '')));

      const historyJobs = sourceForJobs.filter((item) => {
        const status = normalizeStatus(item);
        if (activeIds.has(String(item && item.id ? item.id : ''))) return false;
        if (['completed', 'finished', 'declined', 'rejected', 'cancelled'].includes(status)) return true;

        if (status === 'accepted' || status === 'confirmed' || status === 'pending' || status === 'offered') {
          const requestDate = getRequestDate(item);
          return requestDate instanceof Date && requestDate.getTime() < today.getTime();
        }

        return false;
      }).sort((left, right) => toTimeValue(right.createdAt) - toTimeValue(left.createdAt));

      if (getActiveSectionId() === 'accepted-request') {
        renderSimpleRequestRows('techActiveJobsList', jobsForYou, 'No open jobs.');
      }
      if (getActiveSectionId() === 'history-request') {
        renderSimpleRequestRows('techHistoryJobsList', historyJobs, 'No history jobs yet.');
      }

      const scheduleItems = sourceForJobs
        .filter((item) => {
          const status = normalizeStatus(item);
          return status === 'accepted' || status === 'confirmed' || status === 'in-progress' || status === 'ongoing';
        })
        .sort((left, right) => getRequestDateTime(left).getTime() - getRequestDateTime(right).getTime());

      if (getActiveSectionId() === 'schedule-page') {
        renderSchedule(scheduleItems);
      }
    } catch (error) {
      console.error('Technician overview sync failed.', error);
      activeTechnicianProfile = technicianProfile || {};
      setGreeting(activeTechnicianProfile);
      if (isPersonalInfoPanelActive() || isAccountEditMode) {
        fillAccountForm(activeTechnicianProfile);
        setAccountFormEnabled(!!(activeTechnicianProfile && activeTechnicianProfile.uid));
      }
      maybeShowTechnicianOnboarding(activeTechnicianProfile);
      const fallbackSkills = getTechnicianSkills(activeTechnicianProfile, activeTechnicianProfile && activeTechnicianProfile.email);
      renderSkillChips(fallbackSkills);
      renderProfileCompletionPrompt(fallbackSkills);
      if (getActiveSectionId() === 'messages-page') {
        renderMessagesPanel(activeTechnicianProfile || {}, []);
      }
      setText('techStatTotal', '0');
      setText('techStatAssigned', '0');
      setText('techStatInProgress', '0');
      setText('techStatCompleted', '0');
      setText('techStatRating', '--');
      if (getActiveSectionId() === 'request-list') {
        renderAssignedRequests([]);
      }
      if (getActiveSectionId() === 'accepted-request') {
        renderSimpleRequestRows('techActiveJobsList', [], 'No open jobs.');
      }
      if (getActiveSectionId() === 'history-request') {
        renderSimpleRequestRows('techHistoryJobsList', [], 'No history jobs yet.');
      }
      if (getActiveSectionId() === 'schedule-page') {
        renderSchedule([]);
      }
    }
  }

  const navLinks = Array.from(document.querySelectorAll('.sidebar [data-section]'));
  const panels = Array.from(document.querySelectorAll('[data-panel]'));
  const navGroups = Array.from(document.querySelectorAll('.sidebar .nav-group'));

  function showSection(sectionId) {
    navGroups.forEach((group) => {
      if (group.hasAttribute('open')) group.removeAttribute('open');
    });

    navLinks.forEach((link) => {
      const isActive = link.dataset.section === sectionId;
      link.classList.toggle('active', isActive);
      if (isActive) {
        const parentGroup = link.closest('.nav-group');
        if (parentGroup) parentGroup.setAttribute('open', 'open');
      }
    });

    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== sectionId;
    });

    if (sectionId === 'personal-information') {
      ensureLocationControllersInitialized({ includeAccount: true, includeModal: false });
      fillAccountForm(activeTechnicianProfile || {});
      setAccountFormEnabled(!!(activeTechnicianProfile && activeTechnicianProfile.uid));
    }

    if (sectionId === 'accepted-request') {
      loadTechnicianOverview(activeTechnicianProfile || {}, cachedRealtimeRequests || undefined);
    }

    if (sectionId === 'history-request') {
      loadTechnicianOverview(activeTechnicianProfile || {}, cachedRealtimeRequests || undefined);
    }

    if (sectionId === 'schedule-page') {
      loadTechnicianOverview(activeTechnicianProfile || {}, cachedRealtimeRequests || undefined);
    }

    if (sectionId === 'messages-page') {
      loadTechnicianOverview(activeTechnicianProfile || {}, cachedRealtimeRequests || undefined);
    }
  }

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      showSection(link.dataset.section);
    });
  });

  function ensureLocationControllersInitialized(options = {}) {
    const includeAccount = options.includeAccount !== false;
    const includeModal = options.includeModal !== false;

    if (!locationControllersInitialized) {
      accountLocationController = createLocationController({
        provinceId: 'techProvince',
        cityId: 'techCity',
        townId: 'techTown'
      });

      modalLocationController = createLocationController({
        provinceId: 'techOnboardProvince',
        cityId: 'techOnboardCity',
        townId: 'techOnboardTown'
      });

      locationControllersInitialized = true;
    }

    if (includeAccount && accountLocationController && !accountLocationController.__initialized) {
      accountLocationController.init();
      accountLocationController.__initialized = true;
    }

    if (includeModal && modalLocationController && !modalLocationController.__initialized) {
      modalLocationController.init();
      modalLocationController.__initialized = true;
    }
  }

  ns.bindSidebarToggle();
  ns.bindUserMenu();
  ns.bindAuthState();
  ns.bindSignOut();
  bindScheduleControls();
  bindAccountSection();
  bindPasswordSection();
  bindTechnicianOnboarding();
  bindRequestDetailControls();
  bindRequestActionControls();
  bindMessagesPanelControls();

  if (usersDb && usersDb.auth) {
    usersDb.auth.onAuthStateChanged(async (user) => {
      if (user) {
        let profile = { uid: user.uid, email: user.email || '' };
        if (typeof usersDb.getUserById === 'function') {
          try {
            const loaded = await usersDb.getUserById(user.uid);
            if (loaded) profile = Object.assign({}, loaded, profile);
          } catch (_) {
          }
        }
        startRealtimeRequestsForProfile(profile);
        startOwnPresenceTracking(profile);
        loadTechnicianOverview(profile);
        return;
      }

      stopOwnPresenceTracking();
      stopPeerPresenceSubscription();

      if (typeof unsubscribeTechRequests === 'function') {
        unsubscribeTechRequests();
        unsubscribeTechRequests = null;
      }
      cachedRealtimeRequests = null;

      if (ns && typeof ns.hasDemoSession === 'function' && ns.hasDemoSession()) {
        let demoProfile = { uid: '', email: DEMO_TECH_EMAIL, role: 'technician' };
        try {
          const raw = sessionStorage.getItem(DEMO_TECH_PROFILE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              demoProfile = Object.assign({}, demoProfile, parsed);
            }
          }
        } catch (_) {
        }
        loadTechnicianOverview(demoProfile);
      }
    });
  } else {
    loadTechnicianOverview({ uid: '', email: DEMO_TECH_EMAIL, skills: ['plumbing'] });
  }

  window.addEventListener('beforeunload', () => {
    if (typeof unsubscribeTechRequests === 'function') {
      unsubscribeTechRequests();
      unsubscribeTechRequests = null;
    }
    stopMessagesChatSubscription();
    stopRequestChatSubscription();
    stopPeerPresenceSubscription();
    stopOwnPresenceTracking();
  });
});
