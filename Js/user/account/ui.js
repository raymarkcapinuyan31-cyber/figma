(function () {
  const ns = (window.hfsAccount = window.hfsAccount || {});

  ns.setInlineError = function setInlineError(inputEl, errorNode, message) {
    if (!inputEl || !errorNode) return;
    inputEl.classList.add('input-error');
    inputEl.setAttribute('aria-invalid', 'true');
    errorNode.textContent = message;
  };

  ns.clearInlineError = function clearInlineError(inputEl, errorNode) {
    if (!inputEl || !errorNode) return;
    inputEl.classList.remove('input-error');
    inputEl.removeAttribute('aria-invalid');
    errorNode.textContent = '';
  };

  ns.renderProfile = function renderProfile(profile, authUser, refs) {
    const authEmail = authUser && authUser.email ? String(authUser.email) : '';
    const fallbackEmail = authEmail.endsWith('@mobile.homefix.local') ? '' : authEmail;
    const email = (profile && profile.email) || fallbackEmail;
    const firstName = String((profile && profile.first_name) || '').trim();
    const lastName = String((profile && profile.last_name) || '').trim();
    const suffix = String((profile && profile.suffix) || '').trim();
    const displayName = `${firstName} ${lastName}${suffix ? ` ${suffix}` : ''}`.trim() || 'User';
    refs.infoFirst.textContent = ns.displayValue(profile && profile.first_name);
    refs.infoLast.textContent = ns.displayValue(profile && profile.last_name);
    const middleInitial = typeof ns.normalizeMiddleInitial === 'function'
      ? ns.normalizeMiddleInitial(profile && profile.middle_name)
      : String((profile && profile.middle_name) || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 1);
    refs.infoMiddle.textContent = ns.displayValue(middleInitial);
    if (refs.infoSuffix) {
      const suffixValue = String((profile && profile.suffix) || '').trim();
      refs.infoSuffix.textContent = suffixValue || 'None';
    }
    refs.infoBirthdate.textContent = ns.formatBirthdateForDisplay(profile && profile.birthdate);
    refs.infoEmail.textContent = ns.displayValue(email);
    if (refs.editEmail) refs.editEmail.value = String(email || '');
    refs.infoMobile.textContent = ns.displayValue(profile && profile.mobile_e164);

    const summaryName = document.getElementById('profileDisplayName');
    const summaryEmail = document.getElementById('profileDisplayEmail');
    const summaryAvatar = document.getElementById('profileAvatar');
    if (summaryName) summaryName.textContent = displayName;
    if (summaryEmail) summaryEmail.textContent = ns.displayValue(email);
    if (summaryAvatar) {
      const source = displayName !== 'User' ? displayName : String(email || 'U');
      summaryAvatar.textContent = String(source || 'U').trim().charAt(0).toUpperCase() || 'U';
    }
  };

  ns.fillInputs = function fillInputs(profile, refs) {
    refs.editFirst.value = (profile && profile.first_name) || '';
    refs.editLast.value = (profile && profile.last_name) || '';
    refs.editMiddle.value = typeof ns.normalizeMiddleInitial === 'function'
      ? ns.normalizeMiddleInitial(profile && profile.middle_name)
      : String((profile && profile.middle_name) || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 1);
    if (refs.editSuffix) refs.editSuffix.value = (profile && profile.suffix) || '';
    refs.editBirthdate.value = ns.toDateIsoValue(profile && profile.birthdate);
    if (refs.editEmail) refs.editEmail.value = (profile && profile.email) || refs.infoEmail.textContent || '';
    refs.editMobile.value = (profile && profile.mobile_e164) || '';
  };
})();
