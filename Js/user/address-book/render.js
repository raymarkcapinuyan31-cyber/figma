(function () {
  const ns = (window.hfsAddressBook = window.hfsAddressBook || {});

  ns.renderList = function renderList(list, addresses, handlers) {
    list.innerHTML = '';

    if (!addresses.length) {
      const empty = document.createElement('div');
      empty.className = 'address-item';
      empty.innerHTML = '<div class="address-content"><strong>No saved addresses yet</strong><span>Click Add New Address to create one.</span></div>';
      list.appendChild(empty);
      return;
    }

    addresses.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'address-item';

      const content = document.createElement('div');
      content.className = 'address-content';
      const houseUnit = item.houseUnit || item.house_no_unit || item.houseNo || '';
      const streetName = item.streetName || item.street || '';
      const barangay = item.barangay || item.baranggay || '';
      const details = item.additionalDetails || item.additional_details || item.details || '';
      const extra = details ? `<span>Details: ${details}</span>` : '';
      content.innerHTML = `<strong>${houseUnit}, ${streetName}</strong><span>${barangay}, Dagupan City</span>${extra}`;

      const actions = document.createElement('div');
      actions.className = 'address-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'edit-address-btn';
      editBtn.setAttribute('aria-label', 'Edit address');
      editBtn.title = 'Edit address';
      editBtn.innerHTML = '<img src="../../images/icons/edit-square.svg" alt="Edit">';
      editBtn.addEventListener('click', () => handlers.onEdit(item));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-address-btn';
      deleteBtn.setAttribute('aria-label', 'Delete address');
      deleteBtn.title = 'Delete address';
      deleteBtn.textContent = 'DELETE';
      deleteBtn.addEventListener('click', () => {
        if (handlers && typeof handlers.onDelete === 'function') {
          handlers.onDelete(item);
        }
      });

      actions.append(editBtn, deleteBtn);
      row.append(content, actions);
      list.appendChild(row);
    });
  };
})();
