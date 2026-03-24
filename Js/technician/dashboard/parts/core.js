(function () {
  const ns = (window.hfsTechDashboard = window.hfsTechDashboard || {});
  const usersDb = window.usersDatabase || window.homefixDB || window.userProfileDatabase || null;

  const DEMO_SESSION_KEY = 'hfs_technician_demo_session';
  const DEMO_PROFILE_KEY = 'hfs_technician_demo_profile_v1';
  const FORCED_TECHNICIAN_EMAILS = new Set(['kingsnever721@gmail.com']);
  const LOGIN_NOTICE_KEY = 'hfs_login_notice';
  const DISABLED_ACCOUNT_MESSAGE = 'Your account has been disabled. Please contact the administrator for assistance.';
  const TECH_NOTIFICATION_READ_KEY = 'hfs_technician_notification_reads_v1';

  let stopDisabledStateWatcher = null;
  let disabledStatePollTimer = null;
  let currentDisabledStateUser = null;
  let disabledResumeChecksBound = false;
  let unsubscribeTechNotificationsRequests = null;
  const techNotificationChatUnsubscribers = Object.create(null);
  const techNotificationLatestByRequest = Object.create(null);
  let techNotificationPanelSnapshot = null;

  async function writeSessionLog(payload) {
    try {
      if (!usersDb || typeof usersDb.logSessionEvent !== 'function') return;
      await usersDb.logSessionEvent(payload || {});
    } catch (_) {
    }
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

  function normalizeText(value) {
    return String(value || '').trim();
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

  function isMessagesPanelActive() {
    const active = document.querySelector('.sidebar [data-section].active');
    return !!(active && active.getAttribute('data-section') === 'messages-page');
  }

  function readTechNotificationReadMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TECH_NOTIFICATION_READ_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeTechNotificationReadMap(map) {
    try {
      localStorage.setItem(TECH_NOTIFICATION_READ_KEY, JSON.stringify(map || {}));
    } catch (_) {
    }
  }

  function getTechNotificationElements() {
    return {
      button: document.querySelector('[data-tech-topbar-notification="true"]'),
      dot: document.querySelector('.tech-topbar-notification-dot'),
      panel: document.querySelector('.tech-topbar-notification-panel'),
      clear: document.querySelector('.tech-topbar-notification-clear'),
      list: document.querySelector('.tech-topbar-notification-list'),
      empty: document.querySelector('.tech-topbar-notification-empty')
    };
  }

  function canNotifyForRequest(item) {
    const status = normalizeText(item && item.status).toLowerCase();
    return status === 'accepted' || status === 'confirmed' || status === 'in-progress' || status === 'ongoing';
  }

  function getTechNotificationRequestTitle(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object' ? item.requestDetails : {};
    return normalizeText(details.category || details.serviceType || details.selectedOptionLabel || item && (item.serviceName || item.category || item.serviceType)) || 'Assigned job';
  }

  function buildTechNotificationPreview(entry) {
    const text = normalizeText(entry && entry.text);
    if (text) return text;
    const mediaType = normalizeText(entry && entry.mediaType).toLowerCase();
    if (mediaType.startsWith('image/')) return 'Customer sent a photo';
    if (mediaType.startsWith('video/')) return 'Customer sent a video';
    return 'New message from customer';
  }

  function formatTechNotificationTime(value) {
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

  function getUnreadTechNotifications() {
    const readMap = readTechNotificationReadMap();
    return Object.keys(techNotificationLatestByRequest)
      .map((requestId) => techNotificationLatestByRequest[requestId])
      .filter((item) => item && item.senderRole === 'customer' && item.createdAt > Number(readMap[item.requestId] || 0))
      .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
  }

  function renderTechNotificationPanel(items) {
    const elements = getTechNotificationElements();
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
      const requestId = normalizeText(item && item.requestId);
      const title = normalizeText(item && item.title) || 'New message from customer';
      const preview = normalizeText(item && item.preview) || 'You have a new notification.';
      const timeLabel = formatTechNotificationTime(item && item.createdAt);
      return `
        <div class="tech-topbar-notification-item" data-open-tech-notification="${requestId}" role="button" tabindex="0" aria-label="Open notification for ${title}">
          <div class="tech-topbar-notification-item-head">
            <strong>${title}</strong>
            <button type="button" class="tech-topbar-notification-remove" data-remove-tech-notification="${requestId}" aria-label="Remove notification" title="Remove notification">×</button>
          </div>
          <span>${preview}</span>
          ${timeLabel ? `<time>${timeLabel}</time>` : ''}
        </div>
      `;
    }).join('');
  }

  function renderTechNotificationBadge() {
    const elements = getTechNotificationElements();
    if (!elements.dot) return;
    elements.dot.hidden = getUnreadTechNotifications().length === 0;
  }

  function markTechNotificationsAsRead(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return;
    const readMap = readTechNotificationReadMap();
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
    if (changed) writeTechNotificationReadMap(readMap);
  }

  function removeTechNotificationFromSnapshot(requestId) {
    const cleanRequestId = normalizeText(requestId);
    if (!cleanRequestId || !Array.isArray(techNotificationPanelSnapshot)) return;
    techNotificationPanelSnapshot = techNotificationPanelSnapshot.filter((item) => normalizeText(item && item.requestId) !== cleanRequestId);
    renderTechNotificationPanel(techNotificationPanelSnapshot);
  }

  function clearTechNotificationSnapshot() {
    techNotificationPanelSnapshot = [];
    renderTechNotificationPanel(techNotificationPanelSnapshot);
  }

  function clearTechNotificationSubscriptions() {
    Object.keys(techNotificationChatUnsubscribers).forEach((requestId) => {
      const unsubscribe = techNotificationChatUnsubscribers[requestId];
      if (typeof unsubscribe === 'function') {
        try {
          unsubscribe();
        } catch (_) {
        }
      }
      delete techNotificationChatUnsubscribers[requestId];
      delete techNotificationLatestByRequest[requestId];
    });
  }

  function teardownTechNotifications() {
    if (typeof unsubscribeTechNotificationsRequests === 'function') {
      try {
        unsubscribeTechNotificationsRequests();
      } catch (_) {
      }
    }
    unsubscribeTechNotificationsRequests = null;
    clearTechNotificationSubscriptions();
    techNotificationPanelSnapshot = null;
    renderTechNotificationPanel([]);
    renderTechNotificationBadge();
  }

  function refreshTechNotificationUi() {
    const elements = getTechNotificationElements();
    if (elements.panel && elements.panel.classList.contains('open') && Array.isArray(techNotificationPanelSnapshot)) {
      renderTechNotificationPanel(techNotificationPanelSnapshot);
    }
    renderTechNotificationBadge();
  }

  function bindTechNotificationsForUser(user) {
    const uid = normalizeText(user && user.uid);
    const rtdb = getRealtimeDb();
    if (!uid || !rtdb) {
      teardownTechNotifications();
      return;
    }

    teardownTechNotifications();

    try {
      const query = rtdb.ref('requests').orderByChild('assignedTechnicianId').equalTo(uid);
      const onValue = (snapshot) => {
        const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
        const items = Object.keys(value).map((id) => Object.assign({ id }, value[id] || {}));
        const eligible = items.filter((item) => canNotifyForRequest(item));
        const activeIds = new Set();

        eligible.forEach((item) => {
          const requestId = normalizeText(item && item.id);
          if (!requestId) return;
          activeIds.add(requestId);
          if (techNotificationChatUnsubscribers[requestId]) return;

          const ref = rtdb.ref(`chats/${requestId}`).limitToLast(1);
          const onChatValue = (chatSnapshot) => {
            const chatValue = chatSnapshot && typeof chatSnapshot.val === 'function' ? (chatSnapshot.val() || {}) : {};
            const keys = Object.keys(chatValue);
            if (!keys.length) {
              delete techNotificationLatestByRequest[requestId];
              refreshTechNotificationUi();
              return;
            }

            const latest = chatValue[keys[0]] || {};
            const createdAt = toTimeValue(latest && latest.createdAt);
            const senderRole = normalizeText(latest && latest.senderRole).toLowerCase();
            techNotificationLatestByRequest[requestId] = {
              requestId,
              title: getTechNotificationRequestTitle(item),
              preview: buildTechNotificationPreview(latest),
              createdAt,
              senderRole
            };

            if (isMessagesPanelActive() || senderRole === 'technician') {
              markTechNotificationsAsRead([{ requestId, createdAt }]);
            }

            refreshTechNotificationUi();
          };
          const onChatError = () => {
            delete techNotificationLatestByRequest[requestId];
            refreshTechNotificationUi();
          };

          ref.on('value', onChatValue, onChatError);
          techNotificationChatUnsubscribers[requestId] = () => {
            ref.off('value', onChatValue);
          };
        });

        Object.keys(techNotificationChatUnsubscribers).forEach((requestId) => {
          if (activeIds.has(requestId)) return;
          const unsubscribe = techNotificationChatUnsubscribers[requestId];
          if (typeof unsubscribe === 'function') {
            try {
              unsubscribe();
            } catch (_) {
            }
          }
          delete techNotificationChatUnsubscribers[requestId];
          delete techNotificationLatestByRequest[requestId];
        });

        refreshTechNotificationUi();
      };
      const onError = () => {
        teardownTechNotifications();
      };

      query.on('value', onValue, onError);
      unsubscribeTechNotificationsRequests = () => {
        query.off('value', onValue);
      };
    } catch (_) {
      teardownTechNotifications();
    }
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

    if (actions.querySelector('[data-tech-topbar-notification="true"]')) return;

    const wrap = document.createElement('div');
    wrap.className = 'tech-topbar-notification-wrap';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tech-topbar-notification';
    button.setAttribute('data-tech-topbar-notification', 'true');
    button.setAttribute('aria-label', 'Notifications');
    button.setAttribute('title', 'Notifications');
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');

    const icon = document.createElement('img');
    icon.src = '../../images/icons/notification-bell.svg';
    icon.alt = '';
    icon.className = 'tech-topbar-notification-icon';
    icon.setAttribute('aria-hidden', 'true');

    const dot = document.createElement('span');
    dot.className = 'tech-topbar-notification-dot';
    dot.hidden = true;
    dot.setAttribute('aria-hidden', 'true');

    button.appendChild(icon);
    button.appendChild(dot);

    const panel = document.createElement('div');
    panel.className = 'tech-topbar-notification-panel';
    panel.setAttribute('aria-hidden', 'true');

    const header = document.createElement('div');
    header.className = 'tech-topbar-notification-header';

    const title = document.createElement('div');
    title.className = 'tech-topbar-notification-title';
    title.textContent = 'Notifications';

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'tech-topbar-notification-clear';
    clearButton.textContent = 'Clear all';
    clearButton.hidden = true;

    header.appendChild(title);
    header.appendChild(clearButton);

    const list = document.createElement('div');
    list.className = 'tech-topbar-notification-list';

    const emptyState = document.createElement('p');
    emptyState.className = 'tech-topbar-notification-empty';
    emptyState.textContent = 'You are all caught up. No new notifications right now.';

    panel.appendChild(header);
    panel.appendChild(list);
    panel.appendChild(emptyState);

    wrap.appendChild(button);
    wrap.appendChild(panel);
    actions.insertBefore(wrap, actions.firstChild || null);
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
    try {
      if (usersDb && typeof usersDb.signOut === 'function') {
        await usersDb.signOut();
      }
    } catch (_) {
    }
    ns.redirectToLogin();
  }

  async function isDisabledIdentity(user) {
    if (!user || !usersDb || typeof usersDb.isAccountDisabledByIdentity !== 'function') return false;
    try {
      return await usersDb.isAccountDisabledByIdentity(user.uid, user.email || '');
    } catch (_) {
      return false;
    }
  }

  async function runDisabledStateCheckNow() {
    const activeUser = currentDisabledStateUser || (usersDb && usersDb.auth ? usersDb.auth.currentUser : null);
    if (!activeUser) return;
    if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState === 'hidden') return;
    if (await isDisabledIdentity(activeUser)) {
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

  function startDisabledStatePolling(user) {
    clearDisabledStatePolling();
    if (!user) return;
    disabledStatePollTimer = setInterval(async () => {
      const activeUser = usersDb && usersDb.auth ? usersDb.auth.currentUser : null;
      if (!activeUser) {
        clearDisabledStatePolling();
        return;
      }
      if (await isDisabledIdentity(activeUser)) {
        clearDisabledStatePolling();
        await forceDisabledAccountLogout();
      }
    }, 4000);
  }

  function bindDisabledStateWatcher(user) {
    clearDisabledStateWatcher();

    const uid = String(user && user.uid ? user.uid : '').trim();
    const rtdb = getRealtimeDb();
    if (!uid || !rtdb) return;

    const refs = [
      rtdb.ref(`accountStatus/${uid}`),
      rtdb.ref(`technicians/${uid}`),
      rtdb.ref(`users/${uid}`),
      rtdb.ref(`customers/${uid}`)
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
      const disabledByIdentity = disabledInRecords ? true : await isDisabledIdentity(user);
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

  ns.redirectToLogin = function redirectToLogin() {
    window.location.href = '../../login.html';
  };

  ns.bindSidebarToggle = function bindSidebarToggle() {
    const appShell = document.querySelector('.app-shell');
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (!sidebarToggle || !appShell) return;

    sidebarToggle.addEventListener('click', () => {
      const collapsed = appShell.classList.toggle('sidebar-collapsed');
      sidebarToggle.textContent = collapsed ? '☰' : '✕';
      sidebarToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  };

  ns.bindUserMenu = function bindUserMenu() {
    ensureTopbarNotificationButton();
    const notificationButton = document.querySelector('[data-tech-topbar-notification="true"]');
    const notificationPanel = document.querySelector('.tech-topbar-notification-panel');
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenu = document.getElementById('userMenu');
    if (!userMenuBtn || !userMenu) return;

    function closeNotifications() {
      if (!notificationButton || !notificationPanel) return;
      notificationPanel.classList.remove('open');
      notificationPanel.setAttribute('aria-hidden', 'true');
      notificationButton.setAttribute('aria-expanded', 'false');
      techNotificationPanelSnapshot = null;
    }

    function closeMenu() {
      userMenu.classList.remove('open');
      userMenu.setAttribute('aria-hidden', 'true');
      userMenuBtn.setAttribute('aria-expanded', 'false');
    }

    if (notificationButton && notificationPanel) {
      notificationButton.addEventListener('click', (event) => {
        event.stopPropagation();
        closeMenu();
        const willOpen = !notificationPanel.classList.contains('open');
        techNotificationPanelSnapshot = willOpen ? getUnreadTechNotifications().slice() : null;
        if (willOpen) {
          renderTechNotificationPanel(techNotificationPanelSnapshot);
          markTechNotificationsAsRead(techNotificationPanelSnapshot);
          renderTechNotificationBadge();
        }
        const isOpen = notificationPanel.classList.toggle('open');
        notificationPanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        notificationButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (!isOpen) {
          techNotificationPanelSnapshot = null;
        }
      });

      notificationPanel.addEventListener('click', (event) => {
        const clearButton = event.target && event.target.closest ? event.target.closest('.tech-topbar-notification-clear') : null;
        if (clearButton) {
          event.preventDefault();
          clearTechNotificationSnapshot();
          return;
        }

        const removeButton = event.target && event.target.closest ? event.target.closest('[data-remove-tech-notification]') : null;
        if (removeButton) {
          event.preventDefault();
          event.stopPropagation();
          removeTechNotificationFromSnapshot(removeButton.getAttribute('data-remove-tech-notification'));
          return;
        }

        const openItem = event.target && event.target.closest ? event.target.closest('[data-open-tech-notification]') : null;
        if (openItem) {
          event.preventDefault();
          const requestId = openItem.getAttribute('data-open-tech-notification');
          const opener = ns && typeof ns.openMessagesForRequest === 'function' ? ns.openMessagesForRequest : null;
          if (opener && opener(requestId)) {
            closeNotifications();
          }
        }
      });

      notificationPanel.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const openItem = event.target && event.target.closest ? event.target.closest('[data-open-tech-notification]') : null;
        if (!openItem) return;
        event.preventDefault();
        const requestId = openItem.getAttribute('data-open-tech-notification');
        const opener = ns && typeof ns.openMessagesForRequest === 'function' ? ns.openMessagesForRequest : null;
        if (opener && opener(requestId)) {
          closeNotifications();
        }
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
      }
    });
  };

  ns.setTopbarName = function setTopbarName(name) {
    const userMenuBtn = document.getElementById('userMenuBtn');
    if (!userMenuBtn) return;
    userMenuBtn.innerHTML = `${name} <span class="caret">▼</span>`;
  };

  ns.hasDemoSession = function hasDemoSession() {
    try {
      const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return parsed && parsed.role === 'technician';
    } catch (_) {
      return false;
    }
  };

  ns.bindAuthState = function bindAuthState() {
    bindDisabledStateResumeChecks();
    if (ns.hasDemoSession()) {
      ns.setTopbarName('Technician');
      return;
    }

    if (!(usersDb && usersDb.auth)) {
      ns.redirectToLogin();
      return;
    }

    let seenAuthenticatedUser = false;
    const initialAuthTimeout = setTimeout(() => {
      if (!seenAuthenticatedUser) {
        ns.redirectToLogin();
      }
    }, 1200);

    usersDb.auth.onAuthStateChanged(async (user) => {
      if (!user) {
        currentDisabledStateUser = null;
        clearDisabledStateWatcher();
        clearDisabledStatePolling();
        teardownTechNotifications();
        if (!seenAuthenticatedUser) return;
        ns.redirectToLogin();
        return;
      }

       seenAuthenticatedUser = true;
  currentDisabledStateUser = user;
       clearTimeout(initialAuthTimeout);
       bindDisabledStateWatcher(user);
      startDisabledStatePolling(user);
      bindTechNotificationsForUser(user);

      try {
        const [profileById, profileByEmail] = await Promise.all([
          typeof usersDb.getUserById === 'function' ? usersDb.getUserById(user.uid).catch(() => null) : Promise.resolve(null),
          (user.email && typeof usersDb.getUserByEmail === 'function') ? usersDb.getUserByEmail(user.email).catch(() => null) : Promise.resolve(null)
        ]);

        let profile = profileById || null;
        if ((!profile || !profile.role) && profileByEmail) {
          const byEmail = profileByEmail;
          profile = Object.assign({}, profile, byEmail, { uid: user.uid, email: user.email || byEmail.email || '' });
          const byEmailRole = String(byEmail.role || '').trim().toLowerCase();
          if ((byEmailRole === 'technician' || byEmailRole === 'admin') && typeof usersDb.updateUserProfile === 'function') {
            usersDb.updateUserProfile(user.uid, {
              uid: user.uid,
              email: String(user.email || byEmail.email || '').trim().toLowerCase(),
              first_name: String(byEmail.first_name || '').trim(),
              middle_name: String(byEmail.middle_name || '').trim(),
              last_name: String(byEmail.last_name || '').trim(),
              role: byEmailRole,
              isActive: byEmail.isActive !== false,
              isVerified: true,
              emailVerified: true
            }).catch(() => {});
          }
        }

        const role = String(profile && profile.role ? profile.role : '').toLowerCase();
        const normalizedEmail = String((profile && profile.email) || user.email || '').trim().toLowerCase();
        const isActive = !(profile && profile.isActive === false);

        if (!isActive || await isDisabledIdentity(user)) {
          await forceDisabledAccountLogout();
          return;
        }

        if (normalizedEmail && FORCED_TECHNICIAN_EMAILS.has(normalizedEmail) && role !== 'technician') {
          try {
            if (typeof usersDb.updateUserProfile === 'function') {
              await usersDb.updateUserProfile(user.uid, {
                uid: user.uid,
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
              await rtdb.ref(`technicians/${user.uid}`).update(Object.assign({}, profile || {}, {
                uid: user.uid,
                email: normalizedEmail,
                role: 'technician',
                isActive: profile && Object.prototype.hasOwnProperty.call(profile, 'isActive') ? profile.isActive : true,
                isVerified: true,
                emailVerified: true,
                updatedAt: Date.now()
              }));
              try { await rtdb.ref(`users/${user.uid}`).remove(); } catch (_) {}
              try { await rtdb.ref(`customers/${user.uid}`).remove(); } catch (_) {}
            }
          } catch (_) {
          }

          const forcedDisplayName = [profile && profile.first_name || '', profile && profile.last_name || ''].join(' ').trim() || user.email || 'Technician';
          ns.setTopbarName(forcedDisplayName);
          return;
        }

        if (role && role !== 'technician') {
          await usersDb.signOut();
          ns.redirectToLogin();
          return;
        }

        const displayName = [profile && profile.first_name || '', profile && profile.last_name || ''].join(' ').trim() || user.email || 'Technician';
        ns.setTopbarName(displayName);
      } catch (_) {
        ns.setTopbarName(user.email || 'Technician');
      }
    });
  };

  ns.bindSignOut = function bindSignOut() {
    const signOutLinks = document.querySelectorAll('[data-logout="true"]');
    signOutLinks.forEach((signOutLink) => {
      signOutLink.setAttribute('href', '#');
      signOutLink.addEventListener('click', async (event) => {
        event.preventDefault();

        const demoSession = (() => {
          try {
            const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
          } catch (_) {
            return null;
          }
        })();

        const authUser = usersDb && usersDb.auth ? usersDb.auth.currentUser : null;
        const uid = String(authUser && authUser.uid ? authUser.uid : '').trim();
        const email = String(
          (authUser && authUser.email) ||
          (demoSession && demoSession.email) ||
          ''
        ).trim().toLowerCase();

        if (usersDb && typeof usersDb.endRoleSession === 'function') {
          await usersDb.endRoleSession({
            role: 'technician',
            uid,
            email,
            name: email || 'Technician',
            source: demoSession ? 'technician-demo' : 'technician-dashboard'
          });
        } else {
          await writeSessionLog({
            role: 'technician',
            action: 'logout',
            uid,
            email,
            name: email || 'Technician',
            source: demoSession ? 'technician-demo' : 'technician-dashboard'
          });
        }

        try {
          sessionStorage.removeItem(DEMO_SESSION_KEY);
          sessionStorage.removeItem(DEMO_PROFILE_KEY);
        } catch (_) {
        }

        if (usersDb && typeof usersDb.signOut === 'function') {
          try {
            await usersDb.signOut();
          } catch (_) {
          }
        }

        ns.redirectToLogin();
      });
    });
  };
})();
