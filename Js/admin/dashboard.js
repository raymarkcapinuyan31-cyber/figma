(function () {
	const ADMIN_DEMO_SESSION_KEY = 'hfs_admin_demo_session';
	const ADMIN_DEMO_AUTH_KEY = 'hfs_admin_demo_firebase_auth_v1';
	const FIREBASE_FUNCTIONS_REGION = 'asia-southeast1';
	const usersDb = window.usersDatabase || window.homefixDB || null;
	const FORCED_TECHNICIAN_EMAILS = ['kingsnever721@gmail.com'];
	const PSGC_BASE_URL = 'https://psgc.gitlab.io/api';
	const NORTH_LUZON_PROVINCES = [
		{ name: 'Abra', code: '140100000' },
		{ name: 'Apayao', code: '148100000' },
		{ name: 'Aurora', code: '037700000' },
		{ name: 'Bataan', code: '030800000' },
		{ name: 'Batanes', code: '020900000' },
		{ name: 'Benguet', code: '141100000' },
		{ name: 'Bulacan', code: '031400000' },
		{ name: 'Cagayan', code: '021500000' },
		{ name: 'Ifugao', code: '142700000' },
		{ name: 'Ilocos Norte', code: '012800000' },
		{ name: 'Ilocos Sur', code: '012900000' },
		{ name: 'Isabela', code: '023100000' },
		{ name: 'Kalinga', code: '143200000' },
		{ name: 'La Union', code: '013300000' },
		{ name: 'Mountain Province', code: '144400000' },
		{ name: 'Nueva Ecija', code: '034900000' },
		{ name: 'Nueva Vizcaya', code: '025000000' },
		{ name: 'Pampanga', code: '035400000' },
		{ name: 'Pangasinan', code: '015500000' },
		{ name: 'Quirino', code: '025700000' },
		{ name: 'Tarlac', code: '036900000' },
		{ name: 'Zambales', code: '037100000' }
	];
	const provinceCityCache = new Map();
	const cityBarangayCache = new Map();
	const DAGUPAN_PROVINCE_CODE = '015500000';
	const DAGUPAN_CITY_CODE = '015518000';
	const DAGUPAN_CITY_NAME = 'Dagupan City';
	const DAGUPAN_PROVINCE_NAME = 'Pangasinan';
	const ACTIVE_STATUSES = new Set(['accepted', 'confirmed', 'in-progress', 'ongoing']);
	const DONE_STATUSES = new Set(['completed', 'finished', 'done']);
	const LATE_COMPLETION_THRESHOLD_MS = 60 * 60 * 1000;
	const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'declined', 'rejected']);
	const TABLE_PAGE_SIZE = 10;
	const ACCOUNTS_PAGE_SIZE = TABLE_PAGE_SIZE;
	const REQUESTS_PAGE_SIZE = TABLE_PAGE_SIZE;
	const REPORTS_PAGE_SIZE = TABLE_PAGE_SIZE;
	const SESSION_LOGS_PAGE_SIZE = 10;
	const state = {
		accounts: [],
		accountsPage: 1,
		sessionPresenceByUid: {},
		latestCustomerLoginLogIdByUid: {},
		requests: [],
		allRequests: [],
		visibleRequests: [],
		requestsPage: 1,
		reports: [],
		reportsPage: 1,
		sessionLogs: [],
		sessionLogsPage: 1,
		sessionRoleFilter: 'customer',
		sessionActionFilter: 'login',
		requestStatusFilter: 'pending',
		requestDoneLateFilter: 'all',
		reportsTypeFilter: 'all',
		accountRoleFilter: 'all',
		accountSearchQuery: '',
		accountStatusFilter: 'all'
	};
	let invitePopupTimer = null;
	let unsubscribeRequests = null;
	let unsubscribeAccounts = null;
	let unsubscribeSessionLogs = null;
	let unsubscribeReports = null;
	let unsubscribeSessionPresence = [];
	let requestActionFallbackBound = false;
	let pendingAccountActionResolver = null;
	let technicianAggregateSyncInFlight = false;
	let technicianAggregateSyncQueued = false;

	function readAdminSession() {
		try {
			const raw = sessionStorage.getItem(ADMIN_DEMO_SESSION_KEY);
			return raw ? JSON.parse(raw) : null;
		} catch (_) {
			return null;
		}
	}

	function clearAdminSession() {
		try {
			sessionStorage.removeItem(ADMIN_DEMO_SESSION_KEY);
		} catch (_) {
		}
	}

	function writeAdminSession(session) {
		if (!session || typeof session !== 'object') return;
		try {
			sessionStorage.setItem(ADMIN_DEMO_SESSION_KEY, JSON.stringify(session));
		} catch (_) {
		}
	}

	function isDisposableDemoAdminEmail(value) {
		const email = normalizeLower(value);
		return /^admin\.demo\.[^@]+@homefixsolution\.app$/.test(email);
	}

	function clearStoredAdminAuth() {
		try {
			localStorage.removeItem(ADMIN_DEMO_AUTH_KEY);
		} catch (_) {
		}
	}

	function readStoredAdminAuth() {
		try {
			const parsed = JSON.parse(localStorage.getItem(ADMIN_DEMO_AUTH_KEY) || '{}');
			const email = normalizeLower(parsed && parsed.email);
			if (isDisposableDemoAdminEmail(email)) {
				clearStoredAdminAuth();
				return {
					email: '',
					password: ''
				};
			}
			return {
				email,
				password: normalizeText(parsed && parsed.password)
			};
		} catch (_) {
			return {
				email: '',
				password: ''
			};
		}
	}

	function writeStoredAdminAuth(email, password) {
		const normalizedEmail = normalizeLower(email);
		const normalizedPassword = normalizeText(password);
		if (isDisposableDemoAdminEmail(normalizedEmail)) {
			clearStoredAdminAuth();
			return;
		}
		if (!normalizedEmail || !normalizedPassword) return;
		try {
			localStorage.setItem(ADMIN_DEMO_AUTH_KEY, JSON.stringify({
				email: normalizedEmail,
				password: normalizedPassword
			}));
		} catch (_) {
		}
	}

	function syncStoredAdminAuthEmail(email) {
		const normalizedEmail = normalizeLower(email);
		if (isDisposableDemoAdminEmail(normalizedEmail)) {
			clearStoredAdminAuth();
			return;
		}
		if (!normalizedEmail) return;
		const stored = readStoredAdminAuth();
		try {
			localStorage.setItem(ADMIN_DEMO_AUTH_KEY, JSON.stringify({
				email: normalizedEmail,
				password: normalizeText(stored.password)
			}));
		} catch (_) {
		}
	}

	function syncAdminSessionEmail(email) {
		const normalizedEmail = normalizeLower(email);
		if (!normalizedEmail) return;
		const session = readAdminSession();
		if (!session || typeof session !== 'object') return;
		writeAdminSession(Object.assign({}, session, {
			username: normalizedEmail,
			email: normalizedEmail
		}));
	}

	function getFunctionsBaseUrl() {
		const config = window.HOMEFIX_FIREBASE_CONFIG || {};
		const projectId = normalizeText(config.projectId);
		if (!projectId) return '';
		return `https://${FIREBASE_FUNCTIONS_REGION}-${projectId}.cloudfunctions.net`;
	}

	async function syncAccountAccessStateWithFirebaseAuth(userId, email, role, shouldEnable) {
		const authUser = usersDb && usersDb.auth ? usersDb.auth.currentUser : null;
		if (!authUser || typeof authUser.getIdToken !== 'function') {
			throw new Error('Admin authentication is unavailable.');
		}

		const baseUrl = getFunctionsBaseUrl();
		if (!baseUrl) {
			throw new Error('Firebase Functions is not configured.');
		}

		const response = await fetch(`${baseUrl}/syncAccountAccessState`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${await authUser.getIdToken(true)}`
			},
			body: JSON.stringify({
				userId: normalizeText(userId),
				email: normalizeLower(email),
				role: normalizeLower(role),
				disabled: !shouldEnable
			})
		});

		const payload = await response.json().catch(() => ({}));
		if (!response.ok || !payload || payload.ok !== true) {
			throw new Error(normalizeText(payload && payload.message) || 'Failed to sync Firebase account state.');
		}

		return payload;
	}

	async function ensureDemoAdminFirebaseAuth(session) {
		const role = normalizeLower(session && session.role);
		if (role && role !== 'admin') return true;

		if (!usersDb || typeof usersDb.signInWithEmail !== 'function') return false;
		let currentUser = usersDb.auth && usersDb.auth.currentUser ? usersDb.auth.currentUser : null;
		const ensureAdminProfile = async (authUser) => {
			if (!authUser || !authUser.uid || !usersDb || typeof usersDb.updateUserProfile !== 'function') return;
			try {
				await usersDb.updateUserProfile(authUser.uid, {
					uid: authUser.uid,
					email: normalizeLower(authUser.email || ''),
					first_name: 'Admin',
					middle_name: '',
					last_name: 'User',
					role: 'admin',
					isActive: true,
					isVerified: !!authUser.emailVerified,
					emailVerified: !!authUser.emailVerified,
					updatedAt: Date.now()
				});
			} catch (_) {
			}
		};

		if (currentUser && isDisposableDemoAdminEmail(currentUser.email)) {
			clearStoredAdminAuth();
			try {
				if (typeof usersDb.signOut === 'function') {
					await usersDb.signOut();
				}
			} catch (_) {
			}
			currentUser = null;
		}

		if (currentUser) {
			await ensureAdminProfile(currentUser);
			return true;
		}

		const storedAdminAuth = readStoredAdminAuth();
		const savedEmail = storedAdminAuth.email;
		const savedPassword = storedAdminAuth.password;

		if (savedEmail && savedPassword) {
			try {
				await usersDb.signInWithEmail(savedEmail, savedPassword);
				await ensureAdminProfile(usersDb.auth && usersDb.auth.currentUser ? usersDb.auth.currentUser : null);
				return true;
			} catch (_) {
				clearStoredAdminAuth();
			}
		}

		return false;
	}

	async function waitForCurrentAuthUser(timeoutMs) {
		const auth = usersDb && usersDb.auth ? usersDb.auth : null;
		if (!auth) return null;
		if (auth.currentUser) return auth.currentUser;
		if (typeof auth.onAuthStateChanged !== 'function') return auth.currentUser || null;

		const waitMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : 1200;
		return new Promise((resolve) => {
			let settled = false;
			let unsub = null;
			const finish = (user) => {
				if (settled) return;
				settled = true;
				try {
					if (typeof unsub === 'function') unsub();
				} catch (_) {
				}
				resolve(user || null);
			};

			const timer = setTimeout(() => {
				finish(auth.currentUser || null);
			}, waitMs);

			unsub = auth.onAuthStateChanged((user) => {
				clearTimeout(timer);
				finish(user || null);
			}, () => {
				clearTimeout(timer);
				finish(auth.currentUser || null);
			});
		});
	}

	function normalizeText(value) {
		return String(value || '').trim();
	}

	function normalizeLower(value) {
		return normalizeText(value).toLowerCase();
	}

	function buildAdminDemoPasswordCandidates() {
		const stamp = Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '');
		const base = (stamp + 'X7').slice(-4);
		return [
			`Ad#${base}a1`,
			`HF#${base}a2`,
			`Ax#${base}B3`
		].filter((value) => value.length >= 8 && value.length <= 12);
	}

	function toApprovedSkillCategory(value) {
		const normalized = normalizeLower(value);
		if (!normalized) return '';
		if (/\bhvac\b|\bair\s*con\b|\bair\s*conditioning\b|\bairconditioner\b|\bac\b/.test(normalized)) return 'HVAC Technician';
		if (/\bappliance\b|\brefrigerator\b|\bref\b|\bwasher\b|\bwashing\b|\bmicrowave\b|\boven\b/.test(normalized)) return 'Appliance Repair Technician';
		if (/\belectric\b|\belectrical\b|\belectrician\b|\bwiring\b|\bcircuit\b|\boutlet\b/.test(normalized)) return 'Electrician';
		if (/\bplumb\b|\bplumber\b|\bpipe\b|\bdrain\b|\bfaucet\b|\btoilet\b|\bsink\b|\bleak\b/.test(normalized)) return 'Plumber';
		return normalizeText(value);
	}

	function getRequestBucketByStatus(status) {
		const normalizedStatus = normalizeLower(status);
		if (CANCELLED_STATUSES.has(normalizedStatus)) return 'cancelled';
		if (DONE_STATUSES.has(normalizedStatus)) return 'done';
		if (ACTIVE_STATUSES.has(normalizedStatus)) return 'active';
		return 'pending';
	}

	function formatShortId(value) {
		const id = normalizeText(value);
		if (!id) return '-';
		if (id.length <= 12) return id;
		return `${id.slice(0, 6)}...${id.slice(-4)}`;
	}

	function renderShortIdCell(value) {
		const full = normalizeText(value);
		const short = formatShortId(full);
		if (!full || short === '-') return '-';
		if (short === full) return escapeHtml(full);
		return `<span title="${escapeHtml(full)}">${escapeHtml(short)}</span>`;
	}

	function renderRequestStatusBadgeByStatus(status) {
		const bucket = getRequestBucketByStatus(status);
		const label = formatRequestStatusText(status);
		if (!label || label === '-') return '-';
		return `<span class="request-status-badge ${escapeHtml(bucket)}"><span class="request-status-dot" aria-hidden="true"></span><span>${escapeHtml(label)}</span></span>`;
	}

	function toStableCodeDigits(source) {
		const text = normalizeText(source);
		if (!text) return '00000';
		let hash = 0;
		for (let i = 0; i < text.length; i += 1) {
			hash = ((hash * 33) + text.charCodeAt(i)) >>> 0;
		}
		return String(hash % 100000).padStart(5, '0');
	}

	function buildCustomerCodeFromUid(uid) {
		const cleanUid = normalizeText(uid);
		if (!cleanUid) return '';
		return `C-${toStableCodeDigits(cleanUid)}`;
	}

	function normalizeCustomerCode(rawCode, uidFallback) {
		const code = normalizeText(rawCode).toUpperCase();
		if (code.startsWith('CUS-')) {
			return `C-${code.slice(4)}`;
		}
		if (code.startsWith('C-')) {
			return code;
		}
		return buildCustomerCodeFromUid(uidFallback);
	}

	function getCustomerCode(item) {
		const uid = normalizeText(item && item.customerId);
		const explicitCode = normalizeCustomerCode(item && (item.customerCode || item.customerShortId), uid);
		if (explicitCode) return explicitCode;
		if (!uid) return '-';
		return buildCustomerCodeFromUid(uid) || '-';
	}

	function setAdminRequestDetailStatus(status) {
		const el = document.getElementById('adminDetailStatus');
		if (!el) return;
		const badgeMarkup = renderRequestStatusBadgeByStatus(status);
		if (badgeMarkup === '-') {
			el.textContent = '-';
			return;
		}
		el.innerHTML = badgeMarkup;
	}

	function buildSessionCodeFromId(sessionId) {
		const clean = normalizeText(sessionId);
		if (!clean) return '-';
		return `S-${toStableCodeDigits(clean)}`;
	}

	function buildRoleUserCode(uid, role) {
		const cleanUid = normalizeText(uid);
		if (!cleanUid) return '-';
		const normalizedRole = normalizeLower(role);
		const prefix = normalizedRole === 'technician' ? 'T' : 'C';
		return `${prefix}-${toStableCodeDigits(cleanUid)}`;
	}

	function formatTechnicianReference(emailValue, uidValue) {
		const uid = normalizeText(uidValue);
		if (uid) return buildRoleUserCode(uid, 'technician');

		const email = normalizeText(emailValue).toLowerCase();
		if (email && email.includes('@')) {
			return `T-${toStableCodeDigits(email)}`;
		}

		return '-';
	}

	function getReportCategory(item) {
		const explicit = normalizeLower(item && (item.reportCategory || item.category || item.type));
		if (explicit === 'concern' || explicit === 'customer-concern' || explicit === 'customer_concern') return 'concern';
		if (explicit === 'technician' || explicit === 'technician-report' || explicit === 'technician_report') return 'technician';

		const source = normalizeLower(item && item.source);
		if (source.includes('customer-account') || source.includes('concern')) return 'concern';
		return 'technician';
	}

	function getReportCategoryLabel(category) {
		return category === 'concern' ? 'Customer Concern' : 'Technician Report';
	}

	function renderReportTypeBadge(category) {
		const safeCategory = category === 'concern' ? 'concern' : 'technician';
		return `<span class="report-type-chip ${escapeHtml(safeCategory)}">${escapeHtml(getReportCategoryLabel(safeCategory))}</span>`;
	}

	function getFilteredReports(list, typeFilter) {
		const reports = Array.isArray(list) ? list : [];
		const filter = normalizeLower(typeFilter || 'all');
		if (filter !== 'technician' && filter !== 'concern') return reports;
		return reports.filter((item) => getReportCategory(item) === filter);
	}

	function getSessionUid(item) {
		return normalizeText(item && item.uid);
	}

	function getSessionTimestamp(item) {
		return getTimestampFromRecord(item);
	}

	function getAccountUid(account) {
		return normalizeText(account && (account.uid || account.id));
	}

	function isAccountOnline(account) {
		const uid = getAccountUid(account);
		if (!uid) return false;
		return !!(state.sessionPresenceByUid && state.sessionPresenceByUid[uid]);
	}

	function isAccountEnabled(account) {
		return !(account && account.isActive === false);
	}

	function getAccountStatusText(account) {
		return isAccountEnabled(account) ? 'Enabled' : 'Disabled';
	}

	function getAccountById(userId) {
		const targetId = normalizeText(userId);
		if (!targetId) return null;
		const list = Array.isArray(state.accounts) ? state.accounts : [];
		for (let index = 0; index < list.length; index += 1) {
			const account = list[index];
			if (getAccountUid(account) === targetId) return account;
		}
		return null;
	}

	async function ensureAdminRealtimeAccess(authUser) {
		const user = authUser || (usersDb && usersDb.auth ? usersDb.auth.currentUser : null);
		const uid = normalizeText(user && user.uid);
		if (!uid) return false;

		const rtdb = getRealtimeDatabase();
		if (!rtdb) return false;

		try {
			await rtdb.ref(`admins/${uid}`).update({
				uid,
				email: normalizeLower(user && user.email),
				role: 'admin',
				isActive: true,
				isVerified: !!(user && user.emailVerified),
				emailVerified: !!(user && user.emailVerified),
				updatedAt: Date.now()
			});
			try {
				await rtdb.ref(`users/${uid}`).remove();
			} catch (_) {
			}
			try {
				const adminsSnapshot = await rtdb.ref('admins').once('value');
				const adminsMap = adminsSnapshot && typeof adminsSnapshot.val === 'function' ? (adminsSnapshot.val() || {}) : {};
				await Promise.all(Object.keys(adminsMap).filter((adminUid) => normalizeText(adminUid) !== uid).map((adminUid) => {
					return rtdb.ref(`admins/${adminUid}`).remove().catch(() => {});
				}));
			} catch (_) {
			}
			return true;
		} catch (_) {
			return false;
		}
	}

	async function updateAccountActiveStateInRealtime(userId, shouldEnable, role, email) {
		const cleanUserId = normalizeText(userId);
		if (!cleanUserId) return false;

		const rtdb = getRealtimeDatabase();
		if (!rtdb) return false;

		const timestamp = Date.now();
		const payload = {
			isActive: !!shouldEnable,
			updatedAt: timestamp
		};
		const cleanRole = normalizeLower(role);
		const cleanEmail = normalizeLower(email);
		const statusPayload = {
			isActive: !!shouldEnable,
			updatedAt: timestamp,
			statusChangedAt: timestamp,
			disabledAt: shouldEnable ? null : timestamp,
			enabledAt: shouldEnable ? timestamp : null
		};
		if (cleanRole) statusPayload.role = cleanRole;
		if (cleanEmail) statusPayload.email = cleanEmail;

		const refs = {
			accountStatus: rtdb.ref(`accountStatus/${cleanUserId}`),
			admins: rtdb.ref(`admins/${cleanUserId}`),
			customers: rtdb.ref(`customers/${cleanUserId}`),
			technicians: rtdb.ref(`technicians/${cleanUserId}`),
			users: rtdb.ref(`users/${cleanUserId}`)
		};
		const seenRefs = new Set();
		const updates = [];
		const pushUpdate = (ref, extraPayload) => {
			if (!ref || typeof ref.update !== 'function') return;
			const key = normalizeText(ref.toString ? ref.toString() : '');
			if (key && seenRefs.has(key)) return;
			if (key) seenRefs.add(key);
			updates.push(ref.update(Object.assign({}, payload, extraPayload || {})));
		};
		const pushStatusUpdate = (targetUserId) => {
			const statusUserId = normalizeText(targetUserId);
			if (!statusUserId) return;
			const statusRef = statusUserId === cleanUserId
				? refs.accountStatus
				: rtdb.ref(`accountStatus/${statusUserId}`);
			pushUpdate(statusRef, statusPayload);
		};

		pushStatusUpdate(cleanUserId);

		const snapshots = await Promise.all([
			refs.admins.once('value').catch(() => null),
			refs.customers.once('value').catch(() => null),
			refs.technicians.once('value').catch(() => null),
			refs.users.once('value').catch(() => null)
		]);

		if (snapshots[0] && snapshots[0].exists()) pushUpdate(refs.admins, { role: 'admin' });
		if (snapshots[1] && snapshots[1].exists()) pushUpdate(refs.customers);
		if (snapshots[2] && snapshots[2].exists()) pushUpdate(refs.technicians);
		if (snapshots[3] && snapshots[3].exists()) pushUpdate(refs.users);

		if (cleanEmail) {
			const fieldCandidates = ['email', 'emailAddress', 'email_address'];
			const rootConfigs = [
				{ path: 'admins', rootRef: rtdb.ref('admins') },
				{ path: 'customers', rootRef: rtdb.ref('customers') },
				{ path: 'technicians', rootRef: rtdb.ref('technicians') },
				{ path: 'users', rootRef: rtdb.ref('users') }
			];

			for (let fieldIndex = 0; fieldIndex < fieldCandidates.length; fieldIndex += 1) {
				const field = fieldCandidates[fieldIndex];
				for (let rootIndex = 0; rootIndex < rootConfigs.length; rootIndex += 1) {
					const config = rootConfigs[rootIndex];
					let snapshot = null;
					try {
						snapshot = await config.rootRef.orderByChild(field).equalTo(cleanEmail).once('value');
					} catch (_) {
						snapshot = null;
					}
					const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
					Object.keys(value).forEach((matchedUid) => {
						const ref = rtdb.ref(`${config.path}/${matchedUid}`);
						pushUpdate(ref);
						pushStatusUpdate(matchedUid);
					});
				}
			}
		}

		if (!updates.length) {
			const targetRef = cleanRole === 'technician'
				? refs.technicians
				: (cleanRole === 'admin' ? refs.admins : refs.customers);
			pushUpdate(targetRef, cleanRole ? { role: cleanRole } : {});
		}

		await Promise.all(updates);
		return true;
	}

	function stopSessionPresenceTracking() {
		if (!Array.isArray(unsubscribeSessionPresence)) {
			unsubscribeSessionPresence = [];
			return;
		}
		unsubscribeSessionPresence.forEach((unsubscribe) => {
			if (typeof unsubscribe === 'function') {
				try {
					unsubscribe();
				} catch (_) {
				}
			}
		});
		unsubscribeSessionPresence = [];
	}

	function startSessionPresenceTracking() {
		stopSessionPresenceTracking();
		const rtdb = getRealtimeDatabase();
		if (!rtdb) return;

		const streams = {
			loginCustomers: [],
			logoutCustomers: [],
			loginTechnicians: [],
			logoutTechnicians: []
		};

		const recomputePresence = () => {
			const loginMap = {};
			const logoutMap = {};
			const latestCustomerLoginLogIdByUid = {};

			const applyLatest = (items, target) => {
				(items || []).forEach((item) => {
					const uid = getSessionUid(item);
					if (!uid) return;
					const stamp = getSessionTimestamp(item);
					if (!target[uid] || stamp > target[uid]) {
						target[uid] = stamp;
					}
				});
			};

			applyLatest(streams.loginCustomers, loginMap);
			applyLatest(streams.loginTechnicians, loginMap);
			applyLatest(streams.logoutCustomers, logoutMap);
			applyLatest(streams.logoutTechnicians, logoutMap);

			(streams.loginCustomers || []).forEach((item) => {
				const uid = getSessionUid(item);
				if (!uid) return;
				const stamp = getSessionTimestamp(item);
				const currentId = latestCustomerLoginLogIdByUid[uid];
				if (!currentId) {
					latestCustomerLoginLogIdByUid[uid] = {
						stamp,
						id: normalizeText(item && item.id)
					};
					return;
				}
				if (stamp >= (Number(currentId.stamp) || 0)) {
					latestCustomerLoginLogIdByUid[uid] = {
						stamp,
						id: normalizeText(item && item.id)
					};
				}
			});

			const presence = {};
			const allUids = new Set(Object.keys(loginMap).concat(Object.keys(logoutMap)));
			allUids.forEach((uid) => {
				const latestLogin = Number(loginMap[uid]) || 0;
				const latestLogout = Number(logoutMap[uid]) || 0;
				presence[uid] = latestLogin > latestLogout;
			});

			state.sessionPresenceByUid = presence;
			state.latestCustomerLoginLogIdByUid = Object.keys(latestCustomerLoginLogIdByUid).reduce((acc, uid) => {
				const entry = latestCustomerLoginLogIdByUid[uid] || {};
				acc[uid] = normalizeText(entry.id);
				return acc;
			}, {});

			renderRequestsTable();
			renderAccountsTable();
		};

		const watchPath = (path, streamKey) => {
			const ref = rtdb.ref(path).limitToLast(1000);
			const success = (snapshot) => {
				const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
				streams[streamKey] = Object.keys(value).map((id) => {
					const data = value[id] && typeof value[id] === 'object' ? value[id] : {};
					return Object.assign({ id }, data);
				});
				recomputePresence();
			};
			const failure = () => {
				streams[streamKey] = [];
				recomputePresence();
			};

			ref.on('value', success, failure);
			unsubscribeSessionPresence.push(() => {
				ref.off('value', success);
			});
		};

		watchPath('sessionLogs/login/customers', 'loginCustomers');
		watchPath('sessionLogs/logout/customers', 'logoutCustomers');
		watchPath('sessionLogs/login/technicians', 'loginTechnicians');
		watchPath('sessionLogs/logout/technicians', 'logoutTechnicians');
	}

	function formatRequestCode(item) {
		const source = normalizeText(item && (item.requestId || item.id));
		if (!source) return '-';
		if (usersDb && typeof usersDb.formatRequestCode === 'function') {
			return usersDb.formatRequestCode(item, source);
		}

		const bookingType = normalizeLower(item && item.bookingType);
		const requestMode = normalizeLower(item && item.requestMode);
		const serviceMode = normalizeLower(item && item.serviceMode);
		const prefix = (bookingType === 'appointment' || requestMode === 'drop-off-store' || serviceMode.includes('drop-off') || serviceMode.includes('store')) ? 'SD' : 'HS';
		let hash = 0;
		for (let i = 0; i < source.length; i += 1) {
			hash = ((hash * 33) + source.charCodeAt(i)) >>> 0;
		}
		return `${prefix}-${String(hash % 100000).padStart(5, '0')}`;
	}

	function titleCaseName(value) {
		return String(value || '')
			.toLowerCase()
			.trim()
			.replace(/\s+/g, ' ')
			.split(' ')
			.filter(Boolean)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	function generateTechnicianPassword() {
		const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		const lowercase = 'abcdefghijklmnopqrstuvwxyz';
		const digits = '0123456789';
		const specials = '!@#$%^&*';
		const all = uppercase + lowercase + digits + specials;

		const randomFrom = (source) => source.charAt(Math.floor(Math.random() * source.length));
		const targetLength = 8 + Math.floor(Math.random() * 5);

		const chars = [
			randomFrom(uppercase),
			randomFrom(lowercase),
			randomFrom(digits),
			randomFrom(specials)
		];

		while (chars.length < targetLength) {
			chars.push(randomFrom(all));
		}

		for (let index = chars.length - 1; index > 0; index -= 1) {
			const swapIndex = Math.floor(Math.random() * (index + 1));
			const current = chars[index];
			chars[index] = chars[swapIndex];
			chars[swapIndex] = current;
		}

		return chars.join('');
	}

	function validateCustomerStyleName(value, required, label) {
		const raw = String(value || '');
		if (!raw.trim()) return required ? `${label} is required.` : null;

		if (/^\s+|\s+$/.test(raw)) return 'Remove extra spaces.';
		if (/\s{2,}/.test(raw)) return 'One space only.';

		const clean = raw.trim();
		if (clean.length < 2 || clean.length > 15) return 'Use 2 to 15 letters.';

		const parts = clean.split(' ').filter(Boolean);
		if (parts.length > 1 && parts.every((part) => part.length === 1)) {
			return 'Enter full name.';
		}

		if (/\d/.test(clean)) return 'No numbers.';
		if (!/^[A-Za-z\s-]+$/.test(clean)) return 'No special characters (e.g., Anne-Marie).';
		if (!/^[A-Za-z]+(?:-[A-Za-z]+)?(?:\s[A-Za-z]+)*$/.test(clean)) return `Please enter a valid ${label.toLowerCase()}.`;

		return null;
	}

	function validateSuffix(value) {
		const raw = String(value || '');
		if (!raw.trim()) return null;
		if (/^\s+|\s+$/.test(raw)) return 'Remove spaces at the start or end.';
		if (/\s{2,}/.test(raw)) return 'Use only one space in suffix.';
		const clean = raw.trim();
		if (clean.length < 1 || clean.length > 10) return 'Suffix must be 1 to 10 characters.';
		if (!/^[A-Za-z0-9.\-\s]+$/.test(clean)) return 'Suffix has invalid characters.';
		return null;
	}

	function validateTechnicianMobile(value) {
		const raw = String(value || '').trim();
		if (!raw) return 'Mobile number is required.';
		const compact = raw.replace(/[\s\-()]/g, '');
		if (!/^(\+639\d{9}|09\d{9})$/.test(compact)) {
			return 'Use 09XXXXXXXXX or +639XXXXXXXXX format.';
		}
		return null;
	}

	function normalizeTechnicianMobile(value) {
		const compact = String(value || '').replace(/[\s\-()]/g, '').trim();
		if (!compact) return '';
		if (/^\+639\d{9}$/.test(compact)) return compact;
		if (/^09\d{9}$/.test(compact)) return `+63${compact.slice(1)}`;
		return compact;
	}

	function getSelectedTechnicianSkills() {
		const checkboxes = Array.from(document.querySelectorAll('#techSkillsInput input[name="techSkillsChoice"]'));
		return checkboxes
			.filter((input) => input && input.checked)
			.map((input) => normalizeText(input && input.value))
			.filter(Boolean);
	}

	function fillSelectOptions(select, items, placeholder, mapItem) {
		if (!select) return;
		const list = Array.isArray(items) ? items : [];
		const mapper = typeof mapItem === 'function'
			? mapItem
			: (entry) => ({ value: normalizeText(entry && entry.code), label: normalizeText(entry && entry.name) });

		const options = [`<option value="">${escapeHtml(placeholder || 'Select')}</option>`];
		list.forEach((entry) => {
			const mapped = mapper(entry) || {};
			const value = normalizeText(mapped.value);
			const label = normalizeText(mapped.label);
			if (!value || !label) return;
			options.push(`<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`);
		});
		select.innerHTML = options.join('');
	}

	function setLocationSelectLoading(select, text) {
		if (!select) return;
		select.innerHTML = `<option value="">${escapeHtml(text || 'Loading...')}</option>`;
	}

	async function fetchProvinceCities(provinceCode) {
		const code = normalizeText(provinceCode);
		if (!code) return [];
		if (provinceCityCache.has(code)) return provinceCityCache.get(code).slice();

		try {
			const response = await fetch(`${PSGC_BASE_URL}/provinces/${encodeURIComponent(code)}/cities-municipalities/`);
			if (!response.ok) throw new Error(`Failed to load cities (${response.status})`);
			const data = await response.json();
			const list = (Array.isArray(data) ? data : [])
				.map((entry) => ({
					code: normalizeText(entry && entry.code),
					name: normalizeText(entry && (entry.name || entry.cityName || entry.municipalityName))
				}))
				.filter((entry) => entry.code && entry.name)
				.sort((left, right) => left.name.localeCompare(right.name));

			provinceCityCache.set(code, list);
			return list.slice();
		} catch (_) {
			return [];
		}
	}

	async function fetchCityBarangays(cityCode) {
		const code = normalizeText(cityCode);
		if (!code) return [];
		if (cityBarangayCache.has(code)) return cityBarangayCache.get(code).slice();

		try {
			const response = await fetch(`${PSGC_BASE_URL}/cities-municipalities/${encodeURIComponent(code)}/barangays/`);
			if (!response.ok) throw new Error(`Failed to load barangays (${response.status})`);
			const data = await response.json();
			const list = (Array.isArray(data) ? data : [])
				.map((entry) => ({
					code: normalizeText(entry && entry.code),
					name: normalizeText(entry && entry.name)
				}))
				.filter((entry) => entry.code && entry.name)
				.sort((left, right) => left.name.localeCompare(right.name));

			cityBarangayCache.set(code, list);
			return list.slice();
		} catch (_) {
			return [];
		}
	}

	function getSelectedOptionText(select) {
		if (!select || !select.options || select.selectedIndex < 0) return '';
		const option = select.options[select.selectedIndex];
		return normalizeText(option && option.text);
	}

	function bindAdminCreateTechnicianLocation() {
		const barangaySelect = document.getElementById('techBarangay');
		if (!barangaySelect) return;

		setLocationSelectLoading(barangaySelect, 'Loading barangays...');
		fetchCityBarangays(DAGUPAN_CITY_CODE)
			.then((barangays) => {
				fillSelectOptions(
					barangaySelect,
					barangays,
					barangays.length ? 'Select barangay' : 'No barangays found',
					(entry) => ({
						value: normalizeText(entry && entry.name),
						label: normalizeText(entry && entry.name)
					})
				);
			})
			.catch(() => {
				fillSelectOptions(barangaySelect, [], 'No barangays found');
			});

		barangaySelect.addEventListener('change', () => {
			setTechFormFieldInvalid(barangaySelect, false);
		});
	}

	function escapeHtml(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function toDateValue(value) {
		if (!value) return 0;
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (typeof value === 'string') {
			const trimmed = value.trim();
			if (/^\d{10,}$/.test(trimmed)) {
				const numeric = Number(trimmed);
				if (Number.isFinite(numeric) && numeric > 0) return numeric;
			}
			const parsed = Date.parse(value);
			return Number.isNaN(parsed) ? 0 : parsed;
		}
		if (value && typeof value === 'object') {
			if (typeof value.seconds === 'number') {
				const nanos = typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
				return (value.seconds * 1000) + Math.floor(nanos / 1000000);
			}
			if (typeof value._seconds === 'number') {
				const nanos = typeof value._nanoseconds === 'number' ? value._nanoseconds : 0;
				return (value._seconds * 1000) + Math.floor(nanos / 1000000);
			}
		}
		if (value && typeof value.toMillis === 'function') return value.toMillis();
		if (value && typeof value.toDate === 'function') return value.toDate().getTime();
		return 0;
	}

	function getTimestampFromRecord(item) {
		if (!item || typeof item !== 'object') return 0;
		return toDateValue(
			item.createdAt
			|| item.timestamp
			|| item.created_at
			|| item.time
			|| item.reportedAt
			|| item.loggedAt
			|| item.updatedAt
		);
	}

	function formatDate(value) {
		const time = toDateValue(value);
		if (!time) return '-';
		try {
			return new Date(time).toLocaleString('en-US', {
				month: '2-digit',
				day: '2-digit',
				year: 'numeric',
				hour: 'numeric',
				minute: '2-digit'
			});
		} catch (_) {
			return '-';
		}
	}

	function formatDateOnly(value) {
		const time = toDateValue(value);
		if (!time) return '-';
		try {
			return new Date(time).toLocaleDateString('en-US', {
				month: '2-digit',
				day: '2-digit',
				year: 'numeric'
			});
		} catch (_) {
			return '-';
		}
	}

	function formatTimeOnly(value) {
		const time = toDateValue(value);
		if (!time) return '-';
		try {
			return new Date(time).toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit'
			});
		} catch (_) {
			return '-';
		}
	}

	function getFirestore() {
		if (!usersDb || usersDb.mode !== 'firebase') return null;
		if (!usersDb.firebase || typeof usersDb.firebase.firestore !== 'function') return null;
		return usersDb.firebase.firestore();
	}

	function getRealtimeDatabase() {
		if (!usersDb || usersDb.mode !== 'firebase') return null;
		if (!usersDb.firebase || typeof usersDb.firebase.database !== 'function') return null;
		return usersDb.firebase.database();
	}

	function getFirebaseConfig() {
		if (window.HOMEFIX_FIREBASE_CONFIG && typeof window.HOMEFIX_FIREBASE_CONFIG === 'object') {
			return window.HOMEFIX_FIREBASE_CONFIG;
		}
		return null;
	}

	async function provisionTechnicianAuth(email, initialPassword) {
		if (!window.firebase || typeof window.firebase.initializeApp !== 'function') {
			const error = new Error('Firebase Auth is unavailable.');
			error.code = 'auth/unavailable';
			throw error;
		}

		const config = getFirebaseConfig();
		if (!config) {
			const error = new Error('Firebase config is missing.');
			error.code = 'auth/config-missing';
			throw error;
		}

		const appName = `hfs-tech-provision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
		const secondaryApp = window.firebase.initializeApp(config, appName);
		const secondaryAuth = secondaryApp.auth();

		try {
			const credential = await secondaryAuth.createUserWithEmailAndPassword(email, initialPassword);
			await secondaryAuth.signOut();
			return credential && credential.user ? credential.user : null;
		} finally {
			try {
				await secondaryApp.delete();
			} catch (_) {
			}
		}
	}

	async function sendTechnicianInviteLink(email) {
		const normalizedEmail = normalizeLower(email);
		if (!normalizedEmail) {
			const error = new Error('Invalid email for invite.');
			error.code = 'auth/invalid-email';
			throw error;
		}

		try {
			if (usersDb && usersDb.firebase && typeof usersDb.firebase.auth === 'function') {
				await usersDb.firebase.auth().sendPasswordResetEmail(normalizedEmail);
				return;
			}

			if (window.firebase && typeof window.firebase.auth === 'function') {
				await window.firebase.auth().sendPasswordResetEmail(normalizedEmail);
				return;
			}
		} catch (_) {
		}

		const config = getFirebaseConfig();
		if (!window.firebase || typeof window.firebase.initializeApp !== 'function' || !config) {
			const fallbackError = new Error('Firebase Auth is unavailable for sending invite email.');
			fallbackError.code = 'auth/unavailable';
			throw fallbackError;
		}

		const appName = `hfs-tech-invite-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
		const inviteApp = window.firebase.initializeApp(config, appName);
		const inviteAuth = inviteApp.auth();
		try {
			await inviteAuth.sendPasswordResetEmail(normalizedEmail);
		} finally {
			try {
				await inviteApp.delete();
			} catch (_) {
			}
		}
	}

	async function saveTechnicianProfileAsSelf(email, password, payload) {
		const normalizedEmail = normalizeLower(email);
		const rawPassword = String(password || '');
		if (!normalizedEmail || !rawPassword || !payload || !payload.uid) {
			const error = new Error('Invalid technician profile payload.');
			error.code = 'auth/invalid-argument';
			throw error;
		}

		const config = getFirebaseConfig();
		if (!window.firebase || typeof window.firebase.initializeApp !== 'function' || !config) {
			const unavailableError = new Error('Firebase is unavailable for fallback profile save.');
			unavailableError.code = 'auth/unavailable';
			throw unavailableError;
		}

		const appName = `hfs-tech-profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
		const profileApp = window.firebase.initializeApp(config, appName);
		const profileAuth = profileApp.auth();
		const profileDb = profileApp.database();

		try {
			await profileAuth.signInWithEmailAndPassword(normalizedEmail, rawPassword);
			await profileDb.ref(`technicians/${String(payload.uid)}`).update(payload);
			try {
				await profileDb.ref(`users/${String(payload.uid)}`).remove();
			} catch (_) {
			}
			try {
				await profileDb.ref(`customers/${String(payload.uid)}`).remove();
			} catch (_) {
			}
		} finally {
			try {
				await profileAuth.signOut();
			} catch (_) {
			}
			try {
				await profileApp.delete();
			} catch (_) {
			}
		}
	}

	async function enforceTechnicianRealtimeProfile(uid, payload) {
		const cleanUid = normalizeText(uid);
		if (!cleanUid) return false;

		const rtdb = getRealtimeDatabase();
		if (!rtdb) return false;

		const now = Date.now();
		const safePayload = Object.assign({}, payload || {}, {
			uid: cleanUid,
			role: 'technician',
			isActive: true,
			isVerified: true,
			updatedAt: now,
			createdAt: Number(payload && payload.createdAt) || now
		});

		await rtdb.ref(`technicians/${cleanUid}`).update(safePayload);
		try {
			await rtdb.ref(`customers/${cleanUid}`).remove();
		} catch (_) {
		}
		try {
			await rtdb.ref(`users/${cleanUid}`).remove();
		} catch (_) {
		}

		return true;
	}

	async function canCurrentAuthManageTechnicians() {
		const authUser = usersDb && usersDb.auth && usersDb.auth.currentUser ? usersDb.auth.currentUser : null;
		const authUid = normalizeText(authUser && authUser.uid);
		if (!authUid) return false;

		try {
			if (usersDb && typeof usersDb.getUserById === 'function') {
				const profile = await usersDb.getUserById(authUid);
				if (normalizeLower(profile && profile.role) === 'admin') return true;
			}
		} catch (_) {
		}

		const session = readAdminSession();
		const sessionRole = normalizeLower(session && session.role);
		const username = normalizeLower(session && session.username);
		return sessionRole === 'admin' || username === 'admin';
	}

	async function ensureTechnicianNamesPersisted(uid, payload) {
		const cleanUid = normalizeText(uid);
		const rtdb = getRealtimeDatabase();
		if (!cleanUid || !rtdb || !payload || typeof payload !== 'object') return;

		const expectedFirst = normalizeText(payload.first_name);
		const expectedMiddle = normalizeText(payload.middle_name);
		const expectedLast = normalizeText(payload.last_name);

		if (!expectedFirst && !expectedMiddle && !expectedLast) return;

		let current = null;
		try {
			const snap = await rtdb.ref(`technicians/${cleanUid}`).once('value');
			current = snap && snap.exists() ? (snap.val() || {}) : {};
		} catch (_) {
			current = {};
		}

		const updates = {};
		if (expectedFirst && !normalizeText(current && current.first_name)) updates.first_name = expectedFirst;
		if (expectedMiddle && !normalizeText(current && current.middle_name)) updates.middle_name = expectedMiddle;
		if (expectedLast && !normalizeText(current && current.last_name)) updates.last_name = expectedLast;

		if (!Object.keys(updates).length) return;

		updates.uid = cleanUid;
		updates.role = 'technician';
		updates.updatedAt = Date.now();

		await rtdb.ref(`technicians/${cleanUid}`).update(updates);
	}

	async function migrateSpecificEmailsToTechnician() {
		if (!(await canCurrentAuthManageTechnicians())) return;

		if (!usersDb || typeof usersDb.getUserByEmail !== 'function' || typeof usersDb.updateUserProfile !== 'function') {
			return;
		}

		for (let i = 0; i < FORCED_TECHNICIAN_EMAILS.length; i += 1) {
			const email = normalizeLower(FORCED_TECHNICIAN_EMAILS[i]);
			if (!email) continue;

			try {
				const existing = await usersDb.getUserByEmail(email);
				const uid = normalizeText(existing && (existing.uid || existing.id));
				if (!uid) continue;

				const currentRole = normalizeLower(existing && existing.role);
				if (currentRole === 'technician') {
					await enforceTechnicianRealtimeProfile(uid, existing);
					continue;
				}

				const payload = {
					uid,
					email,
					first_name: normalizeText(existing && existing.first_name),
					middle_name: normalizeText(existing && existing.middle_name),
					last_name: normalizeText(existing && existing.last_name),
					suffix: normalizeText(existing && existing.suffix),
					role: 'technician',
					isActive: existing && Object.prototype.hasOwnProperty.call(existing, 'isActive') ? existing.isActive : true,
					isVerified: true,
					emailVerified: true,
					updatedAt: Date.now()
				};

				await usersDb.updateUserProfile(uid, payload);
				await enforceTechnicianRealtimeProfile(uid, payload);
			} catch (_) {
			}
		}
	}

	async function migrateLegacyUsersRootTechnicians() {
		if (!(await canCurrentAuthManageTechnicians())) return;

		const rtdb = getRealtimeDatabase();
		if (!rtdb) return;

		const forcedEmailSet = new Set(
			(FORCED_TECHNICIAN_EMAILS || []).map((entry) => normalizeLower(entry)).filter(Boolean)
		);

		let usersSnapshot = null;
		try {
			usersSnapshot = await rtdb.ref('users').once('value');
		} catch (_) {
			return;
		}

		if (!usersSnapshot || !usersSnapshot.exists()) return;

		const usersMap = usersSnapshot.val() || {};
		const uidList = Object.keys(usersMap);
		for (let i = 0; i < uidList.length; i += 1) {
			const uid = normalizeText(uidList[i]);
			if (!uid) continue;

			const candidate = usersMap[uid] && typeof usersMap[uid] === 'object' ? usersMap[uid] : null;
			const role = normalizeLower(candidate && candidate.role);
			const email = normalizeLower(candidate && candidate.email);
			const shouldForceTechnician = email && forcedEmailSet.has(email);
			if (role !== 'technician' && !shouldForceTechnician) continue;

			const payload = Object.assign({}, candidate, {
				uid,
				email,
				role: 'technician',
				isActive: candidate && Object.prototype.hasOwnProperty.call(candidate, 'isActive') ? candidate.isActive : true,
				isVerified: true,
				emailVerified: true,
				updatedAt: Date.now()
			});

			try {
				await enforceTechnicianRealtimeProfile(uid, payload);
			} catch (_) {
			}
		}
	}

	function getProfileName(profile) {
		const first = normalizeText(profile && profile.first_name);
		const middle = normalizeText(profile && profile.middle_name);
		const last = normalizeText(profile && profile.last_name);
		const middleInitial = middle ? `${middle.charAt(0).toUpperCase()}.` : '';
		const joined = [first, middleInitial, last].filter(Boolean).join(' ').trim();
		if (joined) return joined;
		return normalizeText(profile && profile.email) || 'Unknown';
	}

	function findAccountByUidOrEmail(uidValue, emailValue, roleValue) {
		const uid = normalizeText(uidValue);
		const email = normalizeLower(emailValue);
		const role = normalizeLower(roleValue);
		const accounts = Array.isArray(state.accounts) ? state.accounts : [];

		for (let index = 0; index < accounts.length; index += 1) {
			const account = accounts[index];
			const accountUid = normalizeText(account && (account.uid || account.id));
			const accountEmail = normalizeLower(account && account.email);
			const accountRole = normalizeLower(account && account.role);
			if (uid && accountUid && accountUid === uid) {
				if (!role || !accountRole || accountRole === role) return account;
			}
			if (email && accountEmail && accountEmail === email) {
				if (!role || !accountRole || accountRole === role) return account;
			}
		}

		return null;
	}

	function getFullNameParts(profile) {
		const first = normalizeText(profile && profile.first_name);
		const middle = normalizeText(profile && profile.middle_name);
		const last = normalizeText(profile && profile.last_name);
		const middleInitial = middle ? `${middle.charAt(0).toUpperCase()}.` : '';
		return [first, middleInitial, last].filter(Boolean);
	}

	function getAccountFullName(profile) {
		const fullName = getFullNameParts(profile).join(' ').trim();
		return fullName || '';
	}

	function toSkillsArray(value) {
		if (Array.isArray(value)) return value.map((entry) => normalizeLower(entry)).filter(Boolean);
		if (typeof value === 'string') {
			return value.split(',').map((entry) => normalizeLower(entry)).filter(Boolean);
		}
		return [];
	}

	function setText(id, value) {
		const element = document.getElementById(id);
		if (!element) return;
		element.textContent = value;
	}

	function formatRoleText(role) {
		const value = normalizeLower(role);
		if (value === 'technician') return 'Technician';
		if (value === 'customer') return 'Customer';
		if (value === 'admin') return 'Admin';
		return 'Unknown';
	}

	function formatActionText(action) {
		const value = normalizeLower(action);
		if (value === 'login') return 'Log in';
		if (value === 'logout') return 'Log out';
		return value ? value.charAt(0).toUpperCase() + value.slice(1) : '-';
	}

	function formatRequestStatusText(status) {
		const value = normalizeLower(status);
		if (!value) return '-';
		if (value === 'canceled') return 'CANCELLED';
		return value.replace(/[_-]+/g, ' ').toUpperCase();
	}

	function renderRequestStatusBadge(item) {
		const bucket = getRequestBucket(item);
		const label = formatRequestStatusText(item && item.status);
		if (!label || label === '-') return '-';
		const lateBadge = isLateCompletedRequest(item)
			? '<span class="request-late-badge">LATE</span>'
			: '';
		return `<span class="request-status-badge ${escapeHtml(bucket)}"><span class="request-status-dot" aria-hidden="true"></span><span>${escapeHtml(label)}</span></span>${lateBadge}`;
	}

	function formatSkillText(skill) {
		const value = normalizeLower(skill);
		if (!value) return '';
		return value.replace(/[_-]+/g, ' ').toUpperCase();
	}

	function renderSkillsBadges(skills) {
		if (!Array.isArray(skills) || !skills.length) return '-';
		return `<div class="skills-badge-list">${skills.map((skill) => `<span class="skills-badge">${escapeHtml(formatSkillText(skill))}</span>`).join('')}</div>`;
	}

	function formatRoleLabel(role) {
		return normalizeLower(role) === 'technician' ? 'Technician' : 'Customer';
	}

	function renderSessionHeaderLabel() {
		const header = document.getElementById('sessionUserIdHeader');
		if (!header) return;
		header.textContent = `${formatRoleLabel(state.sessionRoleFilter)} Code`;
	}

	function getSessionUserName(item) {
		const uid = normalizeText(item && item.uid);
		const email = normalizeLower(item && (item.email || item.emailAddress || item.email_address));
		const role = normalizeLower(item && item.role) || normalizeLower(state.sessionRoleFilter);
		const account = findAccountByUidOrEmail(uid, email, role);

		if (account) {
			const fullName = getAccountFullName(account);
			if (fullName) return fullName;
			return getProfileName(account);
		}

		return normalizeText(item && (item.name || item.fullName || item.displayName || item.email || item.uid)) || '-';
	}

	function renderAccountRoleTabs() {
		const activeFilter = normalizeLower(state.accountRoleFilter || 'all') || 'all';

		const accountsTitle = document.getElementById('accountsPanelTitleLabel');
		if (!accountsTitle) return;
		if (activeFilter === 'technician') {
			accountsTitle.textContent = 'MANAGE TECHNICIANS';
			return;
		}
		if (activeFilter === 'customer') {
			accountsTitle.textContent = 'MANAGE CUSTOMERS';
			return;
		}
		accountsTitle.textContent = 'MANAGE ACCOUNTS';
	}

	function shouldShowSkillsColumn() {
		return normalizeLower(state.accountRoleFilter || 'all') !== 'customer';
	}

	function shouldShowTechnicianIdColumn() {
		return normalizeLower(state.accountRoleFilter || 'all') === 'technician';
	}

	function shouldShowTechnicianRatingColumn() {
		return normalizeLower(state.accountRoleFilter || 'all') === 'technician';
	}

	function parseTechnicianRatingValue(value) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return null;
		if (numeric < 0 || numeric > 5) return null;
		return numeric;
	}

	function getTechnicianRequestRatingStats(account) {
		const source = account && typeof account === 'object' ? account : {};
		const technicianId = normalizeText(source.uid || source.id);
		const technicianEmail = normalizeLower(source.email || source.emailAddress || source.email_address || '');
		const technicianName = normalizeText(getProfileName(source));
		const requests = Array.isArray(state.allRequests) ? state.allRequests : [];

		let total = 0;
		let count = 0;

		for (let index = 0; index < requests.length; index += 1) {
			const item = requests[index] && typeof requests[index] === 'object' ? requests[index] : {};
			const status = normalizeLower(item.status || '');
			if (status !== 'completed' && status !== 'finished') continue;

			const details = item.requestDetails && typeof item.requestDetails === 'object'
				? item.requestDetails
				: {};
			const assignedId = normalizeText(item.assignedTechnicianId || item.technicianId || item.assignedToUid || item.assignedTo || details.selectedTechnicianId || '');
			const assignedEmail = normalizeLower(item.assignedTechnicianEmail || item.technicianEmail || item.assignedToEmail || details.selectedTechnicianEmail || '');
			const assignedNames = [
				item.assignedTechnicianName,
				item.technicianName,
				item.assignedToName,
				details.selectedTechnicianName
			].map((value) => normalizeText(value)).filter(Boolean);

			const matchesTechnician = (technicianId && assignedId === technicianId)
				|| (technicianEmail && assignedEmail === technicianEmail)
				|| (technicianName && assignedNames.includes(technicianName));
			if (!matchesTechnician) continue;

			const ratingCandidates = [
				item.customerRating,
				item.reviewRating,
				item.rating,
				details.customerRating,
				details.reviewRating,
				details.rating
			];

			let rating = null;
			for (let ratingIndex = 0; ratingIndex < ratingCandidates.length; ratingIndex += 1) {
				const parsed = parseTechnicianRatingValue(ratingCandidates[ratingIndex]);
				if (parsed != null && parsed > 0) {
					rating = parsed;
					break;
				}
			}

			if (rating == null) continue;
			total += rating;
			count += 1;
		}

		if (!count) return null;
		return {
			average: total / count,
			count
		};
	}

	function getTechnicianRatingLabel(account) {
		const requestStats = getTechnicianRequestRatingStats(account);
		if (requestStats && Number.isFinite(requestStats.average) && requestStats.average > 0) {
			return `${requestStats.average.toFixed(1)} / 5`;
		}

		const source = account && typeof account === 'object' ? account : {};
		const candidates = [
			source.rating,
			source.averageRating,
			source.avgRating,
			source.technicianRating,
			source.reviewRating,
			source.customerRating,
			source.stars,
			source.ratingAverage
		];

		for (let index = 0; index < candidates.length; index += 1) {
			const parsed = parseTechnicianRatingValue(candidates[index]);
			if (parsed != null && parsed > 0) return `${parsed.toFixed(1)} / 5`;
		}

		return 'No ratings yet';
	}

	function getTechnicianRatingMeta(account) {
		const requestStats = getTechnicianRequestRatingStats(account);
		if (requestStats && Number.isFinite(requestStats.average) && requestStats.average > 0) {
			return {
				average: Number(requestStats.average.toFixed(1)),
				count: Math.max(0, Math.round(Number(requestStats.count) || 0))
			};
		}

		const stored = getStoredTechnicianAggregate(account);
		if (stored && Number.isFinite(stored.average) && stored.average > 0) {
			return {
				average: Number(stored.average.toFixed(1)),
				count: Math.max(0, Math.round(Number(stored.count) || 0))
			};
		}

		return {
			average: 0,
			count: 0
		};
	}

	function renderTechnicianRatingCell(account) {
		const meta = getTechnicianRatingMeta(account);
		if (!meta.average || meta.average <= 0) {
			return '<div class="rating-summary empty"><span class="rating-empty">No ratings yet</span><span class="rating-empty-sub">Waiting for first review</span></div>';
		}

		const fill = Math.max(0, Math.min(100, (meta.average / 5) * 100));
		const reviewLabel = meta.count === 1 ? '1 review' : `${meta.count} reviews`;
		const aria = `Rated ${meta.average.toFixed(1)} out of 5 from ${reviewLabel}`;

		return `
			<div class="rating-summary" aria-label="${escapeHtml(aria)}">
				<div class="rating-score-line">
					<span class="rating-score">${escapeHtml(meta.average.toFixed(1))}</span>
					<span class="rating-scale">/ 5</span>
				</div>
				<div class="rating-stars" aria-hidden="true" style="--rating-fill:${fill}%;">
					<span class="rating-stars-base">★★★★★</span>
					<span class="rating-stars-fill">★★★★★</span>
				</div>
				<span class="rating-count">${escapeHtml(reviewLabel)}</span>
			</div>
		`;
	}

	function getStoredTechnicianAggregate(account) {
		const source = account && typeof account === 'object' ? account : {};
		const averageCandidates = [source.averageRating, source.ratingAverage, source.avgRating, source.rating];
		let average = 0;
		for (let index = 0; index < averageCandidates.length; index += 1) {
			const parsed = parseTechnicianRatingValue(averageCandidates[index]);
			if (parsed != null) {
				average = parsed;
				break;
			}
		}

		const countCandidates = [source.ratingCount, source.reviewCount, source.customerReviewCount];
		let count = 0;
		for (let index = 0; index < countCandidates.length; index += 1) {
			const numeric = Number(countCandidates[index]);
			if (Number.isFinite(numeric) && numeric >= 0) {
				count = Math.max(0, Math.round(numeric));
				break;
			}
		}

		return { average, count };
	}

	async function syncTechnicianRatingAggregates() {
		if (technicianAggregateSyncInFlight) {
			technicianAggregateSyncQueued = true;
			return;
		}

		if (!(usersDb && typeof usersDb.updateUserProfile === 'function')) return;
		const technicians = (Array.isArray(state.accounts) ? state.accounts : []).filter((account) => normalizeLower(account && account.role) === 'technician');
		if (!technicians.length) return;

		technicianAggregateSyncInFlight = true;
		try {
			const writes = [];
			technicians.forEach((account) => {
				const technicianId = normalizeText(account && (account.uid || account.id));
				if (!technicianId) return;
				const requestStats = getTechnicianRequestRatingStats(account) || { average: 0, count: 0 };
				const stored = getStoredTechnicianAggregate(account);
				const nextAverage = Number.isFinite(requestStats.average) ? Number(requestStats.average.toFixed(2)) : 0;
				const nextCount = Math.max(0, Math.round(Number(requestStats.count) || 0));
				const currentAverage = Number.isFinite(stored.average) ? Number(stored.average.toFixed(2)) : 0;
				const currentCount = Math.max(0, Math.round(Number(stored.count) || 0));

				if (nextAverage === currentAverage && nextCount === currentCount) return;

				writes.push(
					usersDb.updateUserProfile(technicianId, {
						averageRating: nextAverage,
						ratingAverage: nextAverage,
						avgRating: nextAverage,
						rating: nextAverage,
						ratingCount: nextCount,
						reviewCount: nextCount,
						customerReviewCount: nextCount,
						lastRatingUpdatedAt: Date.now()
					}).then(() => {
						account.averageRating = nextAverage;
						account.ratingAverage = nextAverage;
						account.avgRating = nextAverage;
						account.rating = nextAverage;
						account.ratingCount = nextCount;
						account.reviewCount = nextCount;
						account.customerReviewCount = nextCount;
					}).catch(() => {})
				);
			});

			if (writes.length) {
				await Promise.all(writes);
				renderAccountsTable();
			}
		} finally {
			technicianAggregateSyncInFlight = false;
			if (technicianAggregateSyncQueued) {
				technicianAggregateSyncQueued = false;
				syncTechnicianRatingAggregates();
			}
		}
	}

	function getAccountsTableColumnCount() {
		let count = 4;
		if (shouldShowTechnicianIdColumn()) count += 1;
		if (shouldShowTechnicianRatingColumn()) count += 1;
		if (shouldShowSkillsColumn()) count += 1;
		return count;
	}

	function getPaginatedItems(items, currentPage, pageSize) {
		const list = Array.isArray(items) ? items : [];
		const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
		const activePage = Math.min(Math.max(1, Number(currentPage) || 1), pageCount);
		const startIndex = (activePage - 1) * pageSize;
		return {
			pageCount,
			activePage,
			items: list.slice(startIndex, startIndex + pageSize)
		};
	}

	function setTablePagination(pageIndicatorId, prevBtnId, nextBtnId, activePage, pageCount) {
		const pageIndicator = document.getElementById(pageIndicatorId);
		const prevBtn = document.getElementById(prevBtnId);
		const nextBtn = document.getElementById(nextBtnId);
		if (pageIndicator) pageIndicator.textContent = `Page ${activePage} of ${pageCount}`;
		if (prevBtn) prevBtn.disabled = activePage <= 1;
		if (nextBtn) nextBtn.disabled = activePage >= pageCount;
	}

	function toSerializable(value) {
		try {
			const serialized = JSON.stringify(value == null ? null : value);
			return serialized ? JSON.parse(serialized) : null;
		} catch (_) {
			return value == null ? null : value;
		}
	}

	function getBackupSummaryCounts() {
		const accounts = Array.isArray(state.accounts) ? state.accounts : [];
		const requests = Array.isArray(state.allRequests) ? state.allRequests : [];
		const reports = Array.isArray(state.reports) ? state.reports : [];
		const sessionLogs = Array.isArray(state.sessionLogs) ? state.sessionLogs : [];
		return {
			accounts: accounts.length,
			requests: requests.length,
			reports: reports.length,
			sessionLogs: sessionLogs.length
		};
	}

	function renderBackupSummary() {
		const counts = getBackupSummaryCounts();
		setText('backupAccountsCount', String(counts.accounts));
		setText('backupRequestsCount', String(counts.requests));
		setText('backupReportsCount', String(counts.reports));
		setText('backupSessionLogsCount', String(counts.sessionLogs));
	}

	function setBackupStatus(message, tone) {
		const element = document.getElementById('backupStatusMessage');
		if (!element) return;
		element.textContent = normalizeText(message) || 'Ready to create a backup file.';
		element.classList.toggle('success', tone === 'success');
		element.classList.toggle('error', tone === 'error');
	}

	function getCurrentAdminAuthUser() {
		return usersDb && usersDb.auth && usersDb.auth.currentUser ? usersDb.auth.currentUser : null;
	}

	function formatAdminDisplayName(profile, session, emailFallback) {
		const firstName = titleCaseName(profile && profile.first_name);
		const lastName = titleCaseName(profile && profile.last_name);
		const fullName = `${firstName} ${lastName}`.trim();
		if (fullName) return fullName;
		if (firstName) return firstName;

		const sessionName = normalizeText(session && session.username);
		if (sessionName) return sessionName;

		const normalizedEmail = normalizeLower(emailFallback);
		if (normalizedEmail.includes('@')) {
			return normalizedEmail.split('@')[0];
		}

		return 'admin';
	}

	function updateAdminSessionGreeting(profile, session, emailFallback) {
		const messageEl = document.getElementById('adminSessionText');
		if (!messageEl) return;
		messageEl.textContent = `Welcome, ${formatAdminDisplayName(profile, session, emailFallback)}.`;
	}

	function getAdminProfileElements() {
		const form = document.getElementById('adminProfileForm');
		if (!form) return null;
		return {
			form,
			emailInput: document.getElementById('adminSettingsEmail'),
			firstNameInput: document.getElementById('adminFirstName'),
			lastNameInput: document.getElementById('adminLastName'),
			sendButton: document.getElementById('sendAdminVerificationBtn'),
			editButton: document.getElementById('editAdminProfileBtn'),
			saveButton: document.getElementById('saveAdminProfileBtn')
		};
	}

	function syncAdminProfileActionState() {
		const elements = getAdminProfileElements();
		if (!elements) return;

		const isEditing = elements.form.dataset.editing === 'true';
		const savedEmail = normalizeLower(elements.form.dataset.savedEmail);
		const draftEmail = normalizeLower(elements.emailInput && elements.emailInput.value);
		const isVerified = elements.form.dataset.emailVerified === 'true';
		const emailChanged = !!draftEmail && draftEmail !== savedEmail;
		const emailError = validateAdminEmail(draftEmail);

		if (elements.sendButton) {
			elements.sendButton.hidden = !isEditing;
			elements.sendButton.disabled = !isEditing || !!emailError || (!emailChanged && isVerified);
		}

		if (elements.saveButton) {
			elements.saveButton.disabled = !isEditing || !isVerified || emailChanged;
		}
	}

	function setAdminProfileEditingState(isEditing) {
		const elements = getAdminProfileElements();
		if (!elements) return;

		const editing = !!isEditing;
		elements.form.dataset.editing = editing ? 'true' : 'false';
		[elements.emailInput, elements.firstNameInput, elements.lastNameInput].forEach((input) => {
			if (!input) return;
			input.readOnly = !editing;
			input.classList.toggle('is-locked', !editing);
		});

		if (elements.editButton) {
			elements.editButton.textContent = editing ? 'Cancel Edit' : 'Edit Profile';
		}

		syncAdminProfileActionState();
	}

	function setAdminProfileVerificationState(isVerified, email) {
		const elements = getAdminProfileElements();
		if (!elements) return;

		elements.form.dataset.emailVerified = isVerified ? 'true' : 'false';
		elements.form.dataset.savedEmail = normalizeLower(email);
		setAdminEmailVerificationStatus(isVerified, email);
		syncAdminProfileActionState();
	}

	function setAdminEmailVerificationStatus(isVerified, email) {
		const element = document.getElementById('adminEmailVerificationStatus');
		if (!element) return;
		element.classList.remove('error', 'verified');
		const normalizedEmail = normalizeLower(email);
		if (isVerified) {
			element.hidden = false;
			element.textContent = normalizedEmail
				? `Email has been verified for ${normalizedEmail}.`
				: 'Email has been verified.';
			element.classList.add('verified');
			return;
		}

		element.textContent = '';
		element.hidden = true;
	}

	function setSettingsMessage(elementId, message, tone) {
		const element = document.getElementById(elementId);
		if (!element) return;
		element.textContent = normalizeText(message);
		element.classList.remove('success', 'error');
		if (tone === 'success' || tone === 'error') {
			element.classList.add(tone);
		}
	}

	function setInputInvalidState(input, isInvalid) {
		if (!input) return;
		input.classList.toggle('invalid', !!isInvalid);
	}

	function validateAdminPassword(value) {
		const password = String(value || '');
		if (!password) return 'New password is required.';
		if (password.length < 8 || password.length > 24) return 'Use 8 to 24 characters.';
		if (!/[A-Z]/.test(password)) return 'Include at least one uppercase letter.';
		if (!/[a-z]/.test(password)) return 'Include at least one lowercase letter.';
		if (!/\d/.test(password)) return 'Include at least one number.';
		return null;
	}

	function bindPasswordToggleButtons() {
		document.querySelectorAll('.password-toggle').forEach((button) => {
			const targetSelector = String(button.dataset.target || '');
			const input = targetSelector ? document.querySelector(targetSelector) : null;
			const icon = button.querySelector('img');
			if (!input || !icon || button.dataset.bound === 'true') return;

			const syncState = () => {
				const isHidden = input.type === 'password';
				icon.src = isHidden ? '../../images/icons/eye-closed.svg' : '../../images/icons/eye-open.svg';
				icon.alt = isHidden ? 'Show password' : 'Hide password';
				button.setAttribute('aria-label', isHidden ? 'Show password' : 'Hide password');
				button.setAttribute('aria-pressed', isHidden ? 'false' : 'true');
			};

			button.dataset.bound = 'true';
			syncState();
			button.addEventListener('click', () => {
				input.type = input.type === 'password' ? 'text' : 'password';
				syncState();
			});
		});
	}

	function validateAdminEmail(value) {
		const email = normalizeLower(value);
		if (!email) return 'Account email is required.';
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
		return null;
	}

	async function reauthenticateAdminForSensitiveChange(email) {
		const authUser = getCurrentAdminAuthUser();
		const stored = readStoredAdminAuth();
		const normalizedEmail = normalizeLower(email || stored.email || (authUser && authUser.email));
		const password = normalizeText(stored.password);
		const emailProvider = usersDb && usersDb.firebase && usersDb.firebase.auth && usersDb.firebase.auth.EmailAuthProvider
			? usersDb.firebase.auth.EmailAuthProvider
			: (window.firebase && window.firebase.auth && window.firebase.auth.EmailAuthProvider ? window.firebase.auth.EmailAuthProvider : null);

		if (!authUser || typeof authUser.reauthenticateWithCredential !== 'function') return false;
		if (!normalizedEmail || !password || !emailProvider || typeof emailProvider.credential !== 'function') return false;

		try {
			const credential = emailProvider.credential(normalizedEmail, password);
			await authUser.reauthenticateWithCredential(credential);
			return true;
		} catch (_) {
			return false;
		}
	}

	async function getAdminProfileContext() {
		const session = readAdminSession();
		let authUser = getCurrentAdminAuthUser();
		if (!authUser) {
			authUser = await waitForCurrentAuthUser(1500);
		}

		const authUid = normalizeText(authUser && authUser.uid);
		let profile = null;
		if (authUid && usersDb && typeof usersDb.getUserById === 'function') {
			try {
				profile = await usersDb.getUserById(authUid);
			} catch (_) {
				profile = null;
			}
		}

		const authEmail = normalizeLower(
			(profile && profile.email)
			|| (authUser && authUser.email)
			|| (session && session.username)
		);
		const emailVerified = !!(
			(authUser && authUser.emailVerified)
			|| (profile && profile.emailVerified)
		);

		return {
			session,
			authUser,
			authUid,
			authEmail,
			emailVerified,
			profile
		};
	}

	function populateAdminSettingsForm(context) {
		const info = context && typeof context === 'object' ? context : {};
		const profile = info.profile || {};
		const authEmail = normalizeLower(info.authEmail);
		const emailValue = authEmail || normalizeLower(profile && profile.email);
		const firstName = titleCaseName(profile && profile.first_name) || 'Admin';
		const lastName = titleCaseName(profile && profile.last_name) || 'User';

		const adminSettingsEmail = document.getElementById('adminSettingsEmail');
		const adminFirstName = document.getElementById('adminFirstName');
		const adminLastName = document.getElementById('adminLastName');

		if (adminSettingsEmail) adminSettingsEmail.value = emailValue;
		if (adminFirstName) adminFirstName.value = firstName;
		if (adminLastName) adminLastName.value = lastName;
		setAdminProfileVerificationState(!!info.emailVerified, emailValue);
		setAdminProfileEditingState(false);

		updateAdminSessionGreeting(profile, info.session, emailValue);
	}

	async function refreshAdminEmailVerificationState() {
		let authUser = getCurrentAdminAuthUser();
		if (!authUser) {
			authUser = await waitForCurrentAuthUser(1500);
		}

		if (authUser && typeof authUser.reload === 'function') {
			try {
				await authUser.reload();
			} catch (_) {
			}
		}

		const activeUser = getCurrentAdminAuthUser() || authUser;
		const email = normalizeLower(activeUser && activeUser.email);
		const emailVerified = !!(activeUser && activeUser.emailVerified);
		setAdminProfileVerificationState(emailVerified, email);

		return {
			authUser: activeUser,
			email,
			emailVerified
		};
	}

	async function sendAdminProfileVerification(event) {
		if (event) event.preventDefault();

		const elements = getAdminProfileElements();
		if (!elements) return;

		const email = normalizeLower(elements.emailInput && elements.emailInput.value);
		setInputInvalidState(elements.emailInput, false);
		setSettingsMessage('adminProfileMessage', '');

		if (elements.form.dataset.editing !== 'true') {
			setSettingsMessage('adminProfileMessage', 'Click Edit Profile first before changing the admin details.', 'error');
			return;
		}

		const emailError = validateAdminEmail(email);
		if (emailError) {
			setInputInvalidState(elements.emailInput, true);
			setSettingsMessage('adminProfileMessage', emailError, 'error');
			return;
		}

		const context = await getAdminProfileContext();
		if (!context.authUid || !usersDb || typeof usersDb.updateUserProfile !== 'function') {
			setSettingsMessage('adminProfileMessage', 'Admin profile is unavailable right now.', 'error');
			return;
		}

		const authUser = context.authUser || getCurrentAdminAuthUser();
		const currentEmail = normalizeLower((authUser && authUser.email) || context.authEmail || (context.profile && context.profile.email));
		const isEmailChanged = email && email !== currentEmail;

		if (isEmailChanged && usersDb && typeof usersDb.getUserByEmail === 'function') {
			try {
				const existing = await usersDb.getUserByEmail(email);
				const existingUid = normalizeText(existing && (existing.uid || existing.id));
				if (existingUid && existingUid !== context.authUid) {
					setInputInvalidState(elements.emailInput, true);
					setSettingsMessage('adminProfileMessage', 'That email is already being used by another account.', 'error');
					return;
				}
			} catch (_) {
			}
		}

		if (elements.sendButton) {
			elements.sendButton.disabled = true;
			elements.sendButton.textContent = 'Sending...';
		}

		try {
			if (!authUser || typeof authUser.sendEmailVerification !== 'function') {
				throw new Error('Admin email verification is unavailable right now.');
			}

			if (isEmailChanged) {
				if (typeof authUser.updateEmail !== 'function') {
					throw new Error('Admin email update is unavailable right now.');
				}

				const reauthenticated = await reauthenticateAdminForSensitiveChange(currentEmail);
				if (!reauthenticated) {
					setInputInvalidState(elements.emailInput, true);
					setSettingsMessage('adminProfileMessage', 'Sign in again before changing the admin email.', 'error');
					return;
				}

				try {
					await authUser.updateEmail(email);
				} catch (error) {
					if (hasErrorCode(error, 'email-already-in-use')) {
						setInputInvalidState(elements.emailInput, true);
						setSettingsMessage('adminProfileMessage', 'That email is already being used by another account.', 'error');
						return;
					}
					if (hasErrorCode(error, 'invalid-email')) {
						setInputInvalidState(elements.emailInput, true);
						setSettingsMessage('adminProfileMessage', 'Enter a valid email address.', 'error');
						return;
					}
					if (hasErrorCode(error, 'requires-recent-login')) {
						setInputInvalidState(elements.emailInput, true);
						setSettingsMessage('adminProfileMessage', 'Sign in again before changing the admin email.', 'error');
						return;
					}
					throw error;
				}

				syncStoredAdminAuthEmail(email);
				syncAdminSessionEmail(email);
			}

			const verificationSent = await sendAdminEmailVerification(authUser);
			if (!verificationSent) {
				setSettingsMessage('adminProfileMessage', 'Verification email could not be sent right now.', 'error');
				return;
			}

			await usersDb.updateUserProfile(context.authUid, {
				uid: context.authUid,
				email,
				role: 'admin',
				isActive: true,
				isVerified: false,
				emailVerified: false,
				updatedAt: Date.now()
			});
			await ensureAdminRealtimeAccess(authUser || getCurrentAdminAuthUser());

			setAdminProfileVerificationState(false, email);
			setSettingsMessage('adminProfileMessage', 'Verification email sent. Verify the admin email first before saving profile changes.', 'success');
		} catch (error) {
			setSettingsMessage('adminProfileMessage', normalizeText(error && error.message) || 'Failed to send verification email.', 'error');
		} finally {
			if (elements.sendButton) {
				elements.sendButton.textContent = 'Send Verification';
				syncAdminProfileActionState();
			}
		}
	}

	async function sendAdminEmailVerification(authUser) {
		const user = authUser || getCurrentAdminAuthUser();
		if (!user || typeof user.sendEmailVerification !== 'function') return false;
		try {
			await user.sendEmailVerification();
			return true;
		} catch (_) {
			return false;
		}
	}

	async function loadAdminSettings() {
		const context = await getAdminProfileContext();
		populateAdminSettingsForm(context);
		return context;
	}

	async function saveAdminProfile(event) {
		if (event) event.preventDefault();

		const elements = getAdminProfileElements();
		if (!elements) return;

		const emailInput = elements.emailInput;
		const firstNameInput = elements.firstNameInput;
		const lastNameInput = elements.lastNameInput;
		const submitButton = elements.saveButton;
		const email = normalizeLower(emailInput && emailInput.value);
		const firstName = normalizeText(firstNameInput && firstNameInput.value);
		const lastName = normalizeText(lastNameInput && lastNameInput.value);

		setInputInvalidState(emailInput, false);
		setInputInvalidState(firstNameInput, false);
		setInputInvalidState(lastNameInput, false);
		setSettingsMessage('adminProfileMessage', '');

		if (elements.form.dataset.editing !== 'true') {
			setSettingsMessage('adminProfileMessage', 'Click Edit Profile first before saving admin changes.', 'error');
			return;
		}

		const emailError = validateAdminEmail(email);
		const firstNameError = validateCustomerStyleName(firstName, true, 'First Name');
		const lastNameError = validateCustomerStyleName(lastName, true, 'Last Name');

		if (emailError) {
			setInputInvalidState(emailInput, true);
			setSettingsMessage('adminProfileMessage', emailError, 'error');
			return;
		}

		if (firstNameError) {
			setInputInvalidState(firstNameInput, true);
			setSettingsMessage('adminProfileMessage', firstNameError, 'error');
			return;
		}

		if (lastNameError) {
			setInputInvalidState(lastNameInput, true);
			setSettingsMessage('adminProfileMessage', lastNameError, 'error');
			return;
		}

		const context = await getAdminProfileContext();
		if (!context.authUid || !usersDb || typeof usersDb.updateUserProfile !== 'function') {
			setSettingsMessage('adminProfileMessage', 'Admin profile is unavailable right now.', 'error');
			return;
		}

		const savedEmail = normalizeLower(elements.form.dataset.savedEmail || context.authEmail || (context.profile && context.profile.email));
		if (email !== savedEmail) {
			setInputInvalidState(emailInput, true);
			setSettingsMessage('adminProfileMessage', 'Send verification for the new admin email first before saving profile changes.', 'error');
			syncAdminProfileActionState();
			return;
		}

		if (submitButton) {
			submitButton.disabled = true;
			submitButton.textContent = 'Saving...';
		}

		try {
			const refreshedVerification = await refreshAdminEmailVerificationState();
			const authUser = refreshedVerification.authUser || context.authUser || getCurrentAdminAuthUser();
			const emailVerified = !!refreshedVerification.emailVerified;

			if (!emailVerified) {
				setSettingsMessage('adminProfileMessage', 'Verify the admin email first before saving profile changes.', 'error');
				return;
			}

			await usersDb.updateUserProfile(context.authUid, {
				uid: context.authUid,
				email,
				first_name: firstName,
				middle_name: '',
				last_name: lastName,
				role: 'admin',
				isActive: true,
				isVerified: emailVerified,
				emailVerified: emailVerified,
				updatedAt: Date.now()
			});
			await ensureAdminRealtimeAccess(authUser || getCurrentAdminAuthUser());

			await loadAdminSettings();
			setSettingsMessage('adminProfileMessage', 'Admin profile updated successfully.', 'success');
		} catch (error) {
			setSettingsMessage('adminProfileMessage', normalizeText(error && error.message) || 'Failed to update admin profile.', 'error');
		} finally {
			if (submitButton) {
				submitButton.textContent = 'Save Profile';
				syncAdminProfileActionState();
			}
		}
	}

	async function saveAdminPassword(event) {
		if (event) event.preventDefault();

		const newPasswordInput = document.getElementById('adminNewPassword');
		const confirmPasswordInput = document.getElementById('adminConfirmPassword');
		const submitButton = document.getElementById('saveAdminPasswordBtn');
		const newPassword = String(newPasswordInput && newPasswordInput.value || '');
		const confirmPassword = String(confirmPasswordInput && confirmPasswordInput.value || '');

		setInputInvalidState(newPasswordInput, false);
		setInputInvalidState(confirmPasswordInput, false);
		setSettingsMessage('adminPasswordMessage', '');

		const passwordError = validateAdminPassword(newPassword);
		if (passwordError) {
			setInputInvalidState(newPasswordInput, true);
			setSettingsMessage('adminPasswordMessage', passwordError, 'error');
			return;
		}

		if (newPassword !== confirmPassword) {
			setInputInvalidState(confirmPasswordInput, true);
			setSettingsMessage('adminPasswordMessage', 'Password confirmation does not match.', 'error');
			return;
		}

		const session = readAdminSession();
		await ensureDemoAdminFirebaseAuth(session);
		const context = await getAdminProfileContext();
		const authUser = context.authUser || getCurrentAdminAuthUser();

		if (!authUser || typeof authUser.updatePassword !== 'function') {
			setSettingsMessage('adminPasswordMessage', 'Admin password update is unavailable right now.', 'error');
			return;
		}

		if (submitButton) {
			submitButton.disabled = true;
			submitButton.textContent = 'Updating...';
		}

		try {
			await authUser.updatePassword(newPassword);
			writeStoredAdminAuth(context.authEmail || authUser.email, newPassword);
			if (newPasswordInput) newPasswordInput.value = '';
			if (confirmPasswordInput) confirmPasswordInput.value = '';
			setSettingsMessage('adminPasswordMessage', 'Admin password updated successfully.', 'success');
		} catch (error) {
			if (hasErrorCode(error, 'requires-recent-login')) {
				try {
					const resetEmail = normalizeLower(context.authEmail || (authUser && authUser.email));
					if (resetEmail && usersDb && usersDb.firebase && typeof usersDb.firebase.auth === 'function') {
						await usersDb.firebase.auth().sendPasswordResetEmail(resetEmail);
						setSettingsMessage('adminPasswordMessage', 'Security check requires sign-in again. A password reset email was sent instead.', 'success');
						return;
					}
				} catch (_) {
				}

				setSettingsMessage('adminPasswordMessage', 'Security check requires you to sign in again before changing the password.', 'error');
				return;
			}

			setSettingsMessage('adminPasswordMessage', normalizeText(error && error.message) || 'Failed to update admin password.', 'error');
		} finally {
			if (submitButton) {
				submitButton.disabled = false;
				submitButton.textContent = 'Update Password';
			}
		}
	}

	function buildBackupFileStamp() {
		return new Date().toISOString().replace(/[:.]/g, '-');
	}

	function buildBackupFileName(kind) {
		const label = normalizeLower(kind || 'backup').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'backup';
		return `homefixsolution-admin-${label}-${buildBackupFileStamp()}.json`;
	}

	function downloadJsonFile(fileName, payload) {
		const jsonText = JSON.stringify(payload, null, 2);
		const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
		const fileLabel = normalizeText(fileName) || buildBackupFileName('backup');

		if (window.navigator && typeof window.navigator.msSaveOrOpenBlob === 'function') {
			window.navigator.msSaveOrOpenBlob(blob, fileLabel);
			return;
		}

		const urlApi = window.URL || window.webkitURL;
		if (!urlApi || typeof urlApi.createObjectURL !== 'function') {
			throw new Error('This browser cannot create backup downloads right now.');
		}

		const url = urlApi.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = fileLabel;
		anchor.rel = 'noopener';
		anchor.style.display = 'none';
		document.body.appendChild(anchor);

		if (typeof anchor.click === 'function') {
			anchor.click();
		} else {
			anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
		}

		window.setTimeout(() => {
			anchor.remove();
			if (typeof urlApi.revokeObjectURL === 'function') {
				urlApi.revokeObjectURL(url);
			}
		}, 1000);
	}

	async function prepareAdminBackupAccess() {
		const session = readAdminSession();
		try {
			await ensureDemoAdminFirebaseAuth(session);
		} catch (_) {
		}
		await waitForCurrentAuthUser(2500);
	}

	async function readRealtimePathValue(path) {
		const targetPath = normalizeText(path);
		const rtdb = getRealtimeDatabase();
		if (!rtdb || !targetPath) return null;
		try {
			const snapshot = await rtdb.ref(targetPath).once('value');
			return snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
		} catch (error) {
			return {
				__backupError: normalizeText(error && (error.code || error.message)) || 'read-failed',
				path: targetPath
			};
		}
	}

	async function getSessionLogsRealtimeBackup() {
		const [loginCustomers, logoutCustomers, loginTechnicians, logoutTechnicians] = await Promise.all([
			readRealtimePathValue('sessionLogs/login/customers'),
			readRealtimePathValue('sessionLogs/logout/customers'),
			readRealtimePathValue('sessionLogs/login/technicians'),
			readRealtimePathValue('sessionLogs/logout/technicians')
		]);

		return {
			login: {
				customers: loginCustomers,
				technicians: loginTechnicians
			},
			logout: {
				customers: logoutCustomers,
				technicians: logoutTechnicians
			}
		};
	}

	async function getReportsRealtimeBackup() {
		const [technician, technicians, legacy, concerns, customerConcerns] = await Promise.all([
			readRealtimePathValue('reports/technician'),
			readRealtimePathValue('reports/technicians'),
			readRealtimePathValue('technicianReports'),
			readRealtimePathValue('reports/concerns'),
			readRealtimePathValue('reports/customerConcerns')
		]);

		return {
			technician,
			technicians,
			legacyTechnicianReports: legacy,
			concerns,
			customerConcerns
		};
	}

	async function buildBackupPayload(kind) {
		const backupKind = normalizeLower(kind || 'full') || 'full';
		const generatedAt = new Date().toISOString();
		const summary = getBackupSummaryCounts();
		const accounts = toSerializable(Array.isArray(state.accounts) ? state.accounts : []);
		const requests = toSerializable(Array.isArray(state.allRequests) ? state.allRequests : []);
		const reports = toSerializable(Array.isArray(state.reports) ? state.reports : []);
		const sessionLogs = toSerializable(Array.isArray(state.sessionLogs) ? state.sessionLogs : []);
		const metadata = {
			generatedAt,
			type: backupKind,
			source: 'admin-dashboard',
			firebaseMode: normalizeText(usersDb && usersDb.mode) || 'unknown'
		};

		if (backupKind === 'accounts') {
			return {
				metadata,
				summary: {
					total: summary.accounts,
					customers: accounts.filter((item) => normalizeLower(item && item.role) === 'customer').length,
					technicians: accounts.filter((item) => normalizeLower(item && item.role) === 'technician').length,
					admins: accounts.filter((item) => normalizeLower(item && item.role) === 'admin').length
				},
				data: accounts
			};
		}

		if (backupKind === 'requests') {
			return {
				metadata,
				summary: {
					total: summary.requests,
					pending: requests.filter((item) => getRequestBucket(item) === 'pending').length,
					active: requests.filter((item) => getRequestBucket(item) === 'active').length,
					done: requests.filter((item) => getRequestBucket(item) === 'done').length,
					cancelled: requests.filter((item) => getRequestBucket(item) === 'cancelled').length
				},
				data: requests
			};
		}

		if (backupKind === 'reports') {
			await prepareAdminBackupAccess();
			return {
				metadata,
				summary: {
					total: summary.reports
				},
				data: reports,
				realtime: await getReportsRealtimeBackup()
			};
		}

		if (backupKind === 'session-logs') {
			await prepareAdminBackupAccess();
			return {
				metadata,
				summary: {
					total: summary.sessionLogs,
					selectedRole: normalizeLower(state.sessionRoleFilter || 'customer'),
					selectedAction: normalizeLower(state.sessionActionFilter || 'login')
				},
				currentSelection: sessionLogs,
				realtime: await getSessionLogsRealtimeBackup()
			};
		}

		await prepareAdminBackupAccess();
		const [customers, technicians, users, realtimeRequests, realtimeReports, realtimeSessionLogs] = await Promise.all([
			readRealtimePathValue('customers'),
			readRealtimePathValue('technicians'),
			readRealtimePathValue('users'),
			readRealtimePathValue('requests'),
			getReportsRealtimeBackup(),
			getSessionLogsRealtimeBackup()
		]);

		return {
			metadata,
			summary,
			datasets: {
				accounts,
				requests,
				reports,
				currentSessionLogs: sessionLogs,
				currentSessionFilter: {
					role: normalizeLower(state.sessionRoleFilter || 'customer'),
					action: normalizeLower(state.sessionActionFilter || 'login')
				}
			},
			realtime: {
				customers,
				technicians,
				users,
				requests: realtimeRequests,
				reports: realtimeReports,
				sessionLogs: realtimeSessionLogs
			}
		};
	}

	async function handleBackupDownload(kind, button) {
		const actionButton = button || null;
		const originalLabel = actionButton ? actionButton.textContent : '';
		const label = normalizeLower(kind || 'backup').replace(/-/g, ' ');

		if (actionButton) {
			actionButton.disabled = true;
			actionButton.textContent = 'Preparing...';
		}

		setBackupStatus(`Preparing ${label} backup...`);

		try {
			const payload = await buildBackupPayload(kind);
			downloadJsonFile(buildBackupFileName(kind), payload);
			setBackupStatus(`Backup ready. Downloaded ${label} JSON successfully.`, 'success');
		} catch (error) {
			setBackupStatus(normalizeText(error && error.message) || `Failed to create ${label} backup.`, 'error');
		} finally {
			if (actionButton) {
				actionButton.disabled = false;
				actionButton.textContent = originalLabel;
			}
		}
	}

	function setFormMessage(message, isError) {
		const element = document.getElementById('techFormMessage');
		if (!element) return;
		element.textContent = message || '';
		element.style.color = isError ? '#b3261e' : '#355070';
	}

	function setTechFormFieldInvalid(field, isInvalid) {
		if (!field) return;
		field.classList.toggle('invalid', !!isInvalid);
	}

	function hasErrorCode(error, code) {
		const target = String(code || '').toLowerCase();
		const value = String(error && error.code ? error.code : '').toLowerCase();
		if (!target || !value) return false;
		return value === target || value.endsWith(`/${target}`);
	}

	function hideInviteSentPopup() {
		const popup = document.getElementById('inviteSentPopup');
		if (!popup) return;
		popup.hidden = true;
		if (invitePopupTimer) {
			clearTimeout(invitePopupTimer);
			invitePopupTimer = null;
		}
	}

	function showInviteSentPopup() {
		const popup = document.getElementById('inviteSentPopup');
		if (!popup) return;
		popup.hidden = false;
		if (invitePopupTimer) clearTimeout(invitePopupTimer);
		invitePopupTimer = setTimeout(() => {
			hideInviteSentPopup();
		}, 2800);
	}

	function closeAccountActionConfirm(confirmed) {
		const modal = document.getElementById('accountActionConfirmModal');
		if (modal) modal.hidden = true;

		if (typeof pendingAccountActionResolver === 'function') {
			const resolve = pendingAccountActionResolver;
			pendingAccountActionResolver = null;
			resolve(!!confirmed);
		}
	}

	function confirmAccountAction(account, shouldEnable) {
		const modal = document.getElementById('accountActionConfirmModal');
		const title = document.getElementById('accountActionConfirmTitle');
		const message = document.getElementById('accountActionConfirmMessage');
		const yesBtn = document.getElementById('accountActionConfirmYesBtn');
		if (!modal || !title || !message || !yesBtn) {
			return Promise.resolve(window.confirm(`Are you sure you want to ${shouldEnable ? 'enable' : 'disable'} this account?`));
		}

		const profileName = getProfileName(account);
		title.textContent = `${shouldEnable ? 'Enable' : 'Disable'} account`;
		message.textContent = `Are you sure you want to ${shouldEnable ? 'enable' : 'disable'} ${profileName}?`;
		yesBtn.textContent = shouldEnable ? 'Yes, enable' : 'Yes, disable';

		if (typeof pendingAccountActionResolver === 'function') {
			pendingAccountActionResolver(false);
		}

		modal.hidden = false;
		return new Promise((resolve) => {
			pendingAccountActionResolver = resolve;
		});
	}

	function startsWithWord(text, query) {
		const source = normalizeLower(text);
		const target = normalizeLower(query);
		if (!target) return true;
		if (source.startsWith(target)) return true;
		return source
			.split(/\s+/)
			.filter(Boolean)
			.some((part) => part.startsWith(target));
	}

	function normalizeAccountForAdmin(id, data, source) {
		const raw = data && typeof data === 'object' ? data : {};
		const normalizedId = normalizeText(raw.uid || raw.id || id);
		const inferredRole = source === 'customers' ? 'customer' : (source === 'technicians' ? 'technician' : (source === 'admins' ? 'admin' : ''));
		const role = normalizeLower(raw.role || inferredRole || 'customer');
		return Object.assign({}, raw, {
			id: normalizedId || id,
			uid: normalizedId || id,
			email: normalizeLower(raw.email || raw.emailAddress || raw.email_address || ''),
			role
		});
	}

	function getFilteredAccounts(accounts) {
		const filter = normalizeLower(state.accountRoleFilter || 'all');
		const roleFiltered = filter === 'all'
			? accounts.slice()
			: accounts.filter((account) => normalizeLower(account && account.role) === filter);

		const query = normalizeLower(state.accountSearchQuery || '');
		const statusFilter = normalizeLower(state.accountStatusFilter || 'all');

		return roleFiltered.filter((account) => {
			const isEnabled = isAccountEnabled(account);
			if (statusFilter === 'enabled' && !isEnabled) return false;
			if (statusFilter === 'disabled' && isEnabled) return false;
			if (!query) return true;
			const name = getProfileName(account);
			const email = normalizeText(account && account.email);
			return startsWithWord(name, query) || startsWithWord(email, query);
		});
	}

	function renderAccountsTable() {
		const tableBody = document.getElementById('accountsTableBody');
		const skillsHeader = document.getElementById('accountsSkillsHeader');
		const technicianIdHeader = document.getElementById('accountsTechnicianIdHeader');
		const ratingHeader = document.getElementById('accountsRatingHeader');
		if (!tableBody) return;
		renderAccountRoleTabs();
		const showSkills = shouldShowSkillsColumn();
		const showTechnicianId = shouldShowTechnicianIdColumn();
		const showTechnicianRating = shouldShowTechnicianRatingColumn();
		if (skillsHeader) {
			skillsHeader.hidden = !showSkills;
		}
		if (technicianIdHeader) {
			technicianIdHeader.hidden = !showTechnicianId;
		}
		if (ratingHeader) {
			ratingHeader.hidden = !showTechnicianRating;
		}
		const columnCount = getAccountsTableColumnCount();

		const accounts = Array.isArray(state.accounts) ? state.accounts : [];
		if (!accounts.length) {
			state.accountsPage = 1;
			setTablePagination('accountsPageIndicator', 'accountsPrevPageBtn', 'accountsNextPageBtn', 1, 1);
			tableBody.innerHTML = `<tr><td colspan="${columnCount}">No accounts found.</td></tr>`;
			return;
		}

		const filtered = getFilteredAccounts(accounts);
		if (!filtered.length) {
			state.accountsPage = 1;
			setTablePagination('accountsPageIndicator', 'accountsPrevPageBtn', 'accountsNextPageBtn', 1, 1);
			tableBody.innerHTML = `<tr><td colspan="${columnCount}">No matching accounts for this filter.</td></tr>`;
			return;
		}

		const pagination = getPaginatedItems(filtered, state.accountsPage, ACCOUNTS_PAGE_SIZE);
		state.accountsPage = pagination.activePage;
		setTablePagination('accountsPageIndicator', 'accountsPrevPageBtn', 'accountsNextPageBtn', pagination.activePage, pagination.pageCount);

		tableBody.innerHTML = pagination.items.map((account) => {
			const role = normalizeLower(account && account.role) || 'customer';
			const accountId = normalizeText(account && (account.uid || account.id));
			const technicianCode = role === 'technician'
				? (buildRoleUserCode(accountId, 'technician') || '-')
				: '-';
			const ratingCell = role === 'technician' ? renderTechnicianRatingCell(account) : '-';
			const isEnabled = isAccountEnabled(account);
			const status = getAccountStatusText(account);
			const skills = toSkillsArray(
				account && (account.skills || account.specialties || account.serviceCategories || account.fields || account.field)
			);
			let actions = '-';
			if (role === 'customer') {
				actions = `<button type="button" class="row-action-btn ${isEnabled ? 'danger' : 'success'}" data-action="toggle-customer" data-user-id="${escapeHtml(accountId)}" data-next-state="${isEnabled ? 'disable' : 'enable'}">${isEnabled ? 'Disable' : 'Enable'}</button>`;
			} else if (role === 'technician') {
				actions = `<button type="button" class="row-action-btn ${isEnabled ? 'danger' : 'success'}" data-action="toggle-technician" data-user-id="${escapeHtml(accountId)}" data-next-state="${isEnabled ? 'disable' : 'enable'}">${isEnabled ? 'Disable' : 'Enable'}</button>`;
			}
			return `
				<tr>
					<td>${escapeHtml(getProfileName(account))}</td>
					${showTechnicianId ? `<td>${escapeHtml(technicianCode)}</td>` : ''}
					${showTechnicianRating ? `<td class="rating-cell">${ratingCell}</td>` : ''}
					<td>${escapeHtml(normalizeText(account && account.email) || '-')}</td>
					<td>${escapeHtml(status)}</td>
					${showSkills ? `<td>${renderSkillsBadges(skills)}</td>` : ''}
					<td>${actions}</td>
				</tr>
			`;
		}).join('');
	}

	function renderSessionLogsTable() {
		const tableBody = document.getElementById('sessionLogsTableBody');
		const pageIndicator = document.getElementById('sessionPageIndicator');
		const prevBtn = document.getElementById('sessionPrevPageBtn');
		const nextBtn = document.getElementById('sessionNextPageBtn');
		if (!tableBody) return;
		renderSessionHeaderLabel();

		const list = Array.isArray(state.sessionLogs) ? state.sessionLogs : [];
		const pageCount = Math.max(1, Math.ceil(list.length / SESSION_LOGS_PAGE_SIZE));
		const activePage = Math.min(Math.max(1, Number(state.sessionLogsPage) || 1), pageCount);
		state.sessionLogsPage = activePage;
		const startIndex = (activePage - 1) * SESSION_LOGS_PAGE_SIZE;
		const visibleList = list.slice(startIndex, startIndex + SESSION_LOGS_PAGE_SIZE);

		if (pageIndicator) pageIndicator.textContent = `Page ${activePage} of ${pageCount}`;
		if (prevBtn) prevBtn.disabled = activePage <= 1;
		if (nextBtn) nextBtn.disabled = activePage >= pageCount;

		if (!list.length) {
			tableBody.innerHTML = '<tr><td colspan="5">No logs found for this selection.</td></tr>';
			return;
		}

		tableBody.innerHTML = visibleList.map((item) => {
			const rowTime = getTimestampFromRecord(item);
			const uid = normalizeText(item && item.uid) || '-';
			const roleForRow = normalizeLower(item && item.role) || normalizeLower(state.sessionRoleFilter);
			const userCode = buildRoleUserCode(uid, roleForRow);
			const rawSessionId = normalizeText(item && (item.sessionId || item.createdBySessionId || item.id));
			const fullSessionId = rawSessionId || '-';
			const sessionCode = buildSessionCodeFromId(rawSessionId);
			const sessionCell = sessionCode === '-'
				? '-'
				: `<span title="${escapeHtml(fullSessionId)}">${escapeHtml(sessionCode)}</span>`;
			const userCell = userCode === '-'
				? '-'
				: `<span title="${escapeHtml(uid)}">${escapeHtml(userCode)}</span>`;
			return `
				<tr>
					<td>${escapeHtml(formatDateOnly(rowTime))}</td>
					<td>${escapeHtml(formatTimeOnly(rowTime))}</td>
					<td>${sessionCell}</td>
					<td>${escapeHtml(getSessionUserName(item))}</td>
					<td>${userCell}</td>
				</tr>
			`;
		}).join('');
	}

	async function loadSessionLogs() {
		const tableBody = document.getElementById('sessionLogsTableBody');
		if (tableBody) tableBody.innerHTML = '<tr><td colspan="5">Loading session logs...</td></tr>';
		state.sessionLogsPage = 1;
		renderSessionHeaderLabel();

		if (typeof unsubscribeSessionLogs === 'function') {
			unsubscribeSessionLogs();
			unsubscribeSessionLogs = null;
		}

		if (usersDb && typeof usersDb.subscribeSessionLogsByRoleAction === 'function') {
			unsubscribeSessionLogs = usersDb.subscribeSessionLogsByRoleAction(
				state.sessionRoleFilter,
				state.sessionActionFilter,
				(items) => {
					state.sessionLogs = Array.isArray(items) ? items : [];
					state.sessionLogsPage = 1;
					renderSessionLogsTable();
					renderBackupSummary();
				},
				(error) => {
					state.sessionLogs = [];
					state.sessionLogsPage = 1;
					renderBackupSummary();
					const errorCode = normalizeLower(error && error.code);
					if (tableBody && (errorCode.includes('permission') || errorCode.includes('denied'))) {
						tableBody.innerHTML = '<tr><td colspan="5">Permission denied while loading logs. Check Firebase sessionLogs rules.</td></tr>';
						return;
					}
					if (tableBody) tableBody.innerHTML = '<tr><td colspan="5">Failed to load logs.</td></tr>';
				},
				400
			);
			return;
		}

		state.sessionLogs = [];
		state.sessionLogsPage = 1;
		renderBackupSummary();
		if (tableBody) tableBody.innerHTML = '<tr><td colspan="4">Session logs are unavailable.</td></tr>';
	}

	function renderReportsTable() {
		const tableBody = document.getElementById('reportsTableBody');
		if (!tableBody) return;

		const list = getFilteredReports(state.reports, state.reportsTypeFilter);
		if (!list.length) {
			state.reportsPage = 1;
			setTablePagination('reportsPageIndicator', 'reportsPrevPageBtn', 'reportsNextPageBtn', 1, 1);
			const emptyText = state.reportsTypeFilter === 'technician'
				? 'No technician reports yet.'
				: state.reportsTypeFilter === 'concern'
					? 'No customer concerns yet.'
					: 'No reports or concerns yet.';
			tableBody.innerHTML = `<tr><td colspan="7">${escapeHtml(emptyText)}</td></tr>`;
			return;
		}

		const pagination = getPaginatedItems(list, state.reportsPage, REPORTS_PAGE_SIZE);
		state.reportsPage = pagination.activePage;
		setTablePagination('reportsPageIndicator', 'reportsPrevPageBtn', 'reportsNextPageBtn', pagination.activePage, pagination.pageCount);

		tableBody.innerHTML = pagination.items.map((item) => {
			const reportCategory = getReportCategory(item);
			const requestCode = normalizeText(item && (item.requestCode || item.requestId || item.bookingCode || item.bookingId)) || '-';
			const customerName = normalizeText(item && item.customerName) || normalizeText(item && item.customerEmail) || normalizeText(item && item.customerId) || '-';
			const technicianId = reportCategory === 'concern'
				? '-'
				: formatTechnicianReference(
					item && (item.technicianEmail || item.assignedTechnicianEmail),
					item && (item.technicianId || item.technicianUid || item.assignedTechnicianId)
				);
			const reason = normalizeText(item && item.reason) || '-';
			const details = normalizeText(item && (item.details || item.explanation || item.note || item.description)) || '-';
			const createdAt = getTimestampFromRecord(item);

			return `
				<tr>
					<td>${escapeHtml(formatDate(createdAt))}</td>
					<td>${renderReportTypeBadge(reportCategory)}</td>
					<td>${escapeHtml(requestCode)}</td>
					<td>${escapeHtml(customerName)}</td>
					<td>${escapeHtml(technicianId)}</td>
					<td>${escapeHtml(reason)}</td>
					<td>${escapeHtml(details)}</td>
				</tr>
			`;
		}).join('');
	}

	async function loadReports(options) {
		const allowReauthRetry = !options || options.allowReauthRetry !== false;
		const tableBody = document.getElementById('reportsTableBody');
		setTablePagination('reportsPageIndicator', 'reportsPrevPageBtn', 'reportsNextPageBtn', 1, 1);
		if (tableBody) tableBody.innerHTML = '<tr><td colspan="7">Loading reports and concerns...</td></tr>';

		if (typeof unsubscribeReports === 'function') {
			unsubscribeReports();
			unsubscribeReports = null;
		}

		const rtdb = getRealtimeDatabase();
		if (!rtdb) {
			state.reports = [];
			renderBackupSummary();
			if (tableBody) tableBody.innerHTML = '<tr><td colspan="7">Realtime Database is unavailable.</td></tr>';
			return;
		}

		if (usersDb && usersDb.auth && !usersDb.auth.currentUser) {
			const session = readAdminSession();
			try {
				await ensureDemoAdminFirebaseAuth(session);
			} catch (_) {
			}
			await waitForCurrentAuthUser(3500);
		}

		const reportPaths = [
			{ path: 'reports/technician', required: true },
			{ path: 'reports/technicians', required: false },
			{ path: 'technicianReports', required: false },
			{ path: 'reports/concerns', required: false },
			{ path: 'reports/customerConcerns', required: false }
		];
		const reportCacheByPath = new Map();
		const refs = [];
		const listeners = [];

		const emitMergedReports = () => {
			const mergedBySignature = new Map();
			reportCacheByPath.forEach((items) => {
				(items || []).forEach((item) => {
					const reportCategory = getReportCategory(item);
					const requestId = normalizeText(item && (item.requestId || item.requestCode || item.bookingCode || item.bookingId));
					const customerId = normalizeText(item && (item.customerId || item.customerEmail));
					const technicianId = normalizeText(item && (item.technicianId || item.technicianUid || item.technicianEmail));
					const reason = normalizeText(item && item.reason);
					const stamp = String(getTimestampFromRecord(item) || 0);
					const signature = [reportCategory, requestId, customerId, technicianId, reason, stamp].join('|') || normalizeText(item && item.id);

					if (!signature) return;
					if (!mergedBySignature.has(signature)) mergedBySignature.set(signature, item);
				});
			});

			const reports = Array.from(mergedBySignature.values());
			reports.sort((left, right) => getTimestampFromRecord(right) - getTimestampFromRecord(left));
			state.reports = reports;
			renderReportsTable();
			renderBackupSummary();
		};

		const makeSuccess = (path) => (snapshot) => {
			const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
			const inferredCategory = path.includes('concern') ? 'concern' : 'technician';
			const reports = Object.keys(value).map((id) => Object.assign({ id, reportCategory: inferredCategory }, value[id] || {}));
			reportCacheByPath.set(path, reports);
			emitMergedReports();
		};
		const makeFailure = (path, requiredPath) => async (error) => {
			const errorCode = normalizeLower(error && error.code);
			if (tableBody && (errorCode.includes('permission') || errorCode.includes('denied'))) {
				if (!requiredPath) {
					// Ignore permission errors on optional legacy paths.
					return;
				}

				state.reports = [];
				renderBackupSummary();
				if (allowReauthRetry) {
					if (typeof unsubscribeReports === 'function') {
						unsubscribeReports();
						unsubscribeReports = null;
					}

					const session = readAdminSession();
					try {
						await ensureDemoAdminFirebaseAuth(session);
					} catch (_) {
					}
					await waitForCurrentAuthUser(3500);
					await loadReports({ allowReauthRetry: false });
					return;
				}

				tableBody.innerHTML = '<tr><td colspan="7">Permission denied while loading reports. Check Firebase reports rules.</td></tr>';
				return;
			}

			if (!requiredPath) return;
			state.reports = [];
			renderBackupSummary();
			if (tableBody) tableBody.innerHTML = '<tr><td colspan="7">Failed to load reports.</td></tr>';
		};

		reportPaths.forEach((entry) => {
			const path = normalizeText(entry && entry.path);
			const requiredPath = !!(entry && entry.required);
			const ref = rtdb.ref(path).limitToLast(300);
			const success = makeSuccess(path);
			const failure = makeFailure(path, requiredPath);
			refs.push(ref);
			listeners.push({ success, failure });
			ref.on('value', success, failure);
		});
		unsubscribeReports = function () {
			for (let index = 0; index < refs.length; index += 1) {
				const ref = refs[index];
				const listener = listeners[index] || {};
				const success = listener.success;
				const failure = listener.failure;
				if (!ref || typeof ref.off !== 'function') continue;
				ref.off('value', success);
				ref.off('value', failure);
			}
		};
	}

	function bindSessionFilters() {
		const sessionRoleFilter = document.getElementById('sessionRoleFilter');
		const sessionActionFilter = document.getElementById('sessionActionFilter');
		if (!sessionRoleFilter || !sessionActionFilter) return;

		sessionRoleFilter.value = state.sessionRoleFilter;
		sessionActionFilter.value = state.sessionActionFilter;

		sessionRoleFilter.addEventListener('change', async () => {
			state.sessionRoleFilter = normalizeLower(sessionRoleFilter.value || 'customer');
			state.sessionLogsPage = 1;
			renderSessionHeaderLabel();
			await loadSessionLogs();
		});

		sessionActionFilter.addEventListener('change', async () => {
			state.sessionActionFilter = normalizeLower(sessionActionFilter.value || 'login');
			state.sessionLogsPage = 1;
			await loadSessionLogs();
		});

		renderSessionHeaderLabel();
	}

	async function setAccountActiveState(userId, shouldEnable, triggerButton) {
		const id = normalizeText(userId);
		if (!id) return;
		const account = getAccountById(id);
		const role = normalizeLower(account && account.role);
		const email = normalizeLower(account && (account.email || account.emailAddress || account.email_address));

		if (triggerButton) triggerButton.disabled = true;

		try {
			if (usersDb && usersDb.auth && !usersDb.auth.currentUser) {
				const session = readAdminSession();
				try {
					await ensureDemoAdminFirebaseAuth(session);
				} catch (_) {
				}
				await waitForCurrentAuthUser(3500);
			}

			const activeAuthUser = usersDb && usersDb.auth ? usersDb.auth.currentUser : null;
			if (!activeAuthUser) {
				throw new Error('Admin authentication is unavailable');
			}

			await ensureAdminRealtimeAccess(activeAuthUser);

			let functionSynced = false;
			let functionError = null;
			try {
				await syncAccountAccessStateWithFirebaseAuth(id, email, role, shouldEnable);
				functionSynced = true;
			} catch (error) {
				functionError = error;
			}

			let updated = false;
			if (usersDb && typeof usersDb.updateUserProfile === 'function') {
				try {
					await usersDb.updateUserProfile(id, {
						role: role || undefined,
						isActive: !!shouldEnable,
						updatedAt: Date.now()
					});
					updated = true;
				} catch (_) {
				}
			}

			await updateAccountActiveStateInRealtime(id, shouldEnable, role, email);

			if (!functionSynced && functionError && !updated) {
				throw functionError;
			}
		} catch (error) {
			if (triggerButton) triggerButton.disabled = false;
			window.alert(normalizeText(error && error.message) || 'Failed to update account status. Deploy Firebase Functions and check admin permissions.');
			return;
		}

		await loadAccounts();
	}

	function renderOverview() {
		const accounts = Array.isArray(state.accounts) ? state.accounts : [];
		const requests = Array.isArray(state.allRequests) ? state.allRequests : [];

		const customers = accounts.filter((account) => normalizeLower(account && account.role) === 'customer');
		const technicians = accounts.filter((account) => normalizeLower(account && account.role) === 'technician');
		const pendingRequests = requests.filter((item) => getRequestBucket(item) === 'pending');
		const inProgressRequests = requests.filter((item) => {
			return getRequestBucket(item) === 'active';
		});

		setText('ovCustomerAccounts', String(customers.length));
		setText('ovTechnicianAccounts', String(technicians.length));
		setText('ovPendingRequests', String(pendingRequests.length));
		setText('ovInProgressRequests', String(inProgressRequests.length));
		renderBackupSummary();

		const body = document.getElementById('overviewRequestsTableBody');
		if (!body) return;

		if (!requests.length) {
			body.innerHTML = '<tr><td colspan="6">No requests yet.</td></tr>';
			return;
		}

		const recent = requests
			.slice()
			.sort((left, right) => toDateValue((right && right.technicianUpdatedAt) || (right && right.createdAt)) - toDateValue((left && left.technicianUpdatedAt) || (left && left.createdAt)))
			.slice(0, 6);

		body.innerHTML = recent.map((item) => `
			<tr>
				<td>${escapeHtml(formatRequestCode(item))}</td>
				<td>${escapeHtml(getRequestCustomer(item))}</td>
				<td>${escapeHtml(getRequestTechnicianName(item))}</td>
				<td>${escapeHtml(getRequestTechnicianCode(item))}</td>
				<td>${renderRequestStatusBadge(item)}</td>
				<td>${escapeHtml(formatDate((item && item.technicianUpdatedAt) || (item && item.createdAt)))}</td>
			</tr>
		`).join('');
	}

	function applyRequestsState(requests) {
		const list = (Array.isArray(requests) ? requests : []).map((item, index) => {
			const raw = item && typeof item === 'object' ? item : {};
			const fallbackSeed = JSON.stringify(raw).slice(0, 160);
			const fallbackId = `LOCAL-${String(index + 1).padStart(3, '0')}-${toStableCodeDigits(fallbackSeed)}`;
			const stableId = normalizeText(raw.id || raw.requestId || raw.key || raw.requestKey || raw.requestCode) || fallbackId;
			return Object.assign({}, raw, {
				id: stableId,
				requestId: normalizeText(raw.requestId) || stableId
			});
		});
		state.allRequests = list;
		state.requests = list.filter((item) => getRequestBucket(item) === 'active');
		renderAccountsTable();
		renderRequestsTable();
		renderOverview();
		syncTechnicianRatingAggregates();
	}

	function getRequestBucket(item) {
		const status = normalizeLower(item && item.status);
		if (CANCELLED_STATUSES.has(status)) return 'cancelled';
		if (DONE_STATUSES.has(status)) return 'done';
		if (ACTIVE_STATUSES.has(status)) return 'active';
		return 'pending';
	}

	function getFilteredRequests(requests, statusFilter, doneLateFilter) {
		const list = Array.isArray(requests) ? requests : [];
		const filter = normalizeLower(statusFilter || 'pending');
		if (!filter) return list;
		const filtered = list.filter((item) => getRequestBucket(item) === filter);
		if (filter !== 'done') return filtered;

		const lateFilter = normalizeLower(doneLateFilter || 'all');
		if (lateFilter !== 'late') return filtered;
		return filtered.filter((item) => isLateCompletedRequest(item));
	}

	function getRequestSessionLogRawValue(item) {
		const direct = normalizeText(item && (item.createdBySessionLogId || item.sessionLogId || item.logId));
		if (direct) return direct;

		const fallbackSession = normalizeText(item && (item.createdBySessionId || item.sessionId));
		if (fallbackSession) return fallbackSession;

		const customerId = normalizeText(item && item.customerId);
		if (!customerId) return '';

		return normalizeText(state && state.latestCustomerLoginLogIdByUid && state.latestCustomerLoginLogIdByUid[customerId]);
	}

	function renderRequestSessionLogCell(item) {
		const raw = getRequestSessionLogRawValue(item);
		if (!raw) return '-';
		const code = buildSessionCodeFromId(raw);
		if (!code || code === '-') return escapeHtml(raw);
		return `<span title="${escapeHtml(raw)}">${escapeHtml(code)}</span>`;
	}

	function renderRequestsTable() {
		const tableBody = document.getElementById('requestsTableBody');
		const panelTitleLabel = document.getElementById('requestsPanelTitleLabel');
		const requestStatusFilter = document.getElementById('requestStatusFilter');
		const requestDoneLateFilter = document.getElementById('requestDoneLateFilter');
		if (!tableBody) return;

		const activeFilter = normalizeLower(state.requestStatusFilter || 'pending');
		const activeDoneLateFilter = normalizeLower(state.requestDoneLateFilter || 'all');
		const showDoneLateFilter = activeFilter === 'done';
		const labelMap = {
			pending: 'PENDING',
			active: 'ACTIVE',
			done: 'DONE',
			cancelled: 'CANCELLED'
		};

		if (requestStatusFilter) {
			requestStatusFilter.value = activeFilter;
		}

		if (requestDoneLateFilter) {
			requestDoneLateFilter.hidden = !showDoneLateFilter;
			requestDoneLateFilter.value = showDoneLateFilter ? activeDoneLateFilter : 'all';
		}

		if (panelTitleLabel) {
			panelTitleLabel.textContent = labelMap[activeFilter] || 'REQUEST';
		}

		const filtered = getFilteredRequests(state.allRequests, activeFilter, activeDoneLateFilter)
			.slice()
			.sort((left, right) => toDateValue((right && right.createdAt) || (right && right.technicianUpdatedAt)) - toDateValue((left && left.createdAt) || (left && left.technicianUpdatedAt)));

		if (!filtered.length) {
			state.requestsPage = 1;
			state.visibleRequests = [];
			setTablePagination('requestsPageIndicator', 'requestsPrevPageBtn', 'requestsNextPageBtn', 1, 1);
			const emptyLabel = showDoneLateFilter && activeDoneLateFilter === 'late'
				? 'late done'
				: (labelMap[activeFilter] ? labelMap[activeFilter].toLowerCase() : 'matching');
			tableBody.innerHTML = `<tr><td colspan="10">No ${emptyLabel} requests found.</td></tr>`;
			return;
		}

		const pagination = getPaginatedItems(filtered, state.requestsPage, REQUESTS_PAGE_SIZE);
		state.requestsPage = pagination.activePage;
		state.visibleRequests = pagination.items.slice();
		setTablePagination('requestsPageIndicator', 'requestsPrevPageBtn', 'requestsNextPageBtn', pagination.activePage, pagination.pageCount);

		tableBody.innerHTML = pagination.items.map((item, index) => `
			<tr>
				<td>${escapeHtml(formatRequestCode(item))}</td>
				<td>${renderRequestSessionLogCell(item)}</td>
				<td>${escapeHtml(getRequestCustomer(item))}</td>
				<td>${escapeHtml(getCustomerCode(item))}</td>
				<td>${escapeHtml(getRequestService(item))}</td>
				<td>${escapeHtml(getRequestSchedule(item))}</td>
				<td>${escapeHtml(getRequestTechnicianName(item))}</td>
				<td>${escapeHtml(getRequestTechnicianCode(item))}</td>
				<td>${renderRequestStatusBadge(item)}</td>
				<td>${getRequestActionHtml(item, index)}</td>
			</tr>
		`).join('');

		bindRequestRowButtons(tableBody);
	}

	function bindRequestRowButtons(tableBody) {
		if (!tableBody) return;

		const detailButtons = Array.from(tableBody.querySelectorAll('button[data-action="view-request-details"][data-request-id]'));
		detailButtons.forEach((button) => {
			button.onclick = (event) => {
				event.preventDefault();
				const indexValue = Number(button.getAttribute('data-request-index'));
				if (Number.isInteger(indexValue) && indexValue >= 0) {
					openAdminRequestDetails(indexValue);
					return;
				}
				openAdminRequestDetails(button.getAttribute('data-request-id'));
			};
		});

	}

	function getRequestActionHtml(item, rowIndex) {
		const requestId = normalizeText(item && (item.id || item.requestId));
		if (!requestId) return '-';
		const indexAttr = Number.isInteger(rowIndex) ? rowIndex : -1;
		const detailsButton = `<button type="button" class="row-action-btn secondary" data-action="view-request-details" data-request-id="${escapeHtml(requestId)}" data-request-index="${indexAttr}" onclick="if(window.hfsAdminOpenRequestDetailsByIndex){window.hfsAdminOpenRequestDetailsByIndex(${indexAttr});}else if(window.hfsAdminOpenRequestDetailsFromButton){window.hfsAdminOpenRequestDetailsFromButton(this);} return false;">Details</button>`;
		return `<div class="row-actions">${detailsButton}</div>`;
	}

	function registerGlobalRequestActionFallbacks() {
		window.hfsAdminOpenRequestDetailsByIndex = function (index) {
			const item = getRequestByVisibleIndex(index);
			if (item) {
				openAdminRequestDetails(item);
				return;
			}
			window.alert('Unable to load request details. Please refresh requests and try again.');
		};

		window.hfsAdminOpenRequestDetailsFromButton = function (button) {
			const requestItem = getRequestByButton(button);
			if (requestItem) {
				openAdminRequestDetails(requestItem);
				return;
			}

			const requestId = button && typeof button.getAttribute === 'function'
				? button.getAttribute('data-request-id')
				: '';
			openAdminRequestDetails(requestId);
		};
	}

	function getRequestByVisibleIndex(index) {
		const rowIndex = Number(index);
		if (!Number.isInteger(rowIndex) || rowIndex < 0) return null;
		const visible = Array.isArray(state.visibleRequests) ? state.visibleRequests : [];
		return visible[rowIndex] || null;
	}

	function getRequestByButton(button) {
		if (!button || typeof button.getAttribute !== 'function') return null;

		const byAttrIndex = Number(button.getAttribute('data-request-index'));
		if (Number.isInteger(byAttrIndex) && byAttrIndex >= 0) {
			const byIndex = getRequestByVisibleIndex(byAttrIndex);
			if (byIndex) return byIndex;
		}

		const row = button.closest ? button.closest('tr') : null;
		if (row && row.parentElement) {
			const rows = Array.from(row.parentElement.querySelectorAll('tr'));
			const domIndex = rows.indexOf(row);
			if (domIndex >= 0) {
				const byDomIndex = getRequestByVisibleIndex(domIndex);
				if (byDomIndex) return byDomIndex;
			}
		}

		const byId = getRequestById(button.getAttribute('data-request-id'));
		return byId || null;
	}

	function getRequestById(requestId) {
		const targetId = normalizeText(requestId);
		if (!targetId) return null;
		const list = Array.isArray(state.allRequests) ? state.allRequests : [];
		for (let i = 0; i < list.length; i += 1) {
			const item = list[i];
			const id = normalizeText(item && (item.id || item.requestId));
			const code = normalizeText(item && item.requestCode);
			if ((id && id === targetId) || (code && code === targetId)) return item;
		}
		return null;
	}

	function setAdminRequestDetailText(id, value) {
		const el = document.getElementById(id);
		const safeValue = normalizeText(value) || '-';
		if (el) {
			el.textContent = safeValue;
		}
	}

	function openAdminRequestDetails(requestRef) {
		const modal = document.getElementById('adminRequestDetailModal');
		if (!modal) return;
		const item = (requestRef && typeof requestRef === 'object')
			? requestRef
			: ((typeof requestRef === 'number')
				? getRequestByVisibleIndex(requestRef)
				: getRequestById(requestRef));
		if (!item) {
			window.alert('Unable to load request details. Please refresh requests and try again.');
			return;
		}

		const details = item && item.requestDetails && typeof item.requestDetails === 'object'
			? item.requestDetails
			: {};

		const formatLocationValue = (locationValue) => {
			if (!locationValue) return '-';
			if (typeof locationValue === 'string') return normalizeText(locationValue) || '-';
			if (typeof locationValue !== 'object') return normalizeText(locationValue) || '-';

			const preferredOrder = [
				'fullAddress',
				'addressLine',
				'street',
				'barangay',
				'city',
				'province',
				'landmark',
				'note'
			];

			const orderedParts = [];
			preferredOrder.forEach((key) => {
				const val = normalizeText(locationValue[key]);
				if (val) orderedParts.push(val);
			});

			if (orderedParts.length) return orderedParts.join(', ');

			const fallbackParts = Object.keys(locationValue)
				.map((key) => normalizeText(locationValue[key]))
				.filter(Boolean);
			return fallbackParts.length ? fallbackParts.join(', ') : '-';
		};

		const concernValue = normalizeText(
			details.issue
			|| item.issue
			|| details.repairConcern
			|| item.repairConcern
		);

		const additionalDetailsValue = normalizeText(
			details.details
			|| details.description
			|| item.details
			|| item.description
			|| details.note
		);

		const serviceTypeValue = normalizeText(details.serviceType || item.serviceType);
		const categoryValue = normalizeText(details.category || item.category || details.selectedOptionValue || details.selectedOptionLabel);

		const attachments = Array.isArray(item && item.media) ? item.media : [];
		const attachmentSummary = attachments.length
			? `${attachments.length} file${attachments.length > 1 ? 's' : ''}`
			: 'No attachment';

		setAdminRequestDetailText('adminDetailRequestId', formatRequestCode(item));
		setAdminRequestDetailText('adminDetailCustomer', getRequestCustomer(item));
		setAdminRequestDetailText('adminDetailCustomerId', getCustomerCode(item));
		setAdminRequestDetailStatus(item && item.status);
		setAdminRequestDetailText('adminDetailServiceMode', normalizeText(item && item.serviceMode));
		setAdminRequestDetailText('adminDetailServiceType', serviceTypeValue);
		setAdminRequestDetailText('adminDetailCategory', categoryValue);
		setAdminRequestDetailText('adminDetailSchedule', getRequestSchedule(item));
		setAdminRequestDetailText('adminDetailConcern', concernValue);
		setAdminRequestDetailText('adminDetailLocation', formatLocationValue(details.location || item.location || details.address || item.address));
		setAdminRequestDetailText('adminDetailNotes', additionalDetailsValue);
		setAdminRequestDetailText('adminDetailAttachments', attachmentSummary);

		modal.hidden = false;
	}

	function closeAdminRequestDetails() {
		const modal = document.getElementById('adminRequestDetailModal');
		if (modal) modal.hidden = true;
	}

	async function approveRequestByAdmin(requestId, triggerButton) {
		const id = normalizeText(requestId);
		if (!id) return;
		if (triggerButton) triggerButton.disabled = true;

		if (usersDb && usersDb.auth && !usersDb.auth.currentUser) {
			const session = readAdminSession();
			try {
				await ensureDemoAdminFirebaseAuth(session);
			} catch (_) {
			}
			await waitForCurrentAuthUser(3500);
		}

		const item = getRequestById(id) || {};
		const details = item && item.requestDetails && typeof item.requestDetails === 'object'
			? item.requestDetails
			: {};
		const approvedSkillCategory = toApprovedSkillCategory(
			details.category ||
			details.serviceType ||
			details.selectedOptionValue ||
			details.selectedOptionLabel ||
			item.category ||
			item.serviceType ||
			item.serviceName ||
			item.deviceType ||
			''
		);

		const meta = {
			adminReviewedAt: Date.now(),
			adminReviewStatus: 'approved',
			reviewedByRole: 'admin',
			adminApprovedSkillCategory: approvedSkillCategory
		};

		const updatePayload = Object.assign({}, meta, {
			status: 'offered',
			assignedTechnicianId: null,
			assignedTechnicianEmail: null,
			technicianId: null,
			technicianEmail: null,
			technicianUpdatedAt: Date.now()
		});

		const writeApprovedStatus = async () => {
			if (usersDb && typeof usersDb.updateBookingRequestStatus === 'function') {
				await usersDb.updateBookingRequestStatus(id, 'offered', meta);
				return;
			}
			const rtdb = getRealtimeDatabase();
			if (!rtdb) throw new Error('Realtime database unavailable');
			await rtdb.ref(`requests/${id}`).update(updatePayload);
		};

		try {
			await writeApprovedStatus();
		} catch (firstError) {
			const session = readAdminSession();
			try {
				await ensureDemoAdminFirebaseAuth(session);
			} catch (_) {
			}
			await waitForCurrentAuthUser(3500);

			try {
				const rtdb = getRealtimeDatabase();
				if (!rtdb) throw firstError || new Error('Realtime database unavailable');
				await rtdb.ref(`requests/${id}`).update(updatePayload);
			} catch (secondError) {
				if (triggerButton) triggerButton.disabled = false;
				const err = secondError || firstError;
				const code = normalizeText(err && (err.code || err.name));
				const message = normalizeText(err && err.message);
				window.alert(`Failed to approve request${code ? ` (${code})` : ''}. ${message || 'Check Firebase permissions.'}`);
				return;
			}
		}

		await loadRequests();
	}

	async function declineRequestByAdmin(requestId, triggerButton) {
		const id = normalizeText(requestId);
		if (!id) return;
		if (triggerButton) triggerButton.disabled = true;

		const meta = {
			adminReviewedAt: Date.now(),
			adminReviewStatus: 'declined',
			reviewedByRole: 'admin'
		};

		try {
			if (usersDb && typeof usersDb.updateBookingRequestStatus === 'function') {
				await usersDb.updateBookingRequestStatus(id, 'declined', meta);
			} else {
				const rtdb = getRealtimeDatabase();
				if (!rtdb) throw new Error('Realtime database unavailable');
				await rtdb.ref(`requests/${id}`).update(Object.assign({}, meta, {
					status: 'declined',
					technicianUpdatedAt: Date.now()
				}));
			}
		} catch (_) {
			if (triggerButton) triggerButton.disabled = false;
			window.alert('Failed to decline request. Check Firebase permissions.');
			return;
		}

		await loadRequests();
	}

	async function loadAccounts() {
		const tableBody = document.getElementById('accountsTableBody');
		if (!tableBody) return;
		setTablePagination('accountsPageIndicator', 'accountsPrevPageBtn', 'accountsNextPageBtn', 1, 1);
		tableBody.innerHTML = `<tr><td colspan="${getAccountsTableColumnCount()}">Loading accounts...</td></tr>`;

		if (typeof unsubscribeAccounts === 'function') {
			unsubscribeAccounts();
			unsubscribeAccounts = null;
		}

		const rtdb = getRealtimeDatabase();
		if (rtdb) {
			const adminsRef = rtdb.ref('admins');
			const customersRef = rtdb.ref('customers');
			const techniciansRef = rtdb.ref('technicians');
			const usersRef = rtdb.ref('users');
			const cache = { admins: {}, customers: {}, technicians: {}, users: {} };
			const errors = { admins: null, customers: null, technicians: null, users: null };

			const renderMerged = () => {
				const accountMap = new Map();

				Object.keys(cache.admins || {}).forEach((id) => {
					const data = cache.admins[id] && typeof cache.admins[id] === 'object' ? cache.admins[id] : {};
					accountMap.set(id, normalizeAccountForAdmin(id, data, 'admins'));
				});

				Object.keys(cache.technicians || {}).forEach((id) => {
					const data = cache.technicians[id] && typeof cache.technicians[id] === 'object' ? cache.technicians[id] : {};
					accountMap.set(id, normalizeAccountForAdmin(id, data, 'technicians'));
				});

				Object.keys(cache.users || {}).forEach((id) => {
					const data = cache.users[id] && typeof cache.users[id] === 'object' ? cache.users[id] : {};
					if (accountMap.has(id)) return;
					accountMap.set(id, normalizeAccountForAdmin(id, data, 'users'));
				});

				Object.keys(cache.customers || {}).forEach((id) => {
					const data = cache.customers[id] && typeof cache.customers[id] === 'object' ? cache.customers[id] : {};
					const normalized = normalizeAccountForAdmin(id, data, 'customers');
					const existing = accountMap.get(id);
					if (existing && normalizeLower(existing.role) === 'technician') {
						return;
					}
					accountMap.set(id, existing ? Object.assign({}, existing, normalized, { role: 'customer' }) : normalized);
				});

				const accounts = Array.from(accountMap.values());

				accounts.sort((left, right) => {
					return toDateValue(right && (right.createdAt || right.updatedAt)) - toDateValue(left && (left.createdAt || left.updatedAt));
				});

				state.accounts = accounts;
				renderAccountsTable();
				renderRequestsTable();
				renderSessionLogsTable();
				renderOverview();
				syncTechnicianRatingAggregates();

				const allFailed = !!errors.admins && !!errors.customers && !!errors.technicians && !!errors.users;
				if (allFailed) {
					tableBody.innerHTML = `<tr><td colspan="${getAccountsTableColumnCount()}">Failed to load admins/customers/technicians/users from Realtime Database.</td></tr>`;
				}
			};

			const adminsSuccess = (snapshot) => {
				errors.admins = null;
				cache.admins = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
				renderMerged();
			};
			const customersSuccess = (snapshot) => {
				errors.customers = null;
				cache.customers = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
				renderMerged();
			};
			const techniciansSuccess = (snapshot) => {
				errors.technicians = null;
				cache.technicians = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
				renderMerged();
			};
			const usersSuccess = (snapshot) => {
				errors.users = null;
				cache.users = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
				renderMerged();
			};
			const adminsFailure = (error) => {
				errors.admins = error || new Error('admins read failed');
				renderMerged();
			};
			const customersFailure = (error) => {
				errors.customers = error || new Error('customers read failed');
				renderMerged();
			};
			const techniciansFailure = (error) => {
				errors.technicians = error || new Error('technicians read failed');
				renderMerged();
			};
			const usersFailure = (error) => {
				errors.users = error || new Error('users read failed');
				renderMerged();
			};

			adminsRef.on('value', adminsSuccess, adminsFailure);
			customersRef.on('value', customersSuccess, customersFailure);
			techniciansRef.on('value', techniciansSuccess, techniciansFailure);
			usersRef.on('value', usersSuccess, usersFailure);
			unsubscribeAccounts = function () {
				adminsRef.off('value', adminsSuccess);
				customersRef.off('value', customersSuccess);
				techniciansRef.off('value', techniciansSuccess);
				usersRef.off('value', usersSuccess);
			};
			return state.accounts;
		}

		const db = getFirestore();
		if (!db) {
			tableBody.innerHTML = `<tr><td colspan="${getAccountsTableColumnCount()}">Firebase is not configured or unavailable.</td></tr>`;
			state.accounts = [];
			state.accountsPage = 1;
			renderOverview();
			return [];
		}

		let accounts = [];
		try {
			const snapshot = await db.collection('users').limit(500).get();
			accounts = snapshot.docs.map((doc) => normalizeAccountForAdmin(doc.id, doc.data() || {}, 'users'));
		} catch (_) {
			tableBody.innerHTML = `<tr><td colspan="${getAccountsTableColumnCount()}">Failed to load accounts from Firebase.</td></tr>`;
			state.accounts = [];
			state.accountsPage = 1;
			renderOverview();
			return [];
		}

		accounts.sort((left, right) => {
			return toDateValue(right && (right.createdAt || right.updatedAt)) - toDateValue(left && (left.createdAt || left.updatedAt));
		});

		state.accounts = accounts;
		renderAccountsTable();
		renderRequestsTable();
		renderSessionLogsTable();
		renderOverview();
		return accounts;
	}

	function getRequestService(item) {
		const modeRaw = normalizeLower(item && (item.serviceMode || item.requestMode || item.bookingType));
		if (modeRaw.includes('drop') || modeRaw.includes('store')) return 'Store Drop-Off';
		if (modeRaw.includes('home')) return 'Home Service';
		return normalizeText(item && item.serviceMode) || '-';
	}

	function getRequestCustomer(item) {
		const customerId = normalizeText(item && item.customerId);
		const profile = findAccountByUidOrEmail(customerId, item && item.customerEmail, 'customer');
		if (profile) {
			const fullName = getAccountFullName(profile);
			if (fullName) return fullName;
		}
		return normalizeText(item && (item.customerName || item.customerEmail || item.customerId)) || '-';
	}

	function getRequestTechnicianCode(item) {
		const bucket = getRequestBucket(item);
		if (bucket !== 'active' && bucket !== 'done') return '-';
		const technicianUid = normalizeText(item && (item.assignedTechnicianId || item.technicianId));
		const technicianEmail = normalizeLower(item && (item.assignedTechnicianEmail || item.technicianEmail));
		const technicianCode = formatTechnicianReference(technicianEmail, technicianUid);
		return technicianCode === '-'
			? (normalizeText(item && item.technicianId) || '-')
			: technicianCode;
	}

	function getRequestTechnicianName(item) {
		const bucket = getRequestBucket(item);
		if (bucket !== 'active' && bucket !== 'done') return '-';
		const technicianUid = normalizeText(item && (item.assignedTechnicianId || item.technicianId));
		const technicianEmail = normalizeLower(item && (item.assignedTechnicianEmail || item.technicianEmail));
		const technicianProfile = findAccountByUidOrEmail(technicianUid, technicianEmail, 'technician');

		if (technicianProfile) {
			const fullName = getAccountFullName(technicianProfile) || getProfileName(technicianProfile);
			if (fullName) return fullName;
		}

		return normalizeText(item && (item.technicianName || item.assignedTechnicianName || technicianEmail)) || '-';
	}

	function getRequestTechnician(item) {
		const technicianName = getRequestTechnicianName(item);
		const technicianCode = getRequestTechnicianCode(item);
		if (technicianName !== '-' && technicianCode !== '-') return `${technicianName} (${technicianCode})`;
		if (technicianName !== '-') return technicianName;
		return technicianCode;
	}

	function getRequestSchedule(item) {
		const date = normalizeText(item && item.preferredDate);
		const time = normalizeText(item && item.preferredTime);
		if (date && time) return `${date} ${time}`;
		return normalizeText(item && (item.preferredSchedule || item.preferred_datetime)) || '-';
	}

	function parseHourFromSchedule(value) {
		const normalized = normalizeText(value);
		if (!normalized) return null;

		const amPmMatch = normalized.match(/\b(1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(AM|PM)\b/i);
		if (amPmMatch) {
			const hour12 = Number(amPmMatch[1]);
			const period = normalizeText(amPmMatch[2]).toUpperCase();
			if (!hour12) return null;
			if (period === 'AM') return hour12 === 12 ? 0 : hour12;
			return hour12 === 12 ? 12 : hour12 + 12;
		}

		const twentyFourMatch = normalized.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
		if (twentyFourMatch) {
			const hour24 = Number(twentyFourMatch[1]);
			return Number.isInteger(hour24) ? hour24 : null;
		}

		return null;
	}

	function getScheduledStartDateTime(item) {
		const date = normalizeText(item && item.preferredDate);
		const time = normalizeText(item && item.preferredTime);
		if (date) {
			const parsedDate = new Date(`${date}T00:00:00`);
			if (!Number.isNaN(parsedDate.getTime())) {
				const parsedHour = parseHourFromSchedule(time);
				const hour = Number.isInteger(parsedHour) ? parsedHour : 8;
				return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), hour, 0, 0, 0);
			}
		}

		const rawPreferred = normalizeText(item && item.preferred_datetime);
		if (rawPreferred) {
			const direct = new Date(rawPreferred);
			if (!Number.isNaN(direct.getTime())) return direct;
		}

		return null;
	}

	function getCompletionTimeValue(item) {
		return toDateValue(item && (item.completedAt || item.finishedAt || item.technicianUpdatedAt || item.updatedAt));
	}

	function isLateCompletedRequest(item) {
		const status = normalizeLower(item && item.status);
		if (!DONE_STATUSES.has(status)) return false;
		if (typeof (item && item.completedLate) === 'boolean') return item.completedLate;
		const scheduledAt = getScheduledStartDateTime(item);
		const completedAt = getCompletionTimeValue(item);
		if (!(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.getTime())) return false;
		if (!completedAt) return false;
		return completedAt - scheduledAt.getTime() > LATE_COMPLETION_THRESHOLD_MS;
	}

	async function loadRequests() {
		const tableBody = document.getElementById('requestsTableBody');
		if (!tableBody) return;
		setTablePagination('requestsPageIndicator', 'requestsPrevPageBtn', 'requestsNextPageBtn', 1, 1);
		tableBody.innerHTML = '<tr><td colspan="10">Loading requests...</td></tr>';

		if (typeof unsubscribeRequests === 'function') {
			unsubscribeRequests();
			unsubscribeRequests = null;
		}

		const rtdb = getRealtimeDatabase();
		if (rtdb) {
			const ref = rtdb.ref('requests');
			const success = (snapshot) => {
				const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
				const items = Object.keys(value).map((id) => {
					const data = value[id] && typeof value[id] === 'object' ? value[id] : {};
					const customerId = normalizeText(data.customerId);
					const customerCode = normalizeCustomerCode(data.customerCode || data.customerShortId, customerId);
					if (customerId && (!normalizeText(data.customerCode) || normalizeText(data.customerCode).toUpperCase().startsWith('CUS-'))) {
						// Keep this as a local display/backfill value; dashboard read access may not permit request writes.
						data.customerCode = customerCode;
					}
					return Object.assign({ id, requestId: String(data.requestId || id) }, data);
				});
				applyRequestsState(items);
			};
			const failure = () => {
				tableBody.innerHTML = '<tr><td colspan="10">Failed to load requests from Firebase Realtime Database.</td></tr>';
				state.requests = [];
				state.allRequests = [];
				state.requestsPage = 1;
				state.visibleRequests = [];
				renderOverview();
			};

			ref.on('value', success, failure);
			unsubscribeRequests = function () {
				ref.off('value', success);
			};
			return state.allRequests;
		}

		if (usersDb && typeof usersDb.subscribeAllRequests === 'function') {
			unsubscribeRequests = usersDb.subscribeAllRequests((items) => {
				applyRequestsState(items);
			}, () => {
				tableBody.innerHTML = '<tr><td colspan="10">Failed to load requests from Firebase.</td></tr>';
				state.requests = [];
				state.allRequests = [];
				state.requestsPage = 1;
				state.visibleRequests = [];
				renderOverview();
			});
			return state.allRequests;
		}

		tableBody.innerHTML = '<tr><td colspan="10">Firebase Realtime Database is not configured or unavailable.</td></tr>';
		state.requests = [];
		state.allRequests = [];
		state.requestsPage = 1;
		state.visibleRequests = [];
		renderOverview();
		return [];
	}

	async function createTechnicianAccount(event) {
		event.preventDefault();

		const firstNameInput = document.getElementById('techFirstName');
		const middleNameInput = document.getElementById('techMiddleName');
		const lastNameInput = document.getElementById('techLastName');
		const suffixChoice = document.querySelector('input[name="techSuffix"]:checked');
		const emailInput = document.getElementById('techEmail');
		const mobileInput = document.getElementById('techMobile');
		const barangayInput = document.getElementById('techBarangay');
		const skillsWrap = document.getElementById('techSkillsInput');
		const submitButton = document.getElementById('createTechnicianBtn');

		const firstName = normalizeText(firstNameInput && firstNameInput.value);
		const middleName = normalizeText(middleNameInput && middleNameInput.value);
		const lastName = normalizeText(lastNameInput && lastNameInput.value);
		const suffix = normalizeText(suffixChoice && suffixChoice.value);
		const email = normalizeLower(emailInput && emailInput.value);
		const mobile = normalizeText(mobileInput && mobileInput.value);
		const barangayName = normalizeText(barangayInput && barangayInput.value);
		const selectedSkills = getSelectedTechnicianSkills();
		const generatedPassword = generateTechnicianPassword();

		setTechFormFieldInvalid(firstNameInput, false);
		setTechFormFieldInvalid(middleNameInput, false);
		setTechFormFieldInvalid(lastNameInput, false);
		setTechFormFieldInvalid(mobileInput, false);
		setTechFormFieldInvalid(barangayInput, false);
		if (skillsWrap) skillsWrap.classList.remove('invalid');

		const firstNameError = validateCustomerStyleName(firstNameInput && firstNameInput.value, true, 'First name');
		if (firstNameError) {
			setTechFormFieldInvalid(firstNameInput, true);
			if (firstNameInput && typeof firstNameInput.focus === 'function') firstNameInput.focus();
			setFormMessage(firstNameError, true);
			return;
		}

		const middleNameError = validateCustomerStyleName(middleNameInput && middleNameInput.value, false, 'Middle name');
		if (middleNameError) {
			setTechFormFieldInvalid(middleNameInput, true);
			if (middleNameInput && typeof middleNameInput.focus === 'function') middleNameInput.focus();
			setFormMessage(middleNameError, true);
			return;
		}

		const lastNameError = validateCustomerStyleName(lastNameInput && lastNameInput.value, false, 'Last name');
		if (lastNameError) {
			setTechFormFieldInvalid(lastNameInput, true);
			if (lastNameInput && typeof lastNameInput.focus === 'function') lastNameInput.focus();
			setFormMessage(lastNameError, true);
			return;
		}

		const suffixError = validateSuffix(suffix);
		if (suffixError) {
			setFormMessage(suffixError, true);
			return;
		}

		if (!email) {
			setFormMessage('Email is required.', true);
			return;
		}

		const mobileError = validateTechnicianMobile(mobile);
		if (mobileError) {
			setTechFormFieldInvalid(mobileInput, true);
			if (mobileInput && typeof mobileInput.focus === 'function') mobileInput.focus();
			setFormMessage(mobileError, true);
			return;
		}

		if (!barangayName) {
			setTechFormFieldInvalid(barangayInput, true);
			if (barangayInput && typeof barangayInput.focus === 'function') barangayInput.focus();
			setFormMessage('Barangay is required.', true);
			return;
		}

		if (!selectedSkills.length) {
			if (skillsWrap) skillsWrap.classList.add('invalid');
			setFormMessage('Select at least one skill.', true);
			return;
		}

		const normalizedMobile = normalizeTechnicianMobile(mobile);
		const locationLabel = [barangayName, DAGUPAN_CITY_NAME, DAGUPAN_PROVINCE_NAME].filter(Boolean).join(', ');

		submitButton.disabled = true;
		setFormMessage('Creating technician account...', false);

		let authUser = null;
		let inviteSent = false;
		let firestoreSaved = false;
		let createdUid = '';
		let createdPayload = null;

		try {
			authUser = await provisionTechnicianAuth(email, generatedPassword);
			const uid = normalizeText(authUser && authUser.uid);
			if (!uid) {
				throw new Error('Could not create technician auth account.');
			}
			createdUid = uid;

			const payload = {
				uid,
				email,
				first_name: firstName,
				middle_name: middleName,
				last_name: lastName,
				suffix,
				mobile: normalizedMobile,
				mobile_e164: normalizedMobile,
				location: locationLabel,
				barangay: barangayName,
				town: barangayName,
				city: DAGUPAN_CITY_NAME,
				province: DAGUPAN_PROVINCE_NAME,
				cityCode: DAGUPAN_CITY_CODE,
				provinceCode: DAGUPAN_PROVINCE_CODE,
				skills: selectedSkills,
				primarySkill: selectedSkills[0] || '',
				profileCompleted: true,
				onboardingCompleted: true,
				role: 'technician',
				isActive: true,
				isVerified: true,
				emailVerified: true,
				createdByAdmin: true,
				inviteSentAt: Date.now(),
				createdAt: Date.now(),
				updatedAt: Date.now()
			};
			createdPayload = Object.assign({}, payload);

			// Ensure the technician node exists even when admin-level profile writes are restricted.
			try {
				await saveTechnicianProfileAsSelf(email, generatedPassword, payload);
			} catch (_) {
			}

			await sendTechnicianInviteLink(email);
			inviteSent = true;

			try {
				if (usersDb && typeof usersDb.updateUserProfile === 'function') {
					await usersDb.updateUserProfile(uid, payload);
					await enforceTechnicianRealtimeProfile(uid, payload);
					await ensureTechnicianNamesPersisted(uid, payload);
					firestoreSaved = true;
				} else {
					throw new Error('Profile update service unavailable');
				}
			} catch (saveError) {
				if (hasErrorCode(saveError, 'permission-denied')) {
					await saveTechnicianProfileAsSelf(email, generatedPassword, payload);
					await enforceTechnicianRealtimeProfile(uid, payload);
					await ensureTechnicianNamesPersisted(uid, payload);
					firestoreSaved = true;
				} else {
					throw saveError;
				}
			}
		} catch (error) {
			submitButton.disabled = false;
			if (inviteSent && !firestoreSaved) {
				setFormMessage('Invite link sent successfully. Profile save was blocked by Firestore rules.', false);
				showInviteSentPopup();
				return;
			}
			if (hasErrorCode(error, 'email-already-in-use')) {
				try {
					await sendTechnicianInviteLink(email);
					setFormMessage('This email already exists. A password setup/reset link was sent to email.', false);
					showInviteSentPopup();
				} catch (_) {
					setFormMessage('Email already exists in Firebase Auth for this project. Use a different email.', true);
				}
				return;
			}
			if (hasErrorCode(error, 'operation-not-allowed')) {
				setFormMessage('Enable Email/Password in Firebase Auth to create technician and send invite link.', true);
				return;
			}
			if (hasErrorCode(error, 'permission-denied')) {
				setFormMessage('Permission denied while saving technician. Check Firestore security rules.', true);
				return;
			}
			setFormMessage('Failed to create technician invite. Check Firebase Auth and Firestore permissions.', true);
			return;
		}

		submitButton.disabled = false;

		if (createdUid && createdPayload) {
			try {
				await ensureTechnicianNamesPersisted(createdUid, createdPayload);
			} catch (_) {
			}
		}

		setFormMessage('Technician created. Password setup link was sent to technician email.', false);
		showInviteSentPopup();
		if (event.target && typeof event.target.reset === 'function') event.target.reset();
		await loadAccounts();
	}

	function bindNavigation() {
		const buttons = Array.from(document.querySelectorAll('.nav-link[data-section], .nav-sub-link[data-section], .stat-card-action[data-section]'));
		const topButtons = Array.from(document.querySelectorAll('.nav-link[data-section]'));
		const subButtons = Array.from(document.querySelectorAll('.nav-sub-link[data-section]'));
		const manageGroup = document.getElementById('manageAccountsGroup');
		const manageSummary = document.getElementById('manageAccountsSummary');
		const adminGroup = document.getElementById('manageAdminGroup');
		const adminSummary = document.getElementById('manageAdminSummary');
		const panels = Array.from(document.querySelectorAll('.panel[data-panel]'));
		if (!buttons.length || !panels.length) return;

		function activate(section, options = {}) {
			const targetFilter = normalizeLower(options.filter || '');
			const targetRequestFilter = normalizeLower(options.requestFilter || '');
			const isAdminSettingsSection = section === 'admin-profile' || section === 'admin-password';

			topButtons.forEach((button) => {
				const isActive = button.getAttribute('data-section') === section;
				button.classList.toggle('active', isActive);
			});

			subButtons.forEach((button) => {
				const sameSection = button.getAttribute('data-section') === section;
				if (!sameSection) {
					button.classList.remove('active');
					return;
				}
				if (section === 'accounts') {
					const sameFilter = normalizeLower(button.getAttribute('data-filter') || '') === targetFilter;
					button.classList.toggle('active', !!targetFilter && sameFilter);
					return;
				}
				if (section === 'requests') {
					const sameRequestFilter = normalizeLower(button.getAttribute('data-request-filter') || '') === targetRequestFilter;
					button.classList.toggle('active', !!targetRequestFilter && sameRequestFilter);
					return;
				}
				button.classList.add('active');
			});

			if (manageSummary) {
				manageSummary.classList.toggle('active', section === 'accounts' || section === 'create-technician');
			}

			if (adminSummary) {
				adminSummary.classList.toggle('active', isAdminSettingsSection);
			}

			if (manageGroup && (section === 'accounts' || section === 'create-technician')) {
				manageGroup.open = true;
			}

			if (adminGroup && isAdminSettingsSection) {
				adminGroup.open = true;
			}

			panels.forEach((panel) => {
				const isActive = panel.getAttribute('data-panel') === section;
				panel.hidden = !isActive;
			});

			if (section === 'accounts') {
				const nextAccountFilter = targetFilter || state.accountRoleFilter || 'all';
				if (normalizeLower(nextAccountFilter) !== normalizeLower(state.accountRoleFilter || 'all')) {
					state.accountsPage = 1;
				}
				state.accountRoleFilter = nextAccountFilter;
				renderAccountsTable();
			}

			if (section === 'requests') {
				const nextRequestFilter = targetRequestFilter || state.requestStatusFilter || 'pending';
				if (normalizeLower(nextRequestFilter) !== normalizeLower(state.requestStatusFilter || 'pending')) {
					state.requestsPage = 1;
				}
				state.requestStatusFilter = nextRequestFilter;
				renderRequestsTable();
			}

			if (isAdminSettingsSection) {
				loadAdminSettings();
			}
		}

		buttons.forEach((button) => {
			button.addEventListener('click', () => {
				const section = button.getAttribute('data-section');
				const filter = button.getAttribute('data-filter');
				const requestFilter = button.getAttribute('data-request-filter');
				activate(section, { filter, requestFilter });
			});
		});
	}

	function bindSidebarToggle() {
		const appShell = document.querySelector('.app-shell');
		const toggleBtn = document.getElementById('adminSidebarToggle');
		if (!appShell || !toggleBtn) return;

		toggleBtn.addEventListener('click', () => {
			const collapsed = appShell.classList.toggle('sidebar-collapsed');
			toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
		});
	}

	function bindEvents() {
		registerGlobalRequestActionFallbacks();

		const refreshOverviewBtn = document.getElementById('refreshOverviewBtn');
		const refreshAccountsBtn = document.getElementById('refreshAccountsBtn');
		const accountSearchInput = document.getElementById('accountSearchInput');
		const accountStatusFilter = document.getElementById('accountStatusFilter');
		const accountsTableBody = document.getElementById('accountsTableBody');
		const accountsPrevPageBtn = document.getElementById('accountsPrevPageBtn');
		const accountsNextPageBtn = document.getElementById('accountsNextPageBtn');
		const accountActionConfirmModal = document.getElementById('accountActionConfirmModal');
		const accountActionConfirmNoBtn = document.getElementById('accountActionConfirmNoBtn');
		const accountActionConfirmYesBtn = document.getElementById('accountActionConfirmYesBtn');
		const requestsTableBody = document.getElementById('requestsTableBody');
		const requestsPrevPageBtn = document.getElementById('requestsPrevPageBtn');
		const requestsNextPageBtn = document.getElementById('requestsNextPageBtn');
		const requestDetailModal = document.getElementById('adminRequestDetailModal');
		const requestDetailCloseBtn = document.getElementById('adminRequestDetailCloseBtn');
		const requestDetailDoneBtn = document.getElementById('adminRequestDetailDoneBtn');
		const refreshRequestsBtn = document.getElementById('refreshRequestsBtn');
		const requestStatusFilter = document.getElementById('requestStatusFilter');
		const refreshSessionLogsBtn = document.getElementById('refreshSessionLogsBtn');
		const sessionPrevPageBtn = document.getElementById('sessionPrevPageBtn');
		const sessionNextPageBtn = document.getElementById('sessionNextPageBtn');
		const refreshReportsBtn = document.getElementById('refreshReportsBtn');
		const reportsTypeFilter = document.getElementById('reportsTypeFilter');
		const reportsPrevPageBtn = document.getElementById('reportsPrevPageBtn');
		const reportsNextPageBtn = document.getElementById('reportsNextPageBtn');
		const downloadFullBackupBtn = document.getElementById('downloadFullBackupBtn');
		const downloadAccountsBackupBtn = document.getElementById('downloadAccountsBackupBtn');
		const downloadRequestsBackupBtn = document.getElementById('downloadRequestsBackupBtn');
		const downloadReportsBackupBtn = document.getElementById('downloadReportsBackupBtn');
		const downloadSessionLogsBackupBtn = document.getElementById('downloadSessionLogsBackupBtn');
		const adminProfileForm = document.getElementById('adminProfileForm');
		const adminPasswordForm = document.getElementById('adminPasswordForm');
		const addTechnicianForm = document.getElementById('addTechnicianForm');
		const closeInvitePopupBtn = document.getElementById('closeInvitePopupBtn');
		const inviteSentPopup = document.getElementById('inviteSentPopup');
		const logoutActions = Array.from(document.querySelectorAll('[data-logout="true"]'));

		if (refreshOverviewBtn) {
			refreshOverviewBtn.addEventListener('click', async () => {
				await Promise.all([loadAccounts(), loadRequests()]);
			});
		}

		if (refreshAccountsBtn) {
			refreshAccountsBtn.addEventListener('click', async () => {
				state.accountsPage = 1;
				await loadAccounts();
			});
		}

		if (accountSearchInput) {
			accountSearchInput.addEventListener('input', () => {
				state.accountSearchQuery = normalizeText(accountSearchInput.value || '');
				state.accountsPage = 1;
				renderAccountsTable();
			});
		}

		if (accountStatusFilter) {
			accountStatusFilter.value = 'all';
			accountStatusFilter.addEventListener('change', () => {
				state.accountStatusFilter = normalizeLower(accountStatusFilter.value || 'all');
				state.accountsPage = 1;
				renderAccountsTable();
			});
		}

		if (accountsPrevPageBtn) {
			accountsPrevPageBtn.addEventListener('click', () => {
				state.accountsPage = Math.max(1, (Number(state.accountsPage) || 1) - 1);
				renderAccountsTable();
			});
		}

		if (accountsNextPageBtn) {
			accountsNextPageBtn.addEventListener('click', () => {
				const total = getFilteredAccounts(Array.isArray(state.accounts) ? state.accounts : []).length;
				const pageCount = Math.max(1, Math.ceil(total / ACCOUNTS_PAGE_SIZE));
				state.accountsPage = Math.min(pageCount, (Number(state.accountsPage) || 1) + 1);
				renderAccountsTable();
			});
		}

		if (accountsTableBody) {
			accountsTableBody.addEventListener('click', async (event) => {
				const actionBtn = event.target && event.target.closest
					? event.target.closest('button[data-action][data-user-id][data-next-state]')
					: null;
				if (!actionBtn) return;

				const action = normalizeLower(actionBtn.getAttribute('data-action'));
				if (action !== 'toggle-customer' && action !== 'toggle-technician') return;
				const shouldEnable = normalizeLower(actionBtn.getAttribute('data-next-state')) === 'enable';
				const account = getAccountById(actionBtn.getAttribute('data-user-id'));
				const confirmed = await confirmAccountAction(account, shouldEnable);
				if (!confirmed) return;
				await setAccountActiveState(actionBtn.getAttribute('data-user-id'), shouldEnable, actionBtn);
			});
		}

		if (accountActionConfirmNoBtn) {
			accountActionConfirmNoBtn.addEventListener('click', () => {
				closeAccountActionConfirm(false);
			});
		}

		if (accountActionConfirmYesBtn) {
			accountActionConfirmYesBtn.addEventListener('click', () => {
				closeAccountActionConfirm(true);
			});
		}

		if (accountActionConfirmModal) {
			accountActionConfirmModal.addEventListener('click', (event) => {
				if (event.target === accountActionConfirmModal) {
					closeAccountActionConfirm(false);
				}
			});
		}

		if (refreshRequestsBtn) {
			refreshRequestsBtn.addEventListener('click', async () => {
				state.requestsPage = 1;
				await loadRequests();
			});
		}

		if (requestStatusFilter) {
			requestStatusFilter.value = normalizeLower(state.requestStatusFilter || 'pending');
			requestStatusFilter.addEventListener('change', () => {
				state.requestStatusFilter = normalizeLower(requestStatusFilter.value || 'pending');
				if (state.requestStatusFilter !== 'done') {
					state.requestDoneLateFilter = 'all';
				}
				state.requestsPage = 1;
				renderRequestsTable();
			});
		}

		if (requestDoneLateFilter) {
			requestDoneLateFilter.value = normalizeLower(state.requestDoneLateFilter || 'all');
			requestDoneLateFilter.addEventListener('change', () => {
				state.requestDoneLateFilter = normalizeLower(requestDoneLateFilter.value || 'all');
				state.requestsPage = 1;
				renderRequestsTable();
			});
		}

		if (requestsPrevPageBtn) {
			requestsPrevPageBtn.addEventListener('click', () => {
				state.requestsPage = Math.max(1, (Number(state.requestsPage) || 1) - 1);
				renderRequestsTable();
			});
		}

		if (requestsNextPageBtn) {
			requestsNextPageBtn.addEventListener('click', () => {
				const total = getFilteredRequests(state.allRequests, state.requestStatusFilter, state.requestDoneLateFilter).length;
				const pageCount = Math.max(1, Math.ceil(total / REQUESTS_PAGE_SIZE));
				state.requestsPage = Math.min(pageCount, (Number(state.requestsPage) || 1) + 1);
				renderRequestsTable();
			});
		}

		const handleRequestTableAction = async (event) => {
			if (!event) return;
				const detailsBtn = event.target && event.target.closest
					? event.target.closest('button[data-action="view-request-details"][data-request-id]')
					: null;
				if (detailsBtn) {
					event.preventDefault();
					const requestItem = getRequestByButton(detailsBtn);
					if (requestItem) {
						openAdminRequestDetails(requestItem);
						return;
					}
					openAdminRequestDetails(detailsBtn.getAttribute('data-request-id'));
					return;
				}

				return;
		};

		if (requestsTableBody) {
			requestsTableBody.addEventListener('click', handleRequestTableAction);
		}

		const requestsPanel = document.getElementById('requests');
		if (requestsPanel) {
			requestsPanel.addEventListener('click', handleRequestTableAction);
		}

		if (!requestActionFallbackBound) {
			const captureDetailsClick = (event) => {
				if (!event) return;
				const detailsBtn = event.target && event.target.closest
					? event.target.closest('button[data-action="view-request-details"][data-request-id]')
					: null;
				if (!detailsBtn) return;

				event.preventDefault();
				event.stopPropagation();

				const requestItem = getRequestByButton(detailsBtn);
				if (requestItem) {
					openAdminRequestDetails(requestItem);
					return;
				}

				openAdminRequestDetails(detailsBtn.getAttribute('data-request-id'));
			};

			document.addEventListener('click', captureDetailsClick, true);
			requestActionFallbackBound = true;
		}

		if (requestDetailCloseBtn) {
			requestDetailCloseBtn.addEventListener('click', closeAdminRequestDetails);
		}

		if (requestDetailDoneBtn) {
			requestDetailDoneBtn.addEventListener('click', closeAdminRequestDetails);
		}

		if (requestDetailModal) {
			requestDetailModal.addEventListener('click', (event) => {
				if (event.target === requestDetailModal) closeAdminRequestDetails();
			});
		}

		if (refreshSessionLogsBtn) {
			refreshSessionLogsBtn.addEventListener('click', async () => {
				state.sessionLogsPage = 1;
				await loadSessionLogs();
			});
		}

		if (sessionPrevPageBtn) {
			sessionPrevPageBtn.addEventListener('click', () => {
				state.sessionLogsPage = Math.max(1, (Number(state.sessionLogsPage) || 1) - 1);
				renderSessionLogsTable();
			});
		}

		if (sessionNextPageBtn) {
			sessionNextPageBtn.addEventListener('click', () => {
				const total = Array.isArray(state.sessionLogs) ? state.sessionLogs.length : 0;
				const pageCount = Math.max(1, Math.ceil(total / SESSION_LOGS_PAGE_SIZE));
				state.sessionLogsPage = Math.min(pageCount, (Number(state.sessionLogsPage) || 1) + 1);
				renderSessionLogsTable();
			});
		}

		if (refreshReportsBtn) {
			refreshReportsBtn.addEventListener('click', async () => {
				state.reportsPage = 1;
				await loadReports();
			});
		}

		if (reportsTypeFilter) {
			reportsTypeFilter.value = normalizeLower(state.reportsTypeFilter || 'all');
			reportsTypeFilter.addEventListener('change', () => {
				state.reportsTypeFilter = normalizeLower(reportsTypeFilter.value || 'all');
				state.reportsPage = 1;
				renderReportsTable();
			});
		}

		if (reportsPrevPageBtn) {
			reportsPrevPageBtn.addEventListener('click', () => {
				state.reportsPage = Math.max(1, (Number(state.reportsPage) || 1) - 1);
				renderReportsTable();
			});
		}

		if (reportsNextPageBtn) {
			reportsNextPageBtn.addEventListener('click', () => {
				const total = getFilteredReports(state.reports, state.reportsTypeFilter).length;
				const pageCount = Math.max(1, Math.ceil(total / REPORTS_PAGE_SIZE));
				state.reportsPage = Math.min(pageCount, (Number(state.reportsPage) || 1) + 1);
				renderReportsTable();
			});
		}

		[
			['full', downloadFullBackupBtn],
			['accounts', downloadAccountsBackupBtn],
			['requests', downloadRequestsBackupBtn],
			['reports', downloadReportsBackupBtn],
			['session-logs', downloadSessionLogsBackupBtn]
		].forEach(([kind, button]) => {
			if (!button) return;
			button.addEventListener('click', async () => {
				await handleBackupDownload(kind, button);
			});
		});

		if (adminProfileForm) {
			adminProfileForm.addEventListener('submit', saveAdminProfile);

			const editAdminProfileBtn = document.getElementById('editAdminProfileBtn');
			if (editAdminProfileBtn) {
				editAdminProfileBtn.addEventListener('click', async () => {
					if (adminProfileForm.dataset.editing === 'true') {
						setSettingsMessage('adminProfileMessage', '');
						await loadAdminSettings();
						return;
					}

					setSettingsMessage('adminProfileMessage', '');
					setAdminProfileEditingState(true);
				});
			}

			const sendAdminVerificationBtn = document.getElementById('sendAdminVerificationBtn');
			if (sendAdminVerificationBtn) {
				sendAdminVerificationBtn.addEventListener('click', sendAdminProfileVerification);
			}

			['adminSettingsEmail', 'adminFirstName', 'adminLastName']
				.map((id) => document.getElementById(id))
				.filter(Boolean)
				.forEach((input) => {
					input.addEventListener('input', () => {
						setInputInvalidState(input, false);
						setSettingsMessage('adminProfileMessage', '');
						syncAdminProfileActionState();
					});

					input.addEventListener('blur', () => {
						const raw = String(input.value || '');
						if (!raw.trim()) return;
						if (input.id === 'adminSettingsEmail') {
							input.value = normalizeLower(raw);
							syncAdminProfileActionState();
							return;
						}
						input.value = titleCaseName(raw);
						syncAdminProfileActionState();
					});
				});
		}

		if (adminPasswordForm) {
			adminPasswordForm.addEventListener('submit', saveAdminPassword);
			bindPasswordToggleButtons();

			['adminNewPassword', 'adminConfirmPassword']
				.map((id) => document.getElementById(id))
				.filter(Boolean)
				.forEach((input) => {
					input.addEventListener('input', () => {
						setInputInvalidState(input, false);
						setSettingsMessage('adminPasswordMessage', '');
					});
				});
		}

		bindSessionFilters();

		if (addTechnicianForm) {
			addTechnicianForm.addEventListener('submit', createTechnicianAccount);

			const techNameInputs = ['techFirstName', 'techMiddleName', 'techLastName']
				.map((id) => document.getElementById(id))
				.filter(Boolean);
			techNameInputs.forEach((input) => {
				input.addEventListener('input', () => {
					setTechFormFieldInvalid(input, false);
				});

				input.addEventListener('blur', () => {
					const raw = String(input.value || '');
					if (!raw.trim()) return;
					input.value = titleCaseName(raw);
				});
			});

			['techEmail', 'techMobile', 'techBarangay']
				.map((id) => document.getElementById(id))
				.filter(Boolean)
				.forEach((input) => {
					input.addEventListener('input', () => {
						setTechFormFieldInvalid(input, false);
					});
				});

			const skillsWrap = document.getElementById('techSkillsInput');
			if (skillsWrap) {
				skillsWrap.addEventListener('change', () => {
					skillsWrap.classList.remove('invalid');
				});
			}

			bindAdminCreateTechnicianLocation();
		}

		if (closeInvitePopupBtn) {
			closeInvitePopupBtn.addEventListener('click', hideInviteSentPopup);
		}

		if (inviteSentPopup) {
			inviteSentPopup.addEventListener('click', (event) => {
				if (event.target === inviteSentPopup) hideInviteSentPopup();
			});
		}

		logoutActions.forEach((action) => {
			action.addEventListener('click', async (event) => {
				event.preventDefault();

				const session = readAdminSession();
				if (usersDb && typeof usersDb.endRoleSession === 'function') {
					try {
						await usersDb.endRoleSession({
							role: 'admin',
							email: normalizeLower(session && session.username),
							name: normalizeText(session && session.username) || 'admin',
							source: 'admin-dashboard'
						});
					} catch (_) {
					}
				} else if (usersDb && typeof usersDb.logSessionEvent === 'function') {
					try {
						await usersDb.logSessionEvent({
							role: 'admin',
							action: 'logout',
							email: normalizeLower(session && session.username),
							name: normalizeText(session && session.username) || 'admin',
							source: 'admin-dashboard'
						});
					} catch (_) {
					}
				}

				if (typeof unsubscribeAccounts === 'function') {
					unsubscribeAccounts();
					unsubscribeAccounts = null;
				}
				if (typeof unsubscribeRequests === 'function') {
					unsubscribeRequests();
					unsubscribeRequests = null;
				}
				if (typeof unsubscribeSessionLogs === 'function') {
					unsubscribeSessionLogs();
					unsubscribeSessionLogs = null;
				}
				if (typeof unsubscribeReports === 'function') {
					unsubscribeReports();
					unsubscribeReports = null;
				}
				stopSessionPresenceTracking();

				if (usersDb && typeof usersDb.signOut === 'function') {
					try {
						await usersDb.signOut();
					} catch (_) {
					}
				}

				clearAdminSession();
				window.location.href = '../../login.html';
			});
		});
	}

	registerGlobalRequestActionFallbacks();

	document.addEventListener('DOMContentLoaded', async () => {
		const messageEl = document.getElementById('adminSessionText');
		const session = readAdminSession();

		if (!session || String(session.role || '').toLowerCase() !== 'admin') {
			if (messageEl) messageEl.textContent = 'No active admin session. Please log in again.';
			setTimeout(() => {
				window.location.href = '../../login.html';
			}, 1200);
			return;
		}

		if (messageEl) {
			const name = String(session.username || 'admin');
			messageEl.textContent = `Welcome, ${name}.`;
		}

		await ensureDemoAdminFirebaseAuth(session);
		await migrateLegacyUsersRootTechnicians();
		await migrateSpecificEmailsToTechnician();

		bindNavigation();
		bindSidebarToggle();
		bindEvents();
		await loadAdminSettings();
		renderBackupSummary();
		startSessionPresenceTracking();
		Promise.all([loadAccounts(), loadRequests(), loadSessionLogs()]);
		loadReports();

		window.addEventListener('beforeunload', () => {
			if (typeof unsubscribeAccounts === 'function') {
				unsubscribeAccounts();
				unsubscribeAccounts = null;
			}
			if (typeof unsubscribeRequests === 'function') {
				unsubscribeRequests();
				unsubscribeRequests = null;
			}
			if (typeof unsubscribeSessionLogs === 'function') {
				unsubscribeSessionLogs();
				unsubscribeSessionLogs = null;
			}
			if (typeof unsubscribeReports === 'function') {
				unsubscribeReports();
				unsubscribeReports = null;
			}
			stopSessionPresenceTracking();
		});
	});
})();
