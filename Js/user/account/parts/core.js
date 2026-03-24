document.addEventListener('DOMContentLoaded', () => {
  const ns = window.hfsAccount || {};
  const dashboardNs = window.hfsDashboard || {};
  const usersDb = window.usersDatabase || window.homefixDB || window.userProfileDatabase || null;

  const refs = {
    infoFirst: document.getElementById('infoFirst'),
    infoLast: document.getElementById('infoLast'),
    infoMiddle: document.getElementById('infoMiddle'),
    infoSuffix: document.getElementById('infoSuffix'),
    infoBirthdate: document.getElementById('infoBirthdate'),
    infoEmail: document.getElementById('infoEmail'),
    infoMobile: document.getElementById('infoMobile'),

    editFirst: document.getElementById('editFirst'),
    editLast: document.getElementById('editLast'),
    editMiddle: document.getElementById('editMiddle'),
    editSuffix: document.getElementById('editSuffix'),
    editBirthdate: document.getElementById('editBirthdate'),
    editEmail: document.getElementById('editEmail'),
    editMobile: document.getElementById('editMobile'),

    editBtn: document.getElementById('editAccountBtn'),
    saveBtn: document.getElementById('saveAccountBtn'),
    cancelBtn: document.getElementById('cancelAccountBtn'),
    errorEl: document.getElementById('accountEditError'),
    errorFirst: document.getElementById('error-editFirst'),
    errorLast: document.getElementById('error-editLast'),
    errorMiddle: document.getElementById('error-editMiddle'),
    errorSuffix: document.getElementById('error-editSuffix'),
    errorBirthdate: document.getElementById('error-editBirthdate'),
    errorMobile: document.getElementById('error-editMobile')
  };

  const infoCard = document.querySelector('.info-card');

  if (!refs.infoFirst || !refs.infoLast || !refs.infoMiddle || !refs.infoSuffix || !refs.infoBirthdate || !refs.infoEmail || !refs.infoMobile) return;
  if (!refs.editFirst || !refs.editLast || !refs.editMiddle || !refs.editSuffix || !refs.editBirthdate || !refs.editEmail || !refs.editMobile) return;
  if (!refs.editBtn || !refs.saveBtn || !refs.cancelBtn || !refs.errorEl) return;
  if (!refs.errorFirst || !refs.errorLast || !refs.errorMiddle || !refs.errorSuffix || !refs.errorBirthdate || !refs.errorMobile) return;
  if (!usersDb || !usersDb.auth) return;

  let activeUser = null;
  let activeProfile = null;
  let isEditing = false;

  function normalizeText(value) {
    return String(value == null ? '' : value).trim();
  }

  function isPermissionDenied(error) {
    const code = String(error && error.code ? error.code : '').toLowerCase();
    const msg = String(error && error.message ? error.message : '').toLowerCase();
    return code === 'permission-denied' || code === 'firestore/permission-denied' || msg.includes('insufficient permissions');
  }

  function getCachedProfile(user) {
    if (!dashboardNs || typeof dashboardNs.getCachedProfile !== 'function') return null;
    return dashboardNs.getCachedProfile(user);
  }

  function splitDisplayName(displayName) {
    const text = String(displayName || '').trim();
    if (!text) return { first_name: '', last_name: '' };
    const parts = text.split(/\s+/).filter(Boolean);
    if (!parts.length) return { first_name: '', last_name: '' };
    return {
      first_name: parts[0] || '',
      last_name: parts.length > 1 ? parts.slice(1).join(' ') : ''
    };
  }

  function hasProfileInfo(profile) {
    if (!profile || typeof profile !== 'object') return false;
    return !!(
      String(profile.first_name || '').trim() ||
      String(profile.last_name || '').trim() ||
      String(profile.middle_name || '').trim() ||
      String(profile.suffix || '').trim() ||
      String(profile.birthdate || '').trim() ||
      String(profile.mobile_e164 || '').trim()
    );
  }

  async function getProfileByEmailFallback(user) {
    if (!usersDb || typeof usersDb.getUserByEmail !== 'function') return null;
    const email = String(user && user.email ? user.email : '').trim();
    if (!email) return null;
    try {
      return await usersDb.getUserByEmail(email);
    } catch (_) {
      return null;
    }
  }

  function saveCachedProfile(profile, user) {
    if (!dashboardNs || typeof dashboardNs.saveProfileCache !== 'function') return;
    dashboardNs.saveProfileCache(profile, user);
  }

  function updateTopbarName(profile, user) {
    const topbarBtn = document.getElementById('userMenuBtn');
    if (!topbarBtn) return;
    const name = (dashboardNs && typeof dashboardNs.getDisplayName === 'function')
      ? dashboardNs.getDisplayName(profile, user)
      : String((profile && profile.first_name) || (user && user.email) || 'User');
    topbarBtn.innerHTML = `${name} <span class="caret">▼</span>`;
  }

  ns.bindBirthdateAutoFormat(refs.editBirthdate);

  function getSelectedSuffixValue() {
    const selected = document.querySelector('#editSuffix input[name="suffixOption"]:checked');
    return selected ? String(selected.value || '') : '';
  }

  function setSelectedSuffixValue(value) {
    const normalized = typeof ns.normalizeSuffix === 'function'
      ? (ns.normalizeSuffix(value) || '')
      : String(value || '').trim();
    const radios = document.querySelectorAll('#editSuffix input[name="suffixOption"]');
    let matched = false;
    radios.forEach((radio) => {
      const isMatch = String(radio.value || '') === normalized;
      radio.checked = isMatch;
      if (isMatch) matched = true;
    });
    if (!matched) {
      const none = document.querySelector('#editSuffix input[name="suffixOption"][value=""]');
      if (none) none.checked = true;
    }
  }

  function clearAllInlineErrors() {
    ns.clearInlineError(refs.editFirst, refs.errorFirst);
    ns.clearInlineError(refs.editLast, refs.errorLast);
    ns.clearInlineError(refs.editMiddle, refs.errorMiddle);
    ns.clearInlineError(refs.editSuffix, refs.errorSuffix);
    ns.clearInlineError(refs.editBirthdate, refs.errorBirthdate);
    ns.clearInlineError(refs.editMobile, refs.errorMobile);
  }

  function validateFields() {
    clearAllInlineErrors();

    const firstNameRaw = String(refs.editFirst.value || '');
    const lastNameRaw = String(refs.editLast.value || '');
    const middleNameRaw = String(refs.editMiddle.value || '');
    const suffixRaw = getSelectedSuffixValue();

    const firstName = ns.titleCaseName(firstNameRaw);
    const lastName = ns.titleCaseName(lastNameRaw);
    const middleName = typeof ns.normalizeMiddleInitial === 'function'
      ? ns.normalizeMiddleInitial(middleNameRaw)
      : String(middleNameRaw || '').trim().toUpperCase().slice(0, 1);
    const suffix = typeof ns.normalizeSuffix === 'function'
      ? (ns.normalizeSuffix(suffixRaw) || '')
      : String(suffixRaw || '').trim();
    const birthdateRaw = String(refs.editBirthdate.value || '').trim();
    const birthdate = ns.normalizeBirthdateValue(birthdateRaw);
    const mobileRaw = String(refs.editMobile.value || '').trim();
    const mobile = mobileRaw.startsWith('09') ? '+63' + mobileRaw.slice(1) : mobileRaw;

    function fail(inputEl, errorNode, message) {
      ns.setInlineError(inputEl, errorNode, message);
      return {
        hasErrors: true,
        firstInvalid: inputEl,
        firstMessage: message,
        payload: null
      };
    }

    if (!firstNameRaw.trim()) {
      return fail(refs.editFirst, refs.errorFirst, 'First name is required.');
    }

    const firstErr = ns.validateName(firstNameRaw);
    if (firstErr) {
      return fail(refs.editFirst, refs.errorFirst, firstErr);
    }

    if (!lastNameRaw.trim()) {
      return fail(refs.editLast, refs.errorLast, 'Last name is required.');
    }

    const lastErr = ns.validateName(lastNameRaw);
    if (lastErr) {
      return fail(refs.editLast, refs.errorLast, lastErr);
    }

    const middleErr = typeof ns.validateMiddleInitial === 'function'
      ? ns.validateMiddleInitial(middleNameRaw)
      : null;
    if (middleErr) {
      return fail(refs.editMiddle, refs.errorMiddle, middleErr);
    }

    const suffixErr = ns.validateSuffix(suffixRaw);
    if (suffixErr) {
      return fail(refs.editSuffix, refs.errorSuffix, suffixErr);
    }

    if (!birthdateRaw) {
      return fail(refs.editBirthdate, refs.errorBirthdate, 'Birthdate is required.');
    }

    const birthErr = ns.validateBirthdate(birthdateRaw);
    if (birthErr) {
      return fail(refs.editBirthdate, refs.errorBirthdate, birthErr);
    }

    if (!mobileRaw) {
      return fail(refs.editMobile, refs.errorMobile, 'Phone number is required.');
    }

    const mobileErr = ns.validateMobile(mobileRaw);
    if (mobileErr) {
      return fail(refs.editMobile, refs.errorMobile, mobileErr);
    }

    return {
      hasErrors: false,
      firstInvalid: null,
      firstMessage: '',
      payload: {
        first_name: firstName,
        last_name: lastName,
        middle_name: middleName,
        suffix,
        birthdate,
        mobile_e164: mobile
      }
    };
  }

  function setInlineEditing(enabled) {
    isEditing = enabled;

    if (infoCard) {
      infoCard.classList.toggle('is-editing', enabled);
    }

    [
      [refs.infoFirst, refs.editFirst],
      [refs.infoLast, refs.editLast],
      [refs.infoMiddle, refs.editMiddle],
      [refs.infoSuffix, refs.editSuffix],
      [refs.infoBirthdate, refs.editBirthdate],
      [refs.infoMobile, refs.editMobile]
    ].forEach(([label, input]) => {
      label.hidden = enabled;
      input.hidden = !enabled;
    });

    // Email is display-only and cannot be edited.
    refs.infoEmail.hidden = false;
    refs.editEmail.hidden = true;

    refs.editBtn.hidden = enabled;
    refs.saveBtn.hidden = !enabled;
    refs.cancelBtn.hidden = !enabled;
    refs.errorEl.textContent = '';
    clearAllInlineErrors();

    if (enabled) refs.editFirst.focus();
  }

  [refs.editFirst, refs.editLast, refs.editMiddle, refs.editBirthdate, refs.editMobile].forEach((inputEl) => {
    if (!inputEl) return;
    inputEl.addEventListener('input', () => {
      if (inputEl === refs.editMiddle) {
        const normalizedMiddle = typeof ns.normalizeMiddleInitial === 'function'
          ? ns.normalizeMiddleInitial(refs.editMiddle.value)
          : String(refs.editMiddle.value || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 1);
        if (refs.editMiddle.value !== normalizedMiddle) {
          refs.editMiddle.value = normalizedMiddle;
        }
      }

      const map = {
        editFirst: refs.errorFirst,
        editLast: refs.errorLast,
        editMiddle: refs.errorMiddle,
        editSuffix: refs.errorSuffix,
        editBirthdate: refs.errorBirthdate,
        editMobile: refs.errorMobile
      };
      if (inputEl === refs.editBirthdate) {
        const liveErr = ns.validateBirthdateLive(refs.editBirthdate.value);
        if (liveErr) {
          ns.setInlineError(refs.editBirthdate, refs.errorBirthdate, liveErr);
        } else {
          ns.clearInlineError(refs.editBirthdate, refs.errorBirthdate);
        }
      } else {
        ns.clearInlineError(inputEl, map[inputEl.id]);
      }
      if (refs.errorEl.textContent) refs.errorEl.textContent = '';
    });
  });

  if (refs.editSuffix) {
    refs.editSuffix.addEventListener('change', () => {
      ns.clearInlineError(refs.editSuffix, refs.errorSuffix);
      if (refs.errorEl.textContent) refs.errorEl.textContent = '';
    });
  }

  if (refs.editMiddle) {
    refs.editMiddle.setAttribute('maxlength', '1');
    refs.editMiddle.setAttribute('inputmode', 'text');
  }

  refs.editBtn.addEventListener('click', () => {
    ns.fillInputs(activeProfile || {}, refs);
    setSelectedSuffixValue(activeProfile && activeProfile.suffix);
    setInlineEditing(true);
  });

  refs.cancelBtn.addEventListener('click', () => {
    ns.fillInputs(activeProfile || {}, refs);
    setSelectedSuffixValue(activeProfile && activeProfile.suffix);
    setInlineEditing(false);
  });

  refs.saveBtn.addEventListener('click', async () => {
    if (!activeUser || !isEditing) return;

    const validation = validateFields();
    if (validation.hasErrors) {
      refs.errorEl.textContent = '';
      if (validation.firstInvalid) validation.firstInvalid.focus();
      return;
    }

    refs.saveBtn.disabled = true;
    refs.saveBtn.textContent = 'SAVING...';
    refs.errorEl.textContent = '';

    try {
      const updates = validation.payload;

      let cloudSaved = false;
      try {
        await usersDb.updateUserProfile(activeUser.uid, updates);
        cloudSaved = true;
      } catch (err) {
        if (!isPermissionDenied(err)) {
          throw err;
        }
      }

      activeProfile = Object.assign({}, activeProfile || {}, updates, {
        uid: activeUser.uid,
        email: String((activeProfile && activeProfile.email) || (activeUser && activeUser.email) || '').trim().toLowerCase()
      });
      saveCachedProfile(activeProfile, activeUser);
      ns.renderProfile(activeProfile, activeUser, refs);

      updateTopbarName(activeProfile, activeUser);
      setInlineEditing(false);
      if (!cloudSaved) {
        refs.errorEl.textContent = 'Saved locally on this device. Cloud profile sync is restricted by permissions.';
      }
    } catch (err) {
      refs.errorEl.textContent = (err && err.message) ? err.message : 'Failed to save account information.';
    } finally {
      refs.saveBtn.disabled = false;
      refs.saveBtn.textContent = 'SAVE';
    }
  });

  let accountRedirectTimer = null;

  function scheduleAccountRedirectIfStillSignedOut() {
    if (accountRedirectTimer) return;
    accountRedirectTimer = setTimeout(() => {
      accountRedirectTimer = null;
      const active = usersDb && usersDb.auth ? usersDb.auth.currentUser : null;
      if (!active) {
        window.location.href = '../../login.html';
      }
    }, 7000);
  }

  function clearAccountRedirectTimer() {
    if (!accountRedirectTimer) return;
    clearTimeout(accountRedirectTimer);
    accountRedirectTimer = null;
  }

  usersDb.auth.onAuthStateChanged(async (user) => {
    if (!user) {
      scheduleAccountRedirectIfStillSignedOut();
      return;
    }

    clearAccountRedirectTimer();

    activeUser = user;

    let firestoreProfile = null;
    let emailProfile = null;
    const cachedProfile = getCachedProfile(user) || {};
    const authNameProfile = splitDisplayName(user && user.displayName ? user.displayName : '');

    try {
      firestoreProfile = await usersDb.getUserById(user.uid) || null;
      if (firestoreProfile) {
        saveCachedProfile(firestoreProfile, user);
      }
    } catch {
    }

    if (!hasProfileInfo(firestoreProfile)) {
      emailProfile = await getProfileByEmailFallback(user);
      if (emailProfile) {
        saveCachedProfile(emailProfile, user);
      }
    }

    if (!firestoreProfile && typeof usersDb.updateUserProfile === 'function') {
      try {
        await usersDb.updateUserProfile(user.uid, {
          uid: user.uid,
          email: String(user && user.email ? user.email : '').trim().toLowerCase(),
          role: 'customer',
          isActive: true,
          isVerified: !!user.emailVerified,
          emailVerified: !!user.emailVerified
        });
        firestoreProfile = await usersDb.getUserById(user.uid);
        if (firestoreProfile) {
          saveCachedProfile(firestoreProfile, user);
        }
      } catch (_) {
      }
    }

    activeProfile = Object.assign({}, authNameProfile, cachedProfile || {}, emailProfile || {}, firestoreProfile || {}, {
      uid: user.uid,
      email: String(((firestoreProfile && firestoreProfile.email)
        || (emailProfile && emailProfile.email)
        || (cachedProfile && cachedProfile.email)
        || user.email
        || '')).trim().toLowerCase()
    });

    try {
      if (window.firebase && typeof window.firebase.database === 'function') {
        const rtdb = window.firebase.database();
        const serverTs = window.firebase.database.ServerValue && window.firebase.database.ServerValue.TIMESTAMP
          ? window.firebase.database.ServerValue.TIMESTAMP
          : Date.now();
        const upsertPayload = {
          uid: user.uid,
          email: activeProfile.email,
          role: 'customer',
          first_name: String(activeProfile.first_name || '').trim(),
          middle_name: String(activeProfile.middle_name || '').trim(),
          last_name: String(activeProfile.last_name || '').trim(),
          suffix: String(activeProfile.suffix || '').trim(),
          birthdate: String(activeProfile.birthdate || '').trim(),
          mobile_e164: String(activeProfile.mobile_e164 || '').trim(),
          isActive: true,
          isVerified: !!user.emailVerified,
          emailVerified: !!user.emailVerified,
          updatedAt: serverTs
        };

        await Promise.all([
          rtdb.ref(`users/${user.uid}`).update(upsertPayload),
          rtdb.ref(`customers/${user.uid}`).update(upsertPayload)
        ]);
      }
    } catch (_) {
    }

    ns.renderProfile(activeProfile, user, refs);
    updateTopbarName(activeProfile, user);
    ns.fillInputs(activeProfile, refs);
    setSelectedSuffixValue(activeProfile && activeProfile.suffix);
    setInlineEditing(false);
  });
});
