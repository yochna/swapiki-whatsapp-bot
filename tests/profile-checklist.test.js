const test = require('node:test');
const assert = require('node:assert/strict');

const { buildProfileChecklist } = require('../js/profileChecklist.js');

const emptyProfile = () => ({
  name: '',
  title: '',
  location: '',
  linkedin: '',
  portfolio: '',
  profileStatus: 'draft',
  projects: []
});

const fullProfile = () => ({
  name: 'Ananya Sharma',
  title: 'Staff Product Designer',
  location: 'Bengaluru',
  linkedin: 'https://linkedin.com/in/ananya-sharma-ux',
  portfolio: 'https://ananya.design',
  profileStatus: 'published',
  projects: [
    { id: 'p1', title: 'A', audioUrl: 'blob:audio' },
    { id: 'p2', title: 'B', audioUrl: null }
  ]
});

test('empty profile is 0% with every item pending', () => {
  const { percent, doneCount, total } = buildProfileChecklist(emptyProfile());
  assert.equal(percent, 0);
  assert.equal(doneCount, 0);
  assert.equal(total, 7);
});

test('fully complete profile is 100%', () => {
  const { percent, doneCount, total, items } = buildProfileChecklist(fullProfile());
  assert.equal(percent, 100);
  assert.equal(doneCount, total);
  assert.ok(items.every(i => i.done));
});

test('name+title+location+links+one project (no audio) = 57%', () => {
  const profile = emptyProfile();
  profile.name = 'Ananya Sharma';
  profile.title = 'Designer';
  profile.location = 'Bengaluru';
  profile.linkedin = 'https://linkedin.com/in/xy';
  profile.projects = [{ id: 'p1', title: 'A', audioUrl: null }];

  const { percent, doneCount } = buildProfileChecklist(profile);
  assert.equal(doneCount, 4); // name-title, location, links, project1
  assert.equal(percent, 57);
});

test('audio on a project counts the voice item; second project is separate', () => {
  const profile = emptyProfile();
  profile.name = 'N';
  profile.title = 'T';
  profile.location = 'L';
  profile.linkedin = 'https://linkedin.com/in/x';
  profile.projects = [{ id: 'p1', title: 'A', audioUrl: 'blob:x' }];

  const one = buildProfileChecklist(profile);
  assert.equal(one.percent, 71); // + voice = 5 of 7

  profile.projects.push({ id: 'p2', title: 'B', audioUrl: null });
  const two = buildProfileChecklist(profile);
  assert.equal(two.doneCount, 6); // + project2 = 6 of 7
});

test('publish status only counts when the profile is published', () => {
  const p = fullProfile();
  p.profileStatus = 'draft';
  const draft = buildProfileChecklist(p);
  assert.equal(draft.doneCount, 6);

  p.profileStatus = 'published';
  const pub = buildProfileChecklist(p);
  assert.equal(pub.doneCount, 7);
});

test('handles a null profile defensively', () => {
  const { percent, doneCount } = buildProfileChecklist(null);
  assert.equal(percent, 0);
  assert.equal(doneCount, 0);
});