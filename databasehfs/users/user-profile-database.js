/*
  databasehfs/users/user-profile-database.js
  User auth/profile/address data access layer.
*/
(function () {
  const core = window.homefixUsersCore;
  if (!core) {
    console.error('user-profile-database requires databasehfs/users/core.js to be loaded first.');
    return;
  }

  const FUNCTIONS_REGION = 'asia-southeast1';
  const RTDB_CUSTOMERS_PATH = 'customers';
  const RTDB_TECHNICIANS_PATH = 'technicians';
  const RTDB_USERS_PATH = 'users';
  const PROFILE_LOOKUP_TTL_MS = 20000;
  const realtimeUserByIdCache = new Map();
  const realtimeUserByEmailCache = new Map();
  const realtimeLookupInFlight = new Map();

  function readLookupCache(map, key) {
    const item = map.get(key);
    if (!item) return null;
    if (item.expiresAt < Date.now()) {
      map.delete(key);
      return null;
    }
    return item.value;
  }

  function writeLookupCache(map, key, value) {
    map.set(key, {
      value: value == null ? null : Object.assign({}, value),
      expiresAt: Date.now() + PROFILE_LOOKUP_TTL_MS
    });
  }

  function invalidateRealtimeLookupCache(uid, email) {
    const cleanUid = String(uid || '').trim();
    const cleanEmail = core.normalizeEmail(email);
    if (cleanUid) {
      const idKey = `id:${cleanUid}`;
      realtimeUserByIdCache.delete(idKey);
      realtimeLookupInFlight.delete(idKey);
    }
    if (cleanEmail) {
      const emailKey = `email:${cleanEmail}`;
      realtimeUserByEmailCache.delete(emailKey);
      realtimeLookupInFlight.delete(emailKey);
    }
  }

  function runLookupOnce(key, loader) {
    if (realtimeLookupInFlight.has(key)) {
      return realtimeLookupInFlight.get(key);
    }

    const pending = (async () => {
      try {
        return await loader();
      } finally {
        realtimeLookupInFlight.delete(key);
      }
    })();

    realtimeLookupInFlight.set(key, pending);
    return pending;
  }

  function snapshotToSingleRecord(snapshot, rootPath) {
    if (!snapshot || !snapshot.exists()) return null;
    const map = snapshot.val() || {};
    const ids = Object.keys(map);
    if (!ids.length) return null;
    const id = ids[0];
    const data = map[id] && typeof map[id] === 'object' ? map[id] : {};
    return { path: rootPath, id, data };
  }

  function getDaysInMonth(month) {
    const monthMaxDays = {
      1: 31,
      2: 28,
      3: 31,
      4: 30,
      5: 31,
      6: 30,
      7: 31,
      8: 31,
      9: 30,
      10: 31,
      11: 30,
      12: 31
    };
    return monthMaxDays[month] || 0;
  }

  function titleCaseName(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((word) => word.split('-').map((part) => part ? (part.charAt(0).toUpperCase() + part.slice(1)) : '').join('-'))
      .join(' ');
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

  function buildCustomerCode(uid) {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid) return '';
    return `C-${toStableCodeDigits(cleanUid)}`;
  }

  function normalizeCustomerCode(rawCode, uidFallback) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (code.startsWith('CUS-')) return `C-${code.slice(4)}`;
    if (code.startsWith('C-')) return code;
    return buildCustomerCode(uidFallback);
  }

  function pickFirstValue(source, keys) {
    if (!source || typeof source !== 'object') return '';
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null) {
        const value = String(source[key]).trim();
        if (value) return value;
      }
    }
    return '';
  }

  function normalizeProfileRecord(record, fallbackId = '') {
    if (!record || typeof record !== 'object') return null;

    const normalized = Object.assign({}, record);
    const normalizedId = String(record.id || record.uid || fallbackId || '').trim();
    const normalizedEmail = core.normalizeEmail(pickFirstValue(record, ['email', 'emailAddress', 'email_address']));

    const firstName = pickFirstValue(record, ['first_name', 'firstName', 'firstname']);
    const middleName = pickFirstValue(record, ['middle_name', 'middleName', 'middlename']);
    const lastName = pickFirstValue(record, ['last_name', 'lastName', 'lastname']);
    const suffix = pickFirstValue(record, ['suffix', 'name_suffix', 'suffixName']);
    const birthdate = pickFirstValue(record, ['birthdate', 'birth_date', 'birthDate', 'date_of_birth']);
    const mobile = pickFirstValue(record, ['mobile_e164', 'mobileE164', 'mobile', 'phone_number', 'phoneNumber', 'phone']);

    normalized.id = normalizedId || normalized.id;
    normalized.uid = normalizedId || normalized.uid;
    if (normalizedId) {
      normalized.customerCode = normalizeCustomerCode(normalized.customerCode, normalizedId);
    }
    if (normalizedEmail) normalized.email = normalizedEmail;
    if (firstName) normalized.first_name = titleCaseName(firstName);
    if (middleName) {
      normalized.middle_name = titleCaseName(middleName);
    }
    if (lastName) normalized.last_name = titleCaseName(lastName);
    if (suffix) normalized.suffix = suffix;
    if (birthdate) normalized.birthdate = birthdate;
    if (mobile) normalized.mobile_e164 = mobile.startsWith('09') ? ('+63' + mobile.slice(1)) : mobile;

    return normalized;
  }

  async function resolveUserDoc(db, uid, emailHint) {
    const cleanUid = String(uid || '').trim();
    const authEmail = core.normalizeEmail(core.auth && core.auth.currentUser && core.auth.currentUser.email ? core.auth.currentUser.email : '');
    const cleanEmailHint = core.normalizeEmail(emailHint);
    const targetEmail = cleanEmailHint || authEmail;

    const directRef = db.collection('users').doc(cleanUid);

    if (cleanUid) {
      try {
        const directDoc = await directRef.get();
        if (directDoc.exists) {
          return { ref: directRef, id: directDoc.id, data: directDoc.data() || {} };
        }
      } catch (_) {
      }
    }

    const lookupCandidates = [];
    if (cleanUid) lookupCandidates.push({ field: 'uid', value: cleanUid });
    if (targetEmail) {
      lookupCandidates.push({ field: 'email', value: targetEmail });
      lookupCandidates.push({ field: 'emailAddress', value: targetEmail });
      lookupCandidates.push({ field: 'email_address', value: targetEmail });
    }

    for (let i = 0; i < lookupCandidates.length; i += 1) {
      const candidate = lookupCandidates[i];
      try {
        const q = await db.collection('users').where(candidate.field, '==', candidate.value).limit(1).get();
        if (!q.empty) {
          const d = q.docs[0];
          return { ref: d.ref, id: d.id, data: d.data() || {} };
        }
      } catch (_) {
      }
    }

    return { ref: directRef, id: cleanUid, data: null };
  }

  function normalizeProfileFields(rawUpdates) {
    const updates = Object.assign({}, rawUpdates || {});

    if (Object.prototype.hasOwnProperty.call(updates, 'first_name')) {
      updates.first_name = titleCaseName(updates.first_name);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'middle_name')) {
      updates.middle_name = titleCaseName(updates.middle_name);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'last_name')) {
      updates.last_name = titleCaseName(updates.last_name);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'suffix')) {
      updates.suffix = String(updates.suffix || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'mobile_e164')) {
      const rawMobile = String(updates.mobile_e164 || '').trim();
      updates.mobile_e164 = rawMobile.startsWith('09') ? ('+63' + rawMobile.slice(1)) : rawMobile;
    }

    return updates;
  }

  function isCalendarBirthdatePartsValid(month, day, year) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
    if (year < 1900 || year > 2026) return false;
    if (month < 1 || month > 12) return false;
    const maxDay = getDaysInMonth(month);
    if (day < 1 || day > maxDay) return false;
    return true;
  }

  function calculateAgeYears(birthdate, today) {
    const birth = new Date(birthdate.getFullYear(), birthdate.getMonth(), birthdate.getDate());
    const nowRef = today || new Date();
    const now = new Date(nowRef.getFullYear(), nowRef.getMonth(), nowRef.getDate());
    let years = now.getFullYear() - birth.getFullYear();
    const monthDelta = now.getMonth() - birth.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
      years -= 1;
    }
    return years;
  }

  function isValidBirthdateString(value) {
    if (value == null || value === '') return true;
    const text = String(value).trim();
    const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!slashMatch && !isoMatch) {
      return false;
    }

    let month;
    let day;
    let year;
    if (slashMatch) {
      month = Number(slashMatch[1]);
      day = Number(slashMatch[2]);
      year = Number(slashMatch[3]);
    } else {
      year = Number(isoMatch[1]);
      month = Number(isoMatch[2]);
      day = Number(isoMatch[3]);
    }
    if (!isCalendarBirthdatePartsValid(month, day, year)) return false;

    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime())) return false;
    if (parsed.getFullYear() !== year || (parsed.getMonth() + 1) !== month || parsed.getDate() !== day) return false;
    if (parsed > new Date()) return false;
    if (calculateAgeYears(parsed) < 16) return false;

    return true;
  }

  function assertValidBirthdate(profileOrUpdates) {
    if (!profileOrUpdates || typeof profileOrUpdates !== 'object') return;
    if (!Object.prototype.hasOwnProperty.call(profileOrUpdates, 'birthdate')) return;
    if (isValidBirthdateString(profileOrUpdates.birthdate)) return;

    const err = new Error('Please enter a valid birthdate.');
    err.code = 'profile/invalid-birthdate';
    throw err;
  }

  function getFunctionsService() {
    if (!core.firebase) return null;

    if (typeof core.firebase.app === 'function') {
      try {
        const app = core.firebase.app();
        if (app && typeof app.functions === 'function') {
          return app.functions(FUNCTIONS_REGION);
        }
      } catch (_) {
      }
    }

    if (typeof core.firebase.functions === 'function') {
      try {
        return core.firebase.functions();
      } catch (_) {
      }
    }

    return null;
  }

  const REGISTER_TEMP_PASSWORD_STORAGE_KEY = 'hfs_register_temp_passwords';

  function getStoredRegisterTempPassword(email) {
    try {
      const key = core.normalizeEmail(email);
      if (!key) return '';
      const map = JSON.parse(localStorage.getItem(REGISTER_TEMP_PASSWORD_STORAGE_KEY) || '{}');
      return String(map[key] || '');
    } catch (_) {
      return '';
    }
  }

  function buildRegisterTempPassword(email) {
    const seed = core.normalizeEmail(email);
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) >>> 0;
    }
    const token = (hash || 0).toString(36).padStart(6, '0').slice(-6);
    return `T${token}a1!`;
  }

  async function trySignInForVerificationEmail(email) {
    const targetEmail = core.normalizeEmail(email);
    if (!targetEmail || !core.auth || typeof core.auth.signInWithEmailAndPassword !== 'function') return false;

    const candidates = [
      getStoredRegisterTempPassword(targetEmail),
      buildRegisterTempPassword(targetEmail)
    ].filter(Boolean);

    const tried = new Set();
    for (const candidate of candidates) {
      if (tried.has(candidate)) continue;
      tried.add(candidate);
      try {
        await core.auth.signInWithEmailAndPassword(targetEmail, candidate);
        const signedInEmail = core.normalizeEmail(core.auth.currentUser && core.auth.currentUser.email ? core.auth.currentUser.email : '');
        if (signedInEmail === targetEmail) return true;
      } catch (_) {
      }
    }

    return false;
  }

  function hasRealtimeDatabase() {
    return !!(core.firebase && typeof core.firebase.database === 'function');
  }

  function getRealtimeDb() {
    if (!hasRealtimeDatabase()) return null;
    try {
      return core.firebase.database();
    } catch (_) {
      return null;
    }
  }

  function getDbTimestamp() {
    const db = getRealtimeDb();
    if (db && db.constructor && db.constructor.ServerValue && db.constructor.ServerValue.TIMESTAMP) {
      return db.constructor.ServerValue.TIMESTAMP;
    }
    if (core.firebase && core.firebase.database && core.firebase.database.ServerValue && core.firebase.database.ServerValue.TIMESTAMP) {
      return core.firebase.database.ServerValue.TIMESTAMP;
    }
    return Date.now();
  }

  function parseTimeValue(value) {
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

  function sortByCreatedAtDesc(items) {
    return (Array.isArray(items) ? items : []).sort((a, b) => {
      return parseTimeValue(b && b.createdAt) - parseTimeValue(a && a.createdAt);
    });
  }

  function isTechnicianRole(value) {
    return String(value || '').trim().toLowerCase() === 'technician';
  }

  function isCustomerRole(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized || normalized === 'customer';
  }

  function isKnownRole(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'customer' || normalized === 'technician' || normalized === 'admin';
  }

  function isNonCustomerRole(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'technician' || normalized === 'admin';
  }

  function isAdminRole(value) {
    return String(value || '').trim().toLowerCase() === 'admin';
  }

  function getPreferredUserRootByRole(roleValue) {
    if (isCustomerRole(roleValue)) return RTDB_CUSTOMERS_PATH;
    if (isTechnicianRole(roleValue)) return RTDB_TECHNICIANS_PATH;
    return RTDB_USERS_PATH;
  }

  async function migrateCustomerNodeToCustomers(rtdb, uid, sourceData) {
    const cleanUid = String(uid || '').trim();
    if (!rtdb || !cleanUid) return;

    const source = sourceData && typeof sourceData === 'object' ? sourceData : {};
    const payload = Object.assign({}, source, {
      uid: cleanUid,
      role: 'customer',
      updatedAt: getDbTimestamp()
    });

    await rtdb.ref(`${RTDB_CUSTOMERS_PATH}/${cleanUid}`).update(payload);
    if (source && source.addresses && typeof source.addresses === 'object') {
      await rtdb.ref(`${RTDB_CUSTOMERS_PATH}/${cleanUid}/addresses`).update(source.addresses);
    }
    try {
      await rtdb.ref(`${RTDB_TECHNICIANS_PATH}/${cleanUid}`).remove();
    } catch (_) {
    }
    try {
      await rtdb.ref(`${RTDB_USERS_PATH}/${cleanUid}`).remove();
    } catch (_) {
    }
  }

  async function migrateTechnicianNodeToTechnicians(rtdb, uid, sourceData) {
    const cleanUid = String(uid || '').trim();
    if (!rtdb || !cleanUid) return;

    const source = sourceData && typeof sourceData === 'object' ? sourceData : {};
    const payload = Object.assign({}, source, {
      uid: cleanUid,
      role: 'technician',
      updatedAt: getDbTimestamp()
    });

    await rtdb.ref(`${RTDB_TECHNICIANS_PATH}/${cleanUid}`).update(payload);
    try {
      await rtdb.ref(`${RTDB_CUSTOMERS_PATH}/${cleanUid}`).remove();
    } catch (_) {
    }
    try {
      await rtdb.ref(`${RTDB_USERS_PATH}/${cleanUid}`).remove();
    } catch (_) {
    }
  }

  async function ensureCustomerRootInRealtime(rtdb, uid, seed) {
    const cleanUid = String(uid || '').trim();
    if (!rtdb || !cleanUid) return null;

    const customerRef = rtdb.ref(`${RTDB_CUSTOMERS_PATH}/${cleanUid}`);
    const customerSnapshot = await customerRef.once('value');
    const userRef = rtdb.ref(`${RTDB_USERS_PATH}/${cleanUid}`);
    const userSnapshot = await userRef.once('value');
    const userData = userSnapshot.exists() ? (userSnapshot.val() || {}) : null;
    const resolvedRole = String(userData && userData.role ? userData.role : '').trim().toLowerCase();

    if (customerSnapshot.exists()) {
      if (userData && isCustomerRole(resolvedRole)) {
        await migrateCustomerNodeToCustomers(rtdb, cleanUid, userData);
      }
      const refreshed = await customerRef.once('value');
      return { path: RTDB_CUSTOMERS_PATH, id: cleanUid, data: refreshed.val() || {} };
    }

    if (userData && isCustomerRole(resolvedRole)) {
      await migrateCustomerNodeToCustomers(rtdb, cleanUid, userData);
      return { path: RTDB_CUSTOMERS_PATH, id: cleanUid, data: Object.assign({}, userData, { role: 'customer' }) };
    }

    const seedData = Object.assign({
      uid: cleanUid,
      role: 'customer',
      isActive: true,
      isVerified: true,
      createdAt: getDbTimestamp(),
      updatedAt: getDbTimestamp()
    }, seed && typeof seed === 'object' ? seed : {});

    await customerRef.update(seedData);
    return { path: RTDB_CUSTOMERS_PATH, id: cleanUid, data: seedData };
  }

  async function getRealtimeUserRecordById(rtdb, uid) {
    const cleanUid = String(uid || '').trim();
    if (!rtdb || !cleanUid) return null;
    const cacheKey = `id:${cleanUid}`;
    const cached = readLookupCache(realtimeUserByIdCache, cacheKey);
    if (cached !== null) return cached;

    const resolved = await runLookupOnce(cacheKey, async () => {
      const [customerSnapshot, technicianSnapshot, userSnapshot] = await Promise.all([
        rtdb.ref(`${RTDB_CUSTOMERS_PATH}/${cleanUid}`).once('value'),
        rtdb.ref(`${RTDB_TECHNICIANS_PATH}/${cleanUid}`).once('value'),
        rtdb.ref(`${RTDB_USERS_PATH}/${cleanUid}`).once('value')
      ]);

      const customerData = customerSnapshot.exists() ? (customerSnapshot.val() || {}) : null;
      const technicianData = technicianSnapshot.exists() ? (technicianSnapshot.val() || {}) : null;
      const userData = userSnapshot.exists() ? (userSnapshot.val() || {}) : null;
      const userRole = String(userData && userData.role ? userData.role : '').trim().toLowerCase();

      if (technicianData) {
        return {
          path: RTDB_TECHNICIANS_PATH,
          id: cleanUid,
          data: Object.assign({}, technicianData, {
            uid: cleanUid,
            role: isKnownRole(technicianData.role) ? String(technicianData.role).trim().toLowerCase() : 'technician'
          })
        };
      }

      if (userData && isTechnicianRole(userRole)) {
        await migrateTechnicianNodeToTechnicians(rtdb, cleanUid, userData);
        return {
          path: RTDB_TECHNICIANS_PATH,
          id: cleanUid,
          data: Object.assign({}, userData, { uid: cleanUid, role: 'technician' })
        };
      }

      if (userData && isAdminRole(userRole)) {
        return { path: RTDB_USERS_PATH, id: cleanUid, data: Object.assign({}, userData, { uid: cleanUid, role: 'admin' }) };
      }

      // Prefer explicit non-customer roles when duplicate roots exist.
      if (customerData) {
        return { path: RTDB_CUSTOMERS_PATH, id: cleanUid, data: customerData };
      }
      if (userData) {
        const role = String(userData && userData.role ? userData.role : '').trim().toLowerCase();
        if (isCustomerRole(role)) {
          await migrateCustomerNodeToCustomers(rtdb, cleanUid, userData);
          return { path: RTDB_CUSTOMERS_PATH, id: cleanUid, data: Object.assign({}, userData, { role: 'customer' }) };
        }
        return { path: RTDB_USERS_PATH, id: cleanUid, data: Object.assign({}, userData, { uid: cleanUid, role: role || 'admin' }) };
      }
      return null;
    });

    writeLookupCache(realtimeUserByIdCache, cacheKey, resolved);
    if (resolved && resolved.data) {
      const recordEmail = core.normalizeEmail(resolved.data.email || resolved.data.emailAddress || resolved.data.email_address || '');
      if (recordEmail) {
        writeLookupCache(realtimeUserByEmailCache, `email:${recordEmail}`, resolved);
      }
    }
    return resolved;
  }

  async function getRealtimeUserRecordByEmail(rtdb, email) {
    const cleanEmail = core.normalizeEmail(email);
    if (!rtdb || !cleanEmail) return null;
    const cacheKey = `email:${cleanEmail}`;
    const cached = readLookupCache(realtimeUserByEmailCache, cacheKey);
    if (cached !== null) return cached;

    const resolved = await runLookupOnce(cacheKey, async () => {
      const fieldCandidates = ['email', 'emailAddress', 'email_address'];
      let customersResult = null;
      let techniciansResult = null;
      let usersResult = null;

      for (let i = 0; i < fieldCandidates.length; i += 1) {
        const field = fieldCandidates[i];
        const customersQuery = await rtdb.ref(RTDB_CUSTOMERS_PATH).orderByChild(field).equalTo(cleanEmail).limitToFirst(1).once('value');
        customersResult = snapshotToSingleRecord(customersQuery, RTDB_CUSTOMERS_PATH);
        if (customersResult) break;
      }

      for (let i = 0; i < fieldCandidates.length; i += 1) {
        const field = fieldCandidates[i];
        const techniciansQuery = await rtdb.ref(RTDB_TECHNICIANS_PATH).orderByChild(field).equalTo(cleanEmail).limitToFirst(1).once('value');
        techniciansResult = snapshotToSingleRecord(techniciansQuery, RTDB_TECHNICIANS_PATH);
        if (techniciansResult) break;
      }

      for (let i = 0; i < fieldCandidates.length; i += 1) {
        const field = fieldCandidates[i];
        const usersQuery = await rtdb.ref(RTDB_USERS_PATH).orderByChild(field).equalTo(cleanEmail).limitToFirst(1).once('value');
        usersResult = snapshotToSingleRecord(usersQuery, RTDB_USERS_PATH);
        if (usersResult) break;
      }

      if (techniciansResult) {
        techniciansResult.data = Object.assign({}, techniciansResult.data || {}, { role: 'technician' });
        return techniciansResult;
      }

      if (usersResult) {
        const role = String(usersResult.data && usersResult.data.role ? usersResult.data.role : '').trim().toLowerCase();
        if (isTechnicianRole(role)) {
          await migrateTechnicianNodeToTechnicians(rtdb, usersResult.id, usersResult.data || {});
          return {
            path: RTDB_TECHNICIANS_PATH,
            id: usersResult.id,
            data: Object.assign({}, usersResult.data || {}, { role: 'technician' })
          };
        }
      }

      if (usersResult) {
        const role = String(usersResult.data && usersResult.data.role ? usersResult.data.role : '').trim().toLowerCase();
        if (isAdminRole(role)) {
          return usersResult;
        }
      }

      if (customersResult) {
        return customersResult;
      }

      if (usersResult) {
        const role = String(usersResult.data && usersResult.data.role ? usersResult.data.role : '').trim().toLowerCase();
        if (isCustomerRole(role)) {
          await migrateCustomerNodeToCustomers(rtdb, usersResult.id, usersResult.data || {});
          return {
            path: RTDB_CUSTOMERS_PATH,
            id: usersResult.id,
            data: Object.assign({}, usersResult.data || {}, { role: 'customer' })
          };
        }
        return {
          path: RTDB_USERS_PATH,
          id: usersResult.id,
          data: Object.assign({}, usersResult.data || {}, { role: role || 'admin' })
        };
      }

      return null;
    });

    writeLookupCache(realtimeUserByEmailCache, cacheKey, resolved);
    if (resolved && resolved.id) {
      writeLookupCache(realtimeUserByIdCache, `id:${resolved.id}`, resolved);
    }
    return resolved;
  }

  const usersDatabase = {
    mode: core.mode,
    firebase: core.firebase,
    auth: core.auth,

    async createUserWithEmail(email, password, profile = {}) {
      assertValidBirthdate(profile);
      if (core.mode === 'firebase') {
        const userCredential = await core.auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        const payload = Object.assign({
          uid: user.uid,
          email: core.normalizeEmail(email),
          role: profile.role || 'customer',
          mobileVerified: false,
          isVerified: false,
          isActive: true,
          createdAt: getDbTimestamp(),
          updatedAt: getDbTimestamp()
        }, profile);

        if (hasRealtimeDatabase()) {
          const rtdb = getRealtimeDb();
          const targetRoot = getPreferredUserRootByRole(payload.role);
          await rtdb.ref(`${targetRoot}/${user.uid}`).update(payload);
          if (isCustomerRole(payload.role)) {
            try {
              await rtdb.ref(`${RTDB_USERS_PATH}/${user.uid}`).remove();
            } catch (_) {
            }
            try {
              await rtdb.ref(`${RTDB_TECHNICIANS_PATH}/${user.uid}`).remove();
            } catch (_) {
            }
          }
          if (isTechnicianRole(payload.role)) {
            try {
              await rtdb.ref(`${RTDB_USERS_PATH}/${user.uid}`).remove();
            } catch (_) {
            }
            try {
              await rtdb.ref(`${RTDB_CUSTOMERS_PATH}/${user.uid}`).remove();
            } catch (_) {
            }
          }
          invalidateRealtimeLookupCache(user.uid, payload.email);
        } else {
          const db = core.firebase.firestore();
          payload.createdAt = core.firebase.firestore.FieldValue.serverTimestamp();
          payload.updatedAt = core.firebase.firestore.FieldValue.serverTimestamp();
          await db.collection('users').doc(user.uid).set(payload, { merge: true });
        }
        return user;
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const created = await core.localAuth.createUserWithEmailAndPassword(email, password);
      const uid = created.user.uid;
      const users = core.readJson(core.STORAGE_KEYS.users, {});
      users[uid] = Object.assign({}, users[uid], {
        first_name: profile.first_name || '',
        middle_name: profile.middle_name || '',
        last_name: profile.last_name || '',
        suffix: profile.suffix || '',
        mobile_e164: profile.mobile_e164 || '',
        role: profile.role || 'customer',
        updatedAt: core.nowIso()
      });
      core.writeJson(core.STORAGE_KEYS.users, users);
      return created.user;
    },

    async getUserById(uid) {
      if (core.mode === 'firebase') {
        if (hasRealtimeDatabase()) {
          const rtdb = getRealtimeDb();
          const cleanUid = String(uid || '').trim();
          if (!cleanUid) return null;
          const resolved = await getRealtimeUserRecordById(rtdb, cleanUid);
          if (resolved && resolved.data) {
            return normalizeProfileRecord({ id: cleanUid, ...resolved.data }, cleanUid);
          }
          return null;
        }

        const db = core.firebase.firestore();
        const resolved = await resolveUserDoc(db, uid);
        return resolved && resolved.data ? normalizeProfileRecord({ id: resolved.id, ...resolved.data }, resolved.id) : null;
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const users = core.readJson(core.STORAGE_KEYS.users, {});
      return users[uid] ? normalizeProfileRecord({ id: uid, ...users[uid] }, uid) : null;
    },

    async getUserByEmail(email) {
      const cleanEmail = core.normalizeEmail(email);
      if (core.mode === 'firebase') {
        if (hasRealtimeDatabase()) {
          const rtdb = getRealtimeDb();
          const resolved = await getRealtimeUserRecordByEmail(rtdb, cleanEmail);
          if (resolved && resolved.data) {
            return normalizeProfileRecord({ id: resolved.id, ...resolved.data }, resolved.id);
          }
          return null;
        }

        const db = core.firebase.firestore();
        const fieldsToTry = ['email', 'emailAddress', 'email_address'];
        for (let i = 0; i < fieldsToTry.length; i += 1) {
          const field = fieldsToTry[i];
          try {
            const q = await db.collection('users').where(field, '==', cleanEmail).limit(1).get();
            if (!q.empty) {
              const d = q.docs[0];
              return normalizeProfileRecord({ id: d.id, ...d.data() }, d.id);
            }
          } catch (_) {
          }
        }
        return null;
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const users = core.readJson(core.STORAGE_KEYS.users, {});
      const found = Object.values(users).find((u) => {
        const candidates = [u.email, u.emailAddress, u.email_address];
        return candidates.some((candidate) => core.normalizeEmail(candidate) === cleanEmail);
      });
      return found ? normalizeProfileRecord({ id: found.uid, ...found }, found.uid) : null;
    },

    async updateUserProfile(uid, updates) {
      const normalizedUpdates = normalizeProfileFields(updates);
      assertValidBirthdate(normalizedUpdates);
      const requestedRole = String(normalizedUpdates && normalizedUpdates.role ? normalizedUpdates.role : '').trim().toLowerCase();
      if (core.mode === 'firebase') {
        if (hasRealtimeDatabase()) {
          const rtdb = getRealtimeDb();
          const cleanUid = String(uid || '').trim();
          if (!cleanUid) return false;
          const existingResolved = await getRealtimeUserRecordById(rtdb, cleanUid);
          const existing = existingResolved && existingResolved.data ? existingResolved.data : null;

          const data = Object.assign({}, normalizedUpdates);
          let resolvedRole = '';
          if (existing) {
            if (isKnownRole(requestedRole)) {
              data.role = requestedRole;
            } else if (Object.prototype.hasOwnProperty.call(existing, 'role') && existing.role != null) {
              data.role = existing.role;
            } else {
              delete data.role;
            }
            resolvedRole = String(data.role || existing.role || '').trim().toLowerCase();
            if (isCustomerRole(resolvedRole) && !String(existing && existing.customerCode || data.customerCode || '').trim()) {
              data.customerCode = buildCustomerCode(cleanUid);
            }
          } else {
            data.uid = cleanUid;
            data.role = String(data.role || 'customer').trim() || 'customer';
            if (!Object.prototype.hasOwnProperty.call(data, 'email')) {
              const currentEmail = core.normalizeEmail(core.auth && core.auth.currentUser && core.auth.currentUser.email ? core.auth.currentUser.email : '');
              data.email = currentEmail;
            }
            data.isActive = Object.prototype.hasOwnProperty.call(data, 'isActive') ? data.isActive : true;
            data.createdAt = getDbTimestamp();
            resolvedRole = String(data.role || '').trim().toLowerCase();
            if (resolvedRole === 'customer' && !String(data.customerCode || '').trim()) {
              data.customerCode = buildCustomerCode(cleanUid);
            }
          }

          data.updatedAt = getDbTimestamp();

          const targetRoot = getPreferredUserRootByRole(resolvedRole || data.role);
          await rtdb.ref(`${targetRoot}/${cleanUid}`).update(data);

          if (isCustomerRole(resolvedRole)) {
            try {
              await rtdb.ref(`${RTDB_USERS_PATH}/${cleanUid}`).remove();
            } catch (_) {
            }
            try {
              await rtdb.ref(`${RTDB_TECHNICIANS_PATH}/${cleanUid}`).remove();
            } catch (_) {
            }
          } else if (isTechnicianRole(resolvedRole)) {
            try {
              await rtdb.ref(`${RTDB_USERS_PATH}/${cleanUid}`).remove();
            } catch (_) {
            }
            try {
              await rtdb.ref(`${RTDB_CUSTOMERS_PATH}/${cleanUid}`).remove();
            } catch (_) {
            }
          } else {
            try {
              await rtdb.ref(`${RTDB_CUSTOMERS_PATH}/${cleanUid}`).remove();
            } catch (_) {
            }
            try {
              await rtdb.ref(`${RTDB_TECHNICIANS_PATH}/${cleanUid}`).remove();
            } catch (_) {
            }
          }
          invalidateRealtimeLookupCache(cleanUid, data.email || (existing && (existing.email || existing.emailAddress || existing.email_address)));
          return true;
        }

        const db = core.firebase.firestore();
        const resolved = await resolveUserDoc(db, uid, normalizedUpdates.email);
        const ref = resolved.ref;
        const existing = resolved && resolved.data ? resolved.data : null;

        const data = Object.assign({}, normalizedUpdates);

        if (existing) {
          if (isKnownRole(requestedRole)) {
            data.role = requestedRole;
          } else if (Object.prototype.hasOwnProperty.call(existing, 'role') && existing.role != null) {
            data.role = existing.role;
          } else {
            delete data.role;
          }
        } else {
          data.uid = uid;
          data.role = String(data.role || 'customer').trim() || 'customer';
          if (!Object.prototype.hasOwnProperty.call(data, 'email')) {
            const currentEmail = core.normalizeEmail(core.auth && core.auth.currentUser && core.auth.currentUser.email ? core.auth.currentUser.email : '');
            data.email = currentEmail;
          }
          data.isActive = Object.prototype.hasOwnProperty.call(data, 'isActive') ? data.isActive : true;
          data.createdAt = core.firebase.firestore.FieldValue.serverTimestamp();
        }

        data.updatedAt = core.firebase.firestore.FieldValue.serverTimestamp();
        await ref.set(data, { merge: true });
        return true;
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const users = core.readJson(core.STORAGE_KEYS.users, {});
      if (!users[uid]) return false;
      users[uid] = Object.assign({}, users[uid], normalizedUpdates, { updatedAt: core.nowIso() });
      core.writeJson(core.STORAGE_KEYS.users, users);
      return true;
    },

    async saveAddress(userId, address) {
      if (core.mode === 'firebase') {
        if (hasRealtimeDatabase()) {
          const rtdb = getRealtimeDb();
          const cleanUserId = String(userId || '').trim();
          const currentEmail = core.normalizeEmail(core.auth && core.auth.currentUser && core.auth.currentUser.email ? core.auth.currentUser.email : '');
          await ensureCustomerRootInRealtime(rtdb, cleanUserId, {
            email: currentEmail
          });

          const userRef = rtdb.ref(`${RTDB_CUSTOMERS_PATH}/${cleanUserId}`);

          const ref = userRef.child('addresses').push();
          await ref.set(Object.assign({}, address, { createdAt: getDbTimestamp() }));
          invalidateRealtimeLookupCache(cleanUserId, currentEmail);
          return ref.key;
        }

        const db = core.firebase.firestore();
        const resolved = await resolveUserDoc(db, userId);
        const userRef = resolved.ref;
        if (!resolved.data) {
          const currentEmail = core.normalizeEmail(core.auth && core.auth.currentUser && core.auth.currentUser.email ? core.auth.currentUser.email : '');
          await userRef.set({
            uid: userId,
            email: currentEmail,
            role: 'customer',
            isActive: true,
            isVerified: true,
            createdAt: core.firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: core.firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
        const payload = Object.assign({}, address, {
          createdAt: core.firebase.firestore.FieldValue.serverTimestamp()
        });
        const ref = await userRef.collection('addresses').add(payload);
        return ref.id;
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const users = core.readJson(core.STORAGE_KEYS.users, {});
      if (!users[userId]) return null;
      const addressId = 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
      users[userId].addresses = users[userId].addresses || [];
      users[userId].addresses.push(Object.assign({ id: addressId, createdAt: core.nowIso() }, address));
      users[userId].updatedAt = core.nowIso();
      core.writeJson(core.STORAGE_KEYS.users, users);
      return addressId;
    },

    async getAddresses(userId) {
      if (core.mode === 'firebase') {
        if (hasRealtimeDatabase()) {
          const rtdb = getRealtimeDb();
          const cleanUserId = String(userId || '').trim();
          await ensureCustomerRootInRealtime(rtdb, cleanUserId);
          const snapshot = await rtdb.ref(`${RTDB_CUSTOMERS_PATH}/${cleanUserId}/addresses`).once('value');
          const raw = snapshot.val() || {};
          const items = Object.keys(raw).map((id) => {
            const data = raw[id] && typeof raw[id] === 'object' ? raw[id] : {};
            return Object.assign({ id }, data);
          });
          return sortByCreatedAtDesc(items);
        }

        const db = core.firebase.firestore();
        const resolved = await resolveUserDoc(db, userId);
        const q = await resolved.ref.collection('addresses').get();
        const items = q.docs.map((d) => ({ id: d.id, ...d.data() }));
        return items.sort((a, b) => {
          const aTime = a && a.createdAt && typeof a.createdAt.toMillis === 'function'
            ? a.createdAt.toMillis()
            : Date.parse(String(a && a.createdAt ? a.createdAt : '')) || 0;
          const bTime = b && b.createdAt && typeof b.createdAt.toMillis === 'function'
            ? b.createdAt.toMillis()
            : Date.parse(String(b && b.createdAt ? b.createdAt : '')) || 0;
          return bTime - aTime;
        });
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const users = core.readJson(core.STORAGE_KEYS.users, {});
      const addresses = users[userId] && Array.isArray(users[userId].addresses) ? users[userId].addresses : [];
      return addresses.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    async updateAddress(userId, addressId, address) {
      if (core.mode === 'firebase') {
        if (hasRealtimeDatabase()) {
          const rtdb = getRealtimeDb();
          const cleanUserId = String(userId || '').trim();
          await ensureCustomerRootInRealtime(rtdb, cleanUserId);
          const ref = rtdb.ref(`${RTDB_CUSTOMERS_PATH}/${cleanUserId}/addresses/${String(addressId || '').trim()}`);
          await ref.update(Object.assign({}, address, { updatedAt: getDbTimestamp() }));
          return true;
        }

        const db = core.firebase.firestore();
        const resolved = await resolveUserDoc(db, userId);
        const payload = Object.assign({}, address, {
          updatedAt: core.firebase.firestore.FieldValue.serverTimestamp()
        });
        await resolved.ref.collection('addresses').doc(addressId).set(payload, { merge: true });
        return true;
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const users = core.readJson(core.STORAGE_KEYS.users, {});
      if (!users[userId] || !Array.isArray(users[userId].addresses)) return false;
      const targetIndex = users[userId].addresses.findIndex((item) => item.id === addressId);
      if (targetIndex < 0) return false;
      users[userId].addresses[targetIndex] = Object.assign({}, users[userId].addresses[targetIndex], address, { updatedAt: core.nowIso() });
      users[userId].updatedAt = core.nowIso();
      core.writeJson(core.STORAGE_KEYS.users, users);
      return true;
    },

    async deleteAddress(userId, addressId) {
      if (core.mode === 'firebase') {
        if (hasRealtimeDatabase()) {
          const rtdb = getRealtimeDb();
          const cleanUserId = String(userId || '').trim();
          await ensureCustomerRootInRealtime(rtdb, cleanUserId);
          await rtdb.ref(`${RTDB_CUSTOMERS_PATH}/${cleanUserId}/addresses/${String(addressId || '').trim()}`).remove();
          return true;
        }

        const db = core.firebase.firestore();
        const resolved = await resolveUserDoc(db, userId);
        await resolved.ref.collection('addresses').doc(addressId).delete();
        return true;
      }

      if (core.forceFirebaseOnly) throw core.buildFirebaseRequiredError();

      const users = core.readJson(core.STORAGE_KEYS.users, {});
      if (!users[userId] || !Array.isArray(users[userId].addresses)) return false;
      users[userId].addresses = users[userId].addresses.filter((item) => item.id !== addressId);
      users[userId].updatedAt = core.nowIso();
      core.writeJson(core.STORAGE_KEYS.users, users);
      return true;
    },

    async signInWithEmail(email, password) {
      if (core.forceFirebaseOnly && core.mode !== 'firebase') throw core.buildFirebaseRequiredError();
      const userCredential = await core.auth.signInWithEmailAndPassword(email, password);
      return userCredential.user;
    },

    async signOut() {
      if (core.forceFirebaseOnly && core.mode !== 'firebase') throw core.buildFirebaseRequiredError();
      await core.auth.signOut();
      return true;
    },

    async sendEmailVerificationCode(emailOrOptions = {}, maybeOptions = {}) {
      if (core.forceFirebaseOnly && core.mode !== 'firebase') throw core.buildFirebaseRequiredError();
      if (core.mode !== 'firebase' || !core.auth) {
        const err = new Error('Email verification service is not available.');
        err.code = 'verification/not-available';
        throw err;
      }

      const isEmailInput = typeof emailOrOptions === 'string';
      const targetEmail = isEmailInput ? core.normalizeEmail(emailOrOptions) : '';
      const options = isEmailInput ? (maybeOptions || {}) : (emailOrOptions || {});

      const requestId = String((options && options.requestId) || '').trim();
      const customContinueUrl = String((options && options.continueUrl) || '').trim();

      let verificationUrl = customContinueUrl;
      if (!verificationUrl) {
        if (/^https?:$/i.test(String(window.location.protocol || ''))) {
          verificationUrl = window.location.origin + '/html/user/register.html';
        } else if (window.HOMEFIX_FIREBASE_CONFIG && window.HOMEFIX_FIREBASE_CONFIG.authDomain) {
          const authDomain = String(window.HOMEFIX_FIREBASE_CONFIG.authDomain || '').trim();
          if (authDomain) {
            const normalized = authDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
            verificationUrl = 'https://' + normalized + '/html/user/register.html';
          }
        }
      }

      let canUseContinueUrl = false;
      if (verificationUrl) {
        try {
          const parsed = new URL(verificationUrl, window.location.href);
          verificationUrl = parsed.toString();
          canUseContinueUrl = /^https?:$/i.test(parsed.protocol);
        } catch (_) {
          canUseContinueUrl = false;
        }
      }

      if (requestId && canUseContinueUrl) {
        try {
          const urlObj = new URL(verificationUrl, window.location.origin);
          urlObj.searchParams.set('rid', requestId);
          verificationUrl = urlObj.toString();
        } catch (_) {
          const joiner = verificationUrl.includes('?') ? '&' : '?';
          verificationUrl = verificationUrl + joiner + 'rid=' + encodeURIComponent(requestId);
        }
      }

      if (canUseContinueUrl && targetEmail) {
        const signedInEmail = core.normalizeEmail(core.auth.currentUser && core.auth.currentUser.email ? core.auth.currentUser.email : '');
        const alreadySignedInAsTarget = !!core.auth.currentUser && signedInEmail === targetEmail;
        if (alreadySignedInAsTarget) {
          await core.auth.currentUser.sendEmailVerification({
            url: verificationUrl,
            handleCodeInApp: false
          });
          return { ok: true, sent: true, requestTrackingEnabled: false, mode: 'verification-link' };
        }

        const err = new Error('Unable to send verification link for this email right now.');
        err.code = 'auth/unauthenticated';
        throw err;
      }

      if (canUseContinueUrl) {
        if (!core.auth.currentUser) {
          const err = new Error('You must be signed in to send email verification.');
          err.code = 'auth/unauthenticated';
          throw err;
        }
        await core.auth.currentUser.sendEmailVerification({
          url: verificationUrl,
          handleCodeInApp: false
        });
        return { ok: true, sent: true, requestTrackingEnabled: false, mode: 'verification-link' };
      }

      if (targetEmail) {
        const refreshedEmail = core.normalizeEmail(core.auth.currentUser && core.auth.currentUser.email ? core.auth.currentUser.email : '');
        if (core.auth.currentUser && refreshedEmail === targetEmail) {
          await core.auth.currentUser.sendEmailVerification();
          return { ok: true, sent: true, requestTrackingEnabled: false, mode: 'verification-link' };
        }

        const err = new Error('Email link sending requires a valid hosted URL.');
        err.code = 'verification/not-available';
        throw err;
      }

      if (!core.auth.currentUser) {
        const err = new Error('You must be signed in to send email verification.');
        err.code = 'auth/unauthenticated';
        throw err;
      }

      await core.auth.currentUser.sendEmailVerification();
      return { ok: true, sent: true, requestTrackingEnabled: false };
    },

    async isEmailSignInLink(link) {
      if (core.forceFirebaseOnly && core.mode !== 'firebase') throw core.buildFirebaseRequiredError();
      if (core.mode !== 'firebase' || !core.auth) return false;
      return !!core.auth.isSignInWithEmailLink(String(link || ''));
    },

    async completeEmailSignInLink(email, link) {
      if (core.forceFirebaseOnly && core.mode !== 'firebase') throw core.buildFirebaseRequiredError();
      if (core.mode !== 'firebase' || !core.auth) {
        const err = new Error('Email sign-in service is not available.');
        err.code = 'verification/not-available';
        throw err;
      }

      const cleanEmail = core.normalizeEmail(email);
      const cleanLink = String(link || '').trim();
      if (!cleanEmail || !cleanLink) {
        const err = new Error('Email and sign-in link are required.');
        err.code = 'verification/invalid-link';
        throw err;
      }

      const cred = await core.auth.signInWithEmailLink(cleanEmail, cleanLink);
      const user = cred && cred.user ? cred.user : core.auth.currentUser;
      if (user && typeof user.reload === 'function') {
        await user.reload();
      }
      return user;
    },

    async verifyEmailVerificationCode(code) {
      if (core.forceFirebaseOnly && core.mode !== 'firebase') throw core.buildFirebaseRequiredError();
      if (core.mode !== 'firebase' || !core.auth) {
        const err = new Error('Email verification service is not available.');
        err.code = 'verification/not-available';
        throw err;
      }

      const cleanCode = String(code || '').trim();
      if (!cleanCode) {
        const err = new Error('Verification code is required.');
        err.code = 'verification/invalid-code';
        throw err;
      }

      await core.auth.applyActionCode(cleanCode);

      const activeUser = core.auth.currentUser;
      if (activeUser && typeof activeUser.reload === 'function') {
        await activeUser.reload();
      }

      const refreshedUser = core.auth.currentUser;
      if (refreshedUser && refreshedUser.emailVerified) {
        return { ok: true, verified: true };
      }

      return { ok: true, verified: true };
    }
  };

  window.userProfileDatabase = usersDatabase;
})();
