(function () {
  function normalizeText(value) {
    return String(value || '').trim();
  }

  function normalizeLower(value) {
    return normalizeText(value).toLowerCase();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toTitleText(value) {
    const normalized = normalizeText(value);
    if (!normalized) return '';
    return normalized
      .split(/\s+/)
      .map((word) => word ? (word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) : '')
      .join(' ');
  }

  function normalizeSkill(value) {
    return normalizeLower(value);
  }

  function getSkillAliases(skill) {
    const normalized = normalizeSkill(skill);
    if (!normalized) return [];

    const aliases = new Set([normalized]);
    if (/\bplumb\b|\bplumber\b|\bpipe\b|\bdrain\b|\bfaucet\b|\btoilet\b|\bsink\b|\bleak\b/.test(normalized)) {
      aliases.add('plumbing');
    }
    if (/\belectric\b|\belectrical\b|\belectrician\b|\bwiring\b|\bcircuit\b|\boutlet\b/.test(normalized)) {
      aliases.add('electrical');
    }
    if (/\bhvac\b|\bair\s*con\b|\bair\s*conditioning\b|\bac\b/.test(normalized)) {
      aliases.add('aircon');
    }
    if (/\bappliance\b|\brefrigerator\b|\bref\b|\bwasher\b|\bmicrowave\b|\boven\b/.test(normalized)) {
      aliases.add('appliance');
    }

    return Array.from(aliases);
  }

  function parseSkills(profile) {
    const source = profile && typeof profile === 'object' ? profile : {};
    const buckets = [
      source.skills,
      source.specialties,
      source.serviceCategories,
      source.fields,
      source.field,
      source.primarySkill
    ];
    const labels = [];
    const seen = new Set();

    buckets.forEach((bucket) => {
      if (Array.isArray(bucket)) {
        bucket.forEach((entry) => {
          const label = toTitleText(entry);
          if (!label) return;
          const key = normalizeLower(label);
          if (seen.has(key)) return;
          seen.add(key);
          labels.push(label);
        });
        return;
      }

      const raw = normalizeText(bucket);
      if (!raw) return;
      raw.split(/[,/|]/g).forEach((entry) => {
        const label = toTitleText(entry);
        if (!label) return;
        const key = normalizeLower(label);
        if (seen.has(key)) return;
        seen.add(key);
        labels.push(label);
      });
    });

    if (labels.length) return labels;

    const aliases = new Set();
    buckets.forEach((bucket) => {
      if (Array.isArray(bucket)) {
        bucket.forEach((entry) => getSkillAliases(entry).forEach((alias) => aliases.add(alias)));
        return;
      }
      normalizeText(bucket).split(/[,/|]/g).forEach((entry) => getSkillAliases(entry).forEach((alias) => aliases.add(alias)));
    });
    return Array.from(aliases).map(toTitleText).filter(Boolean);
  }

  function getName(profile) {
    const firstName = normalizeText(profile && (profile.first_name || profile.firstName || profile.firstname));
    const lastName = normalizeText(profile && (profile.last_name || profile.lastName || profile.lastname));
    const fullName = normalizeText(`${firstName} ${lastName}`);
    if (fullName) return fullName;
    return normalizeText(profile && (profile.name || profile.fullName || profile.displayName)) || 'Technician';
  }

  function getRating(profile) {
    const values = [
      profile && profile.customerRating,
      profile && profile.reviewRating,
      profile && profile.rating,
      profile && profile.averageRating,
      profile && profile.avgRating,
      profile && profile.ratingAverage,
      profile && profile.technicianRating,
      profile && profile.stars
    ];
    for (let index = 0; index < values.length; index += 1) {
      const numeric = Number(values[index]);
      if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 5) {
        return numeric;
      }
    }
    return null;
  }

  function getLocation(profile) {
    const town = normalizeText(profile && (profile.town || profile.city || profile.cityMunicipality));
    const province = normalizeText(profile && profile.province);
    const area = [town, province].filter(Boolean).join(', ');
    return area || 'Dagupan service area';
  }

  function isDemoOrTestText(value) {
    const normalized = normalizeLower(value);
    if (!normalized) return false;
    return normalized === 'test'
      || normalized === 'demo'
      || normalized === 'test test'
      || normalized.startsWith('test ')
      || normalized.endsWith(' test')
      || normalized.includes(' demo')
      || normalized.includes('demo ')
      || normalized.includes('@test.')
      || normalized.includes('@demo.')
      || normalized.includes('example.com')
      || normalized === 'technician@gmail.com';
  }

  function shouldShowTechnician(uid, profile) {
    const source = profile && typeof profile === 'object' ? profile : {};
    const role = normalizeLower(source.role || 'technician');
    const isActive = source.isActive !== false && normalizeLower(source.status) !== 'inactive';
    const signals = [
      uid,
      source.uid,
      source.id,
      source.email,
      source.emailAddress,
      source.email_address,
      source.name,
      source.fullName,
      source.displayName,
      source.first_name,
      source.last_name
    ];

    if (role && role !== 'technician') return false;
    if (!isActive) return false;
    if (signals.some((value) => isDemoOrTestText(value))) return false;
    return true;
  }

  function normalizeEntry(uid, profile) {
    const source = profile && typeof profile === 'object' ? profile : {};
    return {
      id: normalizeText(source.uid || source.id || uid),
      name: getName(source),
      skills: parseSkills(source),
      location: getLocation(source),
      rating: getRating(source)
    };
  }

  function getRealtimeDatabase() {
    const usersCore = window.homefixUsersCore || {};
    const firebaseNs = usersCore.firebase || window.firebase;
    if (!firebaseNs || typeof firebaseNs.database !== 'function') return null;
    try {
      return firebaseNs.database();
    } catch (_) {
      return null;
    }
  }

  function getLocalTechnicians() {
    const usersCore = window.homefixUsersCore || {};
    if (typeof usersCore.readJson !== 'function' || !usersCore.STORAGE_KEYS || !usersCore.STORAGE_KEYS.users) {
      return [];
    }

    const users = usersCore.readJson(usersCore.STORAGE_KEYS.users, {});
    return Object.keys(users || {})
      .filter((uid) => shouldShowTechnician(uid, users[uid]))
      .map((uid) => normalizeEntry(uid, users[uid]));
  }

  function renderCards(container, technicians) {
    const items = Array.isArray(technicians) ? technicians : [];
    if (!items.length) {
      container.innerHTML = '<div class="about-technician-empty">No technicians available yet.</div>';
      return;
    }

    container.innerHTML = items.map((entry) => {
      const skillMarkup = (entry.skills.length ? entry.skills : ['General Service'])
        .slice(0, 4)
        .map((skill) => `<span class="about-technician-skill">${escapeHtml(skill)}</span>`)
        .join('');
      const ratingLabel = entry.rating == null ? 'New' : `${entry.rating.toFixed(1)} / 5`;
      return `
        <article class="about-technician-card">
          <div class="about-technician-top">
            <div>
              <h3 class="about-technician-name">${escapeHtml(entry.name)}</h3>
              <p class="about-technician-role">HomeFixSolution Technician</p>
            </div>
            <span class="about-technician-pill">${escapeHtml(ratingLabel)}</span>
          </div>
          <div class="about-technician-meta">
            <p><strong>Service Area:</strong> ${escapeHtml(entry.location)}</p>
            <p><strong>Specialties:</strong></p>
          </div>
          <div class="about-technician-skills">${skillMarkup}</div>
        </article>
      `;
    }).join('');
  }

  async function loadTechnicians() {
    const container = document.getElementById('aboutTechnicianList');
    if (!container) return;

    try {
      const rtdb = getRealtimeDatabase();
      if (rtdb) {
        const snapshot = await rtdb.ref('technicians').once('value');
        const raw = snapshot && typeof snapshot.val === 'function' ? (snapshot.val() || {}) : {};
        const technicians = Object.keys(raw)
          .filter((uid) => shouldShowTechnician(uid, raw[uid]))
          .map((uid) => normalizeEntry(uid, raw[uid]))
          .sort((left, right) => {
            const leftRating = left.rating == null ? -1 : left.rating;
            const rightRating = right.rating == null ? -1 : right.rating;
            if (rightRating !== leftRating) return rightRating - leftRating;
            return left.name.localeCompare(right.name);
          });
        renderCards(container, technicians);
        return;
      }

      renderCards(container, getLocalTechnicians());
    } catch (_) {
      renderCards(container, getLocalTechnicians());
    }
  }

  document.addEventListener('DOMContentLoaded', loadTechnicians);
})();