(function () {
	const ADMIN_DEMO_SESSION_KEY = 'hfs_admin_demo_session';
	const ADMIN_DEMO_AUTH_KEY = 'hfs_admin_demo_firebase_auth_v1';
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
	const ACCEPTED_STATUSES = new Set(['offered', 'accepted', 'confirmed', 'in-progress', 'ongoing', 'completed', 'finished']);
	const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'declined', 'rejected']);
	const state = {
		accounts: [],
		sessionPresenceByUid: {},
		requests: [],
		allRequests: [],
		visibleRequests: [],
		sessionLogs: [],
		sessionRoleFilter: 'customer',
		sessionActionFilter: 'login',
		requestStatusFilter: 'waiting',
		accountRoleFilter: 'all',
		accountSearchQuery: '',
		accountStatusFilter: 'all'
	};
	let invitePopupTimer = null;
	let unsubscribeRequests = null;
	let unsubscribeAccounts = null;
	let unsubscribeSessionLogs = null;
	let unsubscribeSessionPresence = [];
	let requestActionFallbackBound = false;

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

	async function ensureDemoAdminFirebaseAuth(session) {
		const role = normalizeLower(session && session.role);
		if (role && role !== 'admin') return true;

		if (!usersDb || typeof usersDb.signInWithEmail !== 'function') return false;
		const currentUser = usersDb.auth && usersDb.auth.currentUser ? usersDb.auth.currentUser : null;
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
					isVerified: true,
					emailVerified: true,
					updatedAt: Date.now()
				});
			} catch (_) {
			}
		};

		if (currentUser) {
			await ensureAdminProfile(currentUser);
			return true;
		}

		let savedEmail = '';
		let savedPassword = '';
		try {
			const parsed = JSON.parse(localStorage.getItem(ADMIN_DEMO_AUTH_KEY) || '{}');
			savedEmail = normalizeLower(parsed && parsed.email);
			savedPassword = normalizeText(parsed && parsed.password);
		} catch (_) {
		}

		if (savedEmail && savedPassword) {
			try {
				await usersDb.signInWithEmail(savedEmail, savedPassword);
				await ensureAdminProfile(usersDb.auth && usersDb.auth.currentUser ? usersDb.auth.currentUser : null);
				return true;
			} catch (_) {
			}
		}

		if (!usersDb.auth || typeof usersDb.auth.createUserWithEmailAndPassword !== 'function') {
			return false;
		}

		const demoEmail = `admin.demo.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}@homefixsolution.app`;
		const demoPassword = `Admin#${Date.now().toString(36)}Aa1!${Math.random().toString(36).slice(2, 4)}`;

		try {
			const credential = await usersDb.auth.createUserWithEmailAndPassword(demoEmail, demoPassword);
			const authUser = credential && credential.user ? credential.user : null;
			if (!authUser || !authUser.uid) return false;

			try {
				localStorage.setItem(ADMIN_DEMO_AUTH_KEY, JSON.stringify({
					email: demoEmail,
					password: demoPassword
				}));
			} catch (_) {
			}

			await ensureAdminProfile(authUser);

			return true;
		} catch (_) {
			return false;
		}
	}

	async function waitForCurrentAuthUser(timeoutMs) {
		const auth = usersDb && usersDb.auth ? usersDb.auth : null;
		if (!auth) return null;
		if (auth.currentUser) return auth.currentUser;
		if (typeof auth.onAuthStateChanged !== 'function') return auth.currentUser || null;

		const waitMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : 3000;
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

	function toApprovedSkillCategory(value) {
		const normalized = normalizeLower(value);
		if (!normalized) return '';
		if (/\bhvac\b|\bair\s*con\b|\bair\s*conditioning\b|\bairconditioner\b|\bac\b/.test(normalized)) return 'HVAC Technician';
		if (/\bappliance\b|\brefrigerator\b|\bref\b|\bwasher\b|\bwashing\b|\bmicrowave\b|\boven\b/.test(normalized)) return 'Appliance Repair Technician';
		if (/\belectric\b|\belectrical\b|\belectrician\b|\bwiring\b|\bcircuit\b|\boutlet\b/.test(normalized)) return 'Electrician';
		if (/\bplumb\b|\bplumber\b|\bpipe\b|\bdrain\b|\bfaucet\b|\btoilet\b|\bsink\b|\bleak\b/.test(normalized)) return 'Plumber';
		return normalizeText(value);
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

	function getSessionUid(item) {
		return normalizeText(item && item.uid);
	}

	function getSessionTimestamp(item) {
		return Number(item && item.createdAt) || 0;
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

			const presence = {};
			const allUids = new Set(Object.keys(loginMap).concat(Object.keys(logoutMap)));
			allUids.forEach((uid) => {
				const latestLogin = Number(loginMap[uid]) || 0;
				const latestLogout = Number(logoutMap[uid]) || 0;
				presence[uid] = latestLogin > latestLogout;
			});

			state.sessionPresenceByUid = presence;
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

		if (/^\s+|\s+$/.test(raw)) return 'Remove spaces at the start or end.';
		if (/\s{2,}/.test(raw)) return 'Use only one space between words.';

		const clean = raw.trim();
		if (clean.length < 2 || clean.length > 15) return 'Use 2 to 15 letters.';

		const parts = clean.split(' ').filter(Boolean);
		if (parts.length > 1 && parts.every((part) => part.length === 1)) {
			return 'Enter a full name.';
		}

		if (/\d/.test(clean)) return 'Do not use numbers.';
		if (!/^[A-Za-z\s-]+$/.test(clean)) return 'Do not use special characters (only hyphen - is allowed).';
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

	function getSelectedOptionText(select) {
		if (!select || !select.options || select.selectedIndex < 0) return '';
		const option = select.options[select.selectedIndex];
		return normalizeText(option && option.text);
	}

	function bindAdminCreateTechnicianLocation() {
		const provinceSelect = document.getElementById('techProvince');
		const citySelect = document.getElementById('techCity');
		if (!provinceSelect || !citySelect) return;

		fillSelectOptions(provinceSelect, NORTH_LUZON_PROVINCES, 'Select province', (entry) => ({
			value: normalizeText(entry && entry.code),
			label: normalizeText(entry && entry.name)
		}));
		fillSelectOptions(citySelect, [], 'Select city/municipality');

		provinceSelect.addEventListener('change', async () => {
			setTechFormFieldInvalid(provinceSelect, false);
			setTechFormFieldInvalid(citySelect, false);

			const provinceCode = normalizeText(provinceSelect.value);
			if (!provinceCode) {
				fillSelectOptions(citySelect, [], 'Select city/municipality');
				return;
			}

			setLocationSelectLoading(citySelect, 'Loading city/municipality...');
			const cities = await fetchProvinceCities(provinceCode);
			fillSelectOptions(citySelect, cities, cities.length ? 'Select city/municipality' : 'No city/municipality found', (entry) => ({
				value: normalizeText(entry && entry.code),
				label: normalizeText(entry && entry.name)
			}));
		});

		citySelect.addEventListener('change', () => {
			setTechFormFieldInvalid(citySelect, false);
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
		if (typeof value === 'string') {
			const parsed = Date.parse(value);
			return Number.isNaN(parsed) ? 0 : parsed;
		}
		if (value && typeof value.toMillis === 'function') return value.toMillis();
		if (value && typeof value.toDate === 'function') return value.toDate().getTime();
		return 0;
	}

	function formatDate(value) {
		const time = toDateValue(value);
		if (!time) return '-';
		try {
			return new Date(time).toLocaleString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
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
		const last = normalizeText(profile && profile.last_name);
		const joined = `${first} ${last}`.trim();
		if (joined) return joined;
		return normalizeText(profile && profile.email) || 'Unknown';
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

	function formatRoleLabel(role) {
		return normalizeLower(role) === 'technician' ? 'Technician' : 'Customer';
	}

	function renderSessionHeaderLabel() {
		const header = document.getElementById('sessionUserIdHeader');
		if (!header) return;
		header.textContent = `${formatRoleLabel(state.sessionRoleFilter)} ID`;
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

	function getAccountsTableColumnCount() {
		return shouldShowSkillsColumn() ? 5 : 4;
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
		const inferredRole = source === 'customers' ? 'customer' : (source === 'technicians' ? 'technician' : '');
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
		const statusFilter = normalizeLower(state.accountStatusFilter || 'active');

		return roleFiltered.filter((account) => {
			const isOnline = isAccountOnline(account);
			if (statusFilter === 'active' && !isOnline) return false;
			if (statusFilter === 'inactive' && isOnline) return false;
			if (!query) return true;
			const name = getProfileName(account);
			const email = normalizeText(account && account.email);
			return startsWithWord(name, query) || startsWithWord(email, query);
		});
	}

	function renderAccountsTable() {
		const tableBody = document.getElementById('accountsTableBody');
		const skillsHeader = document.getElementById('accountsSkillsHeader');
		if (!tableBody) return;
		renderAccountRoleTabs();
		const showSkills = shouldShowSkillsColumn();
		if (skillsHeader) {
			skillsHeader.hidden = !showSkills;
		}
		const columnCount = getAccountsTableColumnCount();

		const accounts = Array.isArray(state.accounts) ? state.accounts : [];
		if (!accounts.length) {
			tableBody.innerHTML = `<tr><td colspan="${columnCount}">No accounts found.</td></tr>`;
			return;
		}

		const filtered = getFilteredAccounts(accounts);
		if (!filtered.length) {
			tableBody.innerHTML = `<tr><td colspan="${columnCount}">No matching accounts for this filter.</td></tr>`;
			return;
		}

		tableBody.innerHTML = filtered.map((account) => {
			const role = normalizeLower(account && account.role) || 'customer';
			const accountId = normalizeText(account && (account.uid || account.id));
			const isEnabled = isAccountEnabled(account);
			const status = isAccountOnline(account) ? 'Active' : 'Inactive';
			const skills = toSkillsArray(
				account && (account.skills || account.specialties || account.serviceCategories || account.fields || account.field)
			).join(', ');
			let actions = '-';
			if (role === 'customer') {
				actions = `<button type="button" class="row-action-btn ${isEnabled ? 'danger' : 'secondary'}" data-action="toggle-customer" data-user-id="${escapeHtml(accountId)}" data-next-state="${isEnabled ? 'disable' : 'enable'}">${isEnabled ? 'Disable' : 'Enable'}</button>`;
			} else if (role === 'technician') {
				actions = `<button type="button" class="row-action-btn ${isEnabled ? 'danger' : 'secondary'}" data-action="toggle-technician" data-user-id="${escapeHtml(accountId)}" data-next-state="${isEnabled ? 'disable' : 'enable'}">${isEnabled ? 'Disable' : 'Enable'}</button>`;
			}
			return `
				<tr>
					<td>${escapeHtml(getProfileName(account))}</td>
					<td>${escapeHtml(normalizeText(account && account.email) || '-')}</td>
					<td>${escapeHtml(status)}</td>
					${showSkills ? `<td>${escapeHtml(skills || '-')}</td>` : ''}
					<td>${actions}</td>
				</tr>
			`;
		}).join('');
	}

	function renderSessionLogsTable() {
		const tableBody = document.getElementById('sessionLogsTableBody');
		if (!tableBody) return;
		renderSessionHeaderLabel();

		const list = Array.isArray(state.sessionLogs) ? state.sessionLogs : [];
		if (!list.length) {
			tableBody.innerHTML = '<tr><td colspan="3">No logs found for this selection.</td></tr>';
			return;
		}

		tableBody.innerHTML = list.map((item) => {
			const uid = normalizeText(item && item.uid) || '-';
			return `
				<tr>
					<td>${escapeHtml(formatDate(item && item.createdAt))}</td>
					<td>${escapeHtml(normalizeText(item && item.sessionId) || '-')}</td>
					<td>${escapeHtml(uid)}</td>
				</tr>
			`;
		}).join('');
	}

	async function loadSessionLogs() {
		const tableBody = document.getElementById('sessionLogsTableBody');
		if (tableBody) tableBody.innerHTML = '<tr><td colspan="3">Loading session logs...</td></tr>';
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
					renderSessionLogsTable();
				},
				(error) => {
					state.sessionLogs = [];
					const errorCode = normalizeLower(error && error.code);
					if (tableBody && (errorCode.includes('permission') || errorCode.includes('denied'))) {
						tableBody.innerHTML = '<tr><td colspan="3">Permission denied while loading logs. Check Firebase sessionLogs rules.</td></tr>';
						return;
					}
					if (tableBody) tableBody.innerHTML = '<tr><td colspan="3">Failed to load logs.</td></tr>';
				},
				400
			);
			return;
		}

		state.sessionLogs = [];
		if (tableBody) tableBody.innerHTML = '<tr><td colspan="3">Session logs are unavailable.</td></tr>';
	}

	function bindSessionFilters() {
		const sessionRoleFilter = document.getElementById('sessionRoleFilter');
		const sessionActionFilter = document.getElementById('sessionActionFilter');
		if (!sessionRoleFilter || !sessionActionFilter) return;

		sessionRoleFilter.value = state.sessionRoleFilter;
		sessionActionFilter.value = state.sessionActionFilter;

		sessionRoleFilter.addEventListener('change', async () => {
			state.sessionRoleFilter = normalizeLower(sessionRoleFilter.value || 'customer');
			renderSessionHeaderLabel();
			await loadSessionLogs();
		});

		sessionActionFilter.addEventListener('change', async () => {
			state.sessionActionFilter = normalizeLower(sessionActionFilter.value || 'login');
			await loadSessionLogs();
		});

		renderSessionHeaderLabel();
	}

	async function setAccountActiveState(userId, shouldEnable, triggerButton) {
		const id = normalizeText(userId);
		if (!id) return;

		if (triggerButton) triggerButton.disabled = true;

		try {
			if (usersDb && typeof usersDb.updateUserProfile === 'function') {
				await usersDb.updateUserProfile(id, {
					isActive: !!shouldEnable,
					updatedAt: Date.now()
				});
			} else {
				throw new Error('Profile update service unavailable');
			}
		} catch (_) {
			if (triggerButton) triggerButton.disabled = false;
			window.alert('Failed to update account status. Check Firebase permissions.');
			return;
		}

		await loadAccounts();
	}

	function renderOverview() {
		const accounts = Array.isArray(state.accounts) ? state.accounts : [];
		const requests = Array.isArray(state.allRequests) ? state.allRequests : [];

		const customers = accounts.filter((account) => normalizeLower(account && account.role) === 'customer');
		const technicians = accounts.filter((account) => normalizeLower(account && account.role) === 'technician');
		const pendingRequests = requests.filter((item) => getRequestBucket(item) === 'waiting');
		const inProgressRequests = requests.filter((item) => {
			const status = normalizeLower(item && item.status);
			return status === 'in-progress' || status === 'ongoing';
		});

		setText('ovCustomerAccounts', String(customers.length));
		setText('ovTechnicianAccounts', String(technicians.length));
		setText('ovPendingRequests', String(pendingRequests.length));
		setText('ovInProgressRequests', String(inProgressRequests.length));

		const body = document.getElementById('overviewRequestsTableBody');
		if (!body) return;

		if (!requests.length) {
			body.innerHTML = '<tr><td colspan="4">No requests yet.</td></tr>';
			return;
		}

		const recent = requests
			.slice()
			.sort((left, right) => toDateValue((right && right.technicianUpdatedAt) || (right && right.createdAt)) - toDateValue((left && left.technicianUpdatedAt) || (left && left.createdAt)))
			.slice(0, 6);

		body.innerHTML = recent.map((item) => `
			<tr>
				<td>${escapeHtml(formatRequestCode(item))}</td>
				<td>${escapeHtml(normalizeText(item && item.status) || '-')}</td>
				<td>${escapeHtml(getRequestTechnician(item))}</td>
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
		state.requests = list.filter((item) => getRequestBucket(item) === 'accepted');
		renderRequestsTable();
		renderOverview();
	}

	function getRequestBucket(item) {
		const status = normalizeLower(item && item.status);
		const hasTechnician = !!normalizeText(item && (item.assignedTechnicianId || item.assignedTechnicianEmail || item.technicianId || item.technicianEmail));
		if (CANCELLED_STATUSES.has(status)) return 'cancelled';
		if (ACCEPTED_STATUSES.has(status) || hasTechnician) return 'accepted';
		return 'waiting';
	}

	function getFilteredRequests(requests, statusFilter) {
		const list = Array.isArray(requests) ? requests : [];
		const filter = normalizeLower(statusFilter || 'waiting');
		if (!filter) return list;
		return list.filter((item) => getRequestBucket(item) === filter);
	}

	function renderRequestsTable() {
		const tableBody = document.getElementById('requestsTableBody');
		const panelTitleLabel = document.getElementById('requestsPanelTitleLabel');
		if (!tableBody) return;

		const activeFilter = normalizeLower(state.requestStatusFilter || 'waiting');
		const labelMap = {
			waiting: 'WAITING',
			accepted: 'ACCEPTED',
			cancelled: 'CANCELLED'
		};

		if (panelTitleLabel) {
			panelTitleLabel.textContent = labelMap[activeFilter] || 'REQUEST';
		}

		const filtered = getFilteredRequests(state.allRequests, activeFilter)
			.slice()
			.sort((left, right) => toDateValue((right && right.createdAt) || (right && right.technicianUpdatedAt)) - toDateValue((left && left.createdAt) || (left && left.technicianUpdatedAt)));

		if (!filtered.length) {
			state.visibleRequests = [];
			tableBody.innerHTML = `<tr><td colspan="9">No ${labelMap[activeFilter] ? labelMap[activeFilter].toLowerCase() : 'matching'} requests found.</td></tr>`;
			return;
		}

		state.visibleRequests = filtered.slice();

		tableBody.innerHTML = filtered.map((item, index) => `
			<tr>
				<td>${escapeHtml(formatRequestCode(item))}</td>
				<td>${escapeHtml(normalizeText(item && item.createdBySessionLogId) || '-')}</td>
				<td>${escapeHtml(getRequestCustomer(item))}</td>
				<td>${escapeHtml(getCustomerCode(item))}</td>
				<td>${escapeHtml(normalizeText(item && item.status) || '-')}</td>
				<td>${escapeHtml(getRequestTechnician(item))}</td>
				<td>${escapeHtml(getRequestService(item))}</td>
				<td>${escapeHtml(getRequestSchedule(item))}</td>
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

		const approveButtons = Array.from(tableBody.querySelectorAll('button[data-action="approve-request"][data-request-id]'));
		approveButtons.forEach((button) => {
			button.onclick = async (event) => {
				event.preventDefault();
				await approveRequestByAdmin(button.getAttribute('data-request-id'), button);
			};
		});

		const declineButtons = Array.from(tableBody.querySelectorAll('button[data-action="decline-request"][data-request-id]'));
		declineButtons.forEach((button) => {
			button.onclick = async (event) => {
				event.preventDefault();
				await declineRequestByAdmin(button.getAttribute('data-request-id'), button);
			};
		});
	}

	function getRequestActionHtml(item, rowIndex) {
		const requestId = normalizeText(item && (item.id || item.requestId));
		if (!requestId) return '-';
		const bucket = getRequestBucket(item);
		const indexAttr = Number.isInteger(rowIndex) ? rowIndex : -1;
		const detailsButton = `<button type="button" class="row-action-btn secondary" data-action="view-request-details" data-request-id="${escapeHtml(requestId)}" data-request-index="${indexAttr}" onclick="if(window.hfsAdminOpenRequestDetailsByIndex){window.hfsAdminOpenRequestDetailsByIndex(${indexAttr});}else if(window.hfsAdminOpenRequestDetailsFromButton){window.hfsAdminOpenRequestDetailsFromButton(this);} return false;">Details</button>`;
		if (bucket === 'waiting') {
			return `<div class="row-actions">${detailsButton}<button type="button" class="row-action-btn" data-action="approve-request" data-request-id="${escapeHtml(requestId)}">Approve</button><button type="button" class="row-action-btn danger" data-action="decline-request" data-request-id="${escapeHtml(requestId)}">Decline</button></div>`;
		}
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
		setAdminRequestDetailText('adminDetailStatus', normalizeText(item && item.status));
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
		tableBody.innerHTML = `<tr><td colspan="${getAccountsTableColumnCount()}">Loading accounts...</td></tr>`;

		if (typeof unsubscribeAccounts === 'function') {
			unsubscribeAccounts();
			unsubscribeAccounts = null;
		}

		const rtdb = getRealtimeDatabase();
		if (rtdb) {
			const customersRef = rtdb.ref('customers');
			const techniciansRef = rtdb.ref('technicians');
			const usersRef = rtdb.ref('users');
			const cache = { customers: {}, technicians: {}, users: {} };
			const errors = { customers: null, technicians: null, users: null };

			const renderMerged = () => {
				const accountMap = new Map();

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
				renderOverview();

				const bothFailed = !!errors.customers && !!errors.technicians && !!errors.users;
				if (bothFailed) {
					tableBody.innerHTML = `<tr><td colspan="${getAccountsTableColumnCount()}">Failed to load customers/technicians/users from Realtime Database.</td></tr>`;
				}
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

			customersRef.on('value', customersSuccess, customersFailure);
			techniciansRef.on('value', techniciansSuccess, techniciansFailure);
			usersRef.on('value', usersSuccess, usersFailure);
			unsubscribeAccounts = function () {
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
			renderOverview();
			return [];
		}

		accounts.sort((left, right) => {
			return toDateValue(right && (right.createdAt || right.updatedAt)) - toDateValue(left && (left.createdAt || left.updatedAt));
		});

		state.accounts = accounts;
		renderAccountsTable();
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
		if (customerId) {
			const profile = (Array.isArray(state.accounts) ? state.accounts : []).find((account) => {
				const uid = normalizeText(account && (account.uid || account.id));
				return uid && uid === customerId;
			});
			if (profile) {
				const fullName = [
					normalizeText(profile && profile.first_name),
					normalizeText(profile && profile.middle_name),
					normalizeText(profile && profile.last_name),
					normalizeText(profile && profile.suffix)
				].filter(Boolean).join(' ').trim();
				if (fullName) return fullName;
			}
		}
		return normalizeText(item && (item.customerName || item.customerEmail || item.customerId)) || '-';
	}

	function getRequestTechnician(item) {
		return normalizeText(item && (item.assignedTechnicianEmail || item.technicianEmail || item.assignedTechnicianId || item.technicianId)) || '-';
	}

	function getRequestSchedule(item) {
		const date = normalizeText(item && item.preferredDate);
		const time = normalizeText(item && item.preferredTime);
		if (date && time) return `${date} ${time}`;
		return normalizeText(item && (item.preferredSchedule || item.preferred_datetime)) || '-';
	}

	async function loadRequests() {
		const tableBody = document.getElementById('requestsTableBody');
		if (!tableBody) return;
		tableBody.innerHTML = '<tr><td colspan="9">Loading requests...</td></tr>';

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
				tableBody.innerHTML = '<tr><td colspan="9">Failed to load requests from Firebase Realtime Database.</td></tr>';
				state.requests = [];
				state.allRequests = [];
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
				tableBody.innerHTML = '<tr><td colspan="9">Failed to load requests from Firebase.</td></tr>';
				state.requests = [];
				state.allRequests = [];
				renderOverview();
			});
			return state.allRequests;
		}

		tableBody.innerHTML = '<tr><td colspan="9">Firebase Realtime Database is not configured or unavailable.</td></tr>';
		state.requests = [];
		state.allRequests = [];
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
		const provinceInput = document.getElementById('techProvince');
		const cityInput = document.getElementById('techCity');
		const skillsWrap = document.getElementById('techSkillsInput');
		const submitButton = document.getElementById('createTechnicianBtn');

		const firstName = normalizeText(firstNameInput && firstNameInput.value);
		const middleName = normalizeText(middleNameInput && middleNameInput.value);
		const lastName = normalizeText(lastNameInput && lastNameInput.value);
		const suffix = normalizeText(suffixChoice && suffixChoice.value);
		const email = normalizeLower(emailInput && emailInput.value);
		const mobile = normalizeText(mobileInput && mobileInput.value);
		const provinceCode = normalizeText(provinceInput && provinceInput.value);
		const cityCode = normalizeText(cityInput && cityInput.value);
		const provinceName = getSelectedOptionText(provinceInput);
		const cityName = getSelectedOptionText(cityInput);
		const selectedSkills = getSelectedTechnicianSkills();
		const generatedPassword = generateTechnicianPassword();

		setTechFormFieldInvalid(firstNameInput, false);
		setTechFormFieldInvalid(middleNameInput, false);
		setTechFormFieldInvalid(lastNameInput, false);
		setTechFormFieldInvalid(mobileInput, false);
		setTechFormFieldInvalid(provinceInput, false);
		setTechFormFieldInvalid(cityInput, false);
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

		if (!provinceCode) {
			setTechFormFieldInvalid(provinceInput, true);
			if (provinceInput && typeof provinceInput.focus === 'function') provinceInput.focus();
			setFormMessage('Province is required.', true);
			return;
		}

		if (!cityCode) {
			setTechFormFieldInvalid(cityInput, true);
			if (cityInput && typeof cityInput.focus === 'function') cityInput.focus();
			setFormMessage('City/Municipality is required.', true);
			return;
		}

		if (!selectedSkills.length) {
			if (skillsWrap) skillsWrap.classList.add('invalid');
			setFormMessage('Select at least one skill.', true);
			return;
		}

		const normalizedMobile = normalizeTechnicianMobile(mobile);
		const locationLabel = [cityName, provinceName].filter(Boolean).join(', ');

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
				town: '',
				city: cityName,
				province: provinceName,
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
		const buttons = Array.from(document.querySelectorAll('.nav-link[data-section], .nav-sub-link[data-section]'));
		const topButtons = Array.from(document.querySelectorAll('.nav-link[data-section]'));
		const subButtons = Array.from(document.querySelectorAll('.nav-sub-link[data-section]'));
		const manageGroup = document.getElementById('manageAccountsGroup');
		const requestsGroup = document.getElementById('manageRequestsGroup');
		const manageSummary = document.getElementById('manageAccountsSummary');
		const requestsSummary = document.getElementById('manageRequestsSummary');
		const panels = Array.from(document.querySelectorAll('.panel[data-panel]'));
		if (!buttons.length || !panels.length) return;

		function activate(section, options = {}) {
			const targetFilter = normalizeLower(options.filter || '');
			const targetRequestFilter = normalizeLower(options.requestFilter || '');

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

			if (requestsSummary) {
				requestsSummary.classList.toggle('active', section === 'requests');
			}

			if (manageGroup && (section === 'accounts' || section === 'create-technician')) {
				manageGroup.open = true;
			}

			if (requestsGroup && section === 'requests') {
				requestsGroup.open = true;
			}

			panels.forEach((panel) => {
				const isActive = panel.getAttribute('data-panel') === section;
				panel.hidden = !isActive;
			});

			if (section === 'accounts') {
				if (targetFilter) {
					state.accountRoleFilter = targetFilter;
				} else if (!state.accountRoleFilter) {
					state.accountRoleFilter = 'all';
				}
				renderAccountsTable();
			}

			if (section === 'requests') {
				if (targetRequestFilter) {
					state.requestStatusFilter = targetRequestFilter;
				} else if (!state.requestStatusFilter) {
					state.requestStatusFilter = 'waiting';
				}
				renderRequestsTable();
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

	function bindEvents() {
		registerGlobalRequestActionFallbacks();

		const refreshOverviewBtn = document.getElementById('refreshOverviewBtn');
		const refreshAccountsBtn = document.getElementById('refreshAccountsBtn');
		const accountSearchInput = document.getElementById('accountSearchInput');
		const accountStatusFilter = document.getElementById('accountStatusFilter');
		const accountsTableBody = document.getElementById('accountsTableBody');
		const requestsTableBody = document.getElementById('requestsTableBody');
		const requestDetailModal = document.getElementById('adminRequestDetailModal');
		const requestDetailCloseBtn = document.getElementById('adminRequestDetailCloseBtn');
		const requestDetailDoneBtn = document.getElementById('adminRequestDetailDoneBtn');
		const refreshRequestsBtn = document.getElementById('refreshRequestsBtn');
		const refreshSessionLogsBtn = document.getElementById('refreshSessionLogsBtn');
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
				await loadAccounts();
			});
		}

		if (accountSearchInput) {
			accountSearchInput.addEventListener('input', () => {
				state.accountSearchQuery = normalizeText(accountSearchInput.value || '');
				renderAccountsTable();
			});
		}

		if (accountStatusFilter) {
			accountStatusFilter.value = 'all';
			accountStatusFilter.addEventListener('change', () => {
				state.accountStatusFilter = normalizeLower(accountStatusFilter.value || 'all');
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
				await setAccountActiveState(actionBtn.getAttribute('data-user-id'), shouldEnable, actionBtn);
			});
		}

		if (refreshRequestsBtn) {
			refreshRequestsBtn.addEventListener('click', async () => {
				await loadRequests();
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

				const approveBtn = event.target && event.target.closest
					? event.target.closest('button[data-action="approve-request"][data-request-id]')
					: null;
				if (approveBtn) {
					event.preventDefault();
					await approveRequestByAdmin(approveBtn.getAttribute('data-request-id'), approveBtn);
					return;
				}

				const declineBtn = event.target && event.target.closest
					? event.target.closest('button[data-action="decline-request"][data-request-id]')
					: null;
				if (!declineBtn) return;
				event.preventDefault();
				await declineRequestByAdmin(declineBtn.getAttribute('data-request-id'), declineBtn);
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
				await loadSessionLogs();
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

			['techEmail', 'techMobile', 'techProvince', 'techCity']
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
		bindEvents();
		startSessionPresenceTracking();
		Promise.all([loadAccounts(), loadRequests(), loadSessionLogs()]);

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
			stopSessionPresenceTracking();
		});
	});
})();
