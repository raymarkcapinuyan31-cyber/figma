document.addEventListener('DOMContentLoaded', () => {
  const ns = window.hfsAddressBook || {};
  const usersDb = window.usersDatabase || window.homefixDB || window.userProfileDatabase || null;

  const list = document.getElementById('addressList');
  const addNewBtn = document.getElementById('addNewAddressBtn');
  const deleteModal = document.getElementById('deleteAddressModal');
  const deleteNoBtn = document.getElementById('deleteAddressNoBtn');
  const deleteYesBtn = document.getElementById('deleteAddressYesBtn');

  if (!list || !usersDb || !usersDb.auth) return;

  let activeUser = null;
  let renderNonce = 0;
  let deleteModalResolver = null;

  function closeDeleteModal(result) {
    if (deleteModal) {
      deleteModal.hidden = true;
      deleteModal.setAttribute('aria-hidden', 'true');
    }
    if (deleteModalResolver) {
      deleteModalResolver(!!result);
      deleteModalResolver = null;
    }
  }

  function askDeleteConfirmation() {
    if (!deleteModal || !deleteNoBtn || !deleteYesBtn) {
      return Promise.resolve(window.confirm('Delete this address?'));
    }

    deleteModal.hidden = false;
    deleteModal.setAttribute('aria-hidden', 'false');
    deleteYesBtn.focus();

    return new Promise((resolve) => {
      deleteModalResolver = resolve;
    });
  }

  async function loadAddresses() {
    if (!activeUser || !activeUser.uid) return [];
    return await usersDb.getAddresses(activeUser.uid);
  }

  async function render() {
    const nonce = ++renderNonce;
    list.innerHTML = '';

    if (!activeUser || !activeUser.uid) {
      const loading = document.createElement('div');
      loading.className = 'address-item';
      loading.innerHTML = '<div class="address-content"><strong>Loading saved addresses…</strong><span>Please wait a moment.</span></div>';
      list.appendChild(loading);
      return;
    }

    let addresses = [];
    try {
      addresses = await loadAddresses();
    } catch {
      if (nonce !== renderNonce) return;
      const loading = document.createElement('div');
      loading.className = 'address-item';
      loading.innerHTML = '<div class="address-content"><strong>Loading saved addresses…</strong><span>Syncing your account.</span></div>';
      list.appendChild(loading);
      return;
    }

    if (nonce !== renderNonce) return;

    ns.renderList(list, addresses, {
      onEdit(item) {
        const addressId = String(item && item.id ? item.id : '').trim();
        if (!addressId) return;
        window.location.href = `address-edit.html?id=${encodeURIComponent(addressId)}`;
      },
      async onDelete(item) {
        if (!activeUser || !activeUser.uid) return;
        const addressId = String(item && item.id ? item.id : '').trim();
        if (!addressId) return;

        const confirmed = await askDeleteConfirmation();
        if (!confirmed) return;

        try {
          const ok = await usersDb.deleteAddress(activeUser.uid, addressId);
          if (!ok) {
            await ns.showNotice('Unable to delete this address.');
            return;
          }
          await ns.showNotice('Address deleted successfully.');
          await render();
        } catch (error) {
          await ns.showNotice(error && error.message ? error.message : 'Failed to delete address.');
        }
      }
    });
  }

  const initialUser = ns.resolveInitialUser();
  if (initialUser && initialUser.uid) {
    activeUser = initialUser;
  }
  void render();

  if (addNewBtn) {
    addNewBtn.addEventListener('click', () => {
      window.location.href = 'address-add.html';
    });
  }

  if (deleteNoBtn) {
    deleteNoBtn.addEventListener('click', () => {
      closeDeleteModal(false);
    });
  }

  if (deleteYesBtn) {
    deleteYesBtn.addEventListener('click', () => {
      closeDeleteModal(true);
    });
  }

  if (deleteModal) {
    deleteModal.addEventListener('click', (event) => {
      if (event.target === deleteModal) {
        closeDeleteModal(false);
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && deleteModal && !deleteModal.hidden) {
      closeDeleteModal(false);
    }
  });

  usersDb.auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = '../../login.html';
      return;
    }
    activeUser = user;
    await render();
  });
});
