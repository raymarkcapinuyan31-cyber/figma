document.addEventListener('DOMContentLoaded', () => {
  const usersDb = window.usersDatabase || window.homefixDB || window.bookingDatabase || null;
  const threadList = document.getElementById('messagesThreadList');
  const mainEmpty = document.getElementById('messagesMainEmpty');
  const conversation = document.getElementById('messagesConversation');
  const requestTitle = document.getElementById('messagesRequestTitle');
  const requestMeta = document.getElementById('messagesRequestMeta');
  const assignedTech = document.getElementById('messagesAssignedTech');
  const messagesList = document.getElementById('messagesList');
  const messagesQuickReplies = document.getElementById('messagesQuickReplies');
  const messagesForm = document.getElementById('messagesForm');
  const messagesAttachBtn = document.getElementById('messagesAttachBtn');
  const messagesAttachmentInput = document.getElementById('messagesAttachmentInput');
  const messagesInput = document.getElementById('messagesInput');
  const messagesSendBtn = document.getElementById('messagesSendBtn');
  const messagesReportBtn = document.getElementById('messagesReportBtn');
  const reportModal = document.getElementById('reportModal');
  const reportModalCloseBtn = document.getElementById('reportModalCloseBtn');
  const reportForm = document.getElementById('reportForm');
  const reportReasonSelect = document.getElementById('reportReasonSelect');
  const reportReasonOtherLabel = document.getElementById('reportReasonOtherLabel');
  const reportReasonOther = document.getElementById('reportReasonOther');
  const reportExplanation = document.getElementById('reportExplanation');
  const reportFormError = document.getElementById('reportFormError');
  const reportCancelBtn = document.getElementById('reportCancelBtn');
  const reportSubmitBtn = document.getElementById('reportSubmitBtn');
  const reportSuccessModal = document.getElementById('reportSuccessModal');
  const reportSuccessOkBtn = document.getElementById('reportSuccessOkBtn');
  const reportConfirmModal = document.getElementById('reportConfirmModal');
  const reportConfirmCancelBtn = document.getElementById('reportConfirmCancelBtn');
  const reportConfirmOkBtn = document.getElementById('reportConfirmOkBtn');

  if (!usersDb || !usersDb.auth || !threadList || !mainEmpty || !conversation || !requestTitle || !requestMeta || !assignedTech || !messagesList || !messagesQuickReplies || !messagesForm || !messagesAttachBtn || !messagesAttachmentInput || !messagesInput || !messagesSendBtn || !messagesReportBtn || !reportModal || !reportModalCloseBtn || !reportForm || !reportReasonSelect || !reportReasonOtherLabel || !reportReasonOther || !reportExplanation || !reportFormError || !reportCancelBtn || !reportSubmitBtn || !reportSuccessModal || !reportSuccessOkBtn || !reportConfirmModal || !reportConfirmCancelBtn || !reportConfirmOkBtn) {
    return;
  }

  let activeUser = null;
  let activeItems = [];
  let activeMessageRequestId = '';
  let unsubscribeBookings = null;
  let unsubscribeMessages = null;
  let unsubscribeOwnPresence = null;
  let unsubscribePeerPresence = null;
  let activePeerPresenceUid = '';
  let activeCustomerDisplayName = '';
  let pendingReportSubmission = null;
  let sendMessageForActiveThread = null;
  const technicianNameByRequestId = Object.create(null);
  const technicianNameByUid = Object.create(null);
  const technicianNameByEmail = Object.create(null);
  const technicianLookupInFlight = Object.create(null);
  const presenceByUid = Object.create(null);
  const requestedMessageRequestId = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return normalizeText(params.get('requestId'));
    } catch (_) {
      return '';
    }
  })();

  const QUICK_REPLIES = [
    'Hello, any update on my request?',
    'What time will you arrive?',
    'Thank you.'
  ];
  const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function toTimeValue(value) {
    if (!value) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    if (value && typeof value.toDate === 'function') return value.toDate().getTime();
    return 0;
  }

  function formatDateTime(value) {
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
    const state = normalizeText(presence.state).toLowerCase();
    if (state === 'online') return 'Online now';
    const elapsed = formatElapsedSince(presence.lastChanged);
    return elapsed ? `Offline ${elapsed}` : 'Offline';
  }

  function getRequestDetails(item) {
    return item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};
  }

  function toTitleText(value) {
    const normalized = normalizeText(value);
    if (!normalized) return '';
    return normalized
      .split(/\s+/)
      .map((word) => word ? (word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) : '')
      .join(' ');
  }

  function looksLikeEmail(value) {
    const text = normalizeText(value);
    return !!text && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
  }

  function getFirstName(value) {
    const raw = normalizeText(value);
    if (!raw || looksLikeEmail(raw)) return '';

    const firstToken = raw.split(/\s+/)[0] || '';
    const cleaned = firstToken.replace(/[^A-Za-z'-]/g, '');
    if (!cleaned) return '';

    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  function getAssignedTechnicianKey(item) {
    const uid = normalizeText(item && (item.assignedTechnicianId || item.technicianId || item.assignedToUid || item.assignedTo));
    const email = normalizeText(item && (item.assignedTechnicianEmail || item.technicianEmail || item.assignedToEmail)).toLowerCase();
    return { uid, email };
  }

  function getAssignedTechnicianEmail(item) {
    return normalizeText(item && (item.assignedTechnicianEmail || item.technicianEmail || item.assignedToEmail)).toLowerCase();
  }

  function buildPersonFullName(profile) {
    if (!profile || typeof profile !== 'object') return '';
    const firstName = normalizeText(profile.first_name || profile.firstName);
    const lastName = normalizeText(profile.last_name || profile.lastName);
    return `${firstName} ${lastName}`.trim();
  }

  function getCustomerDisplayNameFromItem(item) {
    const firstName = normalizeText(item && (item.customerFirstName || item.first_name || (item.customer && (item.customer.first_name || item.customer.firstName))));
    const lastName = normalizeText(item && (item.customerLastName || item.last_name || (item.customer && (item.customer.last_name || item.customer.lastName))));
    const combined = `${firstName} ${lastName}`.trim();
    if (combined) return combined;

    const fallback = normalizeText(item && item.customerName);
    if (fallback && !looksLikeEmail(fallback)) return fallback;
    return '';
  }

  async function resolveActiveCustomerDisplayName(user) {
    const uid = normalizeText(user && user.uid);
    if (!uid) {
      activeCustomerDisplayName = '';
      return;
    }

    const fallbackEmail = normalizeText(user && user.email);
    let resolvedName = '';

    try {
      let profile = null;
      if (typeof usersDb.getUserById === 'function') {
        profile = await usersDb.getUserById(uid);
      }
      if (!profile && fallbackEmail && typeof usersDb.getUserByEmail === 'function') {
        profile = await usersDb.getUserByEmail(fallbackEmail);
      }
      resolvedName = buildPersonFullName(profile);
    } catch (_) {
      resolvedName = '';
    }

    if (!resolvedName && fallbackEmail) {
      const fromEmail = getFirstName(fallbackEmail);
      resolvedName = fromEmail || '';
    }

    activeCustomerDisplayName = normalizeText(resolvedName);
  }

  function getTechnicianNameFromRecord(record) {
    if (!record || typeof record !== 'object') return '';
    const firstName = normalizeText(record.first_name || record.firstName);
    const lastName = normalizeText(record.last_name || record.lastName);
    const fullFromParts = `${firstName} ${lastName}`.trim();
    if (fullFromParts) return fullFromParts;
    return normalizeText(record.fullName || record.displayName || record.name);
  }

  function getTechnicianNameFromItem(item) {
    const firstName = normalizeText(
      item && (
        item.assignedTechnicianFirstName
        || item.technicianFirstName
        || item.assignedToFirstName
        || (item.technician && (item.technician.first_name || item.technician.firstName))
      )
    );
    const lastName = normalizeText(
      item && (
        item.assignedTechnicianLastName
        || item.technicianLastName
        || item.assignedToLastName
        || (item.technician && (item.technician.last_name || item.technician.lastName))
      )
    );
    const fullFromParts = `${firstName} ${lastName}`.trim();
    if (fullFromParts) return fullFromParts;

    const directName = normalizeText(
      item && (
        item.assignedTechnicianName
        || item.technicianName
        || item.assignedToName
        || (item.technician && item.technician.name)
      )
    );
    return looksLikeEmail(directName) ? '' : directName;
  }

  function getCachedTechnicianName(item) {
    const assigned = getAssignedTechnicianKey(item);
    if (assigned.uid && technicianNameByUid[assigned.uid]) return technicianNameByUid[assigned.uid];
    if (assigned.email && technicianNameByEmail[assigned.email]) return technicianNameByEmail[assigned.email];
    return '';
  }

  function queueTechnicianNameResolution(items) {
    if (!Array.isArray(items) || !items.length) return;
    if (!usersDb || (typeof usersDb.getUserById !== 'function' && typeof usersDb.getUserByEmail !== 'function')) return;

    const tasks = [];
    let hasResolvedName = false;

    items.forEach((item) => {
      if (!hasAssignedTechnician(item)) return;
      const assigned = getAssignedTechnicianKey(item);
      if (!assigned.uid && !assigned.email) return;
      if (getTechnicianNameFromItem(item)) return;
      if (getCachedTechnicianName(item)) return;

      const lookupKey = assigned.uid ? `uid:${assigned.uid}` : `email:${assigned.email}`;
      if (technicianLookupInFlight[lookupKey]) return;
      technicianLookupInFlight[lookupKey] = true;

      tasks.push((async () => {
        let profile = null;
        try {
          if (assigned.uid && typeof usersDb.getUserById === 'function') {
            profile = await usersDb.getUserById(assigned.uid);
          }
          if (!profile && assigned.email && typeof usersDb.getUserByEmail === 'function') {
            profile = await usersDb.getUserByEmail(assigned.email);
          }
        } catch (_) {
          profile = null;
        }

        const fullName = getTechnicianNameFromRecord(profile);
        if (!fullName) return;
        if (assigned.uid) technicianNameByUid[assigned.uid] = fullName;
        if (assigned.email) technicianNameByEmail[assigned.email] = fullName;
        hasResolvedName = true;
      })().finally(() => {
        delete technicianLookupInFlight[lookupKey];
      }));
    });

    if (!tasks.length) return;

    Promise.all(tasks).then(() => {
      if (hasResolvedName) renderPage();
    });
  }

  function isShortLogicalLabel(value) {
    const text = normalizeText(value);
    if (!text) return false;
    if (text.length > 42) return false;
    return text.split(/\s+/).length <= 6;
  }

  function getRequestTitle(item) {
    const details = getRequestDetails(item);
    const serviceType = toTitleText(details.serviceType || (item && item.serviceType) || '');
    const category = toTitleText(details.category || (item && (item.category || item.adminApprovedSkillCategory)) || '');
    const selected = toTitleText(details.selectedOptionLabel || details.selectedOptionValue || (item && (item.serviceName || item.deviceType)) || '');

    if (category && serviceType) return `${category} - ${serviceType}`;
    if (category && isShortLogicalLabel(selected)) return `${category} - ${selected}`;
    if (category) return category;
    if (serviceType) return serviceType;
    if (isShortLogicalLabel(selected)) return selected;
    return 'Service Request';
  }

  function getScheduleLabel(item) {
    const preferredDate = normalizeText(item && item.preferredDate);
    const preferredTime = normalizeText(item && item.preferredTime);
    if (preferredDate && preferredTime) return `${preferredDate} ${preferredTime}`;
    return normalizeText(item && (item.preferredSchedule || item.preferred_datetime)) || 'No schedule set';
  }

  function getTechnicianLabel(item, requestId) {
    const inferred = normalizeText(requestId && technicianNameByRequestId[requestId]);
    if (inferred) return inferred;

    const fromItem = getTechnicianNameFromItem(item);
    if (fromItem) return fromItem;

    const fromCache = getCachedTechnicianName(item);
    if (fromCache) return fromCache;

    return 'Technician';
  }

  function inferTechnicianDisplayName(entries) {
    const list = Array.isArray(entries) ? entries : [];
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const entry = list[index] || {};
      const role = normalizeText(entry.senderRole).toLowerCase();
      if (role !== 'technician') continue;

      const name = normalizeText(entry.senderName);
      if (name && !looksLikeEmail(name)) return name;
    }
    return '';
  }

  function getBookingCode(item) {
    const value = normalizeText(item && (item.requestId || item.id));
    if (!value) return 'N/A';
    if (usersDb && typeof usersDb.formatRequestCode === 'function') {
      return usersDb.formatRequestCode(item, value);
    }
    return value;
  }

  function hasAssignedTechnician(item) {
    const uid = normalizeText(item && (item.assignedTechnicianId || item.technicianId || item.assignedToUid || item.assignedTo));
    const email = normalizeText(item && (item.assignedTechnicianEmail || item.technicianEmail || item.assignedToEmail));
    const name = normalizeText(item && (item.assignedTechnicianName || item.technicianName || item.assignedToName));
    return !!(uid || email || name);
  }

  function isChatStatusEligible(item) {
    const status = String(item && item.status ? item.status : '').toLowerCase();
    return status === 'accepted' || status === 'confirmed' || status === 'in-progress' || status === 'ongoing';
  }

  function getChatEligibleItems(items) {
    return (Array.isArray(items) ? items : [])
      .filter((item) => isChatStatusEligible(item) && hasAssignedTechnician(item))
      .sort((left, right) => toTimeValue(right && right.updatedAt) - toTimeValue(left && left.updatedAt));
  }

  function stopMessagesSubscription() {
    if (typeof unsubscribeMessages === 'function') {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }
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

  function startOwnPresenceTracking() {
    stopOwnPresenceTracking();
  }

  function getAssignedTechnicianUid(item) {
    return normalizeText(item && (item.assignedTechnicianId || item.technicianId || item.assignedToUid || item.assignedTo));
  }

  function updateAssignedTechnicianLine(item, requestId) {
    const techLabel = getTechnicianLabel(item, requestId);
    assignedTech.textContent = `Assigned Technician: ${techLabel}`;
  }

  function bindPeerPresence(item, requestId) {
    updateAssignedTechnicianLine(item, requestId);
    stopPeerPresenceSubscription();
  }

  function getChatPath(requestId) {
    return `chats/${normalizeText(requestId)}`;
  }

  function getLegacyChatPath(requestId) {
    return `requestChats/${normalizeText(requestId)}`;
  }

  function mergeChatEntries(primaryEntries, legacyEntries) {
    const mergedById = new Map();

    function mergeOne(entry) {
      if (!entry || typeof entry !== 'object') return;
      const id = normalizeText(entry.id);
      if (!id) return;
      const existing = mergedById.get(id);
      if (!existing) {
        mergedById.set(id, entry);
        return;
      }
      const existingTime = toTimeValue(existing && existing.createdAt);
      const nextTime = toTimeValue(entry && entry.createdAt);
      if (nextTime >= existingTime) {
        mergedById.set(id, entry);
      }
    }

    (Array.isArray(primaryEntries) ? primaryEntries : []).forEach(mergeOne);
    (Array.isArray(legacyEntries) ? legacyEntries : []).forEach(mergeOne);

    const entries = Array.from(mergedById.values());
    entries.sort((a, b) => toTimeValue(a && a.createdAt) - toTimeValue(b && b.createdAt));
    return entries;
  }

  function subscribeMergedChat(rtdb, requestId, onEntries, onError) {
    const state = {
      primary: [],
      legacy: [],
      primaryErrored: false,
      legacyErrored: false
    };

    const emit = () => {
      onEntries(mergeChatEntries(state.primary, state.legacy));
    };

    const primaryRef = rtdb.ref(getChatPath(requestId)).limitToLast(200);
    const legacyRef = rtdb.ref(getLegacyChatPath(requestId)).limitToLast(200);

    const makeOnValue = (key) => (snapshot) => {
      const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
      state[key] = Object.keys(value).map((id) => Object.assign({ id }, value[id] || {}));
      emit();
    };

    const onPrimaryValue = makeOnValue('primary');
    const onLegacyValue = makeOnValue('legacy');

    const onPrimaryError = (error) => {
      state.primaryErrored = true;
      emit();
      if (state.legacyErrored && typeof onError === 'function') {
        onError(error);
      }
    };
    const onLegacyError = (error) => {
      state.legacyErrored = true;
      emit();
      if (state.primaryErrored && typeof onError === 'function') {
        onError(error);
      }
    };

    primaryRef.on('value', onPrimaryValue, onPrimaryError);
    legacyRef.on('value', onLegacyValue, onLegacyError);

    return () => {
      primaryRef.off('value', onPrimaryValue);
      legacyRef.off('value', onLegacyValue);
    };
  }

  function isImageMediaType(mediaType) {
    return normalizeText(mediaType).toLowerCase().startsWith('image/');
  }

  function isVideoMediaType(mediaType) {
    return normalizeText(mediaType).toLowerCase().startsWith('video/');
  }

  function isSupportedAttachment(file) {
    if (!file || typeof file !== 'object') return false;
    const mediaType = normalizeText(file.type).toLowerCase();
    return isImageMediaType(mediaType) || isVideoMediaType(mediaType);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(normalizeText(reader.result));
      reader.onerror = () => reject(new Error('Failed to read attachment file'));
      reader.readAsDataURL(file);
    });
  }

  function setConversationVisible(visible) {
    mainEmpty.hidden = !!visible;
    conversation.hidden = !visible;
    if (!visible) {
      messagesReportBtn.disabled = true;
    }
  }

  function getActiveThreadItem() {
    const selectedId = normalizeText(activeMessageRequestId);
    if (!selectedId) return null;
    return (Array.isArray(activeItems) ? activeItems : []).find((item) => normalizeText(item && item.id) === selectedId) || null;
  }

  function setReportFormError(message) {
    reportFormError.textContent = normalizeText(message);
  }

  function setReportOtherReasonVisibility() {
    const isOther = normalizeText(reportReasonSelect.value).toLowerCase() === 'others';
    reportReasonOther.hidden = !isOther;
    reportReasonOtherLabel.hidden = !isOther;
    if (!isOther) reportReasonOther.value = '';
  }

  function resetReportForm() {
    reportForm.reset();
    setReportOtherReasonVisibility();
    setReportFormError('');
  }

  function closeReportModal() {
    reportModal.hidden = true;
    reportSubmitBtn.disabled = false;
  }

  function openReportModal() {
    resetReportForm();
    reportModal.hidden = false;
    setTimeout(() => {
      if (reportReasonSelect && typeof reportReasonSelect.focus === 'function') reportReasonSelect.focus();
    }, 0);
  }

  function closeReportSuccessModal() {
    reportSuccessModal.hidden = true;
  }

  function openReportSuccessModal() {
    reportSuccessModal.hidden = false;
  }

  function closeReportConfirmModal() {
    reportConfirmModal.hidden = true;
    pendingReportSubmission = null;
  }

  function openReportConfirmModal(reason, explanation) {
    pendingReportSubmission = {
      reason: normalizeText(reason),
      explanation: normalizeText(explanation)
    };
    reportConfirmModal.hidden = false;
  }

  function getReportReasonValue() {
    const selectedReason = normalizeText(reportReasonSelect.value);
    if (selectedReason.toLowerCase() !== 'others') return selectedReason;
    return normalizeText(reportReasonOther.value);
  }

  async function submitTechnicianReport(reasonValue, explanationValue) {
    const item = getActiveThreadItem();
    const requestId = normalizeText(item && item.id);
    if (!item || !requestId || !activeUser || !activeUser.uid) {
      setReportFormError('Select a request thread first.');
      return;
    }

    const technicianId = getAssignedTechnicianUid(item);
    if (!technicianId) {
      setReportFormError('Unable to report because technician ID is missing on this request.');
      return;
    }

    const rtdb = usersDb && usersDb.firebase && typeof usersDb.firebase.database === 'function'
      ? usersDb.firebase.database()
      : null;
    if (!rtdb) {
      setReportFormError('Realtime Database is unavailable.');
      return;
    }

    messagesReportBtn.disabled = true;
    reportSubmitBtn.disabled = true;
    setReportFormError('');
    try {
      const payload = {
        requestId,
        requestCode: getBookingCode(item),
        requestStatus: normalizeText(item && item.status),
        customerId: normalizeText(activeUser.uid),
        customerEmail: normalizeText(activeUser.email).toLowerCase(),
        customerName: activeCustomerDisplayName || getCustomerDisplayNameFromItem(item) || 'Customer',
        technicianId,
        technicianEmail: getAssignedTechnicianEmail(item),
        technicianName: getTechnicianLabel(item, requestId),
        reason: normalizeText(reasonValue),
        details: normalizeText(explanationValue),
        source: 'customer-messages',
        createdAt: Date.now()
      };

      await rtdb.ref('reports/technician').push(payload);
      closeReportModal();
      openReportSuccessModal();
    } catch (_) {
      setReportFormError('Failed to submit report. Please try again.');
    } finally {
      if (!conversation.hidden) {
        messagesReportBtn.disabled = false;
      }
      reportSubmitBtn.disabled = false;
    }
  }

  function renderQuickReplies() {
    messagesQuickReplies.innerHTML = QUICK_REPLIES
      .map((text) => `<button type="button" class="messages-quick-reply-btn" data-quick-reply="${escapeHtml(text)}">${escapeHtml(text)}</button>`)
      .join('');
  }

  function setQuickRepliesDisabled(disabled) {
    const buttons = messagesQuickReplies.querySelectorAll('.messages-quick-reply-btn');
    buttons.forEach((button) => {
      button.disabled = !!disabled;
    });
  }

  function renderThreads(items) {
    queueTechnicianNameResolution(items);

    if (!items.length) {
      threadList.innerHTML = '<div class="messages-empty">No requests with assigned technician yet.</div>';
      return;
    }

    threadList.innerHTML = items.map((item) => {
      const id = normalizeText(item && item.id);
      const activeClass = id === activeMessageRequestId ? ' active' : '';
      const techLabel = getTechnicianLabel(item, id);
      return `
        <button type="button" class="messages-thread-btn${activeClass}" data-request-id="${escapeHtml(id)}">
          <strong>${escapeHtml(getRequestTitle(item))}</strong>
          <span>${escapeHtml(`Assigned Technician: ${techLabel}`)}</span>
          <span>${escapeHtml(getScheduleLabel(item))}</span>
        </button>
      `;
    }).join('');
  }

  function renderMessages(entries) {
    if (!entries.length) {
      messagesList.innerHTML = '<div class="messages-empty">No messages yet.</div>';
      return;
    }

    messagesList.innerHTML = entries.map((entry) => {
      const senderUid = normalizeText(entry && entry.senderUid);
      const mine = senderUid && activeUser && senderUid === String(activeUser.uid || '');
      const senderName = normalizeText(entry && entry.senderName) || (mine ? 'You' : 'Technician');
      const text = normalizeText(entry && entry.text);
      const mediaUrl = normalizeText(entry && entry.mediaDataUrl);
      const mediaType = normalizeText(entry && entry.mediaType).toLowerCase();
      let mediaHtml = '';
      if (mediaUrl && isImageMediaType(mediaType)) {
        mediaHtml = `<div class="messages-media-wrap"><img class="messages-media" src="${escapeHtml(mediaUrl)}" alt="Chat image attachment" loading="lazy"></div>`;
      } else if (mediaUrl && isVideoMediaType(mediaType)) {
        mediaHtml = `<div class="messages-media-wrap"><video class="messages-media" src="${escapeHtml(mediaUrl)}" controls preload="metadata"></video></div>`;
      }
      const timeLabel = formatDateTime(entry && entry.createdAt);
      return `<div class="messages-item${mine ? ' mine' : ''}">${mediaHtml}${escapeHtml(text || (mediaHtml ? '' : '(empty message)'))}<span class="messages-meta">${escapeHtml(senderName)}${timeLabel ? ` • ${escapeHtml(timeLabel)}` : ''}</span></div>`;
    }).join('');

    messagesList.scrollTop = messagesList.scrollHeight;
  }

  function bindThreadChat(item) {
    stopMessagesSubscription();
    sendMessageForActiveThread = null;

    const requestId = normalizeText(item && item.id);
    if (!requestId || !activeUser || !activeUser.uid) {
      setConversationVisible(false);
      setQuickRepliesDisabled(true);
      return;
    }

    requestTitle.textContent = getRequestTitle(item);
    requestMeta.textContent = `${getBookingCode(item)} • ${String(item && item.status ? item.status : 'Accepted')}`;
    bindPeerPresence(item, requestId);
    setConversationVisible(true);

    const rtdb = usersDb && usersDb.firebase && typeof usersDb.firebase.database === 'function'
      ? usersDb.firebase.database()
      : null;

    if (!rtdb) {
      messagesInput.disabled = true;
      messagesSendBtn.disabled = true;
      messagesAttachBtn.disabled = true;
      messagesReportBtn.disabled = true;
      setQuickRepliesDisabled(true);
      messagesList.innerHTML = '<div class="messages-empty">Realtime chat is unavailable.</div>';
      return;
    }

    messagesInput.disabled = false;
    messagesSendBtn.disabled = false;
    messagesAttachBtn.disabled = false;
    messagesReportBtn.disabled = false;
    setQuickRepliesDisabled(false);

    const canStillUseChat = () => {
      const latest = (Array.isArray(activeItems) ? activeItems : []).find((entry) => {
        return normalizeText(entry && entry.id) === requestId;
      }) || item || {};
      return isChatStatusEligible(latest) && hasAssignedTechnician(latest);
    };

    const lockClosedChat = () => {
      messagesInput.disabled = true;
      messagesSendBtn.disabled = true;
      messagesAttachBtn.disabled = true;
      messagesReportBtn.disabled = true;
      setQuickRepliesDisabled(true);
      messagesList.innerHTML = '<div class="messages-empty">Chat is now closed for this request.</div>';
    };

    const sendMessage = async (payload) => {
      if (!canStillUseChat()) {
        lockClosedChat();
        renderPage();
        return;
      }

      const rawText = payload && typeof payload === 'object' ? payload.text : payload;
      const text = normalizeText(rawText);
      const attachment = payload && typeof payload === 'object' ? payload.attachment : null;
      const hasAttachment = !!(attachment && normalizeText(attachment.mediaDataUrl));
      if (!text && !hasAttachment) return;

      messagesSendBtn.disabled = true;
      messagesAttachBtn.disabled = true;
      setQuickRepliesDisabled(true);
      try {
        const messagePayload = {
          requestId,
          text: text || (isVideoMediaType(attachment && attachment.mediaType) ? 'Sent a video' : 'Sent a photo'),
          senderUid: String(activeUser.uid || ''),
          senderRole: 'customer',
          senderName: activeCustomerDisplayName || getCustomerDisplayNameFromItem(item) || normalizeText(activeUser.email) || 'Customer',
          createdAt: Date.now()
        };

        if (hasAttachment) {
          messagePayload.mediaType = normalizeText(attachment.mediaType).toLowerCase();
          messagePayload.mediaName = normalizeText(attachment.mediaName);
          messagePayload.mediaDataUrl = normalizeText(attachment.mediaDataUrl);
        }

        const primaryRef = rtdb.ref(getChatPath(requestId)).push();
        const messageId = primaryRef && primaryRef.key ? String(primaryRef.key).trim() : '';
        await primaryRef.set(messagePayload);

        if (messageId) {
          try {
            await rtdb.ref(`${getLegacyChatPath(requestId)}/${messageId}`).set(messagePayload);
          } catch (_) {
          }
        }

        if (normalizeText(messagesInput.value) === text) {
          messagesInput.value = '';
        }
      } catch (_) {
        messagesList.innerHTML = '<div class="messages-empty">Failed to send message. Please try again.</div>';
      } finally {
        if (canStillUseChat()) {
          messagesSendBtn.disabled = false;
          messagesAttachBtn.disabled = false;
          setQuickRepliesDisabled(false);
        } else {
          lockClosedChat();
          renderPage();
        }
      }
    };

    sendMessageForActiveThread = sendMessage;

    const onValue = (entries) => {
      const inferredTechnicianName = inferTechnicianDisplayName(entries);
      if (inferredTechnicianName && technicianNameByRequestId[requestId] !== inferredTechnicianName) {
        technicianNameByRequestId[requestId] = inferredTechnicianName;
        updateAssignedTechnicianLine(item, requestId);
        renderThreads(getChatEligibleItems(activeItems));
      }

      renderMessages(entries);
    };
    const onError = () => {
      messagesList.innerHTML = '<div class="messages-empty">Unable to load chat messages.</div>';
    };

    unsubscribeMessages = subscribeMergedChat(rtdb, requestId, onValue, onError);

    messagesForm.onsubmit = async (event) => {
      event.preventDefault();
      await sendMessage({ text: messagesInput.value });
    };
  }

  function renderPage() {
    const eligible = getChatEligibleItems(activeItems);
    if (!eligible.length) {
      activeMessageRequestId = '';
      stopMessagesSubscription();
      renderThreads([]);
      setConversationVisible(false);
      return;
    }

    if (requestedMessageRequestId && !activeMessageRequestId) {
      activeMessageRequestId = requestedMessageRequestId;
    }

    const hasSelected = eligible.some((item) => normalizeText(item && item.id) === activeMessageRequestId);
    if (!hasSelected) {
      activeMessageRequestId = normalizeText(eligible[0] && eligible[0].id);
    }

    renderThreads(eligible);

    const selected = eligible.find((item) => normalizeText(item && item.id) === activeMessageRequestId) || eligible[0];
    if (selected) {
      activeMessageRequestId = normalizeText(selected.id);
      bindThreadChat(selected);
      renderThreads(eligible);
    }
  }

  threadList.addEventListener('click', (event) => {
    const btn = event.target && event.target.closest ? event.target.closest('[data-request-id]') : null;
    if (!btn) return;
    const requestId = normalizeText(btn.getAttribute('data-request-id'));
    if (!requestId) return;
    activeMessageRequestId = requestId;
    renderPage();
  });

  messagesQuickReplies.addEventListener('click', async (event) => {
    const button = event.target && event.target.closest
      ? event.target.closest('[data-quick-reply]')
      : null;
    if (!button) return;
    if (typeof sendMessageForActiveThread !== 'function') return;

    const quickText = normalizeText(button.getAttribute('data-quick-reply'));
    if (!quickText) return;
    await sendMessageForActiveThread({ text: quickText });
  });

  messagesAttachBtn.addEventListener('click', () => {
    if (messagesAttachBtn.disabled) return;
    messagesAttachmentInput.click();
  });

  messagesReportBtn.addEventListener('click', async () => {
    if (messagesReportBtn.disabled) return;
    const item = getActiveThreadItem();
    if (!item) {
      window.alert('Select a request thread first.');
      return;
    }
    openReportModal();
  });

  reportReasonSelect.addEventListener('change', () => {
    setReportOtherReasonVisibility();
    setReportFormError('');
  });

  reportModalCloseBtn.addEventListener('click', () => {
    closeReportModal();
  });

  reportCancelBtn.addEventListener('click', () => {
    closeReportModal();
  });

  reportModal.addEventListener('click', (event) => {
    if (event.target === reportModal) closeReportModal();
  });

  reportForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const reason = getReportReasonValue();
    const explanation = normalizeText(reportExplanation.value);

    if (!reason) {
      setReportFormError('Please select a reason.');
      return;
    }

    if (!explanation) {
      setReportFormError('Please add an explanation.');
      return;
    }

    openReportConfirmModal(reason, explanation);
  });

  reportConfirmCancelBtn.addEventListener('click', () => {
    closeReportConfirmModal();
  });

  reportConfirmOkBtn.addEventListener('click', async () => {
    if (!pendingReportSubmission) {
      closeReportConfirmModal();
      return;
    }

    const payload = pendingReportSubmission;
    reportConfirmModal.hidden = true;
    pendingReportSubmission = null;
    await submitTechnicianReport(payload.reason, payload.explanation);
  });

  reportConfirmModal.addEventListener('click', (event) => {
    if (event.target === reportConfirmModal) closeReportConfirmModal();
  });

  reportSuccessOkBtn.addEventListener('click', () => {
    closeReportSuccessModal();
  });

  reportSuccessModal.addEventListener('click', (event) => {
    if (event.target === reportSuccessModal) closeReportSuccessModal();
  });

  messagesAttachmentInput.addEventListener('change', async () => {
    const file = messagesAttachmentInput.files && messagesAttachmentInput.files[0] ? messagesAttachmentInput.files[0] : null;
    messagesAttachmentInput.value = '';

    if (!file) return;
    if (typeof sendMessageForActiveThread !== 'function') return;
    if (!isSupportedAttachment(file)) {
      window.alert('Only image and video files are supported.');
      return;
    }
    if (Number(file.size) > MAX_ATTACHMENT_BYTES) {
      window.alert('Attachment is too large. Please select a file under 6 MB.');
      return;
    }

    try {
      const mediaDataUrl = await fileToDataUrl(file);
      if (!mediaDataUrl) throw new Error('No attachment data');
      await sendMessageForActiveThread({
        text: messagesInput.value,
        attachment: {
          mediaType: normalizeText(file.type),
          mediaName: normalizeText(file.name),
          mediaDataUrl
        }
      });
    } catch (_) {
      window.alert('Failed to attach this file. Please try another file.');
    }
  });

  renderQuickReplies();
  setQuickRepliesDisabled(true);

  usersDb.auth.onAuthStateChanged(async (user) => {
    if (!user) {
      if (typeof unsubscribeBookings === 'function') {
        unsubscribeBookings();
        unsubscribeBookings = null;
      }
      stopMessagesSubscription();
      stopPeerPresenceSubscription();
      stopOwnPresenceTracking();
      window.location.href = '../../login.html';
      return;
    }

    activeUser = user;
    await resolveActiveCustomerDisplayName(user);
    startOwnPresenceTracking();

    if (typeof usersDb.subscribeBookingsForUser === 'function') {
      if (typeof unsubscribeBookings === 'function') {
        unsubscribeBookings();
        unsubscribeBookings = null;
      }
      unsubscribeBookings = usersDb.subscribeBookingsForUser(user.uid, (items) => {
        activeItems = Array.isArray(items) ? items : [];
        renderPage();
      }, () => {
        threadList.innerHTML = '<div class="messages-empty">Failed to load chat requests.</div>';
        setConversationVisible(false);
      });
      return;
    }

    try {
      const items = await usersDb.getBookingsForUser(user.uid);
      activeItems = Array.isArray(items) ? items : [];
      renderPage();
    } catch (_) {
      threadList.innerHTML = '<div class="messages-empty">Failed to load chat requests.</div>';
      setConversationVisible(false);
    }
  });

  window.addEventListener('beforeunload', () => {
    if (typeof unsubscribeBookings === 'function') {
      unsubscribeBookings();
      unsubscribeBookings = null;
    }
    stopMessagesSubscription();
    stopPeerPresenceSubscription();
    stopOwnPresenceTracking();
  });
});
