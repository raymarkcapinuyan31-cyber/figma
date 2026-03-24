const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const REGION = 'asia-southeast1';
const ALLOWED_EMAIL_FIELDS = ['email', 'emailAddress', 'email_address'];

function normalizeText(value) {
	return String(value || '').trim();
}

function normalizeLower(value) {
	return normalizeText(value).toLowerCase();
}

function setCorsHeaders(req, res) {
	const origin = req.get('origin') || '*';
	res.set('Access-Control-Allow-Origin', origin);
	res.set('Vary', 'Origin');
	res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
