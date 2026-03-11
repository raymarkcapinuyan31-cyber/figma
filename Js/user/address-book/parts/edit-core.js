document.addEventListener('DOMContentLoaded', () => {
  const ns = window.hfsAddressBook || {};
  const usersDb = window.usersDatabase || window.homefixDB || window.userProfileDatabase || null;

  const form = document.getElementById('addressForm');
  const houseUnitInput = document.getElementById('houseUnit');
  const streetNameInput = document.getElementById('streetName');
  const barangaySelect = document.getElementById('barangay');
  const additionalDetailsInput = document.getElementById('additionalDetails');
  const houseUnitError = document.getElementById('error-houseUnit');
  const streetNameError = document.getElementById('error-streetName');
  const barangayError = document.getElementById('error-barangay');
  const cancelBtn = document.getElementById('cancelAddressBtn');

  if (!form || !houseUnitInput || !streetNameInput || !barangaySelect || !additionalDetailsInput || !houseUnitError || !streetNameError || !barangayError || !cancelBtn || !usersDb || !usersDb.auth) return;

  const params = new URLSearchParams(window.location.search);
  const addressId = String(params.get('id') || '').trim();
  let activeUser = null;

  function goBackToAddressBook() {
    window.location.href = 'address-book.html';
  }

  function clearErrors() {
    ns.clearFieldError(houseUnitInput, houseUnitError);
    ns.clearFieldError(streetNameInput, streetNameError);
    ns.clearFieldError(barangaySelect, barangayError);
  }

  function hasDigit(value) {
    return /\d/.test(String(value || ''));
  }

  function hasAtLeastTwoLetters(value) {
    const letters = String(value || '').match(/[A-Za-z]/g);
    return Array.isArray(letters) && letters.length >= 2;
  }

  function isValidHouseUnitFormat(value) {
    return /^[A-Za-z0-9#.,/\-\s]+$/.test(String(value || ''));
  }

  function isValidStreetNameFormat(value) {
    return /^[A-Za-z0-9.,'/\-\s]+$/.test(String(value || ''));
  }

  function fillForm(item) {
    houseUnitInput.value = item.houseUnit || item.house_no_unit || item.houseNo || '';
    streetNameInput.value = item.streetName || item.street || '';
    barangaySelect.value = item.barangay || item.baranggay || '';
    additionalDetailsInput.value = item.additionalDetails || item.additional_details || item.details || '';
  }

  async function loadAddressForEdit() {
    if (!activeUser || !activeUser.uid || !addressId) return;
    const addresses = await usersDb.getAddresses(activeUser.uid);
    const selected = addresses.find((item) => String(item && item.id ? item.id : '') === addressId);
    if (!selected) {
      goBackToAddressBook();
      return;
    }
    fillForm(selected);
    clearErrors();
    houseUnitInput.focus();
  }

  if (!addressId) {
    goBackToAddressBook();
    return;
  }

  cancelBtn.addEventListener('click', () => {
    goBackToAddressBook();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const houseUnit = houseUnitInput.value.replace(/\s+/g, ' ').trim();
    const streetName = streetNameInput.value.replace(/\s+/g, ' ').trim();
    const barangay = barangaySelect.value.trim();
    const additionalDetails = additionalDetailsInput.value.trim();

    clearErrors();
    let hasError = false;

    if (!houseUnit) {
      ns.setFieldError(houseUnitInput, houseUnitError, 'Please enter your house or unit number.');
      hasError = true;
    } else if (houseUnit.length < 2 || houseUnit.length > 30 || !isValidHouseUnitFormat(houseUnit) || !hasDigit(houseUnit)) {
      ns.setFieldError(houseUnitInput, houseUnitError, 'House/Unit must be 2-30 chars and include a number.');
      hasError = true;
    }

    if (!streetName) {
      ns.setFieldError(streetNameInput, streetNameError, 'Please enter your street name.');
      hasError = true;
    } else if (streetName.length < 2 || streetName.length > 60 || !isValidStreetNameFormat(streetName) || !hasAtLeastTwoLetters(streetName)) {
      ns.setFieldError(streetNameInput, streetNameError, 'Street name must be 2-60 chars and include at least 2 letters.');
      hasError = true;
    }

    if (!barangay) {
      ns.setFieldError(barangaySelect, barangayError, 'Please select your barangay.');
      hasError = true;
    }

    if (hasError || !activeUser || !addressId) return;

    houseUnitInput.value = houseUnit;
    streetNameInput.value = streetName;

    const payload = { houseUnit, streetName, barangay, additionalDetails };
    await usersDb.updateAddress(activeUser.uid, addressId, payload);
    await ns.showNotice('Address updated successfully.');
    goBackToAddressBook();
  });

  async function bootstrapRender(triesLeft) {
    const initialUser = ns.resolveInitialUser();
    if (initialUser && initialUser.uid) {
      activeUser = initialUser;
      await loadAddressForEdit();
      return;
    }

    if (triesLeft <= 0) return;
    setTimeout(() => {
      bootstrapRender(triesLeft - 1);
    }, 700);
  }

  bootstrapRender(8);

  usersDb.auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = '../../login.html';
      return;
    }
    activeUser = user;
    await loadAddressForEdit();
  });
});
