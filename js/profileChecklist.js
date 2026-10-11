// Guided completion checklist for the dashboard. Pure, DOM-free logic so it's
// unit-testable in Node and shared with the telemetry bar (one source of truth
// for "how complete is this profile?").

const CHECKLIST_DEFS = [
  { key: 'name-title', label: 'Add your name & title', action: 'edit-profile' },
  { key: 'location', label: 'Add your location', action: 'edit-profile' },
  { key: 'links', label: 'Add a LinkedIn or portfolio link', action: 'edit-profile' },
  { key: 'project1', label: 'Add your first proof project', action: 'add-project' },
  { key: 'voice', label: 'Record a voice walkthrough', action: 'voice' },
  { key: 'project2', label: 'Add a second proof project', action: 'add-project' },
  { key: 'published', label: 'Publish your profile', action: 'publish' }
];

function projectHasVoice(p) {
  return !!(p && p.audioUrl);
}

function isDone(key, profile) {
  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  switch (key) {
    case 'name-title': return !!(profile.name && profile.title);
    case 'location': return !!profile.location;
    case 'links': return !!(profile.linkedin || profile.portfolio);
    case 'project1': return projects.length >= 1;
    case 'voice': return projects.some(projectHasVoice);
    case 'project2': return projects.length >= 2;
    case 'published': return profile.profileStatus === 'published';
    default: return false;
  }
}

function buildProfileChecklist(profile) {
  const items = CHECKLIST_DEFS.map(def => ({
    key: def.key,
    label: def.label,
    action: def.action,
    done: isDone(def.key, profile || {})
  }));
  const doneCount = items.filter(i => i.done).length;
  const percent = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  return { items: items, doneCount: doneCount, total: items.length, percent: percent };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildProfileChecklist };
}
if (typeof window !== 'undefined' && !window.profileChecklist) {
  window.profileChecklist = { buildProfileChecklist };
}