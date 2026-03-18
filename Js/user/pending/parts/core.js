document.addEventListener('DOMContentLoaded', () => {
  const requestList = document.getElementById('requestList');
  const tabButtons = Array.from(document.querySelectorAll('.request-tabs .tab-btn'));
  const typeFilter = document.getElementById('typeFilter');
  const typeFilterLabel = document.getElementById('typeFilterLabel');
  const cancelModal = document.getElementById('cancelRequestModal');
  const cancelCancelBtn = document.getElementById('cancelRequestCancelBtn');
  const cancelYesBtn = document.getElementById('cancelRequestYesBtn');
  const noticeModal = document.getElementById('requestNoticeModal');
  const noticeMessage = document.getElementById('requestNoticeMessage');
  const noticeOkBtn = document.getElementById('requestNoticeOkBtn');
  const usersDb = window.usersDatabase || window.homefixDB || window.bookingDatabase || null;
  if (!requestList || !usersDb || !usersDb.auth) return;
  let activeUser = null;
  let activeTab = 'pending';
  let activeItems = [];
  let unsubscribePendingBookings = null;
  let unsubscribeMessagesChat = null;
  let activeMessageRequestId = '';
  let pendingCancelResolver = null;
  let pendingNoticeResolver = null;
  const technicianNameByUid = Object.create(null);
  const technicianNameByEmail = Object.create(null);
  const WAITING_TECHNICIAN_LABEL = 'WAITING FOR TECHNICIAN';
  const technicianLookupInFlight = Object.create(null);

  function closeNoticeModal() {
    if (noticeModal) {
      noticeModal.hidden = true;
      noticeModal.setAttribute('aria-hidden', 'true');
    }
    if (pendingNoticeResolver) {
      pendingNoticeResolver();
      pendingNoticeResolver = null;
    }
  }

  function showNotice(message) {
    if (!noticeModal || !noticeMessage || !noticeOkBtn) {
      alert(String(message || 'Done.'));
      return Promise.resolve();
    }

    noticeMessage.textContent = String(message || 'Done.');
    noticeModal.hidden = false;
    noticeModal.setAttribute('aria-hidden', 'false');
    noticeOkBtn.focus();

    return new Promise((resolve) => {
      pendingNoticeResolver = resolve;
    });
  }

  function closeCancelModal(result) {
    if (cancelModal) {
      cancelModal.hidden = true;
      cancelModal.setAttribute('aria-hidden', 'true');
    }
    if (pendingCancelResolver) {
      pendingCancelResolver(!!result);
      pendingCancelResolver = null;
    }
  }

  function askCancelConfirmation() {
    if (!cancelModal || !cancelYesBtn || !cancelCancelBtn) {
      return Promise.resolve(window.confirm('Cancel this request? Once cancelled, this request will no longer continue.'));
    }

    cancelModal.hidden = false;
    cancelModal.setAttribute('aria-hidden', 'false');
    cancelYesBtn.focus();

    return new Promise((resolve) => {
      pendingCancelResolver = resolve;
    });
  }

  function formatDate(value) {
    if (!value) return 'Unknown';
    if (typeof value === 'string') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    if (value && typeof value.toDate === 'function') {
      return value.toDate().toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    return 'Unknown';
  }

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function renderLoadError(err) {
    const raw = String(err && err.message ? err.message : 'Unknown error');
    const indexUrlMatch = raw.match(/https?:\/\/\S+/i);
    if (indexUrlMatch) {
      const url = indexUrlMatch[0];
      requestList.innerHTML = `
        <div class="request-empty">
          <div>Failed to load requests because a Firestore index is required.</div>
          <div class="request-error-link-wrap">
            <a class="request-error-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Create Firestore index</a>
          </div>
          <div class="request-error-note">After creating the index, wait 1-2 minutes then refresh this page.</div>
        </div>
      `;
      return;
    }

    requestList.innerHTML = `<div class="request-empty">Failed to load requests: ${escapeHtml(raw)}</div>`;
  }

  function normalizeBookingType(item) {
    const raw = String((item && (item.bookingType || item.serviceType)) || '').toLowerCase();
    if (raw.includes('appoint')) return 'appointment';
    return 'technician';
  }

  function bookingTypeLabel(type) {
    return type === 'appointment' ? 'Drop-Off at Store' : 'Home Service';
  }

  function renderAddressValue(location) {
    if (location && location.houseUnit) {
      return `${location.houseUnit}, ${location.streetName}, ${location.barangay}, ${location.city || 'Dagupan City'}`;
    }
    return 'N/A';
  }

  function getRequestDetails(item) {
    return item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};
  }

  function getServiceTypeValue(item) {
    const details = getRequestDetails(item);
    const value = String(details.serviceType || item.serviceType || '').trim();
    return value || 'N/A';
  }

  function getCategoryValue(item) {
    const details = getRequestDetails(item);
    const value = String(details.category || item.category || '').trim();
    return value || 'N/A';
  }

  function getAdditionalInfoValue(item) {
    const details = getRequestDetails(item);
    const value = String(details.additionalInfo || details.issue || item.issue || item.description || '').trim();
    return value || 'N/A';
  }

  function getSelectedOption(item) {
    const details = getRequestDetails(item);
    const label = String(details.selectedOptionLabel || '').trim();
    const value = String(details.selectedOptionValue || item.serviceName || item.deviceType || item.device || '').trim();
    if (!value) return null;
    return {
      label: label || 'Concern',
      value
    };
  }

  function normalizeLooseText(value) {
    return String(value || '').trim().toLowerCase();
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

  function stopMessagesChatSubscription() {
    if (typeof unsubscribeMessagesChat === 'function') {
      unsubscribeMessagesChat();
      unsubscribeMessagesChat = null;
    }
  }

  function getRequestChatPath(requestId) {
    return `chats/${String(requestId || '').trim()}`;
  }

  function getCustomerDisplayName() {
    const email = String(activeUser && activeUser.email ? activeUser.email : '').trim();
    return email || 'Customer';
  }

  function getRequestTitle(item) {
    const details = getRequestDetails(item);
    const additionalInfo = normalizeLooseText(details.additionalInfo || details.issue || item.issue || item.description || '');

    const primaryCandidates = [
      item && item.serviceName,
      details && details.selectedOptionValue,
      item && item.deviceType,
      item && item.device
    ];

    const primary = primaryCandidates
      .map((value) => String(value || '').trim())
      .find((value) => value && normalizeLooseText(value) !== additionalInfo);

    if (primary) return primary;

    const serviceType = getServiceTypeValue(item);
    const category = getCategoryValue(item);
    if (serviceType !== 'N/A' && category !== 'N/A') {
      return `${serviceType} • ${category}`;
    }
    if (serviceType !== 'N/A') return serviceType;

    return 'Service Request';
  }

  function getScheduleLabel(item) {
    const preferredDate = String(item && item.preferredDate ? item.preferredDate : '').trim();
    const preferredTime = String(item && item.preferredTime ? item.preferredTime : '').trim();
    if (preferredDate && preferredTime) {
      const parsedDate = new Date(`${preferredDate}T00:00:00`);
      const dateLabel = Number.isNaN(parsedDate.getTime())
        ? preferredDate
        : parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      return `${dateLabel} ${preferredTime}`;
    }

    const schedule = item && item.schedule && typeof item.schedule === 'object'
      ? item.schedule
      : null;

    if (schedule) {
      const display = String(schedule.display || '').trim();
      if (display) return display;

      const dateLabel = String(schedule.dateLabel || schedule.date || '').trim();
      const timeLabel = String(schedule.timeLabel || schedule.time || '').trim();
      if (dateLabel && timeLabel) return `${dateLabel} ${timeLabel}`;
      if (dateLabel) return dateLabel;
    }

    return item.preferredSchedule || item.preferred_datetime || 'N/A';
  }

  function getBookingIdValue(item) {
    const value = String((item && (item.requestId || item.id)) || '').trim();
    if (!value) return 'N/A';
    if (usersDb && typeof usersDb.formatRequestCode === 'function') {
      return usersDb.formatRequestCode(item, value);
    }

    const bookingType = String((item && item.bookingType) || '').toLowerCase();
    const requestMode = String((item && item.requestMode) || '').toLowerCase();
    const serviceMode = String((item && item.serviceMode) || '').toLowerCase();
    const prefix = (bookingType === 'appointment' || requestMode === 'drop-off-store' || serviceMode.includes('drop-off') || serviceMode.includes('store')) ? 'SD' : 'HS';
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash * 33) + value.charCodeAt(i)) >>> 0;
    }
    return `${prefix}-${String(hash % 100000).padStart(5, '0')}`;
  }

  function getTechnicianFullNameFromRecord(record) {
    if (!record || typeof record !== 'object') return '';
    const firstName = String(record.first_name || record.firstName || '').trim();
    const lastName = String(record.last_name || record.lastName || '').trim();
    const fullFromParts = `${firstName} ${lastName}`.trim();
    if (fullFromParts) return fullFromParts;
    return String(record.fullName || record.displayName || record.name || '').trim();
  }

  function getTechnicianNameFromItemParts(item) {
    if (!item || typeof item !== 'object') return '';
    const firstName = String(
      item.assignedTechnicianFirstName
      || item.technicianFirstName
      || item.assignedToFirstName
      || (item.technician && (item.technician.first_name || item.technician.firstName))
      || ''
    ).trim();
    const lastName = String(
      item.assignedTechnicianLastName
      || item.technicianLastName
      || item.assignedToLastName
      || (item.technician && (item.technician.last_name || item.technician.lastName))
      || ''
    ).trim();
    return `${firstName} ${lastName}`.trim();
  }

  function getAssignedTechnicianKey(item) {
    const uid = String(item && (item.assignedTechnicianId || item.technicianId || item.assignedToUid || item.assignedTo) || '').trim();
    const email = String(item && (item.assignedTechnicianEmail || item.technicianEmail || item.assignedToEmail) || '').trim().toLowerCase();
    return { uid, email };
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
      if (!shouldShowTechnicianName(item)) return;
      const assigned = getAssignedTechnicianKey(item);
      if (!assigned.uid && !assigned.email) return;
      if (getTechnicianName(item) !== WAITING_TECHNICIAN_LABEL) return;

      const lookupKey = assigned.uid ? `uid:${assigned.uid}` : `email:${assigned.email}`;
      if (technicianLookupInFlight[lookupKey]) return;
      technicianLookupInFlight[lookupKey] = true;

      tasks.push((async () => {
        let profile = null;
        try {
          const [byId, byEmail] = await Promise.all([
            (assigned.uid && typeof usersDb.getUserById === 'function')
              ? usersDb.getUserById(assigned.uid).catch(() => null)
              : Promise.resolve(null),
            (assigned.email && typeof usersDb.getUserByEmail === 'function')
              ? usersDb.getUserByEmail(assigned.email).catch(() => null)
              : Promise.resolve(null)
          ]);
          profile = byId || byEmail || null;
        } catch (_) {
          profile = null;
        }

        const fullName = getTechnicianFullNameFromRecord(profile);
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
      if (hasResolvedName) renderActiveTab();
    });
  }

  function getTechnicianName(item) {
    if (!shouldShowTechnicianName(item)) return WAITING_TECHNICIAN_LABEL;

    const fullNameFromParts = getTechnicianNameFromItemParts(item);
    if (fullNameFromParts) return fullNameFromParts;

    const cachedName = getCachedTechnicianName(item);
    if (cachedName) return cachedName;

    const candidates = [
      item && item.technicianName,
      item && item.assignedTechnicianName,
      item && item.assignedToName,
      item && item.technician && item.technician.name
    ];
    const name = candidates
      .map((value) => String(value || '').trim())
      .find((value) => value);
    return name || WAITING_TECHNICIAN_LABEL;
  }

  function shouldShowTechnicianName(item) {
    const status = String(item && item.status ? item.status : '').toLowerCase();
    return status === 'accepted'
      || status === 'confirmed'
      || status === 'in-progress'
      || status === 'ongoing'
      || status === 'completed'
      || status === 'finished';
  }

  function hasAssignedTechnician(item) {
    const uid = String(item && (item.assignedTechnicianId || item.technicianId || item.assignedToUid || item.assignedTo) || '').trim();
    const email = String(item && (item.assignedTechnicianEmail || item.technicianEmail || item.assignedToEmail) || '').trim();
    const name = String(item && (item.assignedTechnicianName || item.technicianName || item.assignedToName) || '').trim();
    return !!(uid || email || name);
  }

  function canChatWithTechnician(item) {
    const status = String(item && item.status ? item.status : '').toLowerCase();
    if (!hasAssignedTechnician(item)) return false;
    return status === 'accepted' || status === 'confirmed' || status === 'in-progress' || status === 'ongoing';
  }

  function isConfirmedBucketStatus(statusValue) {
    const status = String(statusValue || '').toLowerCase();
    return status === 'confirmed' || status === 'accepted';
  }

  function statusClassName(status) {
    const key = String(status || '').trim().toLowerCase();
    if (!key) return '';
    return key.replace(/[^a-z0-9_-]+/g, '-');
  }

  function getMediaPreviewInfo(entry) {
    if (!entry || typeof entry !== 'object') return { link: '', preview: '' };
    const rawUrl = String(entry.url || '').trim();
    const rawPreview = String(entry.thumbnailUrl || entry.previewUrl || entry.dataUrl || '').trim();
    const link = /^https?:\/\//i.test(rawUrl) ? rawUrl : '';
    const preview = link || (/^(https?:\/\/|data:image\/)/i.test(rawPreview) ? rawPreview : '');
    return { link, preview };
  }

  function filterByType(items) {
    const filterValue = typeFilter ? String(typeFilter.value || 'all').toLowerCase() : 'all';
    if (filterValue === 'all') return items;
    return items.filter((item) => normalizeBookingType(item) === filterValue);
  }

  function renderRequestList(items, options) {
    const opts = options || {};
    const emptyDefault = opts.emptyDefault || 'No request found.';
    const emptyAppointment = opts.emptyAppointment || 'No appointment request yet.';
    const emptyTechnician = opts.emptyTechnician || 'No technician booking yet.';
    const allowCancel = !!opts.allowCancel;
    const showStatus = opts.showStatus !== false;

    const filteredItems = filterByType(Array.isArray(items) ? items : []);
    queueTechnicianNameResolution(filteredItems);
    const filterValue = typeFilter ? String(typeFilter.value || 'all').toLowerCase() : 'all';

    if (!filteredItems.length) {
      if (filterValue === 'appointment') {
        requestList.innerHTML = `<div class="request-empty">${escapeHtml(emptyAppointment)}</div>`;
        return;
      }
      if (filterValue === 'technician') {
        requestList.innerHTML = `<div class="request-empty">${escapeHtml(emptyTechnician)}</div>`;
        return;
      }
      requestList.innerHTML = `<div class="request-empty">${escapeHtml(emptyDefault)}</div>`;
      return;
    }

    const html = filteredItems.map((item) => {
      const media = Array.isArray(item.media) ? item.media : [];
      const mediaHtml = media.length
        ? `<div class="request-media">${media.map((entry) => {
            const isVideo = !!(entry.type && entry.type.startsWith('video/'));
            const label = `${isVideo ? 'Video' : 'Photo'}: ${escapeHtml(entry.name || 'attachment')}`;
            const mediaInfo = getMediaPreviewInfo(entry);
            if (!mediaInfo.preview) return `<div class="request-media-item">${label}</div>`;

            const thumb = isVideo
              ? '<span class="request-media-thumb video">▶</span>'
              : `<img class="request-media-thumb" src="${escapeHtml(mediaInfo.preview)}" alt="${escapeHtml(entry.name || 'attachment')}">`;

            if (!mediaInfo.link) {
              return `<div class="request-media-item link">${thumb}<span>${label}</span></div>`;
            }

            return `<a class="request-media-item link" href="${escapeHtml(mediaInfo.link)}" target="_blank" rel="noopener noreferrer">${thumb}<span>${label}</span></a>`;
          }).join('')}</div>`
        : '';

      const status = String(item.status || 'pending').toLowerCase();
      const canCancel = allowCancel && (status === 'pending' || status === 'offered' || status === 'accepted' || status === 'confirmed');
      const type = normalizeBookingType(item);
      const selectedOption = getSelectedOption(item);
      const canChat = canChatWithTechnician(item);
      const requestId = String(item && item.id ? item.id : '').trim();
      const actionButtons = [];

      if (canChat && requestId) {
        actionButtons.push(`<a class="chat-link-btn" href="messages.html?requestId=${encodeURIComponent(requestId)}">Chat with Technician</a>`);
      }
      if (allowCancel) {
        actionButtons.push(`<button type="button" class="cancel-btn" data-request-id="${escapeHtml(requestId)}" ${canCancel ? '' : 'disabled'}>${canCancel ? 'CANCEL' : 'CANCELLED'}</button>`);
      }

      return `
        <div class="request-item">
          <div class="request-details">
            <strong>${escapeHtml(getRequestTitle(item))}</strong>
            <div class="request-meta-row">
              <span class="request-meta-pill">Request ID: ${escapeHtml(getBookingIdValue(item))}</span>
              <span class="request-meta-pill">Technician: ${escapeHtml(getTechnicianName(item))}</span>
              <span class="request-meta-pill">Preferred schedule: ${escapeHtml(getScheduleLabel(item))}</span>
            </div>
            <span>Service mode: ${escapeHtml(bookingTypeLabel(type))}</span>
            <span>Service type: ${escapeHtml(getServiceTypeValue(item))}</span>
            <span>Category: ${escapeHtml(getCategoryValue(item))}</span>
            ${selectedOption ? `<span>${escapeHtml(selectedOption.label)}: ${escapeHtml(selectedOption.value)}</span>` : ''}
            <span>Additional info: ${escapeHtml(getAdditionalInfoValue(item))}</span>
            <span>Address: ${escapeHtml(renderAddressValue(item.location))}</span>
            <span>Additional Details: ${escapeHtml(item.location && item.location.additionalDetails ? item.location.additionalDetails : 'N/A')}</span>
            ${showStatus ? `<span>Status: <span class="request-status ${escapeHtml(statusClassName(status))}">${escapeHtml(status)}</span></span>` : ''}
            ${mediaHtml}
          </div>
          ${actionButtons.length ? `<div class="request-actions">${actionButtons.join('')}</div>` : ''}
        </div>
      `;
    }).join('');

    requestList.innerHTML = `<div class="request-list">${html}</div>`;
  }

  function renderPendingList(items) {
    const pendingItems = Array.isArray(items)
      ? items.filter((item) => {
          const status = String(item && item.status ? item.status : 'pending').toLowerCase();
          return status === 'pending' || status === 'offered';
        })
      : [];

    renderRequestList(pendingItems, {
      allowCancel: true,
      showStatus: false,
      emptyDefault: 'No pending request yet. Create one from Book a Service.',
      emptyAppointment: 'No pending appointment yet.',
      emptyTechnician: 'No pending technician booking yet.'
    });
  }

  function renderConfirmedList(items) {
    const confirmedItems = Array.isArray(items)
      ? items.filter((item) => {
          const status = String(item && item.status ? item.status : '').toLowerCase();
          return isConfirmedBucketStatus(status);
        })
      : [];

    renderRequestList(confirmedItems, {
      allowCancel: true,
      emptyDefault: 'No confirmed request yet.',
      emptyAppointment: 'No confirmed appointment yet.',
      emptyTechnician: 'No confirmed technician booking yet.'
    });
  }

  function renderHistoryList(items) {
    const historyItems = Array.isArray(items)
      ? items.filter((item) => {
          const status = String(item && item.status ? item.status : '').toLowerCase();
          return status === 'cancelled' || status === 'canceled' || status === 'rejected' || status === 'finished' || status === 'completed';
        })
      : [];

    renderRequestList(historyItems, {
      allowCancel: false,
      emptyDefault: 'No history request yet.',
      emptyAppointment: 'No appointment history yet.',
      emptyTechnician: 'No technician booking history yet.'
    });
  }

  function getAcceptedRequestsForMessages(items) {
    return Array.isArray(items)
      ? items.filter((item) => String(item && item.status ? item.status : '').toLowerCase() === 'accepted')
      : [];
  }

  function renderMessagesTab(items) {
    const acceptedItems = getAcceptedRequestsForMessages(items).sort((left, right) => toTimeValue(right && right.updatedAt) - toTimeValue(left && left.updatedAt));

    if (!acceptedItems.length) {
      activeMessageRequestId = '';
      stopMessagesChatSubscription();
      requestList.innerHTML = '<div class="request-empty">No accepted requests yet.</div>';
      return;
    }

    const selectedStillValid = acceptedItems.some((item) => String(item && item.id ? item.id : '') === activeMessageRequestId);
    if (!selectedStillValid) {
      activeMessageRequestId = String(acceptedItems[0] && acceptedItems[0].id ? acceptedItems[0].id : '');
    }

    const selected = acceptedItems.find((item) => String(item && item.id ? item.id : '') === activeMessageRequestId) || acceptedItems[0];
    activeMessageRequestId = String(selected && selected.id ? selected.id : '');

    const threadsHtml = acceptedItems.map((item) => {
      const id = String(item && item.id ? item.id : '');
      const activeClass = id === activeMessageRequestId ? ' active' : '';
      return `
        <button type="button" class="messages-thread-btn${activeClass}" data-message-request-id="${escapeHtml(id)}">
          <strong>${escapeHtml(getRequestTitle(item))}</strong>
          <span>${escapeHtml(getTechnicianName(item))}</span>
          <span>${escapeHtml(getScheduleLabel(item))}</span>
        </button>
      `;
    }).join('');

    requestList.innerHTML = `
      <div class="messages-shell">
        <div class="messages-threads">${threadsHtml}</div>
        <div class="messages-main">
          <div class="messages-conversation" id="messagesConversation">
            <div class="messages-head">
              <strong id="messagesRequestTitle">${escapeHtml(getRequestTitle(selected))}</strong>
              <span id="messagesRequestMeta">${escapeHtml(getBookingIdValue(selected))} • Accepted</span>
            </div>
            <div class="messages-list" id="messagesList"><div class="request-empty">Loading messages...</div></div>
            <form class="messages-form" id="messagesForm" novalidate>
              <input type="text" id="messagesInput" maxlength="500" placeholder="Type a message..." autocomplete="off">
              <button type="submit" class="modal-btn" id="messagesSendBtn">Send</button>
            </form>
          </div>
        </div>
      </div>
    `;

    bindMessagesThreadRealtime(selected);
  }

  function bindMessagesThreadRealtime(requestItem) {
    const list = document.getElementById('messagesList');
    const form = document.getElementById('messagesForm');
    const input = document.getElementById('messagesInput');
    const sendBtn = document.getElementById('messagesSendBtn');
    if (!list || !form || !input || !sendBtn) return;

    stopMessagesChatSubscription();

    const requestId = String(requestItem && requestItem.id ? requestItem.id : '').trim();
    if (!requestId || !activeUser || !activeUser.uid) {
      list.innerHTML = '<div class="request-empty">Chat is unavailable.</div>';
      input.disabled = true;
      sendBtn.disabled = true;
      return;
    }

    const rtdb = usersDb && usersDb.firebase && typeof usersDb.firebase.database === 'function'
      ? usersDb.firebase.database()
      : null;
    if (!rtdb) {
      list.innerHTML = '<div class="request-empty">Realtime chat is unavailable.</div>';
      input.disabled = true;
      sendBtn.disabled = true;
      return;
    }

    input.disabled = false;
    sendBtn.disabled = false;

    const ref = rtdb.ref(getRequestChatPath(requestId)).limitToLast(200);
    const onValue = (snapshot) => {
      const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
      const messages = Object.keys(value).map((id) => Object.assign({ id }, value[id] || {}));
      messages.sort((a, b) => toTimeValue(a && a.createdAt) - toTimeValue(b && b.createdAt));

      if (!messages.length) {
        list.innerHTML = '<div class="request-empty">No messages yet.</div>';
      } else {
        list.innerHTML = messages.map((entry) => {
          const senderUid = String(entry && entry.senderUid ? entry.senderUid : '').trim();
          const mine = senderUid === String(activeUser.uid || '');
          const senderName = String(entry && entry.senderName ? entry.senderName : '').trim() || (mine ? 'You' : 'Technician');
          const text = String(entry && entry.text ? entry.text : '').trim();
          const timeLabel = formatDateTime(entry && entry.createdAt);
          return `<div class="messages-item${mine ? ' mine' : ''}">${escapeHtml(text || '(empty message)')}<span class="messages-meta">${escapeHtml(senderName)}${timeLabel ? ` • ${escapeHtml(timeLabel)}` : ''}</span></div>`;
        }).join('');
        list.scrollTop = list.scrollHeight;
      }
    };
    const onError = () => {
      list.innerHTML = '<div class="request-empty">Unable to load chat messages.</div>';
    };

    ref.on('value', onValue, onError);
    unsubscribeMessagesChat = () => {
      ref.off('value', onValue);
    };

    form.onsubmit = async (event) => {
      event.preventDefault();
      const text = String(input.value || '').trim();
      if (!text) return;

      sendBtn.disabled = true;
      try {
        await rtdb.ref(getRequestChatPath(requestId)).push({
          requestId,
          text,
          senderUid: String(activeUser.uid || ''),
          senderRole: 'customer',
          senderName: getCustomerDisplayName(),
          createdAt: Date.now()
        });
        input.value = '';
      } catch (_) {
        await showNotice('Failed to send message. Please try again.');
      } finally {
        sendBtn.disabled = false;
      }
    };
  }

  function setActiveTab(tab) {
    activeTab = tab;
    tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    if (typeFilterLabel) {
      typeFilterLabel.textContent = 'Filter:';
    }

    if (typeFilter) {
      typeFilter.disabled = false;
    }

    const filterWrap = document.getElementById('typeFilterWrap');
    if (filterWrap) {
      filterWrap.hidden = false;
    }
  }

  function getInitialTabFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = String(params.get('tab') || '').trim().toLowerCase();
      if (tab === 'confirmed' || tab === 'history' || tab === 'pending') return tab;
    } catch (_) {}
    return 'pending';
  }

  function renderActiveTab() {
    if (activeTab === 'confirmed') {
      renderConfirmedList(activeItems);
    } else if (activeTab === 'history') {
      renderHistoryList(activeItems);
    } else {
      renderPendingList(activeItems);
    }
  }

  async function refreshList() {
    if (!activeUser) return;

    if (typeof usersDb.subscribeBookingsForUser === 'function') {
      renderActiveTab();
      return;
    }

    try {
      const items = await usersDb.getBookingsForUser(activeUser.uid);
      activeItems = Array.isArray(items) ? items : [];
      renderActiveTab();
    } catch (err) {
      renderLoadError(err);
    }
  }

  function startRealtimeList(user) {
    if (!user || !user.uid || typeof usersDb.subscribeBookingsForUser !== 'function') return;
    if (typeof unsubscribePendingBookings === 'function') {
      unsubscribePendingBookings();
      unsubscribePendingBookings = null;
    }

    unsubscribePendingBookings = usersDb.subscribeBookingsForUser(user.uid, (items) => {
      activeItems = Array.isArray(items) ? items : [];
      renderActiveTab();
    }, (err) => {
      renderLoadError(err);
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tab = btn.getAttribute('data-tab') || 'pending';
      setActiveTab(tab);
      await refreshList();
    });
  });

  if (typeFilter) {
    typeFilter.addEventListener('change', async () => {
      await refreshList();
    });
  }

  if (cancelYesBtn) {
    cancelYesBtn.addEventListener('click', () => {
      closeCancelModal(true);
    });
  }

  if (cancelCancelBtn) {
    cancelCancelBtn.addEventListener('click', () => {
      closeCancelModal(false);
    });
  }

  if (cancelModal) {
    cancelModal.addEventListener('click', (event) => {
      if (event.target === cancelModal) {
        closeCancelModal(false);
      }
    });
  }

  if (noticeOkBtn) {
    noticeOkBtn.addEventListener('click', () => {
      closeNoticeModal();
    });
  }

  if (noticeModal) {
    noticeModal.addEventListener('click', (event) => {
      if (event.target === noticeModal) {
        closeNoticeModal();
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && cancelModal && !cancelModal.hidden) {
      closeCancelModal(false);
      return;
    }
    if (event.key === 'Escape' && noticeModal && !noticeModal.hidden) {
      closeNoticeModal();
    }
  });

  requestList.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (!target.classList.contains('cancel-btn')) return;
    if (!activeUser) return;

    const requestId = target.getAttribute('data-request-id');
    if (!requestId) return;

    const confirmed = await askCancelConfirmation();
    if (!confirmed) return;

    target.disabled = true;
    target.textContent = 'CANCELLING...';

    try {
      const ok = await usersDb.cancelBookingRequest(requestId, activeUser.uid);
      if (!ok) {
        await showNotice('Unable to cancel this request. It may already be processed.');
      } else {
        await showNotice('Request cancelled successfully.');
      }
      await refreshList();
    } catch (err) {
      await showNotice(err && err.message ? err.message : 'Failed to cancel request.');
      await refreshList();
    }
  });

  usersDb.auth.onAuthStateChanged(async (user) => {
    if (!user) {
      if (typeof unsubscribePendingBookings === 'function') {
        unsubscribePendingBookings();
        unsubscribePendingBookings = null;
      }
      stopMessagesChatSubscription();
      window.location.href = '../../login.html';
      return;
    }
    activeUser = user;
    activeTab = getInitialTabFromUrl();
    setActiveTab(activeTab);
    startRealtimeList(user);
    if (typeof usersDb.subscribeBookingsForUser !== 'function') {
      await refreshList();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (typeof unsubscribePendingBookings === 'function') {
      unsubscribePendingBookings();
      unsubscribePendingBookings = null;
    }
    stopMessagesChatSubscription();
  });
});
