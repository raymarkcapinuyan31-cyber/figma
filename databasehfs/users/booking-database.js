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
      issue: String(details.issue || booking.issue || booking.description || '').trim()
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
      requestDetails: normalizeRequestDetails(booking),
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

  function addLocalFallbackRequest(rawBooking) {
    const requests = core.readJson(core.STORAGE_KEYS.requests, []);
    const id = 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    const payload = buildHierarchicalBooking(rawBooking, id, core.nowIso());
    requests.push(Object.assign({ id }, payload));
    core.writeJson(core.STORAGE_KEYS.requests, requests);
    return id;
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

  function mapRealtimeSnapshotItems(snapshot) {
    const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
    const items = Object.keys(value).map((id) => {
      const data = value[id] && typeof value[id] === 'object' ? value[id] : {};
      return Object.assign({ id, requestId: String(data.requestId || id) }, data);
    });
    return sortRequestsByCreatedAt(items);
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

        const db = getRealtimeDb();
        const ref = db.ref('requests').push();
        const payload = buildHierarchicalBooking(finalBooking, ref.key, getServerTimestamp());
        await ref.set(payload);
        return ref.key;
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const requests = core.readJson(core.STORAGE_KEYS.requests, []);
      const id = 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
      const sessionTrace = getRequestSessionTrace();
      finalBooking.createdByRole = sessionTrace.role || 'customer';
      finalBooking.createdBySessionId = sessionTrace.sessionId;
      finalBooking.createdBySessionLogId = sessionTrace.logId;
      const payload = buildHierarchicalBooking(finalBooking, id, core.nowIso());
      requests.push(Object.assign({ id }, payload));
      core.writeJson(core.STORAGE_KEYS.requests, requests);
      return id;
    },

    async getBookingsForUser(customerId) {
      if (core.mode === 'firebase') {
        const db = getRealtimeDb();
        const query = db.ref('requests').orderByChild('customerId').equalTo(String(customerId || ''));
        const snapshot = await query.once('value');
        return mapRealtimeSnapshotItems(snapshot);
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      return getLocalRequestsForUser(customerId);
    },

    async getAllRequests() {
      if (core.mode === 'firebase') {
        const db = getRealtimeDb();
        const snapshot = await db.ref('requests').once('value');
        return mapRealtimeSnapshotItems(snapshot);
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
          const failure = (err) => safeOnError(err);

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
          const failure = (err) => safeOnError(err);

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
          technicianUpdatedAt: getServerTimestamp()
        });
        await ref.update(updates);
        return true;
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const requests = core.readJson(core.STORAGE_KEYS.requests, []);
      const index = requests.findIndex((item) => String(item && item.id || '') === id);
      if (index < 0) return false;
      requests[index] = Object.assign({}, requests[index], extra, { status, technicianUpdatedAt: core.nowIso() });
      core.writeJson(core.STORAGE_KEYS.requests, requests);
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
        if (status !== 'pending' && status !== 'offered') return false;

        await ref.update({
          status: 'cancelled',
          cancelledAt: getServerTimestamp()
        });
        return true;
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const requests = core.readJson(core.STORAGE_KEYS.requests, []);
      const index = requests.findIndex((item) => String(item.id) === String(requestId) && String(item.customerId) === String(customerId));
      if (index < 0) return false;
      const status = String(requests[index].status || '').toLowerCase();
      if (status !== 'pending' && status !== 'offered') return false;
      requests[index] = Object.assign({}, requests[index], { status: 'cancelled', cancelledAt: core.nowIso() });
      core.writeJson(core.STORAGE_KEYS.requests, requests);
      return true;
    }
  };

  window.bookingDatabase = bookingDatabase;
})();
