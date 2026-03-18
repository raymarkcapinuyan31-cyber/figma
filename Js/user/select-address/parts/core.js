document.addEventListener('DOMContentLoaded', () => {
  const DRAFT_KEY = 'hfs_booking_draft';
  const usersDb = window.usersDatabase || window.homefixDB || null;
  const form = document.getElementById('selectAddressForm');
  const options = document.getElementById('addressOptions');
  const confirmBtn = document.getElementById('confirmAddressBtn');
  const pageTitle = document.querySelector('.select-address-card h1');
  const helpText = document.querySelector('.select-address-card .help');

  const quickWrap = document.getElementById('quickAddressWrap');
  const quickHouse = document.getElementById('quickHouseUnit');
  const quickStreet = document.getElementById('quickStreetName');
  const quickBarangay = document.getElementById('quickBarangay');
  const quickAdditionalDetails = document.getElementById('quickAdditionalDetails');
  const quickSaveBtn = document.getElementById('quickSaveAddressBtn');
  const quickError = document.getElementById('quickAddressError');
  const formActions = form.querySelector('.actions-row');
  const submittedModal = document.getElementById('requestSubmittedModal');
  const submittedId = document.getElementById('requestSubmittedId');
  const viewRequestBtn = document.getElementById('viewRequestBtn');
  const closeModalBtn = document.getElementById('closeRequestModalBtn');

  if (!form || !options || !confirmBtn || !usersDb || !usersDb.auth) return;

  let activeUser = null;
  let addresses = [];
  let draft = null;
  let submissionLocked = false;

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeFreeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isValidAdditionalDetailsFormat(value) {
    return /^[A-Za-z0-9,\-\s]+$/.test(String(value || ''));
  }

  function toRequestDisplayId(rawId) {
    const source = String(rawId || '').trim();
    if (!source) return 'N/A';

    const bookingType = String(draft && draft.bookingType ? draft.bookingType : '').toLowerCase();
    const requestMode = bookingType === 'appointment' ? 'drop-off-store' : 'home-service';
    if (usersDb && typeof usersDb.formatRequestCode === 'function') {
      return usersDb.formatRequestCode({ id: source, requestId: source, bookingType, requestMode }, source);
    }

    const prefix = bookingType === 'appointment' ? 'SD' : 'HS';
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
      hash = ((hash * 33) + source.charCodeAt(i)) >>> 0;
    }
    return `${prefix}-${String(hash % 100000).padStart(5, '0')}`;
  }

  function openSubmittedModal(requestRawId, draft, selectedAddress) {
    if (!submittedModal || !submittedId) return;
    submittedId.textContent = toRequestDisplayId(requestRawId);
    submittedModal.hidden = false;
  }

  function closeSubmittedModal() {
    if (!submittedModal) return;
    submittedModal.hidden = true;
  }

  function loadDraft() {
    const draftRaw = sessionStorage.getItem(DRAFT_KEY);
    if (!draftRaw) return null;
    try {
      return JSON.parse(draftRaw);
    } catch {
      return null;
    }
  }

  function toIsoDateLocal(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function normalizeTimeRangeLabel(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    return value
      .replace(/\s*-\s*/g, ' – ')
      .replace(/am/gi, 'AM')
      .replace(/pm/gi, 'PM');
  }

  function extractDraftScheduleParts(sourceDraft) {
    const safeDraft = sourceDraft || {};
    const schedule = safeDraft.schedule && typeof safeDraft.schedule === 'object' ? safeDraft.schedule : {};

    const display = String(
      schedule.display
      || safeDraft.preferredSchedule
      || safeDraft.preferred_datetime
      || ''
    ).trim();

    let preferredDate = String(schedule.date || safeDraft.preferredDate || '').trim();
    let preferredTime = String(schedule.time || safeDraft.preferredTime || '').trim();

    if ((!preferredDate || !preferredTime) && display) {
      const parts = display.split(' at ');
      if (parts.length === 2) {
        if (!preferredDate) preferredDate = toIsoDateLocal(parts[0]);
        if (!preferredTime) preferredTime = parts[1].trim();
      } else {
        const timeMatch = display.match(/(\d{1,2}:\d{2}\s*[ap]m\s*-\s*\d{1,2}:\d{2}\s*[ap]m)\s*$/i);
        if (timeMatch) {
          if (!preferredTime) preferredTime = timeMatch[1].trim();
          if (!preferredDate) {
            const datePart = display.slice(0, display.length - timeMatch[1].length).trim();
            preferredDate = toIsoDateLocal(datePart);
          }
        }
      }
    }

    preferredDate = toIsoDateLocal(preferredDate);
    preferredTime = preferredTime.trim();
    const normalizedTimeLabel = normalizeTimeRangeLabel(preferredTime);

    return {
      preferredDate,
      preferredTime
    };
  }

  async function loadAddresses() {
    if (!activeUser) return [];
    try {
      const data = await usersDb.getAddresses(activeUser.uid);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function renderAddressOptions() {
    if (!addresses.length) {
      options.innerHTML = '<div class="empty">No saved addresses found yet.</div>';
      confirmBtn.disabled = true;
      if (quickWrap) quickWrap.hidden = false;
      return;
    }

    if (quickWrap) quickWrap.hidden = true;
    confirmBtn.disabled = false;

    const cards = addresses.map((entry, index) => {
      const checked = index === 0 ? 'checked' : '';
      const displayLine1 = `${escapeHtml(entry.houseUnit || '')}, ${escapeHtml(entry.streetName || '')}`;
      const displayLine2 = `${escapeHtml(entry.barangay || '')}, Dagupan City`;
      const displayLine3 = entry.additionalDetails ? `<span>Details: ${escapeHtml(entry.additionalDetails)}</span>` : '';
      return `
        <label class="address-option">
          <input type="radio" name="selected_address" value="${escapeHtml(entry.id || '')}" ${checked}>
          <div class="details">
            <strong>${displayLine1}</strong>
            <span>${displayLine2}</span>
            ${displayLine3}
          </div>
        </label>
      `;
    });

    options.innerHTML = cards.join('');
  }

  async function refreshAddresses() {
    addresses = await loadAddresses();
    renderAddressOptions();
  }

  if (quickSaveBtn) {
    quickSaveBtn.addEventListener('click', async () => {
      if (!activeUser) return;

      const houseUnit = normalizeFreeText(quickHouse && quickHouse.value ? quickHouse.value : '');
      const streetName = normalizeFreeText(quickStreet && quickStreet.value ? quickStreet.value : '');
      const barangay = String(quickBarangay && quickBarangay.value ? quickBarangay.value : '').trim();
      const additionalDetails = normalizeFreeText(quickAdditionalDetails && quickAdditionalDetails.value ? quickAdditionalDetails.value : '');

      if (quickError) quickError.textContent = '';

      if (!houseUnit || !streetName || !barangay) {
        if (quickError) quickError.textContent = 'Please complete house/unit, street, and barangay.';
        return;
      }

      if (additionalDetails && !isValidAdditionalDetailsFormat(additionalDetails)) {
        if (quickError) quickError.textContent = 'Landmark/details can only use letters, numbers, spaces, commas, and hyphens.';
        if (quickAdditionalDetails && typeof quickAdditionalDetails.focus === 'function') quickAdditionalDetails.focus();
        return;
      }

      if (quickHouse) quickHouse.value = houseUnit;
      if (quickStreet) quickStreet.value = streetName;
      if (quickAdditionalDetails) quickAdditionalDetails.value = additionalDetails;

      quickSaveBtn.disabled = true;
      quickSaveBtn.textContent = 'SAVING...';

      try {
        await usersDb.saveAddress(activeUser.uid, { houseUnit, streetName, barangay, additionalDetails });
        if (quickHouse) quickHouse.value = '';
        if (quickStreet) quickStreet.value = '';
        if (quickBarangay) quickBarangay.value = '';
        if (quickAdditionalDetails) quickAdditionalDetails.value = '';
        await refreshAddresses();
      } catch (err) {
        if (quickError) quickError.textContent = err && err.message ? err.message : 'Failed to save address.';
      } finally {
        quickSaveBtn.disabled = false;
        quickSaveBtn.textContent = 'SAVE ADDRESS';
      }
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submissionLocked) return;

    const selected = form.querySelector('input[name="selected_address"]:checked');
    if (!selected) {
      if (!addresses.length && quickWrap) {
        quickWrap.hidden = false;
      }
      return;
    }
    const selectedAddress = addresses.find((entry) => String(entry.id) === String(selected.value));
    if (!selectedAddress) return;

    const scheduleParts = extractDraftScheduleParts(draft);
    if (!draft || !draft.device || !draft.issue || !scheduleParts.preferredDate || !scheduleParts.preferredTime) {
      alert('Booking details are incomplete. Please complete the request form again.');
      window.location.href = 'book.html';
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'SAVING...';

    try {
      const addressId = String(selectedAddress.id || '').trim();
      const houseUnit = String(selectedAddress.houseUnit || '').trim();
      const streetName = String(selectedAddress.streetName || '').trim();
      const barangay = String(selectedAddress.barangay || '').trim();
      if (!addressId || !houseUnit || !streetName || !barangay) {
        alert('Please select a valid saved address before submitting.');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'CONFIRM';
        return;
      }

      const requestId = await usersDb.addBookingRequest({
        customerId: activeUser.uid,
        bookingType: draft.bookingType || 'technician',
        deviceType: draft.device,
        issue: draft.issue,
        description: draft.issue,
        preferredDate: scheduleParts.preferredDate,
        preferredTime: scheduleParts.preferredTime,
        requestDetails: {
          serviceMode: (draft.bookingType || 'technician') === 'appointment' ? 'Store Drop-Off' : 'Home Service',
          serviceType: String(draft.serviceType || '').trim(),
          category: String(draft.category || '').trim(),
          selectedOptionLabel: 'Concern',
          selectedOptionValue: String(draft.device || '').trim(),
          additionalInfo: String(draft.issue || '').trim(),
          issue: String(draft.issue || '').trim()
        },
        status: 'pending',
        location: {
          addressId,
          houseUnit,
          streetName,
          barangay,
          additionalDetails: selectedAddress.additionalDetails || '',
          city: 'Dagupan City',
          isStoreVisit: false
        },
        media: Array.isArray(draft.media) ? draft.media : []
      });

      sessionStorage.removeItem(DRAFT_KEY);
      submissionLocked = true;
      confirmBtn.textContent = 'SUBMITTED';
      openSubmittedModal(requestId, draft, selectedAddress);
    } catch (err) {
      alert(err && err.message ? err.message : 'Failed to save booking request. Please try again.');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'CONFIRM';
    }
  });

  if (viewRequestBtn) {
    viewRequestBtn.addEventListener('click', () => {
      window.location.href = 'pending.html';
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      closeSubmittedModal();
    });
  }

  usersDb.auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = '../../login.html';
      return;
    }

    activeUser = user;
    draft = loadDraft();
    if (!draft) {
      window.location.href = 'book.html';
      return;
    }

    confirmBtn.textContent = 'CONFIRM';
    await refreshAddresses();
  });
});
