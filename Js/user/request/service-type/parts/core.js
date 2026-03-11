document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('serviceTypeForm');
  const bookingTypeInputs = Array.from(document.querySelectorAll('input[name="booking_type"]'));
  const bookingTypeBox = document.getElementById('bookingTypeBox');
  const errorBookingType = document.getElementById('error-bookingType');

  if (!form || !bookingTypeBox || !errorBookingType) return;

  function clearError() {
    bookingTypeBox.classList.remove('invalid');
    errorBookingType.textContent = '';
  }

  function setError(message) {
    bookingTypeBox.classList.add('invalid');
    errorBookingType.textContent = message;
  }

  function goToDetails(selectedType) {
    window.location.href = `book-details.html?type=${encodeURIComponent(selectedType)}`;
  }

  bookingTypeInputs.forEach((input) => {
    input.addEventListener('change', () => {
      clearError();
      const selectedType = String(input.value || '').toLowerCase();
      if (selectedType === 'appointment' || selectedType === 'technician') {
        goToDetails(selectedType);
      }
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();

    const selectedInput = bookingTypeInputs.find((input) => input.checked);
    const selectedType = selectedInput ? String(selectedInput.value || '').toLowerCase() : '';

    if (selectedType !== 'appointment' && selectedType !== 'technician') {
      setError('Please choose a service type first.');
      bookingTypeBox.focus();
      return;
    }

    goToDetails(selectedType);
  });
});
