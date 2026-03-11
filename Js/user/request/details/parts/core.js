(function () {
  const ns = (window.hfsRequestDetails = window.hfsRequestDetails || {});

  ns.init = function initRequestDetailsPage() {
  const usersDb = window.usersDatabase || window.homefixDB || null;
  const DRAFT_KEY = 'hfs_booking_draft';
  const MAX_FILES = 4;
  const MAX_PHOTO_SIZE_MB = 5;
  const MAX_VIDEO_SIZE_MB = 20;
  const MIN_ISSUE_LENGTH = 10;
  const MAX_ISSUE_LENGTH = 200;
  const MIN_HOUSE_UNIT_LENGTH = 2;
  const MAX_HOUSE_UNIT_LENGTH = 30;
  const MIN_STREET_NAME_LENGTH = 2;
  const MAX_STREET_NAME_LENGTH = 60;
  const MIN_ADDRESS_LANDMARK_LENGTH = 10;
  const MAX_ADDRESS_LANDMARK_LENGTH = 80;

  const SERVICE_CATALOG = [
    { serviceType: 'repair', category: 'aircon', serviceName: 'Air Conditioner Repair', appointmentRequired: true },
    { serviceType: 'installation', category: 'aircon', serviceName: 'Air Conditioner Installation', appointmentRequired: true },
    { serviceType: 'repair', category: 'appliance', serviceName: 'Refrigerator Repair', appointmentRequired: true },
    { serviceType: 'installation', category: 'appliance', serviceName: 'Refrigerator water line installation (ice maker/water dispenser)', appointmentRequired: true },
    { serviceType: 'installation', category: 'appliance', serviceName: 'Dishwasher water & drain hookup', appointmentRequired: true },
    { serviceType: 'installation', category: 'appliance', serviceName: 'Washing machine water & drain hookup', appointmentRequired: true },
    { serviceType: 'installation', category: 'appliance', serviceName: 'Dryer electrical & vent installation', appointmentRequired: true },
    { serviceType: 'repair', category: 'appliance', serviceName: 'Washing Machine Repair', appointmentRequired: true },
    { serviceType: 'repair', category: 'electrical', serviceName: 'Electrical Wiring Repair', appointmentRequired: true },
    { serviceType: 'installation', category: 'electrical', serviceName: 'Light Fixture Installation', appointmentRequired: true },
    { serviceType: 'installation', category: 'electrical', serviceName: 'Ceiling Fan Installation', appointmentRequired: true },
    { serviceType: 'repair', category: 'plumbing', serviceName: 'Plumbing Leak Repair', appointmentRequired: true },
    { serviceType: 'installation', category: 'plumbing', serviceName: 'Faucet Installation', appointmentRequired: true },
    { serviceType: 'repair', category: 'plumbing', serviceName: 'Water Heater Repair', appointmentRequired: true },
    { serviceType: 'installation', category: 'plumbing', serviceName: 'Water Heater Installation', appointmentRequired: true },
    { serviceType: 'maintenance', category: 'aircon', serviceName: 'Air Conditioner Maintenance', appointmentRequired: true },
    { serviceType: 'maintenance', category: 'appliance', serviceName: 'Refrigerator Maintenance', appointmentRequired: true },
    { serviceType: 'maintenance', category: 'electrical', serviceName: 'Electrical Maintenance', appointmentRequired: true }
  ];

  const form = document.getElementById('requestFlowForm');
  const flowTitle = document.getElementById('flowTitle');
  const backBtn = document.getElementById('backBtn');
  const nextBtn = document.getElementById('nextBtn');

  const step1 = document.getElementById('step1RequestService');
  const step2 = document.getElementById('step2Schedule');
  const step3Address = document.getElementById('step3Address');
  const step4Technician = document.getElementById('step4Technician');
  const step3 = document.getElementById('step3Confirm');
  const step4 = document.getElementById('step4Submitted');

  const serviceTypeInput = document.getElementById('serviceType');
  const categoryInput = document.getElementById('serviceCategory');
  const repairOptionWrap = document.getElementById('repairOptionWrap');
  const repairOptionInput = document.getElementById('repairOption');
  const installationOptionWrap = document.getElementById('installationOptionWrap');
  const installationOptionInput = document.getElementById('installationOption');
  const issueInput = document.getElementById('issue');

  const uploadBtn = document.getElementById('uploadBtn');
  const mediaInput = document.getElementById('mediaInput');
  const mediaPreview = document.getElementById('mediaPreview');

  const errorServiceType = document.getElementById('error-serviceType');
  const errorCategory = document.getElementById('error-category');
  const errorRepairOption = document.getElementById('error-repairOption');
  const errorInstallationOption = document.getElementById('error-installationOption');
  const errorIssue = document.getElementById('error-issue');
  const errorMedia = document.getElementById('error-media');
  const errorSchedule = document.getElementById('error-schedule');
  const errorRequestAddress = document.getElementById('error-requestAddress');
  const errorRequestTechnician = document.getElementById('error-requestTechnician');
  const errorRequestAddressAdd = document.getElementById('error-requestAddressAdd');
  const errorTerms = document.getElementById('error-terms');
  const errorSubmit = document.getElementById('error-submit');

  const requestAddressOptions = document.getElementById('requestAddressOptions');
  const requestAddAddressBox = document.getElementById('requestAddAddressBox');
  const requestOpenAddAddressBtn = document.getElementById('requestOpenAddAddressBtn');
  const requestCloseAddAddressBtn = document.getElementById('requestCloseAddAddressBtn');
  const requestAddressHouseUnit = document.getElementById('requestAddressHouseUnit');
  const requestAddressStreetName = document.getElementById('requestAddressStreetName');
  const requestAddressBarangay = document.getElementById('requestAddressBarangay');
  const requestAddressAdditionalDetails = document.getElementById('requestAddressAdditionalDetails');
  const requestSaveAddressBtn = document.getElementById('requestSaveAddressBtn');
  const requestTechnicianSelect = document.getElementById('requestTechnician');

  const schedulePicker = document.getElementById('schedulePicker');
  const monthLabel = document.getElementById('calendarMonth');
  const grid = document.getElementById('calendarGrid');
  const prevBtn = document.getElementById('prevMonth');
  const nextMonthBtn = document.getElementById('nextMonth');
  const timeTitle = document.getElementById('timeTitle');
  const timeSlots = document.getElementById('timeSlots');
  const selectedText = document.getElementById('scheduleSelected');
  const preferredDatetime = document.getElementById('preferredDatetime');
  const serviceModeNote = document.getElementById('serviceModeNote');

  const summaryServiceType = document.getElementById('summaryServiceType');
  const summaryServiceMode = document.getElementById('summaryServiceMode');
  const summaryAddress = document.getElementById('summaryAddress');
  const summaryTechnician = document.getElementById('summaryTechnician');
  const summaryCategory = document.getElementById('summaryCategory');
  const summarySelectedOptionRow = document.getElementById('summarySelectedOptionRow');
  const summarySelectedOptionLabel = document.getElementById('summarySelectedOptionLabel');
  const summarySelectedOption = document.getElementById('summarySelectedOption');
  const summarySchedule = document.getElementById('summarySchedule');
  const summaryIssue = document.getElementById('summaryIssue');
  const summaryMedia = document.getElementById('summaryMedia');
  const summaryMediaPreview = document.getElementById('summaryMediaPreview');
  const confirmTerms = document.getElementById('confirmTerms');
  const submittedRequestId = document.getElementById('submittedRequestId');
  const copyRequestIdBtn = document.getElementById('copyRequestIdBtn');
  const copyRequestIdStatus = document.getElementById('copyRequestIdStatus');

  if (!form || !monthLabel || !grid || !prevBtn || !nextMonthBtn || !timeTitle || !timeSlots || !selectedText || !preferredDatetime || !mediaInput || !mediaPreview) {
    return;
  }

  if (!usersDb || !usersDb.auth) {
    window.location.href = '../../login.html';
    return;
  }

  let signedInUser = null;
  let currentStep = 1;
  let selectedMedia = [];
  let isSubmitting = false;
  let summaryAddressRequestSeq = 0;
  let technicianLoadSeq = 0;
  let requestAddresses = [];
  let selectedRequestAddressId = '';
  let availableTechnicians = [];
  let selectedTechnicianId = '';

  const searchParams = new URLSearchParams(window.location.search);
  const requestedType = String(searchParams.get('type') || searchParams.get('bookingType') || '').toLowerCase();
  if (requestedType !== 'appointment' && requestedType !== 'technician') {
    window.location.href = 'book.html';
    return;
  }

  const slotValues = ['9:00am - 10:00am', '10:00am - 11:00am', '12:00pm - 1:00pm', '1:00pm - 2:00pm', '2:00pm - 3:00pm', '3:00pm - 4:00pm'];
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const maxSelectableDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  maxSelectableDate.setMonth(maxSelectableDate.getMonth() + 2);
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const maxMonthStart = new Date(maxSelectableDate.getFullYear(), maxSelectableDate.getMonth(), 1);
  let viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
  let selectedDate = null;
  let selectedTime = null;

  function toTitleCase(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatCategoryLabel(category) {
    const normalized = String(category || '').trim().toLowerCase();
    if (normalized === 'appliance') return 'Appliances';
    if (normalized === 'aircon') return 'Aircon';
    return toTitleCase(normalized);
  }

  function normalizeSkill(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getSkillAliases(skill) {
    const normalized = normalizeSkill(skill);
    if (!normalized) return [];

    const aliases = new Set([normalized]);
    if (/\bplumb\b|\bplumber\b|\bpipe\b|\bdrain\b|\bfaucet\b|\btoilet\b|\bsink\b|\bleak\b/.test(normalized)) {
      aliases.add('plumbing');
      aliases.add('plumber');
    }
    if (/\belectric\b|\belectrical\b|\belectrician\b|\bwiring\b|\bcircuit\b|\boutlet\b/.test(normalized)) {
      aliases.add('electrical');
      aliases.add('electrician');
    }
    if (/\bhvac\b|\bair\s*con\b|\bair\s*conditioning\b|\bairconditioner\b|\bac\b/.test(normalized)) {
      aliases.add('aircon');
      aliases.add('air conditioner');
    }
    if (/\bappliance\b|\brefrigerator\b|\bref\b|\bwasher\b|\bwashing\b|\bmicrowave\b|\boven\b/.test(normalized)) {
      aliases.add('appliance');
      aliases.add('appliances');
    }

    return Array.from(aliases);
  }

  function parseTechnicianSkills(profile) {
    const source = profile && typeof profile === 'object' ? profile : {};
    const buckets = [
      source.skills,
      source.specialties,
      source.serviceCategories,
      source.fields,
      source.field,
      source.primarySkill
    ];

    const skillSet = new Set();
    buckets.forEach((bucket) => {
      if (Array.isArray(bucket)) {
        bucket.forEach((entry) => {
          getSkillAliases(entry).forEach((alias) => skillSet.add(alias));
        });
        return;
      }

      const raw = String(bucket || '').trim();
      if (!raw) return;
      raw.split(/[,/|]/g).forEach((entry) => {
        getSkillAliases(entry).forEach((alias) => skillSet.add(alias));
      });
    });

    return Array.from(skillSet);
  }

  function buildTechnicianDisplayName(profile) {
    const firstName = String(profile && (profile.first_name || profile.firstName || profile.firstname) || '').trim();
    const lastName = String(profile && (profile.last_name || profile.lastName || profile.lastname) || '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (fullName) return fullName;
    return String(profile && profile.name || '').trim();
  }

  function getTechnicianEmail(profile) {
    return String(profile && (profile.email || profile.emailAddress || profile.email_address) || '').trim().toLowerCase();
  }

  function normalizeTechnicianEntry(uid, profile) {
    const id = String(uid || profile && profile.uid || profile && profile.id || '').trim();
    const email = getTechnicianEmail(profile);
    const name = buildTechnicianDisplayName(profile) || email || 'Technician';
    const skills = parseTechnicianSkills(profile);
    return {
      id,
      uid: id,
      email,
      name,
      skills,
      raw: profile && typeof profile === 'object' ? profile : {}
    };
  }

  function shouldIncludeTechnicianForCategory(entry, category) {
    const normalizedCategory = normalizeSkill(category);
    if (!normalizedCategory) return false;
    const categoryAliases = new Set(getSkillAliases(normalizedCategory));
    if (!categoryAliases.size) categoryAliases.add(normalizedCategory);

    const skillSet = new Set(Array.isArray(entry && entry.skills) ? entry.skills : []);
    return Array.from(categoryAliases).some((alias) => skillSet.has(alias));
  }

  function getRealtimeDbInstance() {
    const firebaseNs = (usersDb && usersDb.firebase) || window.firebase;
    if (!firebaseNs || typeof firebaseNs.database !== 'function') return null;
    try {
      return firebaseNs.database();
    } catch (_) {
      return null;
    }
  }

  function renderTechnicianOptions(options) {
    if (!requestTechnicianSelect) return;

    const items = Array.isArray(options) ? options : [];
    requestTechnicianSelect.innerHTML = '';

    const firstOption = document.createElement('option');
    firstOption.value = '';
    firstOption.textContent = items.length ? 'Select technician' : 'No available technician for this category yet';
    requestTechnicianSelect.appendChild(firstOption);

    items.forEach((entry) => {
      const option = document.createElement('option');
      option.value = String(entry.id || '').trim();
      option.textContent = String(entry.name || 'Technician').trim();
      requestTechnicianSelect.appendChild(option);
    });

    if (selectedTechnicianId && items.some((entry) => String(entry.id || '') === selectedTechnicianId)) {
      requestTechnicianSelect.value = selectedTechnicianId;
    } else {
      selectedTechnicianId = '';
      requestTechnicianSelect.value = '';
    }
  }

  function getSelectedTechnician() {
    return availableTechnicians.find((entry) => String(entry.id || '') === String(selectedTechnicianId || '')) || null;
  }

  async function refreshTechnicianOptions() {
    if (requestedType !== 'technician' || !requestTechnicianSelect) return;

    const category = String(categoryInput && categoryInput.value ? categoryInput.value : '').trim().toLowerCase();
    if (!category) {
      availableTechnicians = [];
      renderTechnicianOptions([]);
      return;
    }

    const requestSeq = ++technicianLoadSeq;
    requestTechnicianSelect.disabled = true;

    try {
      const rtdb = getRealtimeDbInstance();
      if (!rtdb) {
        availableTechnicians = [];
        renderTechnicianOptions([]);
        return;
      }

      const snapshot = await rtdb.ref('technicians').once('value');
      if (requestSeq !== technicianLoadSeq) return;

      const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
      const list = Object.keys(value).map((uid) => normalizeTechnicianEntry(uid, value[uid]))
        .filter((entry) => entry.id && (entry.name || entry.email))
        .filter((entry) => shouldIncludeTechnicianForCategory(entry, category))
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));

      availableTechnicians = list;
      renderTechnicianOptions(list);
    } catch (_) {
      if (requestSeq !== technicianLoadSeq) return;
      availableTechnicians = [];
      renderTechnicianOptions([]);
    } finally {
      if (requestSeq === technicianLoadSeq && requestTechnicianSelect) {
        requestTechnicianSelect.disabled = false;
      }
    }
  }

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeAddressEntry(entry) {
    return {
      id: String((entry && (entry.id || entry.addressId)) || '').trim(),
      houseUnit: String(entry && entry.houseUnit ? entry.houseUnit : '').trim(),
      streetName: String(entry && entry.streetName ? entry.streetName : '').trim(),
      barangay: String(entry && entry.barangay ? entry.barangay : '').trim(),
      additionalDetails: String(entry && entry.additionalDetails ? entry.additionalDetails : '').trim(),
      city: String(entry && entry.city ? entry.city : 'Dagupan City').trim()
    };
  }

  function normalizeFreeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function hasTextContent(value) {
    return /[A-Za-z0-9]/.test(String(value || ''));
  }

  function isValidHouseUnitFormat(value) {
    return /^[A-Za-z0-9#.,/\-\s]+$/.test(String(value || ''));
  }

  function isValidStreetNameFormat(value) {
    return /^[A-Za-z0-9.,'/\-\s]+$/.test(String(value || ''));
  }

  function hasDigit(value) {
    return /\d/.test(String(value || ''));
  }

  function hasAtLeastTwoLetters(value) {
    const letters = String(value || '').match(/[A-Za-z]/g);
    return Array.isArray(letters) && letters.length >= 2;
  }

  function isValidAddressEntry(entry) {
    return !!(entry && entry.houseUnit && entry.streetName && entry.barangay);
  }

  function buildLocationFromAddress(entry) {
    const normalized = normalizeAddressEntry(entry);
    return {
      addressId: normalized.id,
      houseUnit: normalized.houseUnit,
      streetName: normalized.streetName,
      barangay: normalized.barangay,
      additionalDetails: normalized.additionalDetails,
      city: normalized.city || 'Dagupan City',
      isStoreVisit: false
    };
  }

  function getSelectedRequestAddress() {
    return requestAddresses.find((entry) => String(entry.id || '') === String(selectedRequestAddressId || '')) || null;
  }

  function clearRequestAddressErrors() {
    if (errorRequestAddress) errorRequestAddress.textContent = '';
    if (errorRequestTechnician) errorRequestTechnician.textContent = '';
    if (errorRequestAddressAdd) errorRequestAddressAdd.textContent = '';
    clearFieldError(requestAddressHouseUnit, null);
    clearFieldError(requestAddressStreetName, null);
    clearFieldError(requestAddressBarangay, null);
    clearFieldError(requestAddressAdditionalDetails, null);
  }

  function setRequestAddAddressOpen(isOpen) {
    if (!requestAddAddressBox) return;
    requestAddAddressBox.hidden = !isOpen;
    if (requestOpenAddAddressBtn) {
      requestOpenAddAddressBtn.hidden = !!isOpen;
    }
    if (isOpen && requestAddressHouseUnit) {
      requestAddressHouseUnit.focus();
    }
  }

  function renderRequestAddressOptions() {
    if (!requestAddressOptions) return;

    const addresses = requestAddresses.filter(isValidAddressEntry);
    if (!addresses.length) {
      requestAddressOptions.innerHTML = '<div class="address-empty">No saved addresses yet. Add a new address below.</div>';
      selectedRequestAddressId = '';
      return;
    }

    if (!selectedRequestAddressId || !addresses.some((entry) => String(entry.id) === String(selectedRequestAddressId))) {
      selectedRequestAddressId = String(addresses[0].id || '').trim();
    }

    const cards = addresses.map((entry) => {
      const checked = String(entry.id || '') === String(selectedRequestAddressId || '') ? 'checked' : '';
      const line1 = `${escapeHtml(entry.houseUnit)}, ${escapeHtml(entry.streetName)}`;
      const line2 = `${escapeHtml(entry.barangay)}, ${escapeHtml(entry.city || 'Dagupan City')}`;
      const line3 = entry.additionalDetails ? `<span>Details: ${escapeHtml(entry.additionalDetails)}</span>` : '';
      return `
        <label class="address-option">
          <input type="radio" name="request_selected_address" value="${escapeHtml(entry.id)}" ${checked}>
          <div class="details">
            <strong>${line1}</strong>
            <span>${line2}</span>
            ${line3}
          </div>
        </label>
      `;
    });

    requestAddressOptions.innerHTML = cards.join('');
  }

  async function refreshRequestAddresses() {
    if (requestedType !== 'technician') return;
    const authUser = usersDb && usersDb.auth && usersDb.auth.currentUser
      ? usersDb.auth.currentUser
      : null;
    const activeUid = String((authUser && authUser.uid) || (signedInUser && signedInUser.uid) || '').trim();
    if (!activeUid) {
      requestAddresses = [];
      renderRequestAddressOptions();
      return;
    }

    try {
      const raw = await usersDb.getAddresses(activeUid);
      requestAddresses = (Array.isArray(raw) ? raw : []).map(normalizeAddressEntry).filter((entry) => entry.id);
    } catch {
      requestAddresses = [];
    }

    renderRequestAddressOptions();
  }

  function validateStep3Address() {
    if (requestedType !== 'technician') return true;
    clearRequestAddressErrors();
    const selected = getSelectedRequestAddress();
    if (!selected || !isValidAddressEntry(selected)) {
      if (errorRequestAddress) errorRequestAddress.textContent = 'Please select one saved address before continuing.';
      return false;
    }

    return true;
  }

  function validateStep4Technician() {
    if (requestedType !== 'technician') return true;
    if (errorRequestTechnician) errorRequestTechnician.textContent = '';

    const selectedTechnician = getSelectedTechnician();
    if (!selectedTechnician) {
      if (errorRequestTechnician) errorRequestTechnician.textContent = 'Please choose a technician before continuing.';
      if (requestTechnicianSelect && typeof requestTechnicianSelect.focus === 'function') {
        requestTechnicianSelect.focus();
      }
      return false;
    }

    return true;
  }

  function sanitizeCatalog(items) {
    return (Array.isArray(items) ? items : []).map((entry) => {
      const serviceType = String(entry.serviceType || '').toLowerCase();
      return {
        serviceType,
        category: String(entry.category || '').toLowerCase(),
        serviceName: String(entry.serviceName || '').trim(),
        appointmentRequired: true
      };
    }).filter((entry) => entry.serviceType && entry.category && entry.serviceName && entry.appointmentRequired);
  }

  const APPOINTMENT_SERVICES = sanitizeCatalog(SERVICE_CATALOG);
  const DROP_OFF_ALLOWED_CATEGORIES_BY_SERVICE_TYPE = {
    repair: ['appliance', 'electrical', 'aircon']
  };

  const DROP_OFF_REPAIR_OPTIONS_BY_CATEGORY = {
    appliance: [
      'Laptop problem',
      'Small appliance problem',
      'Microwave or oven problem',
      'Electric fan problem',
      'Others'
    ],
    electrical: [
      'Lamp or light issue',
      'Extension cord / power strip issue',
      'Others'
    ],
    aircon: [
      'Portable AC problem',
      'Others'
    ]
  };

  const DROP_OFF_MAINTENANCE_SERVICE_NAME_BY_CATEGORY = {
    appliance: 'Portable appliance maintenance',
    electrical: 'Portable electrical item maintenance',
    aircon: 'Portable AC maintenance'
  };

  const REPAIR_OPTIONS_BY_CATEGORY = {
    aircon: [
      'Not cold',
      'Low airflow',
      'Making noise',
      'Other / Not sure'
    ],
    appliance: [
      'Refrigerator problem',
      'Washing machine problem',
      'Dishwasher problem',
      'Microwave or oven problem',
      'Other / Not sure'
    ],
    electrical: [
      'Outlet or switch not working',
      'Light not working',
      'Ceiling fan not working',
      'Breaker keeps tripping',
      'Other / Not sure'
    ],
    plumbing: [
      'Leak (pipe or faucet)',
      'Clogged sink or drain',
      'Toilet problem',
      'Water heater problem',
      'Other / Not sure'
    ]
  };
  const INSTALLATION_OPTIONS_BY_CATEGORY = {
    aircon: [
      'Window AC install',
      'Split AC install',
      'Central AC install',
      'Others'
    ],
    appliance: [
      'Refrigerator water line install',
      'Dishwasher hookup',
      'Washing machine hookup',
      'Dryer vent and power setup',
      'Others'
    ],
    electrical: [
      'Ceiling fan install',
      'Light fixture install',
      'Dedicated circuit install',
      'Others'
    ],
    plumbing: [
      'Faucet and sink install',
      'Toilet install',
      'Water heater install',
      'Garbage disposal install',
      'Others'
    ]
  };

  function clearFieldError(field, errorEl) {
    if (field) field.classList.remove('invalid');
    if (errorEl) errorEl.textContent = '';
  }

  function setFieldError(field, errorEl, message) {
    if (field) field.classList.add('invalid');
    if (errorEl) errorEl.textContent = message;
  }

  function formatMonthYear(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function sameDate(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function monthKey(date) {
    return date.getFullYear() * 12 + date.getMonth();
  }

  function isDateWithinAllowedRange(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    return date >= todayStart && date <= maxSelectableDate;
  }

  function syncPreferredText() {
    if (!selectedDate || !selectedTime) {
      selectedText.textContent = 'Preferred schedule: not selected';
      preferredDatetime.value = '';
      return;
    }

    const labelDate = selectedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    selectedText.textContent = `Preferred schedule: ${labelDate} at ${selectedTime}`;
    preferredDatetime.value = `${labelDate} ${selectedTime}`;
  }

  function renderSlots() {
    timeSlots.innerHTML = '';
    slotValues.forEach((value) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'time-slot' + (selectedTime === value ? ' active' : '');
      btn.textContent = value;
      btn.addEventListener('click', () => {
        selectedTime = value;
        renderSlots();
        syncPreferredText();
        if (selectedDate && preferredDatetime.value) clearFieldError(schedulePicker, errorSchedule);
      });
      timeSlots.appendChild(btn);
    });
  }

  function renderCalendar() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    monthLabel.textContent = formatMonthYear(viewDate);
    grid.innerHTML = '';
    prevBtn.disabled = monthKey(viewDate) <= monthKey(currentMonthStart);
    nextMonthBtn.disabled = monthKey(viewDate) >= monthKey(maxMonthStart);

    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let firstIndex = (firstOfMonth.getDay() + 6) % 7;
    if (firstOfMonth.getDay() === 0) firstIndex = 0;

    for (let index = 0; index < firstIndex; index += 1) {
      const blank = document.createElement('button');
      blank.type = 'button';
      blank.className = 'day-cell muted';
      blank.disabled = true;
      blank.textContent = '';
      grid.appendChild(blank);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const current = new Date(year, month, day);
      const dayOfWeek = current.getDay();
      if (dayOfWeek === 0) continue;

      const isPast = current < todayStart;
      const isBeyondMax = current > maxSelectableDate;
      const dayCell = document.createElement('button');
      dayCell.type = 'button';
      dayCell.className = 'day-cell' + (sameDate(current, selectedDate) ? ' active' : '') + ((isPast || isBeyondMax) ? ' disabled' : '');
      dayCell.textContent = String(day);

      if (isPast || isBeyondMax) {
        dayCell.disabled = true;
        grid.appendChild(dayCell);
        continue;
      }

      dayCell.addEventListener('click', () => {
        selectedDate = current;
        selectedTime = null;
        timeTitle.textContent = selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        renderCalendar();
        renderSlots();
        syncPreferredText();
        clearFieldError(schedulePicker, errorSchedule);
      });

      grid.appendChild(dayCell);
    }
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes)) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(0) + ' KB';
    return (kb / 1024).toFixed(1) + ' MB';
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Unable to read file'));
      reader.readAsDataURL(file);
    });
  }

  function createImageThumbnailDataUrl(dataUrl, maxSide = 180, quality = 0.72) {
    return new Promise((resolve) => {
      const source = String(dataUrl || '').trim();
      if (!source.startsWith('data:image/')) {
        resolve('');
        return;
      }

      const image = new Image();
      image.onload = () => {
        try {
          const width = Number(image.naturalWidth || image.width || 0);
          const height = Number(image.naturalHeight || image.height || 0);
          if (!width || !height) {
            resolve('');
            return;
          }

          const scale = Math.min(1, maxSide / Math.max(width, height));
          const targetWidth = Math.max(1, Math.round(width * scale));
          const targetHeight = Math.max(1, Math.round(height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve('');
            return;
          }

          ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (_) {
          resolve('');
        }
      };

      image.onerror = () => resolve('');
      image.src = source;
    });
  }

  function sanitizeFileName(fileName) {
    return String(fileName || 'file')
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-80) || 'file';
  }

  function withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('timeout')), timeoutMs);
      })
    ]);
  }

  async function uploadMediaToStorage(uid, mediaEntries) {
    const entries = Array.isArray(mediaEntries) ? mediaEntries : [];
    if (!entries.length) return [];

    const fallbackMedia = entries.map((entry) => ({
      name: String(entry && entry.name ? entry.name : '').trim(),
      type: String(entry && entry.type ? entry.type : '').trim(),
      size: Number(entry && entry.size ? entry.size : 0) || 0,
      url: String(entry && entry.url ? entry.url : '').trim(),
      thumbnailUrl: String(entry && entry.thumbnailUrl ? entry.thumbnailUrl : '').trim()
    }));

    const firebaseNs = (usersDb && usersDb.firebase) || window.firebase;
    if (!firebaseNs || typeof firebaseNs.storage !== 'function') {
      return fallbackMedia;
    }

    let storage = null;
    try {
      storage = firebaseNs.storage();
    } catch {
      storage = null;
    }
    if (!storage) return fallbackMedia;

    const timestamp = Date.now();

    const uploaded = await Promise.all(entries.map(async (entry, index) => {
      const file = entry && entry.file;
      if (!(file instanceof File)) {
        return {
          name: String(entry && entry.name ? entry.name : '').trim(),
          type: String(entry && entry.type ? entry.type : '').trim(),
          size: Number(entry && entry.size ? entry.size : 0) || 0,
          url: String(entry && entry.url ? entry.url : '').trim()
        };
      }

      try {
        const safeName = sanitizeFileName(file.name);
        const randomKey = Math.random().toString(36).slice(2, 10);
        const objectPath = `request-media/${uid}/${timestamp}_${index}_${randomKey}_${safeName}`;
        const ref = storage.ref().child(objectPath);
        await withTimeout(ref.put(file, { contentType: file.type || 'application/octet-stream' }), 4500);
        const url = await ref.getDownloadURL();

        return {
          name: file.name,
          type: file.type,
          size: file.size,
          url,
          thumbnailUrl: String(entry && entry.thumbnailUrl ? entry.thumbnailUrl : '').trim()
        };
      } catch {
        return {
          name: file.name,
          type: file.type,
          size: file.size,
          url: String(entry && entry.url ? entry.url : '').trim(),
          thumbnailUrl: String(entry && entry.thumbnailUrl ? entry.thumbnailUrl : '').trim()
        };
      }
    }));

    return uploaded;
  }

  function renderMediaPreview() {
    mediaPreview.innerHTML = '';
    if (!selectedMedia.length) return;

    selectedMedia.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'media-item';

      const thumb = document.createElement('div');
      thumb.className = 'thumb';

      if (entry.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = entry.dataUrl;
        video.muted = true;
        video.preload = 'metadata';
        video.playsInline = true;
        thumb.appendChild(video);
      } else {
        const image = document.createElement('img');
        image.src = entry.dataUrl;
        image.alt = entry.name || 'Uploaded photo';
        thumb.appendChild(image);
      }

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `<strong>${entry.type.startsWith('video/') ? 'VIDEO' : 'PHOTO'}</strong><span>${entry.name} (${formatFileSize(entry.size)})</span>`;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        selectedMedia.splice(index, 1);
        renderMediaPreview();
      });

      row.append(thumb, meta, removeBtn);
      mediaPreview.appendChild(row);
    });
  }

  function getCategoriesByServiceType(serviceType) {
    const normalized = String(serviceType || '').toLowerCase();
    let categories = Array.from(new Set(
      APPOINTMENT_SERVICES
        .filter((item) => item.serviceType === normalized)
        .map((item) => item.category)
    ));

    if (requestedType === 'appointment') {
      const allowed = Array.isArray(DROP_OFF_ALLOWED_CATEGORIES_BY_SERVICE_TYPE[normalized])
        ? DROP_OFF_ALLOWED_CATEGORIES_BY_SERVICE_TYPE[normalized]
        : [];
      categories = categories.filter((category) => allowed.includes(category));
    }

    return categories;
  }

  function getRepairOptionsByCategory(category) {
    const normalized = String(category || '').toLowerCase();
    if (requestedType === 'appointment') {
      return Array.isArray(DROP_OFF_REPAIR_OPTIONS_BY_CATEGORY[normalized])
        ? DROP_OFF_REPAIR_OPTIONS_BY_CATEGORY[normalized]
        : [];
    }
    return Array.isArray(REPAIR_OPTIONS_BY_CATEGORY[normalized])
      ? REPAIR_OPTIONS_BY_CATEGORY[normalized]
      : [];
  }

  function fillSelectOptions(selectEl, firstLabel, values, formatter) {
    if (!selectEl) return;
    const current = String(selectEl.value || '');
    selectEl.innerHTML = '';

    const firstOption = document.createElement('option');
    firstOption.value = '';
    firstOption.textContent = firstLabel;
    firstOption.disabled = true;
    firstOption.hidden = true;
    selectEl.appendChild(firstOption);

    values.forEach((value) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = formatter ? formatter(value) : value;
      selectEl.appendChild(opt);
    });

    const hasCurrent = values.includes(current);
    selectEl.value = hasCurrent ? current : '';
  }

  function refreshCategoryOptions() {
    const categories = getCategoriesByServiceType(serviceTypeInput ? serviceTypeInput.value : '');
    fillSelectOptions(categoryInput, 'Category', categories, formatCategoryLabel);
    refreshRepairOptions();
    refreshInstallationOptions();
  }

  function refreshRepairOptions() {
    const selectedServiceType = String(serviceTypeInput ? serviceTypeInput.value : '').toLowerCase();
    const selectedCategory = String(categoryInput ? categoryInput.value : '').toLowerCase();
    const isRepair = selectedServiceType === 'repair';

    if (!repairOptionWrap || !repairOptionInput) return;

    repairOptionWrap.hidden = !isRepair;
    clearFieldError(repairOptionInput, errorRepairOption);

    if (!isRepair) {
      fillSelectOptions(repairOptionInput, 'Repair Concern', [], null);
      return;
    }

    const options = getRepairOptionsByCategory(selectedCategory);
    fillSelectOptions(repairOptionInput, 'Repair Concern', options, null);
  }

  function refreshInstallationOptions() {
    const selectedServiceType = String(serviceTypeInput ? serviceTypeInput.value : '').toLowerCase();
    const selectedCategory = String(categoryInput ? categoryInput.value : '').toLowerCase();
    const isInstallation = selectedServiceType === 'installation';

    if (!installationOptionWrap || !installationOptionInput) return;

    installationOptionWrap.hidden = !isInstallation;
    clearFieldError(installationOptionInput, errorInstallationOption);

    if (!isInstallation) {
      fillSelectOptions(installationOptionInput, 'What to install', [], null);
      return;
    }

    const options = Array.isArray(INSTALLATION_OPTIONS_BY_CATEGORY[selectedCategory])
      ? INSTALLATION_OPTIONS_BY_CATEGORY[selectedCategory]
      : [];
    fillSelectOptions(installationOptionInput, 'What to install', options, null);
  }

  function getAllowedServiceTypes() {
    if (requestedType === 'technician') {
      return ['repair', 'maintenance', 'installation'];
    }
    return ['repair'];
  }

  function initializeServiceTypeOptions() {
    const allowedTypes = getAllowedServiceTypes();
    fillSelectOptions(serviceTypeInput, 'Service Type', allowedTypes, toTitleCase);
    if (serviceTypeInput && allowedTypes.length === 1) {
      serviceTypeInput.value = allowedTypes[0];
      serviceTypeInput.disabled = true;
      serviceTypeInput.required = false;
      serviceTypeInput.hidden = true;
      clearFieldError(serviceTypeInput, errorServiceType);
      if (errorServiceType) errorServiceType.hidden = true;
    } else if (serviceTypeInput) {
      serviceTypeInput.disabled = false;
      serviceTypeInput.required = true;
      serviceTypeInput.hidden = false;
      if (errorServiceType) errorServiceType.hidden = false;
    }
    refreshCategoryOptions();
  }

  function normalizeTimeRangeLabel(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    return value
      .replace(/\s*-\s*/g, ' – ')
      .replace(/am/gi, 'AM')
      .replace(/pm/gi, 'PM');
  }

  function toIsoDateLocal(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function buildSchedulePayload(date, time) {
    if (!date || !time) {
      return {
        preferredDate: '',
        preferredTime: ''
      };
    }

    const preferredDate = toIsoDateLocal(date);
    const preferredTime = String(time || '').trim();

    return {
      preferredDate,
      preferredTime
    };
  }

  function getServiceModeLabel() {
    if (requestedType === 'technician') return 'Home Service';
    if (requestedType === 'appointment') return 'Store Drop-Off';
    return 'Virtual Assistance';
  }

  function updateServiceModeNote() {
    if (!serviceModeNote) return;
    serviceModeNote.textContent = getServiceModeLabel();
  }

  function formatSummarySchedule() {
    if (selectedDate && selectedTime) {
      const dateLabel = selectedDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      return `${dateLabel}\n${normalizeTimeRangeLabel(selectedTime)}`;
    }

    const fallback = String(preferredDatetime.value || '').trim();
    if (!fallback) return '-';
    const parts = fallback.split(' at ');
    if (parts.length === 2) {
      return `${parts[0]}\n${normalizeTimeRangeLabel(parts[1])}`;
    }
    return fallback;
  }

  function formatLocationForSummary(location) {
    const item = location && typeof location === 'object' ? location : null;
    if (!item) return '-';

    if (item.isStoreVisit) {
      return 'HomeFixSolution Service Center\nStore Drop-Off\nDagupan City';
    }

    const houseUnit = String(item.houseUnit || '').trim();
    const streetName = String(item.streetName || '').trim();
    const barangay = String(item.barangay || '').trim();
    const city = String(item.city || 'Dagupan City').trim();
    const additionalDetails = String(item.additionalDetails || '').trim();

    const lines = [];
    if (houseUnit) lines.push(houseUnit);
    if (streetName) lines.push(streetName);
    if (barangay || city) lines.push([barangay, city].filter(Boolean).join(', '));
    if (additionalDetails) lines.push(`Landmark: ${additionalDetails}`);

    if (!lines.length) {
      return 'No saved address found. Please add one in Address Book.';
    }
    return lines.join('\n');
  }

  async function updateSummaryAddress() {
    if (!summaryAddress) return;

    const bookingType = requestedType === 'appointment' ? 'appointment' : 'technician';
    if (bookingType === 'appointment') {
      summaryAddress.textContent = 'HomeFixSolution Service Center, Store Drop-Off, Dagupan City';
      return;
    }

    const selected = getSelectedRequestAddress();
    if (selected && isValidAddressEntry(selected)) {
      summaryAddress.textContent = formatLocationForSummary(buildLocationFromAddress(selected));
      return;
    }

    const authUser = usersDb && usersDb.auth && usersDb.auth.currentUser
      ? usersDb.auth.currentUser
      : null;
    const activeUid = String((authUser && authUser.uid) || (signedInUser && signedInUser.uid) || '').trim();
    if (!activeUid) {
      summaryAddress.textContent = 'No saved address found. Please add one in Address Book.';
      return;
    }

    const reqSeq = ++summaryAddressRequestSeq;
    summaryAddress.textContent = 'Loading address...';

    const fallbackLocation = {
      addressId: '',
      houseUnit: '',
      streetName: '',
      barangay: '',
      additionalDetails: '',
      city: 'Dagupan City',
      isStoreVisit: false
    };

    const location = await withTimeout(resolveLocationForRequest(activeUid, bookingType), 4500)
      .catch(() => fallbackLocation);

    if (reqSeq !== summaryAddressRequestSeq) return;
    summaryAddress.textContent = formatLocationForSummary(location);
  }

  function updateSummary() {
    const selectedServiceType = requestedType === 'appointment'
      ? 'repair'
      : String(serviceTypeInput ? serviceTypeInput.value : '').toLowerCase();
    const selectedRepairOption = String(repairOptionInput ? repairOptionInput.value : '').trim();
    const selectedInstallationOption = String(installationOptionInput ? installationOptionInput.value : '').trim();

    if (summaryServiceMode) summaryServiceMode.textContent = getServiceModeLabel();
    if (summaryAddress) updateSummaryAddress();
    if (summaryTechnician) {
      if (requestedType === 'technician') {
        const selectedTechnician = getSelectedTechnician();
        summaryTechnician.textContent = selectedTechnician ? selectedTechnician.name : '-';
      } else {
        summaryTechnician.textContent = '-';
      }
    }
    if (summaryServiceType) summaryServiceType.textContent = toTitleCase(selectedServiceType) || '-';
    if (summaryCategory) summaryCategory.textContent = formatCategoryLabel(categoryInput ? categoryInput.value : '') || '-';
    if (summarySelectedOption) {
      if (selectedServiceType === 'repair') {
        if (summarySelectedOptionRow) summarySelectedOptionRow.hidden = false;
        if (summarySelectedOptionLabel) summarySelectedOptionLabel.textContent = 'Repair Concern:';
        summarySelectedOption.textContent = selectedRepairOption || '-';
      } else if (selectedServiceType === 'installation') {
        if (summarySelectedOptionRow) summarySelectedOptionRow.hidden = false;
        if (summarySelectedOptionLabel) summarySelectedOptionLabel.textContent = 'Install task:';
        summarySelectedOption.textContent = selectedInstallationOption || '-';
      } else if (selectedServiceType === 'maintenance') {
        if (summarySelectedOptionRow) summarySelectedOptionRow.hidden = true;
      } else {
        if (summarySelectedOptionRow) summarySelectedOptionRow.hidden = true;
        if (summarySelectedOptionLabel) summarySelectedOptionLabel.textContent = 'Concern:';
        summarySelectedOption.textContent = '-';
      }
    }
    if (summarySchedule) summarySchedule.textContent = formatSummarySchedule();
    if (summaryIssue) summaryIssue.textContent = (issueInput && issueInput.value.trim()) || '-';
    if (summaryMedia) {
      const count = selectedMedia.length;
      summaryMedia.textContent = `${count} ${count === 1 ? 'file' : 'files'}`;
    }

    if (summaryMediaPreview) {
      summaryMediaPreview.innerHTML = '';
      selectedMedia.forEach((entry) => {
        const card = document.createElement('div');
        card.className = 'summary-media-item';

        const thumb = document.createElement('div');
        thumb.className = 'thumb';

        if (String(entry.type || '').startsWith('video/')) {
          const video = document.createElement('video');
          video.src = entry.dataUrl;
          video.muted = true;
          video.preload = 'metadata';
          video.playsInline = true;
          thumb.appendChild(video);
        } else {
          const image = document.createElement('img');
          image.src = entry.dataUrl;
          image.alt = entry.name || 'Attached media';
          thumb.appendChild(image);
        }

        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = `${String(entry.type || '').startsWith('video/') ? 'Video' : 'Photo'}: ${entry.name || 'Attachment'}`;

        card.append(thumb, label);
        summaryMediaPreview.appendChild(card);
      });
    }
  }

  function setStep(step) {
    currentStep = step;
    const bookCard = form ? form.closest('.book-card') : null;
    const isHomeServiceFlow = requestedType === 'technician';
    const technicianStep = 4;
    const summaryStep = isHomeServiceFlow ? 5 : 3;
    const submittedStep = isHomeServiceFlow ? 6 : 4;
    const addressStep = 3;

    if (flowTitle) {
      if (step === 1) flowTitle.textContent = 'SERVICE DETAILS';
      if (step === 2) flowTitle.textContent = 'SCHEDULE APPOINTMENT';
      if (isHomeServiceFlow && step === addressStep) flowTitle.textContent = 'SELECT ADDRESS';
      if (isHomeServiceFlow && step === technicianStep) flowTitle.textContent = 'CHOOSE TECHNICIAN';
      if (step === summaryStep) flowTitle.textContent = 'REQUEST SUMMARY';
      if (step === submittedStep) flowTitle.textContent = 'REQUEST SUBMITTED';
      flowTitle.style.display = (step === summaryStep || step === submittedStep) ? 'none' : '';
    }

    if (form) {
      form.classList.toggle('flow-summary-mode', step === summaryStep);
      form.classList.toggle('flow-submitted-mode', step === submittedStep);
    }

    if (bookCard) {
      bookCard.classList.toggle('flow-centered-page', step === summaryStep || step === submittedStep);
      bookCard.classList.toggle('submitted-centered', step === submittedStep);
    }

    if (step1) step1.hidden = step !== 1;
    if (step2) step2.hidden = step !== 2;
    if (step3Address) step3Address.hidden = !isHomeServiceFlow || step !== addressStep;
    if (step4Technician) step4Technician.hidden = !isHomeServiceFlow || step !== technicianStep;
    if (step3) step3.hidden = step !== summaryStep;
    if (step4) step4.hidden = step !== submittedStep;

    if (nextBtn) {
      if (step === 1) nextBtn.textContent = 'CONTINUE';
      if (step === 2) nextBtn.textContent = 'NEXT';
      if (isHomeServiceFlow && step === addressStep) nextBtn.textContent = 'NEXT';
      if (isHomeServiceFlow && step === technicianStep) nextBtn.textContent = 'NEXT';
      if (step === summaryStep) nextBtn.textContent = 'SUBMIT REQUEST';
      if (step === submittedStep) nextBtn.textContent = 'VIEW SERVICE HISTORY';
      nextBtn.disabled = false;
    }

    if (backBtn) {
      backBtn.hidden = false;
      backBtn.textContent = 'BACK';
    }

    if (isHomeServiceFlow && step === addressStep) {
      setRequestAddAddressOpen(false);
      refreshRequestAddresses();
    }

    if (isHomeServiceFlow && step === technicianStep) {
      refreshTechnicianOptions();
    }

    if (step === summaryStep) {
      if (errorTerms) errorTerms.textContent = '';
      updateSummary();
    }
  }

  function validateStep1() {
    clearFieldError(serviceTypeInput, errorServiceType);
    clearFieldError(categoryInput, errorCategory);
    clearFieldError(repairOptionInput, errorRepairOption);
    clearFieldError(installationOptionInput, errorInstallationOption);
    clearFieldError(issueInput, errorIssue);

    let firstInvalid = null;
    const serviceType = requestedType === 'appointment'
      ? 'repair'
      : String(serviceTypeInput ? serviceTypeInput.value : '').toLowerCase();
    const category = String(categoryInput ? categoryInput.value : '').toLowerCase();
    const repairOption = String(repairOptionInput ? repairOptionInput.value : '').trim();
    const installationOption = String(installationOptionInput ? installationOptionInput.value : '').trim();
    const allowedTypes = getAllowedServiceTypes();

    if (!serviceType && allowedTypes.length === 1 && serviceTypeInput) {
      serviceTypeInput.value = allowedTypes[0];
    }

    const effectiveServiceType = requestedType === 'appointment'
      ? 'repair'
      : String(serviceTypeInput ? serviceTypeInput.value : serviceType).toLowerCase();

    if (!effectiveServiceType) {
      setFieldError(serviceTypeInput, errorServiceType, 'Please select a service type.');
      firstInvalid = firstInvalid || serviceTypeInput;
    }

    if (effectiveServiceType && !allowedTypes.includes(effectiveServiceType)) {
      setFieldError(serviceTypeInput, errorServiceType, 'Selected service type is not allowed for this flow.');
      firstInvalid = firstInvalid || serviceTypeInput;
    }

    if (!category) {
      setFieldError(categoryInput, errorCategory, 'Please choose a category.');
      firstInvalid = firstInvalid || categoryInput;
    }

    const matchedService = APPOINTMENT_SERVICES.find((item) => item.serviceType === effectiveServiceType && item.category === category);
    if (effectiveServiceType && category && !matchedService) {
      setFieldError(categoryInput, errorCategory, 'Please select a valid category for this service type.');
      firstInvalid = firstInvalid || categoryInput;
    }

    if (effectiveServiceType === 'repair') {
      const allowedRepairOptions = getRepairOptionsByCategory(category);
      if (!repairOption || !allowedRepairOptions.includes(repairOption)) {
        setFieldError(repairOptionInput, errorRepairOption, 'Please select a valid repair concern.');
        firstInvalid = firstInvalid || repairOptionInput;
      }
    }

    if (effectiveServiceType === 'installation') {
      const allowedInstallOptions = Array.isArray(INSTALLATION_OPTIONS_BY_CATEGORY[category])
        ? INSTALLATION_OPTIONS_BY_CATEGORY[category]
        : [];
      if (!installationOption || !allowedInstallOptions.includes(installationOption)) {
        setFieldError(installationOptionInput, errorInstallationOption, 'Please select what to install.');
        firstInvalid = firstInvalid || installationOptionInput;
      }
    }

    const issueText = normalizeFreeText(issueInput ? issueInput.value : '');
    if (!issueInput || !issueText) {
      setFieldError(issueInput, errorIssue, 'Please describe the issue.');
      firstInvalid = firstInvalid || issueInput;
    } else if (!hasTextContent(issueText)) {
      setFieldError(issueInput, errorIssue, 'Issue details must include readable text.');
      firstInvalid = firstInvalid || issueInput;
    } else if (issueText.length < MIN_ISSUE_LENGTH || issueText.length > MAX_ISSUE_LENGTH) {
      setFieldError(issueInput, errorIssue, `Issue details must be ${MIN_ISSUE_LENGTH}-${MAX_ISSUE_LENGTH} characters.`);
      firstInvalid = firstInvalid || issueInput;
    } else {
      issueInput.value = issueText;
    }

    if (firstInvalid && typeof firstInvalid.focus === 'function') {
      firstInvalid.focus();
    }
    return !firstInvalid;
  }

  function validateStep2() {
    clearFieldError(schedulePicker, errorSchedule);
    if (!preferredDatetime.value.trim() || !selectedDate || !selectedTime) {
      setFieldError(schedulePicker, errorSchedule, 'Please select your preferred date and time.');
      return false;
    }

    if (!isDateWithinAllowedRange(selectedDate)) {
      setFieldError(schedulePicker, errorSchedule, 'Please select a date from today up to 2 months ahead.');
      return false;
    }

    return true;
  }

  function toRequestDisplayId(rawId, context) {
    const source = String(rawId || '').trim();
    if (!source) return 'N/A';
    if (usersDb && typeof usersDb.formatRequestCode === 'function') {
      return usersDb.formatRequestCode(Object.assign({}, context || {}, { id: source, requestId: source }), source);
    }

    const bookingType = String(context && context.bookingType ? context.bookingType : '').toLowerCase();
    const requestMode = String(context && context.requestMode ? context.requestMode : '').toLowerCase();
    const prefix = (bookingType === 'appointment' || requestMode === 'drop-off-store') ? 'SD' : 'HS';
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
      hash = ((hash * 33) + source.charCodeAt(i)) >>> 0;
    }
    return `${prefix}-${String(hash % 100000).padStart(5, '0')}`;
  }

  async function resolveLocationForRequest(uid, bookingType, preferredAddressId = '') {
    if (String(bookingType || '').toLowerCase() === 'appointment') {
      return {
        addressId: 'store-dropoff',
        houseUnit: 'HomeFixSolution Service Center',
        streetName: 'Store Drop-Off',
        barangay: 'Dagupan City',
        additionalDetails: 'Customer will drop off item at store.',
        city: 'Dagupan City',
        isStoreVisit: true
      };
    }

    let addresses = [];
    try {
      addresses = await usersDb.getAddresses(uid);
    } catch {
      addresses = [];
    }

    const candidates = (Array.isArray(addresses) ? addresses : []).map(normalizeAddressEntry);
    const preferredId = String(preferredAddressId || '').trim();

    const validPreferred = preferredId
      ? candidates.find((entry) => entry.id === preferredId && isValidAddressEntry(entry))
      : null;

    const valid = validPreferred || candidates.find((entry) => isValidAddressEntry(entry));

    if (valid) {
      return buildLocationFromAddress(valid);
    }

    return {
      addressId: '',
      houseUnit: '',
      streetName: '',
      barangay: '',
      additionalDetails: 'No saved address on file at submission time.',
      city: 'Dagupan City',
      isStoreVisit: false
    };
  }

  async function submitRequest() {
    clearFieldError(null, errorSubmit);
    if (errorTerms) errorTerms.textContent = '';
    if (isSubmitting) return false;
    const summaryStep = requestedType === 'technician' ? 5 : 3;
    const submittedStep = requestedType === 'technician' ? 6 : 4;

    async function waitForActiveUser(timeoutMs = 2500) {
      const auth = usersDb && usersDb.auth ? usersDb.auth : null;
      if (!auth) return null;
      if (auth.currentUser && auth.currentUser.uid) return auth.currentUser;

      return new Promise((resolve) => {
        let settled = false;
        let unsubscribe = null;
        const done = (user) => {
          if (settled) return;
          settled = true;
          if (typeof unsubscribe === 'function') {
            try { unsubscribe(); } catch (_) {}
          }
          resolve(user || null);
        };

        const timer = setTimeout(() => {
          done(auth.currentUser && auth.currentUser.uid ? auth.currentUser : null);
        }, Math.max(800, Number(timeoutMs) || 2500));

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

    try {
      const auth = usersDb && usersDb.auth ? usersDb.auth : null;
      const currentUser = auth && auth.currentUser ? auth.currentUser : null;
      if (currentUser) {
        signedInUser = currentUser;
      }
    } catch (_) {
    }

    if (!signedInUser) {
      const recoveredUser = await waitForActiveUser(2800);
      if (recoveredUser) {
        signedInUser = recoveredUser;
      }
    }

    if (!signedInUser) {
      setFieldError(null, errorSubmit, 'Session is still restoring. Please try submit again in a moment.');
      return false;
    }

    const authUser = usersDb && usersDb.auth && usersDb.auth.currentUser
      ? usersDb.auth.currentUser
      : null;
    const activeUid = String((authUser && authUser.uid) || (signedInUser && signedInUser.uid) || '').trim();
    if (!activeUid) {
      setFieldError(null, errorSubmit, 'Your session expired. Please sign in again.');
      return false;
    }

    const serviceType = requestedType === 'appointment'
      ? 'repair'
      : String(serviceTypeInput ? serviceTypeInput.value : '').toLowerCase();
    const category = String(categoryInput ? categoryInput.value : '').toLowerCase();
    const repairOption = String(repairOptionInput ? repairOptionInput.value : '').trim();
    const installationOption = String(installationOptionInput ? installationOptionInput.value : '').trim();
    const issue = String(issueInput ? issueInput.value : '').trim();
    const schedulePayload = buildSchedulePayload(selectedDate, selectedTime);
    const selectedTechnician = requestedType === 'technician' ? getSelectedTechnician() : null;

    if (requestedType === 'technician' && !selectedTechnician) {
      if (errorRequestTechnician) errorRequestTechnician.textContent = 'Please choose a technician before submitting.';
      setStep(3);
      return false;
    }

    if (!confirmTerms || !confirmTerms.checked) {
      if (errorTerms) errorTerms.textContent = 'Please accept the Terms and Conditions to continue.';
      return false;
    }

    const matched = APPOINTMENT_SERVICES.find((item) => item.serviceType === serviceType && item.category === category);
    if (!matched) {
      setFieldError(categoryInput, errorCategory, 'Selected category is not valid for this service type.');
      setStep(1);
      return false;
    }

    let serviceName = String(matched.serviceName || `${toTitleCase(category)} ${toTitleCase(serviceType)}`).trim();
    if (serviceType === 'repair') {
      const allowedRepairOptions = getRepairOptionsByCategory(category);
      if (!repairOption || !allowedRepairOptions.includes(repairOption)) {
        setFieldError(repairOptionInput, errorRepairOption, 'Please select a valid repair concern.');
        setStep(1);
        return false;
      }
      serviceName = repairOption;
    }

    if (serviceType === 'maintenance' && requestedType === 'appointment') {
      serviceName = DROP_OFF_MAINTENANCE_SERVICE_NAME_BY_CATEGORY[category] || 'Portable item maintenance';
    }

    if (serviceType === 'installation') {
      const allowedInstallOptions = Array.isArray(INSTALLATION_OPTIONS_BY_CATEGORY[category])
        ? INSTALLATION_OPTIONS_BY_CATEGORY[category]
        : [];
      if (!installationOption || !allowedInstallOptions.includes(installationOption)) {
        setFieldError(installationOptionInput, errorInstallationOption, 'Please select what to install.');
        setStep(1);
        return false;
      }
      serviceName = installationOption;
    }

    isSubmitting = true;
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.textContent = 'SUBMITTING...';
    }

    try {
      const bookingType = requestedType === 'appointment' ? 'appointment' : 'technician';
      const addressStep = 3;
      const technicianStep = 4;
      const fallbackLocation = {
        addressId: '',
        houseUnit: '',
        streetName: '',
        barangay: '',
        additionalDetails: 'No saved address on file at submission time.',
        city: 'Dagupan City',
        isStoreVisit: false
      };
      const selectedAddress = getSelectedRequestAddress();
      const preferredAddressId = bookingType === 'technician'
        ? String(selectedAddress && selectedAddress.id ? selectedAddress.id : '').trim()
        : '';

      if (bookingType === 'technician' && !preferredAddressId) {
        setFieldError(null, errorSubmit, 'Please select a saved address before submitting Home Service.');
        setStep(addressStep);
        return false;
      }

      if (bookingType === 'technician' && !selectedTechnician) {
        setFieldError(null, errorSubmit, 'Please choose a technician before submitting Home Service.');
        setStep(technicianStep);
        return false;
      }

      const [location, uploadedMedia] = await Promise.all([
        withTimeout(resolveLocationForRequest(activeUid, bookingType, preferredAddressId), 4500).catch(() => fallbackLocation),
        uploadMediaToStorage(signedInUser.uid, selectedMedia)
      ]);

      if (bookingType === 'technician') {
        const hasAddress = String(location && location.houseUnit ? location.houseUnit : '').trim()
          && String(location && location.streetName ? location.streetName : '').trim()
          && String(location && location.barangay ? location.barangay : '').trim();
        if (!hasAddress) {
          setFieldError(null, errorSubmit, 'No saved home address found. Please add one in Address Book before submitting Home Service.');
          setStep(addressStep);
          return false;
        }
      }
      let selectedOptionLabel = '';
      let selectedOptionValue = '';

      if (serviceType === 'repair') {
        selectedOptionLabel = 'Repair Concern';
        selectedOptionValue = repairOption;
      } else if (serviceType === 'installation') {
        selectedOptionLabel = 'Install task';
        selectedOptionValue = installationOption;
      }

      const payload = {
        customerId: activeUid,
        bookingType,
        serviceType: toTitleCase(serviceType),
        category: toTitleCase(category),
        serviceName,
        appointmentRequired: true,
        issue,
        description: issue,
        deviceType: serviceName,
        preferredDate: schedulePayload.preferredDate,
        preferredTime: schedulePayload.preferredTime,
        requestDetails: {
          serviceMode: getServiceModeLabel(),
          serviceType: toTitleCase(serviceType),
          category: formatCategoryLabel(category),
          selectedOptionLabel,
          selectedOptionValue,
          selectedTechnicianName: selectedTechnician ? selectedTechnician.name : '',
          selectedTechnicianId: selectedTechnician ? selectedTechnician.id : '',
          additionalInfo: issue,
          issue
        },
        media: uploadedMedia,
        location,
        requestMode: bookingType === 'appointment' ? 'drop-off-store' : 'home-service',
        status: bookingType === 'technician' ? 'offered' : 'pending'
      };

      if (bookingType === 'technician' && selectedTechnician) {
        const techId = String(selectedTechnician.id || '').trim();
        const techEmail = String(selectedTechnician.email || '').trim();
        const techName = String(selectedTechnician.name || '').trim();
        payload.assignedTechnicianId = techId;
        payload.technicianId = techId;
        payload.assignedTechnicianEmail = techEmail;
        payload.technicianEmail = techEmail;
        payload.assignedTechnicianName = techName;
      }

      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      const requestId = await usersDb.addBookingRequest(payload);
      if (submittedRequestId) {
        submittedRequestId.textContent = toRequestDisplayId(requestId, {
          bookingType,
          requestMode: payload.requestMode
        });
      }
      sessionStorage.removeItem(DRAFT_KEY);
      setStep(submittedStep);
      return true;
    } catch (err) {
      const code = String((err && err.code) || '').toLowerCase();
      let msg = err && err.message ? err.message : 'Failed to submit request. Please try again.';
      if (code.includes('permission-denied')) {
        msg = 'Unable to submit request right now (permission denied).';
      } else if (code.includes('unauthenticated')) {
        msg = 'Your session expired. Please sign in again.';
      } else if (code.includes('network-request-failed')) {
        msg = 'Network error while submitting. Please try again.';
      }
      if (err && err.code && !msg.includes('Code:')) {
        msg += ` Code: ${String(err.code)}.`;
      }
      setFieldError(null, errorSubmit, msg);
      return false;
    } finally {
      isSubmitting = false;
      if (nextBtn && currentStep !== submittedStep) {
        nextBtn.disabled = false;
        nextBtn.textContent = currentStep === summaryStep ? 'SUBMIT REQUEST' : nextBtn.textContent;
      }
    }
  }

  let requestRedirectTimer = null;

  function scheduleRequestRedirectIfStillSignedOut() {
    if (requestRedirectTimer) return;
    requestRedirectTimer = setTimeout(() => {
      requestRedirectTimer = null;
      if (isSubmitting) {
        scheduleRequestRedirectIfStillSignedOut();
        return;
      }
      const active = usersDb && usersDb.auth ? usersDb.auth.currentUser : null;
      if (!active) {
        window.location.href = '../../login.html';
      }
    }, 3500);
  }

  function clearRequestRedirectTimer() {
    if (!requestRedirectTimer) return;
    clearTimeout(requestRedirectTimer);
    requestRedirectTimer = null;
  }

  usersDb.auth.onAuthStateChanged((user) => {
    if (!user) {
      scheduleRequestRedirectIfStillSignedOut();
      return;
    }
    clearRequestRedirectTimer();
    signedInUser = user;
  });

  if (copyRequestIdBtn) {
    copyRequestIdBtn.addEventListener('click', async () => {
      const value = String(submittedRequestId && submittedRequestId.textContent ? submittedRequestId.textContent : '').trim();
      if (!value) return;

      const originalTitle = copyRequestIdBtn.title;
      const originalAriaLabel = copyRequestIdBtn.getAttribute('aria-label') || '';
      if (copyRequestIdStatus) copyRequestIdStatus.textContent = '';
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(value);
        } else {
          const area = document.createElement('textarea');
          area.value = value;
          area.setAttribute('readonly', 'readonly');
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          document.execCommand('copy');
          document.body.removeChild(area);
        }
        copyRequestIdBtn.title = 'Copied!';
        copyRequestIdBtn.setAttribute('aria-label', 'Copied');
        if (copyRequestIdStatus) copyRequestIdStatus.textContent = 'Copied';
      } catch (_) {
        copyRequestIdBtn.title = 'Copy failed';
        copyRequestIdBtn.setAttribute('aria-label', 'Copy failed');
        if (copyRequestIdStatus) copyRequestIdStatus.textContent = 'Copy failed';
      }

      window.setTimeout(() => {
        copyRequestIdBtn.title = originalTitle;
        copyRequestIdBtn.setAttribute('aria-label', originalAriaLabel || 'Copy request ID');
        if (copyRequestIdStatus) copyRequestIdStatus.textContent = '';
      }, 1200);
    });
  }

  if (serviceTypeInput) {
    serviceTypeInput.addEventListener('change', () => {
      clearFieldError(serviceTypeInput, errorServiceType);
      refreshCategoryOptions();
      refreshTechnicianOptions();
    });
  }
  if (categoryInput) {
    categoryInput.addEventListener('change', () => {
      clearFieldError(categoryInput, errorCategory);
      refreshRepairOptions();
      refreshInstallationOptions();
      refreshTechnicianOptions();
    });
  }
  if (repairOptionInput) {
    repairOptionInput.addEventListener('change', () => {
      clearFieldError(repairOptionInput, errorRepairOption);
    });
  }
  if (installationOptionInput) {
    installationOptionInput.addEventListener('change', () => {
      clearFieldError(installationOptionInput, errorInstallationOption);
    });
  }
  if (issueInput) {
    issueInput.addEventListener('input', () => clearFieldError(issueInput, errorIssue));
  }

  if (requestAddressHouseUnit) {
    requestAddressHouseUnit.addEventListener('input', () => {
      clearFieldError(requestAddressHouseUnit, null);
      if (errorRequestAddressAdd) errorRequestAddressAdd.textContent = '';
    });
  }

  if (requestAddressStreetName) {
    requestAddressStreetName.addEventListener('input', () => {
      clearFieldError(requestAddressStreetName, null);
      if (errorRequestAddressAdd) errorRequestAddressAdd.textContent = '';
    });
  }

  if (requestAddressBarangay) {
    requestAddressBarangay.addEventListener('change', () => {
      clearFieldError(requestAddressBarangay, null);
      if (errorRequestAddressAdd) errorRequestAddressAdd.textContent = '';
    });
  }

  if (requestAddressAdditionalDetails) {
    requestAddressAdditionalDetails.addEventListener('input', () => {
      clearFieldError(requestAddressAdditionalDetails, null);
      if (errorRequestAddressAdd) errorRequestAddressAdd.textContent = '';
    });
  }

  if (uploadBtn) uploadBtn.addEventListener('click', () => mediaInput.click());

  mediaInput.addEventListener('change', async (event) => {
    clearFieldError(uploadBtn, errorMedia);
    const picked = Array.from(event.target.files || []);
    if (!picked.length) return;

    if (selectedMedia.length + picked.length > MAX_FILES) {
      setFieldError(uploadBtn, errorMedia, `You can upload up to ${MAX_FILES} photos/videos only.`);
      mediaInput.value = '';
      return;
    }

    for (const file of picked) {
      const isAllowed = file.type.startsWith('image/') || file.type.startsWith('video/');
      if (!isAllowed) {
        setFieldError(uploadBtn, errorMedia, 'Only image and video files are allowed.');
        continue;
      }

      const sizeMb = file.size / (1024 * 1024);
      const isVideo = file.type.startsWith('video/');
      const allowedSizeMb = isVideo ? MAX_VIDEO_SIZE_MB : MAX_PHOTO_SIZE_MB;
      if (sizeMb > allowedSizeMb) {
        setFieldError(uploadBtn, errorMedia, `${isVideo ? 'Video' : 'Photo'} ${file.name} exceeds ${allowedSizeMb}MB.`);
        continue;
      }

      try {
        const dataUrl = await fileToDataUrl(file);
        const thumbnailUrl = file.type.startsWith('image/')
          ? await createImageThumbnailDataUrl(dataUrl)
          : '';
        selectedMedia.push({
          name: file.name,
          type: file.type,
          size: file.size,
          file,
          dataUrl,
          previewUrl: dataUrl,
          thumbnailUrl
        });
      } catch {
        setFieldError(uploadBtn, errorMedia, `Could not read ${file.name}.`);
      }
    }

    mediaInput.value = '';
    renderMediaPreview();
  });

  prevBtn.addEventListener('click', () => {
    const candidate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    if (monthKey(candidate) < monthKey(currentMonthStart)) return;
    viewDate = candidate;
    renderCalendar();
  });

  nextMonthBtn.addEventListener('click', () => {
    const candidate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    if (monthKey(candidate) > monthKey(maxMonthStart)) return;
    viewDate = candidate;
    renderCalendar();
  });

  if (backBtn) {
    backBtn.addEventListener('click', (event) => {
      const isHomeServiceFlow = requestedType === 'technician';
      const technicianStep = 4;
      const summaryStep = isHomeServiceFlow ? 5 : 3;
      const submittedStep = isHomeServiceFlow ? 6 : 4;
      if (currentStep === 1 || currentStep === submittedStep) return;
      event.preventDefault();
      if (currentStep === 2) setStep(1);
      if (currentStep === 3) setStep(2);
      if (isHomeServiceFlow && currentStep === technicianStep) setStep(3);
      if (currentStep === summaryStep) setStep(isHomeServiceFlow ? technicianStep : 2);
    });
  }

  if (requestAddressOptions) {
    requestAddressOptions.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.name !== 'request_selected_address') return;
      selectedRequestAddressId = String(target.value || '').trim();
      if (errorRequestAddress) errorRequestAddress.textContent = '';
    });
  }

  if (requestTechnicianSelect) {
    requestTechnicianSelect.addEventListener('change', () => {
      selectedTechnicianId = String(requestTechnicianSelect.value || '').trim();
      if (errorRequestTechnician) errorRequestTechnician.textContent = '';
    });
  }

  if (confirmTerms) {
    confirmTerms.addEventListener('change', () => {
      if (errorTerms) errorTerms.textContent = '';
    });
  }

  if (requestOpenAddAddressBtn) {
    requestOpenAddAddressBtn.addEventListener('click', () => {
      clearRequestAddressErrors();
      setRequestAddAddressOpen(true);
    });
  }

  if (requestCloseAddAddressBtn) {
    requestCloseAddAddressBtn.addEventListener('click', () => {
      clearRequestAddressErrors();
      setRequestAddAddressOpen(false);
    });
  }

  if (requestSaveAddressBtn) {
    requestSaveAddressBtn.addEventListener('click', async () => {
      clearRequestAddressErrors();
      const authUser = usersDb && usersDb.auth && usersDb.auth.currentUser
        ? usersDb.auth.currentUser
        : null;
      const activeUid = String((authUser && authUser.uid) || (signedInUser && signedInUser.uid) || '').trim();
      if (!activeUid) {
        if (errorRequestAddressAdd) errorRequestAddressAdd.textContent = 'Please sign in again.';
        return;
      }

      const houseUnit = normalizeFreeText(requestAddressHouseUnit && requestAddressHouseUnit.value ? requestAddressHouseUnit.value : '');
      const streetName = normalizeFreeText(requestAddressStreetName && requestAddressStreetName.value ? requestAddressStreetName.value : '');
      const barangay = String(requestAddressBarangay && requestAddressBarangay.value ? requestAddressBarangay.value : '').trim();
      const additionalDetails = normalizeFreeText(requestAddressAdditionalDetails && requestAddressAdditionalDetails.value ? requestAddressAdditionalDetails.value : '');

      if (!houseUnit) {
        setFieldError(requestAddressHouseUnit, errorRequestAddressAdd, 'Please enter your house or unit number.');
        if (typeof requestAddressHouseUnit.focus === 'function') requestAddressHouseUnit.focus();
        return;
      } else if (!hasTextContent(houseUnit) || !isValidHouseUnitFormat(houseUnit) || houseUnit.length < MIN_HOUSE_UNIT_LENGTH || houseUnit.length > MAX_HOUSE_UNIT_LENGTH || !hasDigit(houseUnit)) {
        setFieldError(requestAddressHouseUnit, errorRequestAddressAdd, `House/Unit must be ${MIN_HOUSE_UNIT_LENGTH}-${MAX_HOUSE_UNIT_LENGTH} characters, use valid text, and include a number.`);
        if (typeof requestAddressHouseUnit.focus === 'function') requestAddressHouseUnit.focus();
        return;
      }

      if (!streetName) {
        setFieldError(requestAddressStreetName, errorRequestAddressAdd, 'Please enter your street name.');
        if (typeof requestAddressStreetName.focus === 'function') requestAddressStreetName.focus();
        return;
      } else if (!hasTextContent(streetName) || !isValidStreetNameFormat(streetName) || streetName.length < MIN_STREET_NAME_LENGTH || streetName.length > MAX_STREET_NAME_LENGTH || !hasAtLeastTwoLetters(streetName)) {
        setFieldError(requestAddressStreetName, errorRequestAddressAdd, `Street name must be ${MIN_STREET_NAME_LENGTH}-${MAX_STREET_NAME_LENGTH} characters and include at least 2 letters.`);
        if (typeof requestAddressStreetName.focus === 'function') requestAddressStreetName.focus();
        return;
      }

      if (!barangay) {
        setFieldError(requestAddressBarangay, errorRequestAddressAdd, 'Please select your barangay.');
        if (typeof requestAddressBarangay.focus === 'function') requestAddressBarangay.focus();
        return;
      }

      if (!additionalDetails) {
        setFieldError(requestAddressAdditionalDetails, errorRequestAddressAdd, 'Please enter additional details or landmark.');
        if (typeof requestAddressAdditionalDetails.focus === 'function') requestAddressAdditionalDetails.focus();
        return;
      } else if (!hasTextContent(additionalDetails)) {
        setFieldError(requestAddressAdditionalDetails, errorRequestAddressAdd, 'Additional details must include readable text.');
        if (typeof requestAddressAdditionalDetails.focus === 'function') requestAddressAdditionalDetails.focus();
        return;
      } else if (additionalDetails.length < MIN_ADDRESS_LANDMARK_LENGTH || additionalDetails.length > MAX_ADDRESS_LANDMARK_LENGTH) {
        setFieldError(requestAddressAdditionalDetails, errorRequestAddressAdd, `Additional details/landmark must be ${MIN_ADDRESS_LANDMARK_LENGTH}-${MAX_ADDRESS_LANDMARK_LENGTH} characters.`);
        if (typeof requestAddressAdditionalDetails.focus === 'function') requestAddressAdditionalDetails.focus();
        return;
      }

      if (requestAddressHouseUnit) requestAddressHouseUnit.value = houseUnit;
      if (requestAddressStreetName) requestAddressStreetName.value = streetName;
      if (requestAddressAdditionalDetails) requestAddressAdditionalDetails.value = additionalDetails;

      requestSaveAddressBtn.disabled = true;
      requestSaveAddressBtn.textContent = 'SAVING...';
      try {
        await usersDb.saveAddress(activeUid, { houseUnit, streetName, barangay, additionalDetails });
        if (requestAddressHouseUnit) requestAddressHouseUnit.value = '';
        if (requestAddressStreetName) requestAddressStreetName.value = '';
        if (requestAddressBarangay) requestAddressBarangay.value = '';
        if (requestAddressAdditionalDetails) requestAddressAdditionalDetails.value = '';
        await refreshRequestAddresses();
        setRequestAddAddressOpen(false);
      } catch (err) {
        if (errorRequestAddressAdd) {
          errorRequestAddressAdd.textContent = err && err.message ? err.message : 'Failed to save address.';
        }
      } finally {
        requestSaveAddressBtn.disabled = false;
        requestSaveAddressBtn.textContent = 'SAVE ADDRESS';
      }
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const isHomeServiceFlow = requestedType === 'technician';
    const technicianStep = 4;
    const summaryStep = isHomeServiceFlow ? 5 : 3;
    const submittedStep = isHomeServiceFlow ? 6 : 4;

    if (currentStep === 1) {
      if (!validateStep1()) return;
      setStep(2);
      return;
    }

    if (currentStep === 2) {
      if (!validateStep2()) return;
      setStep(3);
      return;
    }

    if (isHomeServiceFlow && currentStep === 3) {
      if (!validateStep3Address()) return;
      setStep(technicianStep);
      return;
    }

    if (isHomeServiceFlow && currentStep === technicianStep) {
      if (!validateStep4Technician()) return;
      setStep(summaryStep);
      return;
    }

    if (currentStep === summaryStep) {
      await submitRequest();
      return;
    }

    if (currentStep === submittedStep) {
      window.location.href = 'pending.html';
    }
  });

  initializeServiceTypeOptions();
  updateServiceModeNote();
  renderCalendar();
  renderSlots();
  syncPreferredText();
  renderMediaPreview();
  setStep(1);
  };
})();

