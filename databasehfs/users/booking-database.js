/*
  databasehfs/users/booking-database.js
  Booking request data access layer.
*/
(function () {
  const core = window.homefixUsersCore;
  if (!core) {
    console.error('booking-database requires databasehfs/users/core.js to be loaded first.');
    return;
  }

  function toIsoDate(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return '';

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function normalizeScheduleFields(rawBooking) {
    const booking = Object.assign({}, rawBooking || {});
    const schedule = booking.schedule && typeof booking.schedule === 'object' ? booking.schedule : {};

    let preferredDate = String(booking.preferredDate || schedule.date || '').trim();
    let preferredTime = String(booking.preferredTime || schedule.time || '').trim();

    const legacySchedule = String(
      booking.preferredSchedule
      || booking.preferred_datetime
      || schedule.display
      || ''
    ).trim();

    if ((!preferredDate || !preferredTime) && legacySchedule) {
      const atParts = legacySchedule.split(' at ');
      if (atParts.length === 2) {
        if (!preferredDate) preferredDate = toIsoDate(atParts[0]);
        if (!preferredTime) preferredTime = String(atParts[1] || '').trim();
      }

      const rangeMatch = legacySchedule.match(/(\d{1,2}:\d{2}\s*[ap]m\s*-\s*\d{1,2}:\d{2}\s*[ap]m)\s*$/i);
      if (!preferredTime && rangeMatch) {
        preferredTime = String(rangeMatch[1] || '').trim();
      }

      if (!preferredDate) {
        const dateSource = rangeMatch
          ? legacySchedule.slice(0, legacySchedule.length - String(rangeMatch[1] || '').length).trim()
          : legacySchedule;
        preferredDate = toIsoDate(dateSource);
      }
    }

    preferredDate = toIsoDate(preferredDate);
    preferredTime = String(preferredTime || '').trim();

    delete booking.preferredSchedule;
    delete booking.preferred_datetime;
    delete booking.schedule;

    if (preferredDate) booking.preferredDate = preferredDate;
    else delete booking.preferredDate;

    if (preferredTime) booking.preferredTime = preferredTime;
    else delete booking.preferredTime;

    return booking;
  }

  function normalizeMediaFields(rawBooking) {
    const booking = Object.assign({}, rawBooking || {});
    const media = Array.isArray(booking.media) ? booking.media : [];

    booking.media = media.map((entry) => {
      const item = entry && typeof entry === 'object' ? entry : {};
      const rawUrl = String(item.url || '').trim();
      const safeUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : '';
      const rawThumb = String(item.thumbnailUrl || '').trim();
      const safeThumb = /^(https?:\/\/|data:image\/)/i.test(rawThumb) ? rawThumb : '';
      return {
        name: String(item.name || '').trim(),
        type: String(item.type || '').trim(),
        size: Number.isFinite(Number(item.size)) ? Number(item.size) : 0,
        url: safeUrl,
        thumbnailUrl: safeThumb
      };
    }).filter((item) => item.name || item.type || item.size > 0 || item.url || item.thumbnailUrl);

    return booking;
  }

  function normalizeRequestFields(rawBooking) {
    const booking = Object.assign({}, rawBooking || {});

    delete booking.deviceType;
    delete booking.serviceName;
    delete booking.serviceType;

    return booking;
  }

  function normalizeFreeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function isValidRequestIssueFormat(value) {
    return /^[A-Za-z0-9,\-\s]+$/.test(String(value || ''));
  }

  function normalizeRequestIssueValue(value) {
    const issue = normalizeFreeText(value);
    if (issue && !isValidRequestIssueFormat(issue)) {
      const err = new Error('Request details can only use letters, numbers, spaces, commas, and hyphens.');
      err.code = 'validation/invalid-request-details';
      throw err;
    }
    return issue;
  }

  function normalizeRequestDetails(rawBooking) {
    const booking = Object.assign({}, rawBooking || {});
    const details = booking.requestDetails && typeof booking.requestDetails === 'object'
      ? booking.requestDetails
      : {};

    return {
      serviceType: String(details.serviceType || booking.serviceType || '').trim(),
      category: String(details.category || booking.category || '').trim(),
      selectedOptionLabel: String(details.selectedOptionLabel || '').trim(),
      selectedOptionValue: String(details.selectedOptionValue || booking.serviceName || booking.deviceType || booking.device || '').trim(),
      selectedTechnicianName: String(details.selectedTechnicianName || booking.assignedTechnicianName || booking.technicianName || '').trim(),
      selectedTechnicianId: String(details.selectedTechnicianId || booking.assignedTechnicianId || booking.technicianId || '').trim(),
      selectedTechnicianEmail: String(details.selectedTechnicianEmail || booking.assignedTechnicianEmail || booking.technicianEmail || '').trim().toLowerCase(),
      issue: normalizeRequestIssueValue(details.issue || booking.issue || booking.description)
    };
  }

  function normalizeServiceMode(rawBooking) {
    const booking = Object.assign({}, rawBooking || {});
    const direct = String(booking.serviceMode || '').trim();
    if (direct) return direct;

    const bookingType = String(booking.bookingType || '').toLowerCase();
    const requestMode = String(booking.requestMode || '').toLowerCase();
    if (bookingType === 'appointment' || requestMode === 'drop-off-store') return 'Store Drop-Off';
    return 'Home Service';
  }

  function inferRequestCodePrefix(rawBooking) {
    const booking = Object.assign({}, rawBooking || {});
    const bookingType = String(booking.bookingType || '').trim().toLowerCase();
    const requestMode = String(booking.requestMode || '').trim().toLowerCase();
    const serviceMode = String(booking.serviceMode || normalizeServiceMode(booking)).trim().toLowerCase();
    const isStoreDropOff = bookingType === 'appointment'
      || requestMode === 'drop-off-store'
      || serviceMode.includes('drop-off')
      || serviceMode.includes('store');
    return isStoreDropOff ? 'SD' : 'HS';
  }

  function toStableCodeDigits(source) {
    const text = String(source || '').trim();
    if (!text) return '00000';
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash * 33) + text.charCodeAt(i)) >>> 0;
    }
    return String(hash % 100000).padStart(5, '0');
  }

  function buildRequestCode(rawBooking, requestId) {
    const id = String(requestId || '').trim();
    if (!id) return 'N/A';
    const prefix = inferRequestCodePrefix(rawBooking);
    return `${prefix}-${toStableCodeDigits(id)}`;
  }

  function buildCustomerCode(customerUid) {
    const uid = String(customerUid || '').trim();
    if (!uid) return '';
    return `C-${toStableCodeDigits(uid)}`;
  }

  function normalizeCustomerCode(rawCode, uidFallback) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (code.startsWith('CUS-')) return `C-${code.slice(4)}`;
    if (code.startsWith('C-')) return code;
    return buildCustomerCode(uidFallback);
  }

  function buildHierarchicalBooking(rawBooking, requestId, createdAtValue) {
    const booking = Object.assign({}, rawBooking || {});
    const preferredDate = String(booking.preferredDate || '').trim();
    const preferredTime = String(booking.preferredTime || '').trim();
    const status = String(booking.status || 'pending').trim() || 'pending';

    return {
      requestId: String(requestId || '').trim(),
      requestCode: buildRequestCode(booking, requestId),
      customerId: String(booking.customerId || '').trim(),
      customerCode: normalizeCustomerCode(booking.customerCode, booking.customerId),
      createdAt: createdAtValue,
      serviceMode: normalizeServiceMode(booking),
      bookingType: String(booking.bookingType || '').trim(),
      requestMode: String(booking.requestMode || '').trim(),
      requestDetails: normalizeRequestDetails(booking),
      assignedTechnicianId: String(booking.assignedTechnicianId || booking.technicianId || '').trim(),
      technicianId: String(booking.technicianId || booking.assignedTechnicianId || '').trim(),
      assignedTechnicianEmail: String(booking.assignedTechnicianEmail || booking.technicianEmail || '').trim().toLowerCase(),
      technicianEmail: String(booking.technicianEmail || booking.assignedTechnicianEmail || '').trim().toLowerCase(),
      assignedTechnicianName: String(booking.assignedTechnicianName || booking.technicianName || '').trim(),
      technicianName: String(booking.technicianName || booking.assignedTechnicianName || '').trim(),
      createdByRole: String(booking.createdByRole || '').trim(),
      createdBySessionId: String(booking.createdBySessionId || '').trim(),
      createdBySessionLogId: String(booking.createdBySessionLogId || '').trim(),
      preferredDate,
      preferredTime,
      status,
      location: booking.location && typeof booking.location === 'object' ? booking.location : {},
      media: Array.isArray(booking.media) ? booking.media : []
    };
  }

  function readSessionStorageValue(key) {
    try {
      return String(sessionStorage.getItem(key) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function getRequestSessionTrace() {
    const usersDb = window.usersDatabase || window.homefixDB || null;
    const customerTrace = usersDb && typeof usersDb.getActiveRoleSession === 'function'
      ? (usersDb.getActiveRoleSession('customer') || {})
      : {};
    const technicianTrace = usersDb && typeof usersDb.getActiveRoleSession === 'function'
      ? (usersDb.getActiveRoleSession('technician') || {})
      : {};

    const customerSessionId = String(customerTrace && customerTrace.sessionId || '').trim() || readSessionStorageValue('hfs_customer_session_id');
    const customerLogId = String(customerTrace && customerTrace.logId || '').trim() || readSessionStorageValue('hfs_customer_login_log_id');
    const technicianSessionId = String(technicianTrace && technicianTrace.sessionId || '').trim() || readSessionStorageValue('hfs_technician_session_id');
    const technicianLogId = String(technicianTrace && technicianTrace.logId || '').trim() || readSessionStorageValue('hfs_technician_login_log_id');

    if (customerSessionId || customerLogId) {
      return {
        role: 'customer',
        sessionId: customerSessionId,
        logId: customerLogId
      };
    }

    if (technicianSessionId || technicianLogId) {
      return {
        role: 'technician',
        sessionId: technicianSessionId,
        logId: technicianLogId
      };
    }

    return {
      role: '',
      sessionId: '',
      logId: ''
    };
  }

  function parseCreatedTime(value) {
    if (value == null) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    if (value && typeof value.toDate === 'function') return value.toDate().getTime();
    return 0;
  }

  function getLocalRequestsForUser(customerId) {
    const requests = core.readJson(core.STORAGE_KEYS.requests, []);
    return requests
      .filter((r) => String(r && r.customerId || '') === String(customerId || ''))
      .sort((a, b) => parseCreatedTime(b && b.createdAt) - parseCreatedTime(a && a.createdAt));
  }

  function isPermissionDeniedError(err) {
    const code = String(err && err.code ? err.code : '').toLowerCase();
    const message = String(err && err.message ? err.message : '').toLowerCase();
    return code.includes('permission-denied') ||
      code.includes('permission_denied') ||
      message.includes('permission denied') ||
      message.includes('permission_denied');
  }

  function sortRequestsByCreatedAt(items) {
    return (Array.isArray(items) ? items : []).sort((a, b) => {
      return parseCreatedTime(b && b.createdAt) - parseCreatedTime(a && a.createdAt);
    });
  }

  function getRealtimeDb() {
    if (!core.firebase || typeof core.firebase.database !== 'function') {
      const err = new Error('Firebase Realtime Database SDK is unavailable. Add firebase-database-compat.js to your page.');
      err.code = 'database/not-available';
      throw err;
    }
    return core.firebase.database();
  }

  function getServerTimestamp() {
    try {
      if (core.firebase && core.firebase.database && core.firebase.database.ServerValue && core.firebase.database.ServerValue.TIMESTAMP) {
        return core.firebase.database.ServerValue.TIMESTAMP;
      }
    } catch (_) {
    }
    return Date.now();
  }

  function getRequestTechnicianIdentity(request) {
    const item = request && typeof request === 'object' ? request : {};
    const details = item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};

    return {
      technicianId: String(item.assignedTechnicianId || item.technicianId || details.selectedTechnicianId || '').trim(),
      technicianEmail: String(item.assignedTechnicianEmail || item.technicianEmail || details.selectedTechnicianEmail || '').trim().toLowerCase()
    };
  }

  function isCompletedRequestStatus(value) {
    const status = String(value || '').trim().toLowerCase();
    return status === 'completed' || status === 'finished';
  }

  function normalizeReviewRating(value) {
    const rating = Number(value);
    if (!Number.isFinite(rating)) {
      const err = new Error('A valid rating is required.');
      err.code = 'validation/invalid-rating';
      throw err;
    }

    const normalized = Math.round(rating);
    if (normalized < 1 || normalized > 5) {
      const err = new Error('Rating must be between 1 and 5 stars.');
      err.code = 'validation/invalid-rating-range';
      throw err;
    }

    return normalized;
  }

  function normalizeReviewComment(value) {
    const comment = normalizeFreeText(value);
    if (comment.length > 500) {
      const err = new Error('Feedback must be 500 characters or less.');
      err.code = 'validation/review-too-long';
      throw err;
    }
    return comment;
  }

  function hasExistingCustomerReview(request) {
    const item = request && typeof request === 'object' ? request : {};
    const details = item.requestDetails && typeof item.requestDetails === 'object'
      ? item.requestDetails
      : {};

    if (item.hasCustomerReview === true || details.hasCustomerReview === true) return true;
    if (normalizeFreeText(item.reviewSubmittedAt || item.customerReviewedAt || item.ratingUpdatedAt)) return true;

    const ratingCandidates = [
      item.customerRating,
      item.reviewRating,
      item.rating,
      details.customerRating,
      details.reviewRating,
      details.rating
    ];

    for (let index = 0; index < ratingCandidates.length; index += 1) {
      const numeric = Number(ratingCandidates[index]);
      if (Number.isFinite(numeric) && numeric > 0) return true;
    }

    const commentCandidates = [
      item.reviewComment,
      item.customerFeedback,
      item.feedback,
      item.reviewText,
      details.reviewComment,
      details.customerFeedback,
      details.feedback,
      details.reviewText
    ];

    return commentCandidates.some((entry) => normalizeFreeText(entry));
  }

  function mapRealtimeSnapshotItems(snapshot) {
    const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
    const items = Object.keys(value).map((id) => {
      const data = value[id] && typeof value[id] === 'object' ? value[id] : {};
      return Object.assign({ id, requestId: String(data.requestId || id) }, data);
    });
    return sortRequestsByCreatedAt(items);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  async function getAuthenticatedUid(waitMs = 4000) {
    const currentUid = String(core.auth && core.auth.currentUser && core.auth.currentUser.uid ? core.auth.currentUser.uid : '').trim();
    if (currentUid) return currentUid;

    if (!core.auth || typeof core.auth.onAuthStateChanged !== 'function') {
      return '';
    }

    return new Promise((resolve) => {
      let settled = false;
      let unsubscribe = null;
      const done = (uid) => {
        if (settled) return;
        settled = true;
        if (typeof unsubscribe === 'function') {
          try { unsubscribe(); } catch (_) {}
        }
        resolve(String(uid || '').trim());
      };

      const timer = setTimeout(() => {
        done('');
      }, Math.max(500, Number(waitMs) || 4000));

      unsubscribe = core.auth.onAuthStateChanged((user) => {
        const uid = String(user && user.uid ? user.uid : '').trim();
        if (!uid) return;
        clearTimeout(timer);
        done(uid);
      });
    });
  }

  function buildMinimalCreatePayload(fullPayload, authUid, requestId) {
    const payload = fullPayload && typeof fullPayload === 'object' ? fullPayload : {};
    return {
      requestId: String(payload.requestId || requestId || '').trim(),
      customerId: String(authUid || '').trim(),
      customerCode: String(payload.customerCode || buildCustomerCode(authUid) || '').trim(),
      createdAt: Date.now(),
      status: String(payload.status || 'pending').trim() || 'pending'
    };
  }

  function normalizeTimeRangeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\u2013|\u2014/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/\s*-\s*/g, '-');
  }

  function normalizeStatusKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  }

  function isBlockingScheduleStatus(value) {
    const status = normalizeStatusKey(value);
    if (!status) return true;
    if (status === 'cancelled'
      || status === 'declined'
      || status === 'rejected'
      || status === 'completed'
      || status === 'done'
      || status === 'resolved'
      || status === 'no-show') {
      return false;
    }
    return status === 'reserved'
      || status === 'pending'
      || status === 'offered'
      || status === 'accepted'
      || status === 'confirmed'
      || status === 'approved'
      || status === 'in-progress'
      || status === 'ongoing';
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getTechnicianIdentityFromRequest(item) {
    const request = item && typeof item === 'object' ? item : {};
    const details = request.requestDetails && typeof request.requestDetails === 'object'
      ? request.requestDetails
      : {};
    const id = String(
      request.assignedTechnicianId
      || request.technicianId
      || details.selectedTechnicianId
      || ''
    ).trim();
    const email = normalizeEmail(
      request.assignedTechnicianEmail
      || request.technicianEmail
      || details.selectedTechnicianEmail
      || ''
    );
    return { id, email };
  }

  function getTechnicianIdentityFromBooking(booking) {
    const item = booking && typeof booking === 'object' ? booking : {};
    return {
      id: String(item.assignedTechnicianId || item.technicianId || '').trim(),
      email: normalizeEmail(item.assignedTechnicianEmail || item.technicianEmail || '')
    };
  }

  function getRequestSchedule(item) {
    const request = item && typeof item === 'object' ? item : {};
    return {
      date: toIsoDate(String(request.preferredDate || '').trim()),
      time: normalizeTimeRangeKey(request.preferredTime)
    };
  }

  function hasScheduleConflict(existingRequest, nextBooking) {
    const existing = existingRequest && typeof existingRequest === 'object' ? existingRequest : {};
    if (!isBlockingScheduleStatus(existing.status)) return false;

    const existingSchedule = getRequestSchedule(existing);
    const targetSchedule = getRequestSchedule(nextBooking);
    if (!existingSchedule.date || !existingSchedule.time || !targetSchedule.date || !targetSchedule.time) return false;
    if (existingSchedule.date !== targetSchedule.date || existingSchedule.time !== targetSchedule.time) return false;

    const nextBookingType = String(nextBooking && nextBooking.bookingType || '').trim().toLowerCase();
    if (nextBookingType === 'technician') {
      const existingTech = getTechnicianIdentityFromRequest(existing);
      const targetTech = getTechnicianIdentityFromBooking(nextBooking);
      if (targetTech.id && existingTech.id && targetTech.id === existingTech.id) return true;
      if (targetTech.email && existingTech.email && targetTech.email === existingTech.email) return true;
      return false;
    }

    const existingBookingType = String(existing && existing.bookingType || '').trim().toLowerCase();
    const existingRequestMode = String(existing && existing.requestMode || '').trim().toLowerCase();
    const existingServiceMode = String(existing && existing.serviceMode || '').trim().toLowerCase();
    return existingBookingType === 'appointment'
      || existingRequestMode === 'drop-off-store'
      || existingServiceMode.includes('drop-off')
      || existingServiceMode.includes('store');
  }

  function buildSlotUnavailableError() {
    const err = new Error('This schedule is already booked. Please choose another time slot.');
    err.code = 'booking/slot-unavailable';
    return err;
  }

  const SLOT_HOLD_MS = 15 * 60 * 1000;

  function toSafeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[.#$\[\]\/]/g, '_');
  }

  function getScheduleLockScope(booking) {
    const item = booking && typeof booking === 'object' ? booking : {};
    const bookingType = String(item.bookingType || '').trim().toLowerCase();
    if (bookingType !== 'technician') return null;

    const preferredDate = toIsoDate(String(item.preferredDate || '').trim());
    const preferredTime = normalizeTimeRangeKey(item.preferredTime);
    const technician = getTechnicianIdentityFromBooking(item);
    const technicianKey = toSafeKey(technician.id || technician.email || '');

    if (!technicianKey || !preferredDate || !preferredTime) return null;

    return {
      namespace: 'technician',
      technicianKey,
      preferredDate,
      preferredTime,
      timeKey: toSafeKey(preferredTime),
      path: `scheduleLocks/technician/${technicianKey}/${preferredDate}/${toSafeKey(preferredTime)}`
    };
  }

  function buildReservedLockPayload(booking, requestId, customerId) {
    const lockScope = getScheduleLockScope(booking);
    const technician = getTechnicianIdentityFromBooking(booking);
    return {
      state: 'reserved',
      requestId: String(requestId || '').trim(),
      customerId: String(customerId || '').trim(),
      technicianId: String(technician.id || '').trim(),
      technicianEmail: String(technician.email || '').trim(),
      preferredDate: String(lockScope && lockScope.preferredDate || '').trim(),
      preferredTime: String(lockScope && lockScope.preferredTime || '').trim(),
      createdAt: Date.now(),
      expiresAt: Date.now() + SLOT_HOLD_MS,
      updatedAt: Date.now()
    };
  }

  function isAcceptedLockState(value) {
    const state = normalizeStatusKey(value);
    return state === 'accepted'
      || state === 'confirmed'
      || state === 'approved'
      || state === 'in-progress'
      || state === 'ongoing';
  }

  function isLockStateReleased(value) {
    const state = normalizeStatusKey(value);
    return state === 'declined'
      || state === 'rejected'
      || state === 'cancelled'
      || state === 'completed'
      || state === 'done'
      || state === 'resolved'
      || state === 'no-show';
  }

  async function acquireScheduleLockHold(db, booking, requestId, customerId) {
    const lockScope = getScheduleLockScope(booking);
    if (!lockScope) return null;

    const payload = buildReservedLockPayload(booking, requestId, customerId);
    const lockRef = db.ref(lockScope.path);

    const txnResult = await lockRef.transaction((current) => {
      const now = Date.now();
      const data = current && typeof current === 'object' ? current : null;
      if (!data) return payload;

      const currentRequestId = String(data.requestId || '').trim();
      const currentState = normalizeStatusKey(data.state || data.status);
      const currentExpiry = Number(data.expiresAt || 0);

      if (currentRequestId && currentRequestId === String(requestId || '').trim()) {
        if (isAcceptedLockState(currentState)) return data;
        return Object.assign({}, data, payload);
      }

      if (isAcceptedLockState(currentState)) return;

      const activeReserved = currentState === 'reserved' && currentExpiry > now;
      if (activeReserved) return;

      return Object.assign({}, data, payload);
    });

    if (!txnResult || !txnResult.committed) {
      throw buildSlotUnavailableError();
    }

    return lockScope;
  }

  async function readRequestForLockSync(requestId, mode) {
    const id = String(requestId || '').trim();
    if (!id) return null;

    if (mode === 'firebase') {
      const db = getRealtimeDb();
      const snapshot = await db.ref(`requests/${id}`).once('value');
      if (!snapshot.exists()) return null;
      return Object.assign({ id, requestId: id }, snapshot.val() || {});
    }

    const requests = core.readJson(core.STORAGE_KEYS.requests, []);
    const found = (Array.isArray(requests) ? requests : []).find((item) => String(item && (item.requestId || item.id) || '').trim() === id);
    return found || null;
  }

  async function syncScheduleLockForRequest(requestId, nextStatus, requestData, mode) {
    const id = String(requestId || '').trim();
    if (!id) return false;

    const effectiveMode = mode || core.mode;
    const request = requestData && typeof requestData === 'object'
      ? requestData
      : await readRequestForLockSync(id, effectiveMode);
    if (!request) return false;

    const lockScope = getScheduleLockScope(request);
    if (!lockScope) return false;

    const normalizedStatus = normalizeStatusKey(nextStatus || request.status || '');
    if (!normalizedStatus) return false;

    if (effectiveMode === 'firebase') {
      const db = getRealtimeDb();
      const lockRef = db.ref(lockScope.path);

      if (isAcceptedLockState(normalizedStatus)) {
        await lockRef.transaction((current) => {
          const existing = current && typeof current === 'object' ? current : {};
          const currentRequestId = String(existing.requestId || '').trim();
          if (currentRequestId && currentRequestId !== id && isAcceptedLockState(existing.state || existing.status)) {
            return existing;
          }
          return {
            state: 'accepted',
            requestId: id,
            customerId: String(request.customerId || '').trim(),
            technicianId: String(request.assignedTechnicianId || request.technicianId || '').trim(),
            technicianEmail: normalizeEmail(request.assignedTechnicianEmail || request.technicianEmail || ''),
            preferredDate: lockScope.preferredDate,
            preferredTime: lockScope.preferredTime,
            createdAt: Number(existing.createdAt || Date.now()),
            updatedAt: Date.now(),
            acceptedAt: Date.now(),
            expiresAt: 0
          };
        });
        return true;
      }

      if (isLockStateReleased(normalizedStatus)) {
        await lockRef.transaction((current) => {
          const existing = current && typeof current === 'object' ? current : null;
          if (!existing) return existing;
          const currentRequestId = String(existing.requestId || '').trim();
          if (!currentRequestId || currentRequestId === id) return null;
          return existing;
        });
        return true;
      }

      return false;
    }

    return false;
  }

  async function assertNoScheduleConflict(nextBooking, mode) {
    const booking = nextBooking && typeof nextBooking === 'object' ? nextBooking : {};
    const bookingType = String(booking.bookingType || '').trim().toLowerCase();
    if (bookingType !== 'technician' && bookingType !== 'appointment') return;

    const scheduleDate = toIsoDate(String(booking.preferredDate || '').trim());
    const scheduleTime = normalizeTimeRangeKey(booking.preferredTime);
    const tech = getTechnicianIdentityFromBooking(booking);
    const hasScopeIdentity = bookingType === 'technician'
      ? !!(tech.id || tech.email)
      : true;
    if (!scheduleDate || !scheduleTime || !hasScopeIdentity) return;

    if (mode === 'firebase') {
      const db = getRealtimeDb();
      const snapshot = await db.ref('requests').orderByChild('preferredDate').equalTo(scheduleDate).once('value');
      const candidates = mapRealtimeSnapshotItems(snapshot);
      const conflict = candidates.some((item) => hasScheduleConflict(item, booking));
      if (conflict) throw buildSlotUnavailableError();
      return;
    }

    const requests = core.readJson(core.STORAGE_KEYS.requests, []);
    const conflict = (Array.isArray(requests) ? requests : []).some((item) => hasScheduleConflict(item, booking));
    if (conflict) throw buildSlotUnavailableError();
  }

  async function ensureFreshAuthToken() {
    try {
      const current = core && core.auth ? core.auth.currentUser : null;
      if (current && typeof current.getIdToken === 'function') {
        await current.getIdToken(true);
      }
    } catch (_) {
    }
  }

  async function createRequestWithRetry(ref, payload, authUid) {
    try {
      await ref.set(payload);
      return;
    } catch (err) {
      if (!isPermissionDeniedError(err)) throw err;

      await ensureFreshAuthToken();
      await sleep(180);

      const retriedPayload = Object.assign({}, payload, {
        customerId: String(authUid || '').trim(),
        createdAt: Date.now(),
        status: 'pending'
      });

      try {
        await ref.set(retriedPayload);
        return;
      } catch (retryErr) {
        if (!isPermissionDeniedError(retryErr)) throw retryErr;

        const uid = String(authUid || '').trim();
        if (!uid) throw retryErr;

        // Fallback for stricter rulesets: seed create with required owner field first.
        await ref.child('customerId').set(uid);
        await Promise.all([
          ref.child('requestId').set(String(payload && payload.requestId ? payload.requestId : ref.key || '').trim()),
          ref.child('status').set('pending'),
          ref.child('createdAt').set(Date.now())
        ]);
      }
    }
  }

  const bookingDatabase = {
    mode: core.mode,
    firebase: core.firebase,
    auth: core.auth,

    formatRequestCode(requestLike, requestIdOverride) {
      const request = requestLike && typeof requestLike === 'object' ? requestLike : {};
      const rawCode = String(request.requestCode || '').trim();
      if (rawCode) return rawCode;
      const id = String(requestIdOverride || request.requestId || request.id || '').trim();
      if (!id) return 'N/A';
      return buildRequestCode(request, id);
    },

    async addBookingRequest(booking) {
      const normalizedSchedule = normalizeScheduleFields(booking);
      const normalizedBooking = normalizeMediaFields(normalizedSchedule);
      const finalBooking = normalizeRequestFields(normalizedBooking);

      if (core.mode === 'firebase') {
        const authUid = await getAuthenticatedUid();
        if (!authUid) {
          const err = new Error('Your session expired. Please sign in again.');
          err.code = 'auth/unauthenticated';
          throw err;
        }

        finalBooking.customerId = authUid;
        finalBooking.customerCode = buildCustomerCode(authUid);
        finalBooking.status = 'pending';

        const sessionTrace = getRequestSessionTrace();
        finalBooking.createdByRole = sessionTrace.role || 'customer';
        finalBooking.createdBySessionId = sessionTrace.sessionId;
        finalBooking.createdBySessionLogId = sessionTrace.logId;

        await assertNoScheduleConflict(finalBooking, 'firebase');

        try {
          const db = getRealtimeDb();
          const ref = db.ref('requests').push();
          const payload = buildHierarchicalBooking(finalBooking, ref.key, getServerTimestamp());
          await acquireScheduleLockHold(db, payload, ref.key, authUid);
          const minimalPayload = buildMinimalCreatePayload(payload, authUid, ref.key);
          await createRequestWithRetry(ref, minimalPayload, authUid);

          const hydrationPayload = Object.assign({}, payload, {
            customerId: String(authUid || '').trim(),
            status: 'pending'
          });

          try {
            await ref.update(hydrationPayload);
          } catch (hydrateErr) {
            if (!isPermissionDeniedError(hydrateErr)) throw hydrateErr;
            console.warn('Request created with minimal payload; optional fields update was denied by rules.', hydrateErr);
          }
          return ref.key;
        } catch (err) {
          throw err;
        }
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const requests = core.readJson(core.STORAGE_KEYS.requests, []);
      const id = 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
      const sessionTrace = getRequestSessionTrace();
      finalBooking.createdByRole = sessionTrace.role || 'customer';
      finalBooking.createdBySessionId = sessionTrace.sessionId;
      finalBooking.createdBySessionLogId = sessionTrace.logId;
      await assertNoScheduleConflict(finalBooking, 'local');
      const payload = buildHierarchicalBooking(finalBooking, id, core.nowIso());
      requests.push(Object.assign({ id }, payload));
      core.writeJson(core.STORAGE_KEYS.requests, requests);
      return id;
    },

    async getBookingsForUser(customerId) {
      if (core.mode === 'firebase') {
        try {
          const db = getRealtimeDb();
          const query = db.ref('requests').orderByChild('customerId').equalTo(String(customerId || ''));
          const snapshot = await query.once('value');
          return mapRealtimeSnapshotItems(snapshot);
        } catch (err) {
          throw err;
        }
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      return getLocalRequestsForUser(customerId);
    },

    async getAllRequests() {
      if (core.mode === 'firebase') {
        try {
          const db = getRealtimeDb();
          const snapshot = await db.ref('requests').once('value');
          return mapRealtimeSnapshotItems(snapshot);
        } catch (err) {
          throw err;
        }
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const requests = core.readJson(core.STORAGE_KEYS.requests, []);
      return sortRequestsByCreatedAt(requests.slice());
    },

    subscribeBookingsForUser(customerId, onData, onError) {
      const safeOnData = typeof onData === 'function' ? onData : function () {};
      const safeOnError = typeof onError === 'function' ? onError : function () {};

      if (core.mode === 'firebase') {
        try {
          const db = getRealtimeDb();
          const query = db.ref('requests').orderByChild('customerId').equalTo(String(customerId || ''));
          const success = (snapshot) => safeOnData(mapRealtimeSnapshotItems(snapshot));
          const failure = (err) => {
            safeOnError(err);
          };

          query.on('value', success, failure);
          return function unsubscribe() {
            query.off('value', success);
          };
        } catch (err) {
          safeOnError(err);
          return function unsubscribe() {};
        }
      }

      if (core.forceFirebaseOnly) {
        safeOnError(core.buildFirebaseRequiredError());
        return function unsubscribe() {};
      }

      safeOnData(getLocalRequestsForUser(customerId));
      return function unsubscribe() {};
    },

    subscribeAllRequests(onData, onError) {
      const safeOnData = typeof onData === 'function' ? onData : function () {};
      const safeOnError = typeof onError === 'function' ? onError : function () {};

      if (core.mode === 'firebase') {
        try {
          const db = getRealtimeDb();
          const ref = db.ref('requests');
          const success = (snapshot) => safeOnData(mapRealtimeSnapshotItems(snapshot));
          const failure = (err) => {
            safeOnError(err);
          };

          ref.on('value', success, failure);
          return function unsubscribe() {
            ref.off('value', success);
          };
        } catch (err) {
          safeOnError(err);
          return function unsubscribe() {};
        }
      }

      if (core.forceFirebaseOnly) {
        safeOnError(core.buildFirebaseRequiredError());
        return function unsubscribe() {};
      }

      const requests = core.readJson(core.STORAGE_KEYS.requests, []);
      safeOnData(sortRequestsByCreatedAt(requests.slice()));
      return function unsubscribe() {};
    },

    async updateBookingRequestStatus(requestId, nextStatus, metaUpdates) {
      const id = String(requestId || '').trim();
      const status = String(nextStatus || '').trim();
      const extra = metaUpdates && typeof metaUpdates === 'object' ? metaUpdates : {};
      if (!id || !status) return false;

      if (core.mode === 'firebase') {
        const db = getRealtimeDb();
        const ref = db.ref(`requests/${id}`);
        const snapshot = await ref.once('value');
        if (!snapshot.exists()) return false;
        const updates = Object.assign({}, extra, {
          status,
          updatedAt: getServerTimestamp(),
          technicianUpdatedAt: getServerTimestamp()
        });
        await ref.update(updates);
        const mergedRequest = Object.assign({ id, requestId: id }, snapshot.val() || {}, updates);
        await syncScheduleLockForRequest(id, status, mergedRequest, 'firebase');
        return true;
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const requests = core.readJson(core.STORAGE_KEYS.requests, []);
      const index = requests.findIndex((item) => String(item && item.id || '') === id);
      if (index < 0) return false;
      requests[index] = Object.assign({}, requests[index], extra, { status, updatedAt: core.nowIso(), technicianUpdatedAt: core.nowIso() });
      core.writeJson(core.STORAGE_KEYS.requests, requests);
      await syncScheduleLockForRequest(id, status, requests[index], 'local');
      return true;
    },

    async cancelBookingRequest(requestId, customerId) {
      if (!requestId) return false;

      if (core.mode === 'firebase') {
        const db = getRealtimeDb();
        const ref = db.ref(`requests/${String(requestId || '').trim()}`);
        const snapshot = await ref.once('value');
        if (!snapshot.exists()) return false;

        const data = snapshot.val() || {};
        if (String(data.customerId || '') !== String(customerId || '')) return false;
        const status = String(data.status || '').toLowerCase();
        if (status !== 'pending' && status !== 'offered' && status !== 'accepted' && status !== 'confirmed') return false;

        await ref.update({
          status: 'cancelled',
          updatedAt: getServerTimestamp(),
          cancelledAt: getServerTimestamp()
        });
        const mergedRequest = Object.assign({ id: String(requestId || '').trim(), requestId: String(requestId || '').trim() }, data, {
          status: 'cancelled'
        });
        await syncScheduleLockForRequest(String(requestId || '').trim(), 'cancelled', mergedRequest, 'firebase');
        return true;
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const requests = core.readJson(core.STORAGE_KEYS.requests, []);
      const index = requests.findIndex((item) => String(item.id) === String(requestId) && String(item.customerId) === String(customerId));
      if (index < 0) return false;
      const status = String(requests[index].status || '').toLowerCase();
      if (status !== 'pending' && status !== 'offered' && status !== 'accepted' && status !== 'confirmed') return false;
      requests[index] = Object.assign({}, requests[index], { status: 'cancelled', updatedAt: core.nowIso(), cancelledAt: core.nowIso() });
      core.writeJson(core.STORAGE_KEYS.requests, requests);
      await syncScheduleLockForRequest(String(requestId || '').trim(), 'cancelled', requests[index], 'local');
      return true;
    },

    async saveBookingRequestReview(requestId, customerId, reviewData) {
      const id = String(requestId || '').trim();
      const uid = String(customerId || '').trim();
      const payload = reviewData && typeof reviewData === 'object' ? reviewData : {};
      if (!id || !uid) return false;

      const rating = normalizeReviewRating(payload.rating);
      const comment = normalizeReviewComment(payload.comment);

      if (core.mode === 'firebase') {
        const db = getRealtimeDb();
        const ref = db.ref(`requests/${id}`);
        const snapshot = await ref.once('value');
        if (!snapshot.exists()) return false;

        const existing = snapshot.val() || {};
        if (String(existing.customerId || '').trim() !== uid) return false;
        if (!isCompletedRequestStatus(existing.status)) return false;
        if (hasExistingCustomerReview(existing)) {
          const err = new Error('This request has already been rated and can no longer be edited.');
          err.code = 'review/already-submitted';
          throw err;
        }

        const technicianIdentity = getRequestTechnicianIdentity(existing);
        if (!technicianIdentity.technicianId && !technicianIdentity.technicianEmail) return false;

        const timestamp = getServerTimestamp();
        const updates = {
          customerRating: rating,
          reviewRating: rating,
          rating,
          reviewComment: comment,
          customerFeedback: comment,
          feedback: comment,
          reviewText: comment,
          hasCustomerReview: true,
          reviewedByRole: 'customer',
          reviewSubmittedAt: timestamp,
          customerReviewedAt: timestamp,
          ratingUpdatedAt: timestamp,
          updatedAt: timestamp
        };

        await ref.update(updates);
        return true;
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const requests = core.readJson(core.STORAGE_KEYS.requests, []);
      const index = requests.findIndex((item) => String(item && item.id || '') === id);
      if (index < 0) return false;
      const existing = requests[index] || {};
      if (String(existing.customerId || '').trim() !== uid) return false;
      if (!isCompletedRequestStatus(existing.status)) return false;
      if (hasExistingCustomerReview(existing)) {
        const err = new Error('This request has already been rated and can no longer be edited.');
        err.code = 'review/already-submitted';
        throw err;
      }

      const technicianIdentity = getRequestTechnicianIdentity(existing);
      if (!technicianIdentity.technicianId && !technicianIdentity.technicianEmail) return false;

      requests[index] = Object.assign({}, existing, {
        customerRating: rating,
        reviewRating: rating,
        rating,
        reviewComment: comment,
        customerFeedback: comment,
        feedback: comment,
        reviewText: comment,
        hasCustomerReview: true,
        reviewedByRole: 'customer',
        reviewSubmittedAt: core.nowIso(),
        customerReviewedAt: core.nowIso(),
        ratingUpdatedAt: core.nowIso(),
        updatedAt: core.nowIso()
      });
      core.writeJson(core.STORAGE_KEYS.requests, requests);
      return true;
    },

    async syncScheduleLockForRequest(requestId, nextStatus) {
      return syncScheduleLockForRequest(requestId, nextStatus, null, core.mode);
    }
  };

  window.bookingDatabase = bookingDatabase;
})();
