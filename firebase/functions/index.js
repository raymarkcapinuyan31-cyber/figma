const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const REGION = 'asia-southeast1';
const ALLOWED_EMAIL_FIELDS = ['email', 'emailAddress', 'email_address'];
const ALLOWED_ORIGIN_PATTERNS = [
	/^https:\/\/[a-z0-9-]+\.web\.app$/i,
	/^https:\/\/[a-z0-9-]+\.firebaseapp\.com$/i,
	/^http:\/\/localhost(?::\d+)?$/i,
	/^http:\/\/127\.0\.0\.1(?::\d+)?$/i,
	/^https:\/\/localhost(?::\d+)?$/i,
	/^https:\/\/127\.0\.0\.1(?::\d+)?$/i
];

function normalizeText(value) {
	return String(value || '').trim();
}

function normalizeLower(value) {
	return normalizeText(value).toLowerCase();
}

function isAllowedOrigin(origin) {
	const target = normalizeText(origin);
	if (!target) return false;
	return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(target));
}

function setCorsHeaders(req, res) {
	const requestOrigin = normalizeText(req.get('origin'));
	const allowOrigin = requestOrigin && isAllowedOrigin(requestOrigin) ? requestOrigin : '*';
	const requestedHeaders = normalizeText(req.get('access-control-request-headers'));
	res.set('Access-Control-Allow-Origin', allowOrigin);
	res.set('Vary', 'Origin');
	res.set('Access-Control-Allow-Headers', requestedHeaders || 'Content-Type, Authorization');
	res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
	res.set('Access-Control-Max-Age', '3600');
}

async function readCallerRole(uid) {
	const db = admin.database();
	const roots = ['admins', 'users', 'technicians', 'customers'];
	for (let index = 0; index < roots.length; index += 1) {
		const root = roots[index];
		const snapshot = await db.ref(`${root}/${uid}/role`).once('value');
		const role = normalizeLower(snapshot && typeof snapshot.val === 'function' ? snapshot.val() : '');
		if (role) return role;
	}
	return '';
}

async function verifyAdminRequest(req) {
	const header = normalizeText(req.get('Authorization'));
	if (!header.toLowerCase().startsWith('bearer ')) {
		throw new functions.https.HttpsError('unauthenticated', 'Missing admin token.');
	}

	const idToken = header.slice(7).trim();
	if (!idToken) {
		throw new functions.https.HttpsError('unauthenticated', 'Missing admin token.');
	}

	const decoded = await admin.auth().verifyIdToken(idToken);
	const role = await readCallerRole(decoded.uid);
	if (role !== 'admin') {
		throw new functions.https.HttpsError('permission-denied', 'Admin access is required.');
	}

	return decoded;
}

async function listMatchingRealtimeRefs(db, uid, email) {
	const cleanUid = normalizeText(uid);
	const cleanEmail = normalizeLower(email);
	const rootNames = ['admins', 'customers', 'technicians', 'users'];
	const refs = new Map();

	rootNames.forEach((root) => {
		if (cleanUid) {
			refs.set(`${root}/${cleanUid}`, db.ref(`${root}/${cleanUid}`));
		}
	});

	if (cleanEmail) {
		for (let fieldIndex = 0; fieldIndex < ALLOWED_EMAIL_FIELDS.length; fieldIndex += 1) {
			const field = ALLOWED_EMAIL_FIELDS[fieldIndex];
			for (let rootIndex = 0; rootIndex < rootNames.length; rootIndex += 1) {
				const root = rootNames[rootIndex];
				const snapshot = await db.ref(root).orderByChild(field).equalTo(cleanEmail).once('value');
				const value = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
				Object.keys(value).forEach((matchedUid) => {
					refs.set(`${root}/${matchedUid}`, db.ref(`${root}/${matchedUid}`));
				});
			}
		}
	}

	return Array.from(refs.values());
}

async function updateRealtimeAccountState(uid, email, role, disabled, actorUid) {
	const db = admin.database();
	const refs = await listMatchingRealtimeRefs(db, uid, email);
	const cleanRole = normalizeLower(role);
	const now = Date.now();
	const payload = {
		isActive: !disabled,
		updatedAt: now,
		disabledAt: disabled ? now : null,
		disabledBy: disabled ? normalizeText(actorUid) : null
	};

	if (!refs.length && uid) {
		const targetRoot = cleanRole === 'technician' ? 'technicians' : (cleanRole === 'admin' ? 'admins' : 'customers');
		refs.push(db.ref(`${targetRoot}/${uid}`));
	}

	await Promise.all(refs.map(async (ref) => {
		const snap = await ref.once('value');
		const existing = snap && typeof snap.val === 'function' ? (snap.val() || {}) : {};
		const data = Object.assign({}, payload);
		if (!existing.uid && uid) data.uid = uid;
		if (!existing.role && cleanRole) data.role = cleanRole;
		if (!existing.email && email) data.email = normalizeLower(email);
		return ref.update(data);
	}));
}

async function upsertRealtimeAdminProfile(uid, profile) {
	const cleanUid = normalizeText(uid);
	if (!cleanUid) {
		throw new functions.https.HttpsError('invalid-argument', 'Admin uid is required.');
	}

	const db = admin.database();
	const payload = Object.assign({}, profile || {}, {
		uid: cleanUid,
		role: 'admin',
		email: normalizeLower(profile && profile.email),
		first_name: normalizeText(profile && profile.first_name),
		middle_name: normalizeText(profile && profile.middle_name),
		last_name: normalizeText(profile && profile.last_name),
		isActive: profile && Object.prototype.hasOwnProperty.call(profile, 'isActive') ? profile.isActive !== false : true,
		isVerified: profile && Object.prototype.hasOwnProperty.call(profile, 'isVerified') ? profile.isVerified !== false : true,
		emailVerified: profile && Object.prototype.hasOwnProperty.call(profile, 'emailVerified') ? profile.emailVerified !== false : true,
		updatedAt: Date.now()
	});

	await db.ref(`admins/${cleanUid}`).update(payload);
	try {
		await db.ref(`users/${cleanUid}`).remove();
	} catch (_) {
	}
	try {
		await db.ref(`customers/${cleanUid}`).remove();
	} catch (_) {
	}
	try {
		await db.ref(`technicians/${cleanUid}`).remove();
	} catch (_) {
	}

	return payload;
}

async function resolveAuthUser(uid, email) {
	const cleanUid = normalizeText(uid);
	const cleanEmail = normalizeLower(email);

	if (cleanUid) {
		try {
			return await admin.auth().getUser(cleanUid);
		} catch (error) {
			if (!error || error.code !== 'auth/user-not-found') throw error;
		}
	}

	if (cleanEmail) {
		try {
			return await admin.auth().getUserByEmail(cleanEmail);
		} catch (error) {
			if (!error || error.code !== 'auth/user-not-found') throw error;
		}
	}

	return null;
}

function isValidEmail(email) {
	const cleanEmail = normalizeLower(email);
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
}

function buildProvisionTempPassword(email) {
	const seed = normalizeLower(email).replace(/[^a-z0-9]/g, '');
	const body = (seed + Date.now().toString(36)).slice(-4) || 'hfs1';
	return `Hf#${body}a1`;
}

async function findRealtimeProfileByEmail(email) {
	const db = admin.database();
	const refs = await listMatchingRealtimeRefs(db, '', email);
	for (let index = 0; index < refs.length; index += 1) {
		const ref = refs[index];
		const snapshot = await ref.once('value').catch(() => null);
		if (!snapshot || !snapshot.exists()) continue;
		const value = snapshot.val() || {};
		const uid = normalizeText(value && (value.uid || snapshot.key));
		if (uid) {
			return {
				uid,
				email: normalizeLower(value && (value.email || value.emailAddress || value.email_address || email)),
				role: normalizeLower(value && value.role)
			};
		}
	}
	return null;
}

exports.preparePasswordResetIdentity = functions.region(REGION).https.onRequest(async (req, res) => {
	setCorsHeaders(req, res);
	if (req.method === 'OPTIONS') {
		res.status(204).send('');
		return;
	}

	if (req.method !== 'POST') {
		res.status(405).json({ ok: false, message: 'Method not allowed.' });
		return;
	}

	try {
		const body = req.body && typeof req.body === 'object' ? req.body : {};
		const email = normalizeLower(body.email);
		if (!isValidEmail(email)) {
			res.status(200).json({ ok: true });
			return;
		}

		let authUser = await resolveAuthUser('', email);
		if (!authUser) {
			const profile = await findRealtimeProfileByEmail(email);
			if (profile && profile.uid) {
				const tempPassword = buildProvisionTempPassword(email);
				try {
					authUser = await admin.auth().createUser({
						uid: profile.uid,
						email,
						password: tempPassword,
						disabled: false
					});
				} catch (error) {
					const code = normalizeText(error && error.code);
					if (code === 'auth/uid-already-exists') {
						try {
							await admin.auth().updateUser(profile.uid, { email, disabled: false });
							authUser = await admin.auth().getUser(profile.uid);
						} catch (_) {
						}
					} else if (code === 'auth/email-already-exists') {
						authUser = await resolveAuthUser('', email);
					}
				}
			}
		}

		res.status(200).json({ ok: true, prepared: !!authUser });
	} catch (_) {
		res.status(200).json({ ok: true });
	}
});

exports.syncAccountAccessState = functions.region(REGION).https.onRequest(async (req, res) => {
	setCorsHeaders(req, res);
	if (req.method === 'OPTIONS') {
		res.status(204).send('');
		return;
	}

	if (req.method !== 'POST') {
		res.status(405).json({ ok: false, message: 'Method not allowed.' });
		return;
	}

	try {
		const decoded = await verifyAdminRequest(req);
		const body = req.body && typeof req.body === 'object' ? req.body : {};
		const targetUid = normalizeText(body.userId || body.uid);
		const targetEmail = normalizeLower(body.email);
		const targetRole = normalizeLower(body.role) || 'customer';
		const disabled = !!body.disabled;

		if (!targetUid && !targetEmail) {
			res.status(400).json({ ok: false, message: 'Target user id or email is required.' });
			return;
		}

		const authUser = await resolveAuthUser(targetUid, targetEmail);
		if (authUser) {
			await admin.auth().updateUser(authUser.uid, { disabled });
			if (disabled) {
				await admin.auth().revokeRefreshTokens(authUser.uid);
			}
		}

		await updateRealtimeAccountState(
			authUser && authUser.uid ? authUser.uid : targetUid,
			authUser && authUser.email ? authUser.email : targetEmail,
			targetRole,
			disabled,
			decoded.uid
		);

		res.status(200).json({
			ok: true,
			disabled,
			authUserFound: !!authUser,
			uid: authUser && authUser.uid ? authUser.uid : targetUid,
			email: authUser && authUser.email ? authUser.email : targetEmail
		});
	} catch (error) {
		const message = normalizeText(error && error.message) || 'Failed to sync account access state.';
		const code = normalizeText(error && error.code);
		const status = code === 'permission-denied'
			? 403
			: code === 'unauthenticated'
				? 401
				: 500;
		res.status(status).json({ ok: false, message, code: code || 'internal' });
	}
});

exports.upsertAdminProfile = functions.region(REGION).https.onRequest(async (req, res) => {
	setCorsHeaders(req, res);
	if (req.method === 'OPTIONS') {
		res.status(204).send('');
		return;
	}

	if (req.method !== 'POST') {
		res.status(405).json({ ok: false, message: 'Method not allowed.' });
		return;
	}

	try {
		await verifyAdminRequest(req);
		const body = req.body && typeof req.body === 'object' ? req.body : {};
		const uid = normalizeText(body.uid || body.userId);
		const email = normalizeLower(body.email);
		if (!uid || !email) {
			res.status(400).json({ ok: false, message: 'Admin uid and email are required.' });
			return;
		}

		const payload = await upsertRealtimeAdminProfile(uid, {
			email,
			first_name: body.first_name,
			middle_name: body.middle_name,
			last_name: body.last_name,
			isActive: body.isActive,
			isVerified: body.isVerified,
			emailVerified: body.emailVerified
		});

		res.status(200).json({ ok: true, profile: payload });
	} catch (error) {
		const message = normalizeText(error && error.message) || 'Failed to upsert admin profile.';
		const code = normalizeText(error && error.code);
		const status = code === 'permission-denied'
			? 403
			: code === 'unauthenticated'
				? 401
				: code === 'invalid-argument'
					? 400
					: 500;
		res.status(status).json({ ok: false, message, code: code || 'internal' });
	}
});
