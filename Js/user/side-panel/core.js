(function () {
  const ns = (window.hfsDashboard = window.hfsDashboard || {});
  const PROFILE_CACHE_KEY = 'hfs_profile_cache_v1';
  const SIDEBAR_COLLAPSED_KEY = 'hfs_sidebar_collapsed_v1';
  const PENDING_REGISTER_SYNC_KEY = 'hfs_register_pending_sync_v1';
  const NOTIFICATION_READ_KEY = 'hfs_customer_notification_reads_v1';
  let pendingSyncRetryTimer = null;
  let unsubscribeNotificationBookings = null;
  const notificationChatUnsubscribers = Object.create(null);
  const notificationLatestByRequest = Object.create(null);
  let notificationPanelSnapshot = null;

  function readInitialSidebarCollapsedState() {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  if (readInitialSidebarCollapsedState()) {
    document.documentElement.classList.add('hfs-sidebar-precollapsed');
  } else {
    document.documentElement.classList.add('hfs-sidebar-preexpanded');
  }

  function readSidebarCollapsedState() {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function writeSidebarCollapsedState(collapsed) {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch (_) {
    }
  }

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function normalizeLower(value) {
    return normalizeText(value).toLowerCase();
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

  function isMessagesPage() {
    return /\/messages\.html$/i.test(String(window.location && window.location.pathname || ''));
  }

  function readNotificationReadMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_READ_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeNotificationReadMap(map) {
    try {
      localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify(map || {}));
    } catch (_) {
    }
  }

  function getNotificationElements() {
    return {
      button: document.querySelector('[data-topbar-notification="true"]'),
      dot: document.querySelector('.topbar-notification-dot'),
      panel: document.querySelector('.topbar-notification-panel'),
      clear: document.querySelector('.topbar-notification-clear'),
      list: document.querySelector('.topbar-notification-list'),
      empty: document.querySelector('.topbar-notification-empty')
    };
  }

  function getConcernModalElements() {
    return {
      modal: document.querySelector('.topbar-concern-modal'),
      form: document.getElementById('topbarConcernForm'),
      topic: document.getElementById('topbarConcernTopic'),
      requestIdWrap: document.getElementById('topbarConcernRequestIdWrap'),
      requestId: document.getElementById('topbarConcernRequestId'),
      otherWrap: document.getElementById('topbarConcernOtherWrap'),
      other: document.getElementById('topbarConcernOther'),
      details: document.getElementById('topbarConcernDetails'),
      close: document.querySelector('.topbar-concern-close'),
      cancel: document.getElementById('topbarConcernCancelBtn'),
      submit: document.getElementById('topbarConcernSubmitBtn'),
      error: document.getElementById('topbarConcernError'),
      success: document.getElementById('topbarConcernSuccess')
    };
  }

  function ensureTopbarConcernModal() {
    if (document.querySelector('.topbar-concern-modal')) return;

    const modal = document.createElement('div');
    modal.className = 'topbar-concern-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="topbar-concern-card" role="dialog" aria-modal="true" aria-labelledby="topbarConcernTitle">
        <div class="topbar-concern-head">
          <div>
            <h2 id="topbarConcernTitle">Submit a Concern</h2>
          </div>
          <button type="button" class="topbar-concern-close" aria-label="Close concern form">×</button>
        </div>
        <form id="topbarConcernForm" class="topbar-concern-form" novalidate>
          <label class="topbar-concern-field">
            <span>Concern Type</span>
            <select id="topbarConcernTopic" required>
              <option value="" selected>Select a concern type</option>
              <option value="Booking or schedule issue">Booking or schedule issue</option>
              <option value="Payment or refund issue">Payment or refund issue</option>
              <option value="Account access issue">Account access issue</option>
              <option value="Service quality or technician issue">Service quality or technician issue</option>
              <option value="App or system issue">App or system issue</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label class="topbar-concern-field" id="topbarConcernRequestIdWrap" hidden>
            <span>Request ID</span>
            <input id="topbarConcernRequestId" type="text" maxlength="8" inputmode="text" autocapitalize="characters" spellcheck="false" placeholder="Example: HS-12345">
          </label>
          <label class="topbar-concern-field" id="topbarConcernOtherWrap" hidden>
            <span>Other Type</span>
            <input id="topbarConcernOther" type="text" maxlength="120" placeholder="Enter concern type">
          </label>
          <label class="topbar-concern-field">
            <span>Details</span>
            <textarea id="topbarConcernDetails" rows="4" maxlength="1000" placeholder="Explain the concern."></textarea>
          </label>
          <p id="topbarConcernError" class="topbar-concern-error" role="alert" aria-live="polite"></p>
          <p id="topbarConcernSuccess" class="topbar-concern-success" role="status" aria-live="polite"></p>
          <div class="topbar-concern-actions">
            <button type="button" id="topbarConcernCancelBtn" class="topbar-concern-btn topbar-concern-btn-secondary">Cancel</button>
            <button type="submit" id="topbarConcernSubmitBtn" class="topbar-concern-btn">Submit</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function setConcernModalError(message) {
    const elements = getConcernModalElements();
    if (elements.error) elements.error.textContent = normalizeText(message);
  }

  function setConcernModalSuccess(message) {
    const elements = getConcernModalElements();
    if (elements.success) elements.success.textContent = normalizeText(message);
  }

  function concernTopicNeedsRequestId(topic) {
    const normalized = normalizeLower(topic);
    return normalized === 'booking or schedule issue'
      || normalized === 'payment or refund issue'
      || normalized === 'service quality or technician issue';
  }

  function sanitizeConcernRequestId(value) {
    return normalizeText(value).toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
  }

  function isValidConcernRequestId(value) {
    return /^[A-Z]{2}-\d{5}$/.test(normalizeText(value).toUpperCase());
  }

  function syncConcernModalRequestIdVisibility() {
    const elements = getConcernModalElements();
    if (!elements.topic || !elements.requestIdWrap || !elements.requestId) return;
    const shouldShow = concernTopicNeedsRequestId(elements.topic.value);
    elements.requestIdWrap.hidden = !shouldShow;
    if (!shouldShow) elements.requestId.value = '';
  }

  function syncConcernModalOtherVisibility() {
    const elements = getConcernModalElements();
    if (!elements.topic || !elements.otherWrap || !elements.other) return;
    const isOther = normalizeLower(elements.topic.value) === 'other';
    elements.otherWrap.hidden = !isOther;
    if (!isOther) elements.other.value = '';
  }

  function resetConcernModalForm() {
    const elements = getConcernModalElements();
    if (elements.form) elements.form.reset();
    syncConcernModalRequestIdVisibility();
    syncConcernModalOtherVisibility();
    setConcernModalError('');
    setConcernModalSuccess('');
    if (elements.submit) {
      elements.submit.disabled = false;
      elements.submit.textContent = 'Submit';
    }
  }

  function openConcernModal() {
    ensureTopbarConcernModal();
    resetConcernModalForm();
    const elements = getConcernModalElements();
    if (!elements.modal) return;
    elements.modal.hidden = false;
    window.setTimeout(() => {
      if (elements.topic && typeof elements.topic.focus === 'function') elements.topic.focus();
    }, 0);
  }

  function closeConcernModal() {
    const elements = getConcernModalElements();
    if (!elements.modal) return;
    elements.modal.hidden = true;
  }

	function getConcernModalTopicValue() {
		const elements = getConcernModalElements();
		if (!elements.topic) return '';
		const selected = normalizeText(elements.topic.value);
		if (normalizeLower(selected) !== 'other') return selected;
		return normalizeText(elements.other && elements.other.value);
	}

	async function submitConcernFromModal() {
		const elements = getConcernModalElements();
		if (!elements.topic || !elements.details || !elements.submit) return;

		const usersDb = window.usersDatabase || window.homefixDB || null;
		const auth = usersDb && usersDb.auth ? usersDb.auth : null;
		const activeUser = auth && auth.currentUser ? auth.currentUser : null;
		const topic = getConcernModalTopicValue();
    const requestId = sanitizeConcernRequestId(elements.requestId && elements.requestId.value);
		const details = normalizeText(elements.details.value);

		if (!activeUser || !activeUser.uid) {
			setConcernModalError('You must be signed in to submit a concern.');
			return;
		}
		if (!topic) {
			setConcernModalError('Please select a concern type.');
			if (elements.topic) elements.topic.focus();
			return;
		}
    if (concernTopicNeedsRequestId(topic) && !requestId) {
      setConcernModalError('Please enter request ID.');
      if (elements.requestId) elements.requestId.focus();
      return;
    }
		if (concernTopicNeedsRequestId(topic) && !isValidConcernRequestId(requestId)) {
      setConcernModalError('Request ID must use the format HS-12345 or SD-12345.');
			if (elements.requestId) elements.requestId.focus();
			return;
		}
		if (!details) {
			setConcernModalError('Please enter the concern details.');
			elements.details.focus();
			return;
		}

		const rtdb = window.firebase && typeof window.firebase.database === 'function'
			? window.firebase.database()
			: null;
		if (!rtdb) {
			setConcernModalError('Realtime Database is unavailable.');
			return;
		}

		elements.submit.disabled = true;
		elements.submit.textContent = 'Submitting...';
		setConcernModalError('');
		setConcernModalSuccess('');

		try {
			const cachedProfile = typeof ns.getCachedProfile === 'function' ? ns.getCachedProfile(activeUser) : null;
			const customerName = normalizeText(
				(cachedProfile && [cachedProfile.first_name, cachedProfile.middle_name, cachedProfile.last_name].filter(Boolean).join(' '))
				|| (activeUser && activeUser.displayName)
				|| (typeof ns.getDisplayName === 'function' ? ns.getDisplayName(cachedProfile, activeUser) : '')
				|| 'Customer'
			);

			await rtdb.ref('reports/concerns').push({
				reportCategory: 'concern',
				concernType: topic,
				reason: topic,
        requestId,
				details,
				customerId: normalizeText(activeUser.uid),
				customerEmail: normalizeLower(activeUser.email),
				customerName,
				source: 'customer-topbar',
				createdAt: Date.now()
			});

			setConcernModalSuccess('Concern submitted successfully.');
			if (elements.form) elements.form.reset();
			syncConcernModalOtherVisibility();
			window.setTimeout(() => {
				closeConcernModal();
			}, 700);
		} catch (_) {
			setConcernModalError('Failed to submit concern. Please try again.');
		} finally {
			elements.submit.disabled = false;
			elements.submit.textContent = 'Submit';
		}
	}

	function bindConcernModal() {
		ensureTopbarConcernModal();
		const elements = getConcernModalElements();
		if (!elements.modal || elements.modal.dataset.concernModalBound === '1') return;
		elements.modal.dataset.concernModalBound = '1';

		if (elements.topic) {
			elements.topic.addEventListener('change', () => {
        syncConcernModalRequestIdVisibility();
				syncConcernModalOtherVisibility();
				setConcernModalError('');
				setConcernModalSuccess('');
			});
		}

    if (elements.requestId) {
      elements.requestId.addEventListener('input', () => {
        const sanitized = sanitizeConcernRequestId(elements.requestId.value);
        if (elements.requestId.value !== sanitized) {
          elements.requestId.value = sanitized;
        }
        setConcernModalError('');
        setConcernModalSuccess('');
      });
    }

		if (elements.other) {
			elements.other.addEventListener('input', () => {
				setConcernModalError('');
				setConcernModalSuccess('');
			});
		}

		if (elements.details) {
			elements.details.addEventListener('input', () => {
				setConcernModalError('');
				setConcernModalSuccess('');
			});
		}

		if (elements.close) elements.close.addEventListener('click', closeConcernModal);
		if (elements.cancel) elements.cancel.addEventListener('click', closeConcernModal);
		if (elements.form) {
			elements.form.addEventListener('submit', async (event) => {
				event.preventDefault();
				await submitConcernFromModal();
			});
		}
		elements.modal.addEventListener('click', (event) => {
			if (event.target === elements.modal) closeConcernModal();
		});
	}

  function isChatStatusEligible(item) {
    const status = normalizeText(item && item.status).toLowerCase();
    return status === 'accepted' || status === 'confirmed' || status === 'in-progress' || status === 'ongoing';
  }

  function hasAssignedTechnician(item) {
    return !!(
      normalizeText(item && (item.assignedTechnicianId || item.technicianId || item.assignedToUid || item.assignedTo))
      || normalizeText(item && (item.assignedTechnicianEmail || item.technicianEmail || item.assignedToEmail))
      || normalizeText(item && (item.assignedTechnicianName || item.technicianName || item.assignedToName))
    );
  }

  function getNotificationRequestTitle(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object' ? item.requestDetails : {};
    return normalizeText(details.category || details.serviceType || details.selectedOptionLabel || item && (item.serviceName || item.category || item.serviceType)) || 'Service request';
  }

  function buildNotificationPreview(entry) {
    const text = normalizeText(entry && entry.text);
    if (text) return text;
    const mediaType = normalizeText(entry && entry.mediaType).toLowerCase();
    if (mediaType.startsWith('image/')) return 'Sent a photo';
    if (mediaType.startsWith('video/')) return 'Sent a video';
    return 'New message from your technician';
  }

  function formatNotificationTime(value) {
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

  function getUnreadNotifications() {
    const readMap = readNotificationReadMap();
    return Object.keys(notificationLatestByRequest)
      .map((requestId) => notificationLatestByRequest[requestId])
      .filter((item) => item && item.senderRole === 'technician' && item.createdAt > Number(readMap[item.requestId] || 0))
      .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
  }

  function renderNotificationPanel(items) {
    const elements = getNotificationElements();
    if (!elements.list || !elements.empty) return;

    const list = Array.isArray(items) ? items : [];
    if (elements.clear) elements.clear.hidden = list.length === 0;
    if (!list.length) {
      elements.list.innerHTML = '';
      elements.empty.hidden = false;
      return;
    }

    elements.empty.hidden = true;
    elements.list.innerHTML = list.map((item) => {
      const title = normalizeText(item && item.title) || 'New message from technician';
      const preview = normalizeText(item && item.preview) || 'You have a new notification.';
      const timeLabel = formatNotificationTime(item && item.createdAt);
      const requestId = normalizeText(item && item.requestId);
      return `
        <div class="topbar-notification-item" data-open-notification="${requestId}" role="button" tabindex="0" aria-label="Open notification for ${title}">
          <div class="topbar-notification-item-head">
            <strong>${title}</strong>
            <button type="button" class="topbar-notification-remove" data-remove-notification="${requestId}" aria-label="Remove notification" title="Remove notification">×</button>
          </div>
          <span>${preview}</span>
          ${timeLabel ? `<time>${timeLabel}</time>` : ''}
        </div>
      `;
    }).join('');
  }

  function removeNotificationFromSnapshot(requestId) {
    const cleanRequestId = normalizeText(requestId);
    if (!cleanRequestId || !Array.isArray(notificationPanelSnapshot)) return;
    notificationPanelSnapshot = notificationPanelSnapshot.filter((item) => normalizeText(item && item.requestId) !== cleanRequestId);
    renderNotificationPanel(notificationPanelSnapshot);
  }

  function clearNotificationSnapshot() {
    notificationPanelSnapshot = [];
    renderNotificationPanel(notificationPanelSnapshot);
  }

  function openMessagesFromNotification(requestId) {
    const cleanRequestId = normalizeText(requestId);
    if (!cleanRequestId) return false;
    const targetUrl = new URL('messages.html', window.location.href);
    targetUrl.searchParams.set('requestId', cleanRequestId);
    window.location.href = targetUrl.toString();
    return true;
  }

  function renderNotificationBadge() {
    const elements = getNotificationElements();
    if (!elements.dot) return;
    elements.dot.hidden = getUnreadNotifications().length === 0;
  }

  function markNotificationsAsRead(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return;
    const readMap = readNotificationReadMap();
    let changed = false;
    list.forEach((item) => {
      const requestId = normalizeText(item && item.requestId);
      const createdAt = Number(item && item.createdAt) || 0;
      if (!requestId || !createdAt) return;
      if (createdAt > Number(readMap[requestId] || 0)) {
        readMap[requestId] = createdAt;
        changed = true;
      }
    });
    if (changed) writeNotificationReadMap(readMap);
  }

  function clearNotificationChatSubscriptions() {
    Object.keys(notificationChatUnsubscribers).forEach((requestId) => {
      const unsubscribe = notificationChatUnsubscribers[requestId];
      if (typeof unsubscribe === 'function') {
        try {
          unsubscribe();
        } catch (_) {
        }
      }
      delete notificationChatUnsubscribers[requestId];
      delete notificationLatestByRequest[requestId];
    });
  }

  function teardownTopbarNotifications() {
    if (typeof unsubscribeNotificationBookings === 'function') {
      try {
        unsubscribeNotificationBookings();
      } catch (_) {
      }
    }
    unsubscribeNotificationBookings = null;
    clearNotificationChatSubscriptions();
    notificationPanelSnapshot = null;
    renderNotificationPanel([]);
    renderNotificationBadge();
  }

  function refreshTopbarNotificationUi() {
    const elements = getNotificationElements();
    if (elements.panel && elements.panel.classList.contains('open') && Array.isArray(notificationPanelSnapshot)) {
      renderNotificationPanel(notificationPanelSnapshot);
    }
    renderNotificationBadge();
  }

  function bindTopbarNotificationsForUser(user) {
    const usersDb = window.usersDatabase || window.homefixDB || window.bookingDatabase || null;
    const uid = normalizeText(user && user.uid);
    if (!uid || !usersDb || typeof usersDb.subscribeBookingsForUser !== 'function') {
      teardownTopbarNotifications();
      return;
    }

    teardownTopbarNotifications();

    const rtdb = usersDb && usersDb.firebase && typeof usersDb.firebase.database === 'function'
      ? usersDb.firebase.database()
      : null;
    if (!rtdb) return;

    unsubscribeNotificationBookings = usersDb.subscribeBookingsForUser(uid, (items) => {
      const eligible = (Array.isArray(items) ? items : []).filter((item) => isChatStatusEligible(item) && hasAssignedTechnician(item));
      const activeIds = new Set();

      eligible.forEach((item) => {
        const requestId = normalizeText(item && item.id);
        if (!requestId) return;
        activeIds.add(requestId);

        if (notificationChatUnsubscribers[requestId]) return;

        const ref = rtdb.ref(`chats/${requestId}`).limitToLast(1);
        const onValue = (snapshot) => {
          const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
          const keys = Object.keys(value);
          if (!keys.length) {
            delete notificationLatestByRequest[requestId];
            refreshTopbarNotificationUi();
            return;
          }

          const latest = value[keys[0]] || {};
          const createdAt = toTimeValue(latest && latest.createdAt);
          const senderRole = normalizeText(latest && latest.senderRole).toLowerCase();
          notificationLatestByRequest[requestId] = {
            requestId,
            title: getNotificationRequestTitle(item),
            preview: buildNotificationPreview(latest),
            createdAt,
            senderRole
          };

          if (isMessagesPage() || senderRole === 'customer') {
            markNotificationsAsRead([{ requestId, createdAt }]);
          }

          refreshTopbarNotificationUi();
        };
        const onError = () => {
          delete notificationLatestByRequest[requestId];
          refreshTopbarNotificationUi();
        };

        ref.on('value', onValue, onError);
        notificationChatUnsubscribers[requestId] = () => {
          ref.off('value', onValue);
        };
      });

      Object.keys(notificationChatUnsubscribers).forEach((requestId) => {
        if (activeIds.has(requestId)) return;
        const unsubscribe = notificationChatUnsubscribers[requestId];
        if (typeof unsubscribe === 'function') {
          try {
            unsubscribe();
          } catch (_) {
          }
        }
        delete notificationChatUnsubscribers[requestId];
        delete notificationLatestByRequest[requestId];
      });

      refreshTopbarNotificationUi();
    }, () => {
      teardownTopbarNotifications();
    });
  }

  function ensureTopbarNotificationButton() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;

    let actions = topbar.querySelector('.topbar-actions');
    const userMenuWrap = topbar.querySelector('.user-menu-wrap');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'topbar-actions';
      if (userMenuWrap && userMenuWrap.parentNode === topbar) {
        topbar.insertBefore(actions, userMenuWrap);
        actions.appendChild(userMenuWrap);
      } else {
        topbar.appendChild(actions);
      }
    } else if (userMenuWrap && userMenuWrap.parentNode === topbar) {
      actions.appendChild(userMenuWrap);
    }

    if (!actions.querySelector('[data-topbar-concern="true"]')) {
      const concernButton = document.createElement('button');
      concernButton.type = 'button';
      concernButton.className = 'topbar-concern';
      concernButton.setAttribute('data-topbar-concern', 'true');
      concernButton.setAttribute('aria-label', 'Submit a concern');
      concernButton.setAttribute('title', 'Submit a concern');

      const concernIcon = document.createElement('img');
      concernIcon.src = '../../images/icons/concern-icon.svg';
      concernIcon.alt = '';
      concernIcon.className = 'topbar-concern-icon';
      concernIcon.setAttribute('aria-hidden', 'true');

      concernButton.appendChild(concernIcon);
      actions.insertBefore(concernButton, actions.firstChild || null);
    }

    if (actions.querySelector('[data-topbar-notification="true"]')) return;

    const wrap = document.createElement('div');
    wrap.className = 'topbar-notification-wrap';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'topbar-notification';
    button.setAttribute('data-topbar-notification', 'true');
    button.setAttribute('aria-label', 'Notifications');
    button.setAttribute('title', 'Notifications');
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');

    const icon = document.createElement('img');
    icon.src = '../../images/icons/notification-bell.svg';
    icon.alt = '';
    icon.className = 'topbar-notification-icon';
    icon.setAttribute('aria-hidden', 'true');

    const dot = document.createElement('span');
    dot.className = 'topbar-notification-dot';
    dot.hidden = true;
    dot.setAttribute('aria-hidden', 'true');

    button.appendChild(icon);
    button.appendChild(dot);

    const panel = document.createElement('div');
    panel.className = 'topbar-notification-panel';
    panel.setAttribute('aria-hidden', 'true');

    const panelTitle = document.createElement('div');
    panelTitle.className = 'topbar-notification-title';
    panelTitle.textContent = 'Notifications';

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'topbar-notification-clear';
    clearButton.textContent = 'Clear all';
    clearButton.hidden = true;

    const header = document.createElement('div');
    header.className = 'topbar-notification-header';
    header.appendChild(panelTitle);
    header.appendChild(clearButton);

    const list = document.createElement('div');
    list.className = 'topbar-notification-list';

    const emptyState = document.createElement('p');
    emptyState.className = 'topbar-notification-empty';
    emptyState.textContent = 'You are all caught up. No new notifications right now.';
    panel.appendChild(header);
    panel.appendChild(list);
    panel.appendChild(emptyState);

    wrap.appendChild(button);
    wrap.appendChild(panel);
    actions.insertBefore(wrap, actions.firstChild || null);
  }

  ns.bindSidebarToggle = function bindSidebarToggle() {
    const appShell = document.querySelector('.app-shell');
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (!sidebarToggle || !appShell) return;
    if (sidebarToggle.dataset.sidebarBound === '1') return;
    sidebarToggle.dataset.sidebarBound = '1';

    function applySidebarState(collapsed) {
      appShell.classList.toggle('sidebar-collapsed', !!collapsed);
      sidebarToggle.textContent = collapsed ? '☰' : '✕';
      sidebarToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    applySidebarState(readSidebarCollapsedState());
    appShell.classList.add('sidebar-state-ready');
    document.documentElement.classList.remove('hfs-sidebar-precollapsed');
    document.documentElement.classList.remove('hfs-sidebar-preexpanded');

    sidebarToggle.addEventListener('click', () => {
      const willCollapse = !appShell.classList.contains('sidebar-collapsed');
      applySidebarState(willCollapse);
      writeSidebarCollapsedState(willCollapse);
    });
  };

  ns.bindUserMenu = function bindUserMenu() {
    ensureTopbarNotificationButton();
    bindConcernModal();
    const concernButton = document.querySelector('[data-topbar-concern="true"]');
    const notificationButton = document.querySelector('[data-topbar-notification="true"]');
    const notificationPanel = document.querySelector('.topbar-notification-panel');
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenu = document.getElementById('userMenu');
    if (!userMenuBtn || !userMenu) return;
    if (userMenuBtn.dataset.userMenuBound === '1') return;
    userMenuBtn.dataset.userMenuBound = '1';

    function closeNotifications() {
      if (!notificationButton || !notificationPanel) return;
      notificationPanel.classList.remove('open');
      notificationPanel.setAttribute('aria-hidden', 'true');
      notificationButton.setAttribute('aria-expanded', 'false');
      notificationPanelSnapshot = null;
    }

    function closeMenu() {
      userMenu.classList.remove('open');
      userMenu.setAttribute('aria-hidden', 'true');
      userMenuBtn.setAttribute('aria-expanded', 'false');
    }

    if (concernButton && concernButton.dataset.concernBound !== '1') {
      concernButton.dataset.concernBound = '1';
      concernButton.addEventListener('click', (event) => {
        event.stopPropagation();
        closeNotifications();
        closeMenu();
        openConcernModal();
      });
    }

    if (notificationButton && notificationPanel) {
      notificationButton.addEventListener('click', (event) => {
        event.stopPropagation();
        closeMenu();
        const willOpen = !notificationPanel.classList.contains('open');
        notificationPanelSnapshot = willOpen ? getUnreadNotifications().slice() : null;
        if (willOpen) {
          renderNotificationPanel(notificationPanelSnapshot);
          markNotificationsAsRead(notificationPanelSnapshot);
          renderNotificationBadge();
        }
        const isOpen = notificationPanel.classList.toggle('open');
        notificationPanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        notificationButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (!isOpen) {
          notificationPanelSnapshot = null;
        }
      });

      notificationPanel.addEventListener('click', (event) => {
        const clearButton = event.target && event.target.closest ? event.target.closest('.topbar-notification-clear') : null;
        if (clearButton) {
          event.preventDefault();
          clearNotificationSnapshot();
          return;
        }

        const removeButton = event.target && event.target.closest ? event.target.closest('[data-remove-notification]') : null;
        if (removeButton) {
          event.preventDefault();
          event.stopPropagation();
          removeNotificationFromSnapshot(removeButton.getAttribute('data-remove-notification'));
          return;
        }

        const openItem = event.target && event.target.closest ? event.target.closest('[data-open-notification]') : null;
        if (openItem) {
          event.preventDefault();
          openMessagesFromNotification(openItem.getAttribute('data-open-notification'));
        }
      });

      notificationPanel.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const openItem = event.target && event.target.closest ? event.target.closest('[data-open-notification]') : null;
        if (!openItem) return;
        event.preventDefault();
        openMessagesFromNotification(openItem.getAttribute('data-open-notification'));
      });
    }

    userMenuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      closeNotifications();
      const isOpen = userMenu.classList.toggle('open');
      userMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      userMenuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', (event) => {
      if (notificationPanel && notificationButton && !notificationPanel.contains(event.target) && !notificationButton.contains(event.target)) {
        closeNotifications();
      }
      if (!userMenu.contains(event.target) && !userMenuBtn.contains(event.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeNotifications();
        closeMenu();
        closeConcernModal();
      }
    });
  };

  ns.setTopbarName = function setTopbarName(name) {
    const userMenuBtn = document.getElementById('userMenuBtn');
    if (!userMenuBtn) return;
    userMenuBtn.innerHTML = `${name} <span class="caret">▼</span>`;
  };

  function normalizeEmail(value) {
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

  function clearPendingRegisterSync(uid) {
    const key = String(uid || '').trim();
    if (!key) return;
    const map = readPendingRegisterSyncMap();
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      delete map[key];
      writePendingRegisterSyncMap(map);
    }
  }

  async function withTimeout(promise, timeoutMs, timeoutMessage) {
    const ms = Math.max(1000, Number(timeoutMs) || 4000);
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

  async function flushPendingRegisterSyncForCurrentUser() {
    const usersDb = window.usersDatabase;
    const auth = usersDb && usersDb.auth ? usersDb.auth : null;
    const authUser = auth && auth.currentUser ? auth.currentUser : null;
    const uid = String(authUser && authUser.uid ? authUser.uid : '').trim();
    if (!uid) return;

    const map = readPendingRegisterSyncMap();
    const item = map[uid];
    if (!item || typeof item !== 'object') return;

    try {
      if (item.needsPasswordUpdate && item.password && typeof authUser.updatePassword === 'function') {
        await withTimeout(
          authUser.updatePassword(String(item.password || '')),
          3000,
          'Updating password timed out.'
        );
      }

      if (item.profilePayload && usersDb && typeof usersDb.updateUserProfile === 'function') {
        await withTimeout(
          usersDb.updateUserProfile(uid, item.profilePayload),
          3000,
          'Saving profile timed out.'
        );
        ns.saveProfileCache(item.profilePayload, authUser);
      }

      clearPendingRegisterSync(uid);
    } catch (_) {
    }
  }

  function schedulePendingRegisterSyncRetries() {
    if (pendingSyncRetryTimer) return;

    let attempts = 0;
    pendingSyncRetryTimer = setInterval(() => {
      attempts += 1;
      void flushPendingRegisterSyncForCurrentUser();
      if (attempts >= 20) {
        clearInterval(pendingSyncRetryTimer);
        pendingSyncRetryTimer = null;
      }
    }, 1200);
  }

  ns.saveProfileCache = function saveProfileCache(profile, authUser) {
    const uid = String((profile && (profile.uid || profile.id)) || (authUser && authUser.uid) || '').trim();
    const email = normalizeEmail((profile && profile.email) || (authUser && authUser.email) || '');
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
  };

  ns.getCachedProfile = function getCachedProfile(authUserOrUid, maybeEmail) {
    const uid = typeof authUserOrUid === 'string'
      ? String(authUserOrUid || '').trim()
      : String(authUserOrUid && authUserOrUid.uid ? authUserOrUid.uid : '').trim();

    const emailFromUser = typeof authUserOrUid === 'object' && authUserOrUid
      ? normalizeEmail(authUserOrUid.email)
      : '';
    const emailFromArg = normalizeEmail(maybeEmail);
    const email = emailFromUser || emailFromArg;

    const store = readProfileCacheStore();
    const byUid = uid ? store.byUid[uid] : null;
    const byEmail = !byUid && email ? store.byEmail[email] : null;
    const record = byUid || byEmail;

    return record ? Object.assign({}, record) : null;
  };

  ns.getDisplayName = function getDisplayName(profile, authUser) {
    if (profile && profile.first_name) {
      const first = String(profile.first_name || '').trim();
      if (first) return first;
    }
    if (profile && profile.firstName) {
      const firstCamel = String(profile.firstName || '').trim();
      if (firstCamel) return firstCamel;
    }
    if (profile && profile.last_name) {
      const last = String(profile.last_name || '').trim();
      if (last) return last;
    }
    if (authUser && authUser.displayName) {
      const display = String(authUser.displayName || '').trim();
      if (display) return display.split(/\s+/)[0];
    }

    const email = String(authUser && authUser.email ? authUser.email : '').trim();
    if (email && email.includes('@')) {
      const local = email.split('@')[0];
      const token = String(local || '').split(/[._\-\s]+/)[0] || '';
      const clean = token.replace(/[^A-Za-z0-9']/g, '');
      if (clean) {
        return clean.charAt(0).toUpperCase() + clean.slice(1);
      }
    }

    const uid = String(authUser && authUser.uid ? authUser.uid : '').trim();
    if (uid) return 'Customer';

    return 'User';
  };

  ns.bindNavByHref = function bindNavByHref(href) {
    const link = document.querySelector(`.sidebar a[href="${href}"]`);
    if (!link) return;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = href;
    });
  };

  function initSidePanelEarly() {
    ns.bindSidebarToggle();
    ns.bindUserMenu();
    void flushPendingRegisterSyncForCurrentUser();
    schedulePendingRegisterSyncRetries();

    const usersDb = window.usersDatabase;
    const auth = usersDb && usersDb.auth ? usersDb.auth : null;
    if (auth && typeof auth.onAuthStateChanged === 'function') {
      auth.onAuthStateChanged((user) => {
        void flushPendingRegisterSyncForCurrentUser();
        if (user && user.uid) {
          bindTopbarNotificationsForUser(user);
        } else {
          teardownTopbarNotifications();
        }
      });

      if (auth.currentUser && auth.currentUser.uid) {
        bindTopbarNotificationsForUser(auth.currentUser);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidePanelEarly);
  } else {
    initSidePanelEarly();
  }
})();
