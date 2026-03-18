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
  const additionalDetailsError = document.getElementById('error-additionalDetails');
  const cancelBtn = document.getElementById('cancelAddressBtn');

  if (!form || !houseUnitInput || !streetNameInput || !barangaySelect || !additionalDetailsInput || !houseUnitError || !streetNameError || !barangayError || !additionalDetailsError || !cancelBtn || !usersDb || !usersDb.auth) return;

  let activeUser = null;

  function goBackToAddressBook() {
    window.location.href = 'address-book.html';
  }

  function clearErrors() {
    ns.clearFieldError(houseUnitInput, houseUnitError);
    ns.clearFieldError(streetNameInput, streetNameError);
    ns.clearFieldError(barangaySelect, barangayError);
    ns.clearFieldError(additionalDetailsInput, additionalDetailsError);
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

  function isValidAdditionalDetailsFormat(value) {
    return /^[A-Za-z0-9,\-\s]+$/.test(String(value || ''));
  }

  cancelBtn.addEventListener('click', () => {
    goBackToAddressBook();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const houseUnit = houseUnitInput.value.replace(/\s+/g, ' ').trim();
    const streetName = streetNameInput.value.replace(/\s+/g, ' ').trim();
    const barangay = barangaySelect.value.trim();
    const additionalDetails = additionalDetailsInput.value.replace(/\s+/g, ' ').trim();

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

    if (additionalDetails && !isValidAdditionalDetailsFormat(additionalDetails)) {
      ns.setFieldError(additionalDetailsInput, additionalDetailsError, 'Landmark/details can only use letters, numbers, spaces, commas, and hyphens.');
      hasError = true;
    }

    if (hasError || !activeUser || !activeUser.uid) return;

    houseUnitInput.value = houseUnit;
    streetNameInput.value = streetName;
    additionalDetailsInput.value = additionalDetails;

    const payload = { houseUnit, streetName, barangay, additionalDetails };

    try {
      await usersDb.saveAddress(activeUser.uid, payload);
      await ns.showNotice('Address saved successfully.');
      goBackToAddressBook();
    } catch (error) {
      await ns.showNotice(error && error.message ? error.message : 'Failed to save address.');
    }
  });

  usersDb.auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = '../../login.html';
      return;
    }
    activeUser = user;
  });
});
