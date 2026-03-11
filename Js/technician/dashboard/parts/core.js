(function () {
  const ns = (window.hfsTechDashboard = window.hfsTechDashboard || {});
  const usersDb = window.usersDatabase || window.homefixDB || window.userProfileDatabase || null;

  const DEMO_SESSION_KEY = 'hfs_technician_demo_session';
  const DEMO_PROFILE_KEY = 'hfs_technician_demo_profile_v1';
  const FORCED_TECHNICIAN_EMAILS = new Set(['kingsnever721@gmail.com']);

  async function writeSessionLog(payload) {
    try {
      if (!usersDb || typeof usersDb.logSessionEvent !== 'function') return;
      await usersDb.logSessionEvent(payload || {});
    } catch (_) {
    }
  }

  ns.redirectToLogin = function redirectToLogin() {
    window.location.href = '../../login.html';
  };

  ns.bindSidebarToggle = function bindSidebarToggle() {
    const appShell = document.querySelector('.app-shell');
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (!sidebarToggle || !appShell) return;

    sidebarToggle.addEventListener('click', () => {
      const collapsed = appShell.classList.toggle('sidebar-collapsed');
      sidebarToggle.textContent = collapsed ? '☰' : '✕';
      sidebarToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  };

  ns.bindUserMenu = function bindUserMenu() {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenu = document.getElementById('userMenu');
    if (!userMenuBtn || !userMenu) return;

    function closeMenu() {
      userMenu.classList.remove('open');
      userMenu.setAttribute('aria-hidden', 'true');
      userMenuBtn.setAttribute('aria-expanded', 'false');
    }

    userMenuBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = userMenu.classList.toggle('open');
      userMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      userMenuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', (event) => {
      if (!userMenu.contains(event.target) && !userMenuBtn.contains(event.target)) {
        closeMenu();
      }
    });
  };

  ns.setTopbarName = function setTopbarName(name) {
    const userMenuBtn = document.getElementById('userMenuBtn');
    if (!userMenuBtn) return;
    userMenuBtn.innerHTML = `${name} <span class="caret">▼</span>`;
  };

  ns.hasDemoSession = function hasDemoSession() {
    try {
      const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return parsed && parsed.role === 'technician';
    } catch (_) {
      return false;
    }
  };

  ns.bindAuthState = function bindAuthState() {
    if (ns.hasDemoSession()) {
      ns.setTopbarName('Technician');
      return;
    }

    if (!(usersDb && usersDb.auth)) {
      ns.redirectToLogin();
      return;
    }

    let seenAuthenticatedUser = false;
    const initialAuthTimeout = setTimeout(() => {
      if (!seenAuthenticatedUser) {
        ns.redirectToLogin();
      }
    }, 3000);

    usersDb.auth.onAuthStateChanged(async (user) => {
      if (!user) {
        if (!seenAuthenticatedUser) return;
        ns.redirectToLogin();
        return;
      }

       seenAuthenticatedUser = true;
       clearTimeout(initialAuthTimeout);

      try {
        let profile = await usersDb.getUserById(user.uid);
        if ((!profile || !profile.role) && user.email && typeof usersDb.getUserByEmail === 'function') {
          const byEmail = await usersDb.getUserByEmail(user.email);
          if (byEmail) {
            profile = Object.assign({}, profile, byEmail, { uid: user.uid, email: user.email || byEmail.email || '' });
            const byEmailRole = String(byEmail.role || '').trim().toLowerCase();
            if ((byEmailRole === 'technician' || byEmailRole === 'admin') && typeof usersDb.updateUserProfile === 'function') {
              await usersDb.updateUserProfile(user.uid, {
                uid: user.uid,
                email: String(user.email || byEmail.email || '').trim().toLowerCase(),
                first_name: String(byEmail.first_name || '').trim(),
                middle_name: String(byEmail.middle_name || '').trim(),
                last_name: String(byEmail.last_name || '').trim(),
                role: byEmailRole,
                isActive: byEmail.isActive !== false,
                isVerified: true,
                emailVerified: true
              });
            }
          }
        }

        const role = String(profile && profile.role ? profile.role : '').toLowerCase();
        const normalizedEmail = String((profile && profile.email) || user.email || '').trim().toLowerCase();

        if (normalizedEmail && FORCED_TECHNICIAN_EMAILS.has(normalizedEmail) && role !== 'technician') {
          try {
            if (typeof usersDb.updateUserProfile === 'function') {
              await usersDb.updateUserProfile(user.uid, {
                uid: user.uid,
                email: normalizedEmail,
                first_name: String(profile && profile.first_name ? profile.first_name : '').trim(),
                middle_name: String(profile && profile.middle_name ? profile.middle_name : '').trim(),
                last_name: String(profile && profile.last_name ? profile.last_name : '').trim(),
                role: 'technician',
                isActive: profile && Object.prototype.hasOwnProperty.call(profile, 'isActive') ? profile.isActive : true,
                isVerified: true,
                emailVerified: true
              });
            }

            if (usersDb && usersDb.firebase && typeof usersDb.firebase.database === 'function') {
              const rtdb = usersDb.firebase.database();
              await rtdb.ref(`technicians/${user.uid}`).update(Object.assign({}, profile || {}, {
                uid: user.uid,
                email: normalizedEmail,
                role: 'technician',
                isActive: profile && Object.prototype.hasOwnProperty.call(profile, 'isActive') ? profile.isActive : true,
                isVerified: true,
                emailVerified: true,
                updatedAt: Date.now()
              }));
              try { await rtdb.ref(`users/${user.uid}`).remove(); } catch (_) {}
              try { await rtdb.ref(`customers/${user.uid}`).remove(); } catch (_) {}
            }
          } catch (_) {
          }

          const forcedDisplayName = [profile && profile.first_name || '', profile && profile.last_name || ''].join(' ').trim() || user.email || 'Technician';
          ns.setTopbarName(forcedDisplayName);
          return;
        }

        if (role && role !== 'technician') {
          await usersDb.signOut();
          ns.redirectToLogin();
          return;
        }

        const displayName = [profile && profile.first_name || '', profile && profile.last_name || ''].join(' ').trim() || user.email || 'Technician';
        ns.setTopbarName(displayName);
      } catch (_) {
        ns.setTopbarName(user.email || 'Technician');
      }
    });
  };

  ns.bindSignOut = function bindSignOut() {
    const signOutLinks = document.querySelectorAll('[data-logout="true"]');
    signOutLinks.forEach((signOutLink) => {
      signOutLink.setAttribute('href', '#');
      signOutLink.addEventListener('click', async (event) => {
        event.preventDefault();

        const demoSession = (() => {
          try {
            const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
          } catch (_) {
            return null;
          }
        })();

        const authUser = usersDb && usersDb.auth ? usersDb.auth.currentUser : null;
        const uid = String(authUser && authUser.uid ? authUser.uid : '').trim();
        const email = String(
          (authUser && authUser.email) ||
          (demoSession && demoSession.email) ||
          ''
        ).trim().toLowerCase();

        if (usersDb && typeof usersDb.endRoleSession === 'function') {
          await usersDb.endRoleSession({
            role: 'technician',
            uid,
            email,
            name: email || 'Technician',
            source: demoSession ? 'technician-demo' : 'technician-dashboard'
          });
        } else {
          await writeSessionLog({
            role: 'technician',
            action: 'logout',
            uid,
            email,
            name: email || 'Technician',
            source: demoSession ? 'technician-demo' : 'technician-dashboard'
          });
        }

        try {
          sessionStorage.removeItem(DEMO_SESSION_KEY);
          sessionStorage.removeItem(DEMO_PROFILE_KEY);
        } catch (_) {
        }

        if (usersDb && typeof usersDb.signOut === 'function') {
          try {
            await usersDb.signOut();
          } catch (_) {
          }
        }

        ns.redirectToLogin();
      });
    });
  };
})();
