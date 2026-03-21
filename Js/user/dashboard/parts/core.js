document.addEventListener('DOMContentLoaded', () => {
  const ns = window.hfsDashboard || {};
  const usersDb = window.usersDatabase || window.homefixDB || null;
  const REGISTER_WELCOME_FLAG_KEY = 'hfs_show_welcome_on_dashboard';
  const detailsModal = document.getElementById('overviewDetailsModal');
  const detailsBody = document.getElementById('overviewDetailsBody');
  const detailsCloseBtn = document.getElementById('overviewDetailsCloseBtn');
  const welcomePopup = document.getElementById('dashboardWelcomePopup');
  const welcomeOkBtn = document.getElementById('dashboardWelcomeOkBtn');
  const recentList = document.getElementById('overviewRecentList');
  const recentItemMap = new Map();
  let latestOverviewItems = [];
  let unsubscribeOverviewBookings = null;
  const RECENT_REQUEST_LIMIT = 3;

  const homeCard = document.querySelector('.home-card');
  if (homeCard) homeCard.scrollTop = 0;

  (function showRegisterWelcomePopup() {
    try {
      const shouldShow = sessionStorage.getItem(REGISTER_WELCOME_FLAG_KEY) === '1';
      if (!shouldShow) return;
      sessionStorage.removeItem(REGISTER_WELCOME_FLAG_KEY);
      if (!welcomePopup) return;
      welcomePopup.hidden = false;
      welcomePopup.setAttribute('aria-hidden', 'false');

      const closePopup = () => {
        welcomePopup.hidden = true;
        welcomePopup.setAttribute('aria-hidden', 'true');
      };

      if (welcomeOkBtn) {
        welcomeOkBtn.addEventListener('click', closePopup, { once: true });
      }

      setTimeout(closePopup, 3000);
    } catch (_) {
    }
  })();

  function toDateValue(value) {
    if (!value) return null;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (value && typeof value.toDate === 'function') {
      return value.toDate();
    }
    return null;
  }

  function getStatus(item) {
    return String(item && item.status ? item.status : 'pending').toLowerCase();
  }

  function isConfirmedBucketStatus(statusValue) {
    const status = String(statusValue || '').toLowerCase();
    return status === 'confirmed' || status === 'accepted';
  }

  function formatRequestCode(item) {
    const source = String((item && (item.requestId || item.id)) || '').trim();
    if (!source) return 'N/A';
    if (usersDb && typeof usersDb.formatRequestCode === 'function') {
      return usersDb.formatRequestCode(item, source);
    }

    const bookingType = String((item && item.bookingType) || '').toLowerCase();
    const requestMode = String((item && item.requestMode) || '').toLowerCase();
    const serviceMode = String((item && item.serviceMode) || '').toLowerCase();
    const prefix = (bookingType === 'appointment' || requestMode === 'drop-off-store' || serviceMode.includes('drop-off') || serviceMode.includes('store')) ? 'SD' : 'HS';
    let hash = 0;
    for (let i = 0; i < source.length; i += 1) {
      hash = ((hash * 33) + source.charCodeAt(i)) >>> 0;
    }
    return `${prefix}-${String(hash % 100000).padStart(5, '0')}`;
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = value;
  }

  function getFirstName(profile, fullName, email) {
    function cleanNameToken(value) {
      const text = String(value || '').trim();
      if (!text) return '';
      const lettersOnly = text.replace(/[^A-Za-z]/g, '');
      if (!lettersOnly) return '';
      return lettersOnly.charAt(0).toUpperCase() + lettersOnly.slice(1).toLowerCase();
    }

    const profileFirstName = profile && typeof profile.first_name === 'string'
      ? profile.first_name.trim()
      : '';
    if (profileFirstName) return profileFirstName;

    const fallbackName = String(fullName || '').trim();
    if (fallbackName) {
      const firstWord = fallbackName.split(/\s+/)[0];
      const normalized = cleanNameToken(firstWord);
      if (normalized) return normalized;
    }

    const emailValue = String(email || '').trim();
    if (emailValue.includes('@')) {
      const localPart = emailValue.split('@')[0];
      const token = localPart.split(/[._-]+/).find(Boolean) || localPart;
      const normalized = cleanNameToken(token);
      if (normalized) return normalized;
    }

    return 'User';
  }

  function getDisplayLabel(item) {
    const details = item && item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};

    const additionalInfo = String(details.additionalInfo || details.issue || item.issue || item.description || '').trim().toLowerCase();
    const chosenCandidates = [
      details && details.selectedOptionValue,
      item && item.serviceName,
      item && item.deviceType,
      item && item.device,
      details && details.category
    ];

    const chosen = chosenCandidates
      .map((value) => String(value || '').trim())
      .find((value) => value && value.toLowerCase() !== additionalInfo)
      || 'Service Request';

    const bookingTypeRaw = String((item && (item.bookingType || item.serviceType)) || '').toLowerCase();
    const serviceMode = bookingTypeRaw.includes('appoint') ? 'Drop-Off at Store' : 'Home Service';
    const serviceType = String(details.serviceType || item.serviceType || '').trim() || 'N/A';
    const normalizedServiceType = serviceType.toLowerCase() === 'n/a' ? '' : serviceType;
    const normalizedChosen = chosen.toLowerCase() === 'service request' ? '' : chosen;

    let title = 'Service Request';
    if (normalizedServiceType && normalizedChosen) {
      title = `${normalizedServiceType} - ${normalizedChosen}`;
    } else if (normalizedServiceType) {
      title = normalizedServiceType;
    } else if (normalizedChosen) {
      title = normalizedChosen;
    }
    const preferredDate = String(item && item.preferredDate ? item.preferredDate : '').trim();
    const preferredTime = String(item && item.preferredTime ? item.preferredTime : '').trim();
    const scheduleData = item && item.schedule && typeof item.schedule === 'object'
      ? item.schedule
      : null;

    let schedule = 'No schedule set';
    if (preferredDate && preferredTime) {
      const parsedDate = new Date(`${preferredDate}T00:00:00`);
      const dateLabel = Number.isNaN(parsedDate.getTime())
        ? preferredDate
        : parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      schedule = `${dateLabel} ${preferredTime}`;
    }

    if (scheduleData) {
      const display = String(scheduleData.display || '').trim();
      const dateLabel = String(scheduleData.dateLabel || scheduleData.date || '').trim();
      const timeLabel = String(scheduleData.timeLabel || scheduleData.time || '').trim();

      if (schedule === 'No schedule set') {
        if (display) schedule = display;
        else if (dateLabel && timeLabel) schedule = `${dateLabel} ${timeLabel}`;
        else if (dateLabel) schedule = dateLabel;
      }
    }

    if (schedule === 'No schedule set') {
      schedule = item.preferredSchedule || item.preferred_datetime || 'No schedule set';
    }

    return { title, chosen, schedule, serviceMode, serviceType };
  }

  function getRequestedDate(item) {
    const candidates = [
      item && item.createdAt,
      item && item.requestedAt,
      item && item.submittedAt,
      item && item.created_at,
      item && item.timestamp,
      item && item.updatedAt
    ];

    for (const value of candidates) {
      const dateValue = toDateValue(value);
      if (dateValue) return dateValue;
      if (typeof value === 'number') {
        const numericDate = new Date(value);
        if (!Number.isNaN(numericDate.getTime())) return numericDate;
      }
    }

    return null;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function isPermissionDenied(error) {
    const code = String(error && error.code ? error.code : '').toLowerCase();
    const msg = String(error && error.message ? error.message : '').toLowerCase();
    return code === 'permission-denied' || code === 'firestore/permission-denied' || msg.includes('insufficient permissions');
  }

  async function getProfileWithFallback(user) {
    if (!usersDb || !user || !user.uid || typeof usersDb.getUserById !== 'function') return null;

    try {
      const profile = await usersDb.getUserById(user.uid);
      if (profile) {
        if (typeof ns.saveProfileCache === 'function') {
          ns.saveProfileCache(profile, user);
        }
        return profile;
      }
    } catch (_) {
    }

    if (typeof usersDb.updateUserProfile === 'function') {
      try {
        await usersDb.updateUserProfile(user.uid, {
          uid: user.uid,
          email: String(user.email || '').trim().toLowerCase(),
          role: 'customer',
          isVerified: !!user.emailVerified,
          emailVerified: !!user.emailVerified
        });
      } catch (_) {
      }
    }

    try {
      const profile = await usersDb.getUserById(user.uid);
      if (profile && typeof ns.saveProfileCache === 'function') {
        ns.saveProfileCache(profile, user);
      }
      if (profile) return profile;
    } catch (_) {
    }

    if (typeof ns.getCachedProfile === 'function') {
      return ns.getCachedProfile(user);
    }

    return null;
  }

  function renderRecentRequests(items) {
    const list = document.getElementById('overviewRecentList');
    if (!list) return;
    recentItemMap.clear();

    if (!Array.isArray(items) || !items.length) {
      list.innerHTML = '<div class="overview-empty">No requests yet. Create your first service request.</div>';
      return;
    }

    const sorted = [...items].sort((a, b) => {
      const left = getRequestedDate(a);
      const right = getRequestedDate(b);
      return (right ? right.getTime() : 0) - (left ? left.getTime() : 0);
    }).slice(0, RECENT_REQUEST_LIMIT);

    const html = sorted.map((item, index) => {
      const status = getStatus(item);
      const label = getDisplayLabel(item);
      const requestId = String((item && (item.id || item.requestId)) || `recent-${index}`).trim();
      recentItemMap.set(requestId, item);
      return `
        <div class="overview-item">
          <div class="overview-item-main">
            <strong>${escapeHtml(label.title)}</strong>
            <span class="overview-item-meta">${escapeHtml(`Service mode: ${label.serviceMode} • Type: ${label.serviceType}`)}</span>
            <span class="overview-item-meta">${escapeHtml(`Schedule: ${label.schedule}`)}</span>
          </div>
          <div class="overview-item-actions">
            <button type="button" class="overview-details-btn" data-request-id="${escapeHtml(requestId)}">Details</button>
            <span class="overview-status ${escapeHtml(status)}">${escapeHtml(status)}</span>
          </div>
        </div>
      `;
    }).join('');

    list.innerHTML = html;
  }

  function getScheduleText(item) {
    return getDisplayLabel(item).schedule;
  }

  function getMediaPreviewInfo(entry) {
    if (!entry || typeof entry !== 'object') return { link: '', preview: '' };
    const rawUrl = String(entry.url || '').trim();
    const rawPreview = String(entry.thumbnailUrl || entry.previewUrl || entry.dataUrl || '').trim();
    const link = /^https?:\/\//i.test(rawUrl) ? rawUrl : '';
    const preview = link || (/^(https?:\/\/|data:image\/)/i.test(rawPreview) ? rawPreview : '');
    return { link, preview };
  }

  function getAddressLines(item) {
    const location = item && item.location && typeof item.location === 'object' ? item.location : null;
    if (!location) return ['N/A'];

    const bookingTypeRaw = String((item && (item.bookingType || item.serviceType)) || '').toLowerCase();
    const isStoreDropOff = bookingTypeRaw.includes('appoint');

    const houseUnit = String(location.houseUnit || '').trim();
    const streetName = String(location.streetName || '').trim();
    const barangay = String(location.barangay || '').trim();
    const city = String(location.city || 'Dagupan City').trim();
    const additional = String(location.additionalDetails || '').trim();

    if (isStoreDropOff) {
      const lines = [];
      if (houseUnit) lines.push(houseUnit);
      if (streetName) lines.push(streetName);

      const locationLine = [barangay, city].filter(Boolean).join(', ').trim();
      if (locationLine) lines.push(locationLine);

      if (additional) lines.push(additional);
      return lines.length ? lines : ['N/A'];
    }

    const lines = [];
    if (houseUnit) lines.push(houseUnit);
    if (streetName) lines.push(streetName);
    if (barangay) lines.push(barangay);
    if (city) lines.push(city);
    if (additional) lines.push(additional);

    if (lines.length) return lines;

    if (location.houseUnit) {
      return [`${location.houseUnit}, ${location.streetName}, ${location.barangay}, ${location.city || 'Dagupan City'}`];
    }
    return ['N/A'];
  }

  function showRequestDetails(item) {
    if (!detailsModal || !detailsBody) return;
    const details = item && item.requestDetails && typeof item.requestDetails === 'object' ? item.requestDetails : {};
    const label = getDisplayLabel(item);
    const status = getStatus(item);
    const requested = getRequestedDate(item);
    const requestedText = requested
      ? requested.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Not recorded';
    const category = String(details.category || item.category || 'N/A').trim() || 'N/A';
    const additionalInfo = String(details.additionalInfo || details.issue || item.issue || item.description || 'N/A').trim() || 'N/A';
    const addressValues = getAddressLines(item);
    if (additionalInfo && additionalInfo.toLowerCase() !== 'n/a') {
      addressValues.push(`Request note: ${additionalInfo}`);
    }

    const addressLines = addressValues
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join('');
    const media = Array.isArray(item && item.media) ? item.media : [];
    const requestIdValue = formatRequestCode(item);
    const mediaHtml = media.length
      ? media.map((entry, index) => {
          const info = getMediaPreviewInfo(entry);
          const isVideo = !!(entry && entry.type && String(entry.type).toLowerCase().startsWith('video/'));
          const labelText = String(entry && entry.name ? entry.name : `${isVideo ? 'Video' : 'Photo'} ${index + 1}`);

          if (isVideo) {
            if (info.link || info.preview) {
              const source = info.link || info.preview;
              return `
                <a class="overview-details-media-item" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(labelText)}">
                  <span class="overview-details-media-video">▶ Video</span>
                </a>
              `;
            }
            return `<div class="overview-details-media-item"><span class="overview-details-media-video">▶ Video</span></div>`;
          }

          if (info.preview) {
            return `
              <a class="overview-details-media-item" href="${escapeHtml(info.link || info.preview)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(labelText)}">
                <img src="${escapeHtml(info.preview)}" alt="${escapeHtml(labelText)}">
              </a>
            `;
          }

          return `<div class="overview-details-media-item"><span class="overview-details-media-video">Image</span></div>`;
        }).join('')
      : '<div class="overview-details-media-empty">No media submitted.</div>';

    detailsBody.innerHTML = `
      <div><strong>Title:</strong> ${escapeHtml(label.title)}</div>
      <div><strong>Request ID:</strong> ${escapeHtml(requestIdValue)}</div>
      <div><strong>Status:</strong> ${escapeHtml(status)}</div>
      <div><strong>Service mode:</strong> ${escapeHtml(label.serviceMode)}</div>
      <div><strong>Service type:</strong> ${escapeHtml(label.serviceType)}</div>
      <div><strong>Category:</strong> ${escapeHtml(category)}</div>
      <div><strong>Schedule:</strong> ${escapeHtml(getScheduleText(item))}</div>
      <div><strong>Requested:</strong> ${escapeHtml(requestedText)}</div>
      <div><strong>Address:</strong></div>
      <div class="overview-details-address">${addressLines}</div>
      <div><strong>Submitted media:</strong></div>
      <div class="overview-details-media">${mediaHtml}</div>
    `;

    detailsModal.hidden = false;
    detailsModal.setAttribute('aria-hidden', 'false');
    if (detailsCloseBtn) detailsCloseBtn.focus();
  }

  function closeRequestDetails() {
    if (!detailsModal) return;
    detailsModal.hidden = true;
    detailsModal.setAttribute('aria-hidden', 'true');
  }

  function bindStatCardLinks() {
    const cards = Array.from(document.querySelectorAll('.stat-card-link'));
    if (!cards.length) return;

    function navigateFromCard(card) {
      const tab = String(card && card.getAttribute('data-target-tab') ? card.getAttribute('data-target-tab') : 'pending').trim().toLowerCase();
      const targetTab = (tab === 'confirmed' || tab === 'history') ? tab : 'pending';
      window.location.href = `pending.html?tab=${encodeURIComponent(targetTab)}`;
    }

    cards.forEach((card) => {
      if (card.dataset.boundStatLink === '1') return;
      card.dataset.boundStatLink = '1';

      card.addEventListener('click', () => {
        navigateFromCard(card);
      });

      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigateFromCard(card);
        }
      });
    });
  }

  async function loadOverview(user) {
    const email = user && user.email ? user.email : 'No email';
    let profile = null;

    try {
      profile = await getProfileWithFallback(user);
    } catch (_) {
      profile = null;
    }

    const name = ns.getDisplayName(profile, user);
    const firstName = getFirstName(profile, name, email);
    const avatarSource = (name || email || 'U').trim();

    setText('overviewWelcomeHeading', `Welcome ${firstName}!`);
    setText('overviewUserName', name || 'User');
    setText('overviewUserEmail', email);
    setText('overviewAvatar', avatarSource.charAt(0).toUpperCase());

    function applyBookingItems(items) {
      const list = Array.isArray(items) ? items : [];
      latestOverviewItems = list;

      const pendingCount = list.filter((item) => {
        const status = getStatus(item);
        return status === 'pending' || status === 'offered';
      }).length;
      const confirmedCount = list.filter((item) => isConfirmedBucketStatus(getStatus(item))).length;
      const completedCount = list.filter((item) => {
        const status = getStatus(item);
        return status === 'completed' || status === 'finished';
      }).length;

      setText('statTotal', String(list.length));
      setText('statPending', String(pendingCount));
      setText('statConfirmed', String(confirmedCount));
      setText('statCompleted', String(completedCount));
      renderRecentRequests(list);
    }

    if (typeof unsubscribeOverviewBookings === 'function') {
      unsubscribeOverviewBookings();
      unsubscribeOverviewBookings = null;
    }

    if (usersDb && typeof usersDb.subscribeBookingsForUser === 'function') {
      unsubscribeOverviewBookings = usersDb.subscribeBookingsForUser(user.uid, (items) => {
        applyBookingItems(items);
      }, (error) => {
        if (!isPermissionDenied(error)) {
          console.warn('Failed to load bookings overview.', error);
        }
        applyBookingItems([]);
      });
      return;
    }

    try {
      const bookings = await usersDb.getBookingsForUser(user.uid);
      applyBookingItems(bookings);
    } catch (error) {
      if (!isPermissionDenied(error)) {
        console.warn('Failed to load bookings overview.', error);
      }
      applyBookingItems([]);
    }
  }

  ns.bindSidebarToggle();
  ns.bindUserMenu();
  ns.bindAuthState();
  ns.bindSignOut();
  bindStatCardLinks();

  if (recentList) {
    recentList.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      if (!target.classList.contains('overview-details-btn')) return;

      const requestId = String(target.getAttribute('data-request-id') || '').trim();
      if (!requestId || !recentItemMap.has(requestId)) return;
      showRequestDetails(recentItemMap.get(requestId));
    });
  }

  if (detailsCloseBtn) {
    detailsCloseBtn.addEventListener('click', closeRequestDetails);
  }

  if (detailsModal) {
    detailsModal.addEventListener('click', (event) => {
      if (event.target === detailsModal) closeRequestDetails();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && detailsModal && !detailsModal.hidden) closeRequestDetails();
  });

  if (usersDb && usersDb.auth) {
    usersDb.auth.onAuthStateChanged((user) => {
      if (!user) {
        if (typeof unsubscribeOverviewBookings === 'function') {
          unsubscribeOverviewBookings();
          unsubscribeOverviewBookings = null;
        }
        return;
      }
      if (!document.querySelector('.dashboard-overview')) return;
      loadOverview(user);
    });
  }

  window.addEventListener('beforeunload', () => {
    if (typeof unsubscribeOverviewBookings === 'function') {
      unsubscribeOverviewBookings();
      unsubscribeOverviewBookings = null;
    }
  });
});
