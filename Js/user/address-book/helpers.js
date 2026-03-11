(function () {
  const ns = (window.hfsAddressBook = window.hfsAddressBook || {});

  ns.setFieldError = function setFieldError(inputEl, errorEl, message) {
    inputEl.classList.add('invalid');
    errorEl.textContent = message;
  };

  ns.clearFieldError = function clearFieldError(inputEl, errorEl) {
    inputEl.classList.remove('invalid');
    errorEl.textContent = '';
  };

  ns.resolveInitialUser = function resolveInitialUser() {
    const usersDb = window.usersDatabase || window.homefixDB || window.userProfileDatabase || null;
    const auth = usersDb && usersDb.auth ? usersDb.auth : null;
    if (auth && auth.currentUser && auth.currentUser.uid) {
      return auth.currentUser;
    }

    const fallbackUid = localStorage.getItem('hfs_auth_uid');
    if (fallbackUid) {
      return { uid: fallbackUid };
    }

    return null;
  };

  ns.showNotice = function showNotice(message) {
    const modal = document.getElementById('addressNoticeModal');
    const messageEl = document.getElementById('addressNoticeMessage');
    const okBtn = document.getElementById('addressNoticeOkBtn');

    if (!modal || !messageEl || !okBtn) {
      alert(String(message || 'Done.'));
      return Promise.resolve();
    }

    if (!ns._noticeState) {
      ns._noticeState = { resolver: null };
    }

    function closeNotice() {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      if (ns._noticeState && typeof ns._noticeState.resolver === 'function') {
        ns._noticeState.resolver();
        ns._noticeState.resolver = null;
      }
    }

    if (modal.dataset.noticeBound !== '1') {
      modal.dataset.noticeBound = '1';

      okBtn.addEventListener('click', closeNotice);
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeNotice();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !modal.hidden) closeNotice();
      });
    }

    messageEl.textContent = String(message || 'Done.');
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    okBtn.focus();

    return new Promise((resolve) => {
      ns._noticeState.resolver = resolve;
    });
  };
})();
