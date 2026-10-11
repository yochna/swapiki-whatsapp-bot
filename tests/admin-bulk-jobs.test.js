// Bulk approve / reject in the admin jobs table.
//
// The queue this exists for is real: a scheduled feed run left 45 drafts waiting,
// and clearing them one at a time meant one round trip and one re-render per row.
// The risk is not speed, it is a partly-applied bulk action leaving the admin
// looking at a queue that disagrees with what they ticked, so most of these
// assertions are about the count being honest.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { bootApp, makeStorage } = require('./helpers/app-sandbox');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

const job = (n, status) => ({
  id: `0000000${n}-2222-3333-4444-555555555555`,
  title: `Job ${n}`,
  company: 'Acme',
  category: 'it',
  status
});

// --- a DOM stand-in good enough for the selection helpers -------------------
// The real selectors are `.admin-job-check[data-group="x"]`, the same plus
// `:checked`, `.admin-job-check-all[...]`, `.admin-bulk-btn[...]` and
// `[data-selected-count="x"]`. Matching those by class token and data attribute
// is enough, and it keeps the tests honest: the app code runs unmodified.
function matchesNode(node, sel) {
  const needsChecked = sel.endsWith(':checked');
  const base = needsChecked ? sel.slice(0, -':checked'.length) : sel;
  const cls = base.match(/^\.([\w-]+)/);
  if (cls) {
    const classes = String(node.className || '').split(/\s+/);
    if (!classes.includes(cls[1])) return false;
  }
  const attr = base.match(/\[([\w-]+)="([^"]+)"\]/);
  if (attr) {
    // dataset drops the data- prefix and camelCases the rest: data-group is
    // .group and data-selected-count is .selectedCount.
    const key = attr[1].replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (node.dataset[key] !== attr[2]) return false;
  }
  if (needsChecked && !node.checked) return false;
  return true;
}

/** One stand-in element. A delegated listener asks it whether it matches a selector. */
function fakeNode(props) {
  const el = Object.assign({ checked: false, indeterminate: false, textContent: '', disabled: false }, props);
  el.matches = sel => matchesNode(el, sel);
  return el;
}

function makeJobsDom(draftChecked = [], publishedChecked = []) {
  // A delegated listener asks the target whether it matches the selector, so the
  // stand-in elements answer that with the same matcher the queries use.
  const node = fakeNode;
  const row = (group, n, checked) => node({
    className: 'admin-job-check w-4 h-4 rounded',
    dataset: { group }, checked, value: `id-${group}-${n}`
  });
  const bar = group => node({ className: 'admin-bulk-btn inline-flex', dataset: { group }, disabled: true });
  const label = group => node({ dataset: { selectedCount: group } });
  const master = group => node({
    className: 'admin-job-check-all w-4 h-4 rounded',
    dataset: { group }
  });
  const nodes = [
    ...[0, 1, 2].map(n => row('draft', n, draftChecked.includes(n))),
    ...[0, 1].map(n => row('published', n, publishedChecked.includes(n))),
    label('draft'), label('published'),
    bar('draft'), bar('published'),
    master('draft'), master('published')
  ];
  // The two blocks a decision repaints into. Each table has its own search box,
  // and those live outside the repainted block, so there is one host per table.
  const draftInner = { id: 'admin-draft-inner', innerHTML: '' };
  const publishedInner = { id: 'admin-published-inner', innerHTML: '' };
  // What the queue looks like as a whole, for the assertions that read the markup
  // rather than pick a row out of it.
  const jobsInner = { get innerHTML() { return draftInner.innerHTML + publishedInner.innerHTML; } };
  // The candidate list repaints into a table body and a stack of phone cards,
  // for the same reason the job tables do: the toolbar above them survives.
  const candidatesTbody = { id: 'admin-candidates-tbody', innerHTML: '' };
  const candidatesCards = { id: 'admin-candidates-cards', innerHTML: '' };
  // The candidate pager is its own host for the same reason: it is drawn with the
  // rows but lives outside the table body and the card stack.
  const candidatesPager = { id: 'admin-candidates-pager', innerHTML: '' };
  const hosts = {
    'admin-draft-inner': draftInner,
    'admin-published-inner': publishedInner,
    'admin-candidates-tbody': candidatesTbody,
    'admin-candidates-cards': candidatesCards,
    'admin-candidates-pager': candidatesPager
  };
  // The counts live in the heading and the toolbar, both outside the repainted
  // block, so they are corrected in place rather than redrawn. These stand-ins
  // hold them, and the `hidden` flag records whether a control is showing.
  const total = group => node({ dataset: { adminTotal: group }, textContent: '0', className: 'badge' });
  const counter = group => node({ dataset: { adminCount: group }, textContent: '', className: 'count' });
  const flag = (group, kind) => {
    const n = node({ dataset: { [kind]: group }, className: 'hidden' });
    // toggle(name, force), as the DOM spells it: the first argument is the class
    // name and the second decides. The `hidden` class is mirrored onto the node so
    // a test can ask whether a control is on screen.
    n.classList = {
      hidden: true,
      toggle(name, force) {
        const on = force === undefined ? !this[name] : !!force;
        this[name] = on;
        n[name] = on;
      }
    };
    return n;
  };
  const headings = { draft: total('draft'), published: total('published') };
  const counters = { draft: counter('draft'), published: counter('published') };
  const flags = [];
  ['draft', 'published'].forEach(g => { flags.push(flag(g, 'adminMore'), flag(g, 'adminClear')); });
  // The sort label is a label, not a list: it sits in the toolbar and has to be
  // told the new direction when the rows below it flip.
  const sortLabel = node({ dataset: { adminSortLabel: 'candidates' }, textContent: 'A–Z' });
  const extras = [headings.draft, headings.published, counters.draft, counters.published, ...flags, sortLabel];
  const document = {
    querySelectorAll: sel => [...nodes, ...extras].filter(n => matchesNode(n, sel)),
    querySelector: sel => document.querySelectorAll(sel)[0] || null,
    getElementById: id => (id === 'admin-jobs-inner' ? jobsInner : (hosts[id] || null))
  };
  return { document, nodes, jobsInner, draftInner, publishedInner, candidatesTbody, candidatesCards, candidatesPager, headings, counters, flags, sortLabel };
}

const classOf = node => String(node.className || '');
const draftBox = (dom, n) => dom.nodes.find(x => classOf(x).startsWith('admin-job-check ') && x.dataset.group === 'draft' && x.value === `id-draft-${n}`);
const masterOf = (dom, group) => dom.nodes.find(x => classOf(x).startsWith('admin-job-check-all') && x.dataset.group === group);
const labelOf = (dom, group) => dom.nodes.find(x => x.dataset.selectedCount === group);
const buttonsOf = dom => dom.nodes.filter(x => classOf(x).startsWith('admin-bulk-btn'));
// app.js runs in a vm realm, so its arrays are not reference-equal to ours and
// deepStrictEqual rejects them on prototype alone. Copy into this realm first.
const ids = app => Array.from(app.adminSelectedJobIds('draft'));

// --- the rendered markup ---------------------------------------------------
test('every draft row carries a checkbox whose value is the job id', () => {
  const html = bootApp(makeStorage()).app.renderAdminJobsSection([job(1, 'draft'), job(2, 'draft'), job(3, 'draft')]);
  // The master checkbox shares the class prefix, so it is excluded deliberately:
  // counting it as a row is exactly the kind of off-by-one that would leave the
  // select-all box itself in the id list.
  const rowBoxes = html.match(/class="admin-job-check [^"]*"[^>]*value="([^"]+)"/g) || [];
  assert.strictEqual(rowBoxes.length, 3, `expected 3 row checkboxes, found ${rowBoxes.length}`);
  assert.ok(html.includes('value="00000001-2222-3333-4444-555555555555"'), 'checkbox value must be the job id');
});

test('the published table gets its own checkboxes and its own bar', () => {
  const html = bootApp(makeStorage()).app.renderAdminJobsSection([
    job(1, 'draft'), job(2, 'draft'), job(3, 'published')
  ]);
  const publishedBoxes = (html.match(/class="admin-job-check [^"]*"[^>]*data-group="published"/g) || []).length;
  assert.strictEqual(publishedBoxes, 1, 'only the published row is checkable in the published table');
  // Scoping matters: one shared bar would let a ticked draft be published by a
  // press on the published table, and the count shown would belong to neither.
  ['draft', 'published'].forEach(group => {
    assert.ok(html.includes(`admin-job-check-all`) && html.includes(`data-group="${group}"`), `missing master checkbox for ${group}`);
    assert.ok(html.includes(`data-selected-count="${group}"`), `missing count label for ${group}`);
    assert.ok(html.includes(`app.adminBulkSetStatus('${group}', 'rejected')`), `missing reject button for ${group}`);
  });
  assert.ok(html.includes(`app.adminBulkSetStatus('draft', 'published')`), 'the draft bar publishes');
  // Publishing rows that are already published reads as a broken button, so the
  // published bar offers the move its single-row button does.
  assert.ok(html.includes(`app.adminBulkSetStatus('published', 'draft')`), 'the published bar moves back to draft');
  assert.ok(!html.includes(`app.adminBulkSetStatus('published', 'published')`), 'the published bar must not offer a no-op publish');
  // The checkboxes only exist in the desktop table, so the bar hides with them
  // rather than sitting on a phone above cards it cannot act on.
  assert.ok(/class="hidden md:flex[^"]*"/.test(html), 'the bulk bar must be hidden on mobile');
});

test('the count, the armed state and the master box all follow the checkboxes', () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom([0, 2], [1]);
  sandbox.document = dom.document;

  app.adminSyncBulkBar('draft');
  assert.strictEqual(ids(app).length, 2, 'only ticked rows are selected');
  assert.deepStrictEqual(Array.from(app.adminSelectedJobIds('published')), ['id-published-1'], 'a ticked published row is separate');

  // The count reads as "n of total", not a bare number: "2 selected" next to
  // three rows in the table is ambiguous when the queue is this long.
  assert.strictEqual(labelOf(dom, 'draft').textContent, '2 of 3 selected');
  assert.ok(buttonsOf(dom).filter(b => b.dataset.group === 'draft').every(b => b.disabled === false), 'a selection arms the bar');
  // Partial selection must be reported as indeterminate, or "Select all" looks
  // un-ticked while rows are queued.
  assert.strictEqual(masterOf(dom, 'draft').checked, false);
  assert.strictEqual(masterOf(dom, 'draft').indeterminate, true);

  // The other table is untouched by ticking rows in this one: a ticked draft
  // must not arm the published table's buttons.
  assert.ok(buttonsOf(dom).filter(b => b.dataset.group === 'published').every(b => b.disabled === true), 'the published bar stays disarmed');
  assert.strictEqual(masterOf(dom, 'published').indeterminate, false);
  assert.deepStrictEqual(Array.from(app.adminSelectedJobIds('published')), ['id-published-1'], 'the published selection is its own');
});

test('an empty selection leaves the bar disarmed', () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom([], []);
  sandbox.document = dom.document;
  app.adminSyncBulkBar('draft');
  assert.deepStrictEqual(ids(app), []);
  assert.strictEqual(labelOf(dom, 'draft').textContent, '0 of 3 selected');
  assert.ok(buttonsOf(dom).filter(b => b.dataset.group === 'draft').every(b => b.disabled === true), 'nothing ticked must stay disarmed');
  assert.strictEqual(masterOf(dom, 'draft').indeterminate, false);
});

test('select all ticks the whole table, and clearing it works in reverse', () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;

  app.adminToggleAllJobs('draft', true);
  assert.strictEqual(ids(app).length, 3);
  assert.strictEqual(labelOf(dom, 'draft').textContent, '3 of 3 selected');
  assert.strictEqual(masterOf(dom, 'draft').checked, true, 'a full selection reads as a ticked master');
  assert.strictEqual(masterOf(dom, 'draft').indeterminate, false, 'a full selection is not partial');

  app.adminToggleAllJobs('draft', false);
  assert.strictEqual(ids(app).length, 0);
  assert.ok(buttonsOf(dom).filter(b => b.dataset.group === 'draft').every(b => b.disabled === true));
});

test('change events on a ticked row refresh the count', () => {
  // The dashboard is re-rendered on every decision, so the listeners are attached
  // to whatever exists right now. A row that was ticked before the swap would
  // otherwise keep a stale count.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  const box = draftBox(dom, 1);
  box.checked = true;
  app.adminSyncBulkBar('draft');
  assert.strictEqual(labelOf(dom, 'draft').textContent, '1 of 3 selected');
  box.checked = false;
  app.adminSyncBulkBar('draft');
  assert.strictEqual(labelOf(dom, 'draft').textContent, '0 of 3 selected');
});

// --- the store write -------------------------------------------------------
function bootStore(supabase) {
  const noop = () => {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    document: { referrer: '', querySelector: () => null, querySelectorAll: () => [], addEventListener: noop },
    fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('store.js'), sandbox, { filename: 'store.js' });
  sandbox.swapikiStore.supabase = supabase;
  sandbox.swapikiStore.isAdminUser = true;
  return sandbox.swapikiStore;
}

/** Records the query the store builds, and answers with a chosen row count. */
function fakeSupabase(count) {
  const calls = [];
  const builder = {
    update: payload => { calls.push({ op: 'update', payload }); return builder; },
    eq: (...a) => { calls.push({ op: 'eq', args: a }); return builder; },
    in: (...a) => { calls.push({ op: 'in', args: a }); return builder; },
    select: (...a) => { calls.push({ op: 'select', args: a }); return Promise.resolve({ data: null, error: null, count }); }
  };
  return {
    calls,
    client: { from: table => { calls.push({ op: 'from', table }); return builder; } }
  };
}

test('a bulk write is one filtered update, not a loop of single updates', async () => {
  const sup = fakeSupabase(2);
  const store = bootStore(sup.client);
  const ids = ['00000001-2222-3333-4444-555555555555', '00000002-2222-3333-4444-555555555555'];
  const updated = await store.adminSetJobStatusBulk(ids, 'rejected');

  assert.strictEqual(updated, 2);
  assert.strictEqual(sup.calls.filter(c => c.op === 'update').length, 1, 'one statement, so the write cannot half-apply');
  const inCall = sup.calls.find(c => c.op === 'in');
  assert.ok(inCall, 'the ids must be filtered on');
  assert.deepStrictEqual(inCall.args[1], ids, 'every ticked id is in the filter');
  const write = sup.calls.find(c => c.op === 'update').payload;
  assert.strictEqual(write.status, 'rejected');
  assert.ok(write.updated_at, 'the write is stamped');
});

test('a short write is reported instead of reported as success', async () => {
  // Two rows ticked, one row written. Swallowing this is how a bulk action ends
  // up disagreeing with the admin's own selection.
  const sup = fakeSupabase(1);
  const store = bootStore(sup.client);
  await assert.rejects(
    () => store.adminSetJobStatusBulk(['00000001-2222-3333-4444-555555555555', '00000002-2222-3333-4444-555555555555'], 'published'),
    /Only 1 of 2/
  );
});

test('ids are shape-checked before they reach the query', () => {
  // This is the one place a list of values is built from markup, so junk never
  // gets near the query rather than being escaped into it.
  const sup = fakeSupabase(1);
  const store = bootStore(sup.client);
  return assert.rejects(
    () => store.adminSetJobStatusBulk(['1 OR 1=1', '', null, '../../etc'], 'published'),
    /No valid job selected/
  ).then(() => {
    assert.strictEqual(sup.calls.length, 0, 'nothing may be sent when no id is usable');
  });
});

test('a bulk write still requires admin access', async () => {
  const sup = fakeSupabase(1);
  const store = bootStore(sup.client);
  store.isAdminUser = false;
  await assert.rejects(
    () => store.adminSetJobStatusBulk(['00000001-2222-3333-4444-555555555555'], 'published'),
    /Admin access required/
  );
  assert.strictEqual(sup.calls.length, 0);
});

// --- the action itself -----------------------------------------------------
// `renders` counts repaints of the two review tables, `rerenders` counts full
// admin re-renders. They are separate on purpose: a decision repaints the queue
// and nothing else, and that separation is the fix for a page that used to blank
// for a second on every press.
function wireBulk(app, sandbox, dom) {
  sandbox.document = dom.document;
  sandbox.confirm = () => true;
  const calls = [];
  const toasts = [];
  sandbox.swapikiStore.adminSetJobStatusBulk = (ids, status) => {
    // Copy into this realm: the ids arrive as a vm-realm array.
    calls.push({ ids: Array.from(ids), status });
    return Promise.resolve(ids.length);
  };
  sandbox.swapikiStore.adminDeleteJob = id => { calls.push({ deleted: id }); return Promise.resolve(); };
  app.showToast = msg => toasts.push(msg);
  let rerenders = 0;
  let renders = 0;
  app.renderAdminDashboard = async () => { rerenders++; };
  app.repaintAdminJobs = () => { renders++; return true; };
  // The queue in memory, seeded from the same rows the checkboxes stand for, so
  // a decision has something real to move.
  app._adminJobs = dom.nodes
    .filter(n => classOf(n).startsWith('admin-job-check '))
    .map(n => ({ id: n.value, title: n.value, status: n.dataset.group }));
  return { calls, toasts, rerenders: () => rerenders, renders: () => renders };
}

test('bulk reject writes the rejected status and never deletes', async () => {
  // Curation rejects rather than deletes so a decision can be reversed, and the
  // admin button has to mean the same thing. A bulk path that called the delete
  // helper would destroy rows the single-row reject keeps.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom([0, 1, 2]);
  const wired = wireBulk(app, sandbox, dom);

  await app.adminBulkSetStatus('draft', 'rejected');

  assert.strictEqual(wired.calls.length, 1, 'exactly one write');
  assert.strictEqual(wired.calls[0].status, 'rejected');
  assert.deepStrictEqual(wired.calls[0].ids, ['id-draft-0', 'id-draft-1', 'id-draft-2']);
  assert.strictEqual(wired.calls.filter(c => c.deleted).length, 0, 'no row is deleted');
  assert.strictEqual(wired.renders(), 1, 'the queue repaints from memory once the press lands');
  assert.strictEqual(wired.rerenders(), 0, 'and the rest of the admin page is left alone');
});

test('bulk publish writes published', async () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom([1]);
  const wired = wireBulk(app, sandbox, dom);
  await app.adminBulkSetStatus('draft', 'published');
  assert.strictEqual(wired.calls[0].status, 'published');
  assert.deepStrictEqual(wired.calls[0].ids, ['id-draft-1']);
});

test('bulk move back to draft writes draft and never deletes', async () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom([], [0, 1]);
  const wired = wireBulk(app, sandbox, dom);
  await app.adminBulkSetStatus('published', 'draft');
  assert.strictEqual(wired.calls[0].status, 'draft');
  assert.strictEqual(wired.calls.filter(c => c.deleted).length, 0, 'unpublishing is a status change');
});

test('the confirmation states what each action will do', async () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom([0], [0]);
  const wired = wireBulk(app, sandbox, dom);
  const asked = [];
  sandbox.confirm = msg => { asked.push(msg); return false; };

  await app.adminBulkSetStatus('draft', 'published');
  await app.adminBulkSetStatus('draft', 'rejected');
  await app.adminBulkSetStatus('published', 'draft');

  assert.match(asked[0], /1 job will be published to the board/);
  assert.match(asked[1], /rejected \(kept, not deleted, and reversible\)/);
  assert.match(asked[2], /moved back to draft and taken off the board/);
  assert.strictEqual(wired.calls.length, 0, 'declining every prompt writes nothing');
});

test('nothing ticked writes nothing, and a declined confirmation writes nothing', async () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  const wired = wireBulk(app, sandbox, dom);
  await app.adminBulkSetStatus('draft', 'published');
  assert.strictEqual(wired.calls.length, 0, 'an empty selection is a no-op');

  draftBox(dom, 0).checked = true;
  sandbox.confirm = () => false;
  await app.adminBulkSetStatus('draft', 'published');
  assert.strictEqual(wired.calls.length, 0, 'a declined confirmation is a no-op');
});

test('a failed bulk write surfaces the error and re-arms the bar', async () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom([0, 1]);
  const wired = wireBulk(app, sandbox, dom);
  sandbox.swapikiStore.adminSetJobStatusBulk = () => Promise.reject(new Error('Only 1 of 2 selected jobs could be updated.'));

  await app.adminBulkSetStatus('draft', 'published');

  assert.ok(wired.toasts.some(t => /Only 1 of 2/.test(t)), 'the real reason is shown, not a generic failure');
  assert.ok(wired.toasts.some(t => t.startsWith('❌')));
  // The selection is still on screen and the buttons must be usable again,
  // otherwise the admin has to refresh the page to retry the one that failed.
  assert.strictEqual(ids(app).length, 2, 'the selection survives a failure');
  assert.ok(buttonsOf(dom).filter(b => b.dataset.group === 'draft').every(b => b.disabled === false), 'the bar is armed again after an error');
  assert.deepStrictEqual(
    Array.from(app._adminJobs.filter(j => j.id === 'id-draft-0' || j.id === 'id-draft-1'), j => j.status),
    ['draft', 'draft'],
    'and the rows are back where they were, not left on screen as published'
  );
});

// ---------------------------------------------------------------------------
// A single row's decision
//
// The report this answers: pressing reject in Job Review felt like nothing
// happened, so it was pressed again. Three causes, three fixes — the page went
// to a skeleton for a full reload, nothing was locked while the write was open,
// and a draft row had no reject button at all (the only red button was a
// permanent delete).
// ---------------------------------------------------------------------------

const uuid = n => `0000000${n}-2222-3333-4444-555555555555`;

/**
 * Wires the single-row path against the real repaint, so a test reads the markup
 * that lands in the queue's mount. `defer` holds the write open so a second
 * press can be attempted while the first is still in flight.
 */
function wireRow(app, sandbox, dom, jobs, { defer = false, fail = false } = {}) {
  sandbox.document = dom.document;
  sandbox.confirm = () => true;
  const toasts = [];
  const writes = [];
  let release;
  const gate = defer ? new Promise(r => { release = r; }) : Promise.resolve();
  app.showToast = msg => toasts.push(msg);
  sandbox.swapikiStore.adminSetJobStatus = (id, status) => {
    writes.push({ id, status });
    return gate.then(() => { if (fail) throw new Error('permission denied for jobs'); });
  };
  let rerenders = 0;
  app.renderAdminDashboard = async () => { rerenders++; };
  app._adminJobs = jobs;
  return { writes, toasts, rerenders: () => rerenders, release: () => release && release() };
}

test('every row offers reject, and it is a status change rather than a delete', () => {
  const { app } = bootApp(makeStorage());
  const html = app.renderAdminJobsSection([job(1, 'draft'), job(2, 'published')]);

  // The single-row buttons have to say the same thing as the bulk ones. A row
  // that could only be published or deleted could not be rejected at all.
  assert.ok(html.includes("app.adminRejectJob('00000001-2222-3333-4444-555555555555'"), 'a draft row can be rejected');
  assert.ok(html.includes("app.adminRejectJob('00000002-2222-3333-4444-555555555555'"), 'and so can a published one');
  assert.ok(html.includes('Reject'), 'and the button is labelled as a rejection, not a deletion');
  // The two destructive-looking buttons have to be told apart on hover, because
  // one of them destroys the row.
  assert.ok(html.includes('Delete permanently'), 'delete says it is permanent');
  assert.ok(html.includes('can be reopened'), 'and reject says it is not');
});

test('rejecting one row writes rejected and never calls the delete helper', async () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom([0]);
  const jobs = [{ id: uuid(1), title: 'Job 1', status: 'draft' }];
  const wired = wireRow(app, sandbox, dom, jobs);
  const deleted = [];
  sandbox.swapikiStore.adminDeleteJob = id => { deleted.push(id); return Promise.resolve(); };

  await app.adminRejectJob(uuid(1));

  assert.deepStrictEqual(wired.writes, [{ id: uuid(1), status: 'rejected' }], 'one write, to the rejected status');
  assert.deepStrictEqual(deleted, [], 'the row is kept');
  assert.strictEqual(jobs[0].status, 'rejected', 'and the in-memory queue agrees');
});

test('the row leaves the table on the press, not when the write comes back', async () => {
  // This is the whole point: the press has a visible answer straight away, so it
  // never reads as a missed click.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  const jobs = [{ id: uuid(1), title: 'Keep me', status: 'draft' }];
  const wired = wireRow(app, sandbox, dom, jobs, { defer: true });

  const pending = app.adminApproveJob(uuid(1));

  assert.strictEqual(dom.headings.draft.textContent, '0', 'the badge drops to zero at once');
  assert.strictEqual(dom.headings.published.textContent, '1', 'and the row is already counted as published');
  assert.ok(dom.jobsInner.innerHTML.includes(`app.adminUnpublishJob('${uuid(1)}')`), 'it is in the published table, not still waiting');
  assert.ok(!dom.jobsInner.innerHTML.includes(`app.adminApproveJob('${uuid(1)}')`), 'and no longer offered for review');
  assert.strictEqual(wired.rerenders(), 0, 'the rest of the admin page is never re-rendered');
  wired.release();
  await pending;
});

test('a second press while the write is open writes nothing', async () => {
  // The repeat the admin reported. A press already in flight owns the outcome,
  // so a second one is ignored rather than queued as a second decision.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  const jobs = [{ id: uuid(1), title: 'Job 1', status: 'draft' }];
  const wired = wireRow(app, sandbox, dom, jobs, { defer: true });

  const first = app.adminRejectJob(uuid(1));
  app.adminRejectJob(uuid(1));
  app.adminApproveJob(uuid(1));
  app.adminApproveJob(uuid(1));

  wired.release();
  await first;
  assert.strictEqual(wired.writes.length, 1, 'one press, one write — the rest are no-ops');
  assert.strictEqual(wired.writes[0].status, 'rejected', 'and it is the first press that decided it');
});

test('a failed decision puts the row back where it was and says why', async () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  const jobs = [{ id: uuid(1), title: 'Job 1', status: 'draft' }];
  const wired = wireRow(app, sandbox, dom, jobs, { fail: true });

  await app.adminApproveJob(uuid(1));

  assert.strictEqual(jobs[0].status, 'draft', 'the queue is not left showing a publish that never happened');
  assert.strictEqual(dom.headings.draft.textContent, '1', 'and the badge is back to one to review');
  assert.match(dom.jobsInner.innerHTML, /Job 1/, 'with the row back in it');
  assert.ok(wired.toasts.some(t => /permission denied for jobs/.test(t)), 'the real reason is shown');
  assert.strictEqual(app._adminJobBusy[uuid(1)], undefined, 'the row is unlocked so it can be retried');
});

test('deleting asks for the permanent one by name, and points at reject as the reversible one', async () => {
  // Delete sits on the same row as reject and destroys the row. A prompt that
  // says only "delete?" leaves an admin reaching for the wrong one.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  const jobs = [{ id: uuid(1), title: 'Job 1', status: 'draft' }];
  wireRow(app, sandbox, dom, jobs);
  const asked = [];
  sandbox.confirm = msg => { asked.push(msg); return false; };

  await app.adminDeleteJob(uuid(1));

  assert.strictEqual(asked.length, 1);
  assert.match(asked[0], /permanently/);
  assert.match(asked[0], /cannot be undone/);
  assert.match(asked[0], /Reject/, 'and it names the reversible alternative');
});

test('a job title never reaches an inline handler', () => {
  // A title is employer-supplied. Interpolated into onclick="..." it is one quote
  // away from closing the attribute and running as script in the admin's session,
  // and a submission is exactly the kind of field a stranger controls. The
  // handlers read the title off the queue instead, so only the uuid is in markup.
  const { app } = bootApp(makeStorage());
  const hostile = 'Backend " onmouseover="alert(1)" x="';
  const row = { id: uuid(1), title: hostile, status: 'draft' };
  const html = app.renderAdminJobsSection([row]);

  assert.ok(!html.includes('onmouseover="alert(1)"'), 'the title cannot break out of the attribute');
  assert.ok(html.includes('onmouseover=&quot;alert(1)&quot;'), 'it is shown, escaped, in the row itself');
  const handlers = html.match(/onclick="app\.admin(?:Reject|Delete)Job\('([^']*)'\)"/g) || [];
  // Two per row: the desktop table's, and the phone card's, which is built here
  // because the stand-in has no matchMedia. Both must be uuid-only.
  assert.ok(handlers.length >= 2, `reject and delete are both on the row: ${handlers.length}`);
  handlers.forEach(h => {
    const arg = /\('([^']*)'\)/.exec(h)[1];
    assert.match(arg, /^[0-9a-f-]{36}$/, `a handler carries only the uuid: ${h}`);
  });
  // The queue is what the confirmation reads, and it holds the real title, so
  // moving it out of the markup costs the prompt nothing.
  app._adminJobs = [row];
  assert.strictEqual(app.adminJobTitle(uuid(1)), hostile, 'the confirmation still names the real title');
});

test('a full admin render collapses into the one already running', async () => {
  // Six queries, four charts and every row on the page, per render. Two racing
  // renders are what made the admin feel slow, so a second request waits for the
  // first and asks for one more pass instead of starting its own.
  const { app } = bootApp(makeStorage());
  let passes = 0;
  let open;
  const gate = new Promise(r => { open = r; });
  app.renderAdminDashboardPass = async () => { passes++; await gate; };

  const first = app.renderAdminDashboard();
  const second = app.renderAdminDashboard();
  open();
  await Promise.all([first, second]);

  assert.strictEqual(passes, 2, 'the running pass, plus exactly one for the request that queued');
  assert.strictEqual(app._adminRenderInFlight, null, 'and the guard is released afterwards');
});

// --- select all ------------------------------------------------------------
// The helpers above work when called. What was broken is that nothing called
// them: the listener was bound to each checkbox, and every decision replaces the
// checkboxes, so from then on a press on "Select all" did nothing at all and the
// count stayed at zero. These drive the listener the way a click does.
function makeSelectAllContainer() {
  const container = {
    _listeners: {},
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  };
  const fire = (el) => (container._listeners.change || []).forEach(fn => fn({ target: el }));
  return { container, fire, count: () => (container._listeners.change || []).length };
}

test('select all works because the listener is on the container, not the checkbox', () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  const { container, fire, count } = makeSelectAllContainer();

  app.bindAdminSelection(container);
  assert.strictEqual(count(), 1, 'one change listener, on the element that is never replaced');

  // The row click an admin actually makes: a `change` that bubbles.
  fire(masterOf(dom, 'draft'));
  masterOf(dom, 'draft').checked = true;
  fire(masterOf(dom, 'draft'));
  assert.strictEqual(ids(app).length, 3, 'the master box ticks the table through the listener');
  assert.strictEqual(labelOf(dom, 'draft').textContent, '3 of 3 selected');
  assert.ok(buttonsOf(dom).filter(b => b.dataset.group === 'draft').every(b => b.disabled === false), 'and arms the bar');

  masterOf(dom, 'draft').checked = false;
  fire(masterOf(dom, 'draft'));
  assert.strictEqual(ids(app).length, 0, 'and clearing it clears the table');
});

test('a single row tick updates the count through the same listener', () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  const { container, fire } = makeSelectAllContainer();
  app.bindAdminSelection(container);
  // The render arms both bars before anyone can press anything.
  ['draft', 'published'].forEach(g => app.adminSyncBulkBar(g));

  const row = dom.nodes.find(n => classOf(n).startsWith('admin-job-check ') && n.dataset.group === 'published' && n.value === 'id-published-0');
  row.checked = true;
  fire(row);

  assert.deepStrictEqual(Array.from(app.adminSelectedJobIds('published')), ['id-published-0']);
  assert.strictEqual(labelOf(dom, 'published').textContent, '1 of 2 selected');
  assert.strictEqual(masterOf(dom, 'published').indeterminate, true, 'a partial tick shows on the master box');
  assert.strictEqual(labelOf(dom, 'draft').textContent, '0 of 3 selected', 'and leaves the other table alone');
  assert.strictEqual(masterOf(dom, 'draft').indeterminate, false);
  assert.ok(buttonsOf(dom).filter(b => b.dataset.group === 'draft').every(b => b.disabled === true), 'the draft bar stays disarmed');
});

test('the queue repaint does not take the listener with it', () => {
  // The regression itself: a decision rewrites the markup, and the boxes the
  // admin presses next are new elements. A listener bound to the old ones is
  // gone, so select all goes dead the first time anything is reviewed.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  const { container, fire, count } = makeSelectAllContainer();
  app.bindAdminSelection(container);

  app._adminJobs = [job(1, 'draft'), job(2, 'draft'), job(3, 'draft')];
  app.repaintAdminJobs();
  assert.ok(count() === 1, 'repainting the queue does not stack a listener');

  masterOf(dom, 'draft').checked = true;
  fire(masterOf(dom, 'draft'));
  assert.strictEqual(labelOf(dom, 'draft').textContent, '3 of 3 selected', 'select all still answers after a repaint');
});

test('re-entering the admin page does not stack a second listener', () => {
  // A second listener would read one tick as two calls, and "toggle all" twice
  // leaves the table exactly as it was — which looks exactly like a dead button.
  const { app } = bootApp(makeStorage());
  const { container, count } = makeSelectAllContainer();
  app.bindAdminSelection(container);
  app.bindAdminSelection(container);
  app.bindAdminSelection(container);
  assert.strictEqual(count(), 1, 'still one listener after three binds');
});

test('a rejected row can be reopened, so reject is reversible in the UI', async () => {
  // The note under the queue used to tell an admin to set a status back to draft
  // by hand. That is only possible with a SQL client, which made the one claim of
  // reversibility in this page untrue.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  const jobs = [
    { id: uuid(1), title: 'Turned down', status: 'rejected', source: 'user-submission' },
    { id: uuid(2), title: 'Curated away', status: 'rejected', source: 'adzuna' }
  ];
  const wired = wireRow(app, sandbox, dom, jobs);
  app.repaintAdminJobs();

  const html = dom.jobsInner.innerHTML;
  assert.match(html, /Rejected \(2\)/, 'the pile is shown and counted');
  assert.ok(html.includes('kept, and can be reopened'), 'and says it is reversible');
  assert.ok(html.includes(`app.adminReopenJob('${uuid(1)}')`), 'with a way to reopen it');
  assert.ok(html.includes('posted by an employer'), 'and says how many of them a person sent in');
  assert.ok(!html.includes('Reopen one by setting its status back to draft'), 'the hand-edit instruction is gone');

  await app.adminReopenJob(uuid(1));

  assert.deepStrictEqual(wired.writes, [{ id: uuid(1), status: 'draft' }], 'reopening is a plain status write');
  assert.strictEqual(dom.headings.draft.textContent, '1', 'and the row is back in the review queue');
  assert.match(dom.jobsInner.innerHTML, /Rejected \(1\)/, 'with the pile down to what is left');
});

test('a phone can decide a job, not just read one', () => {
  // The bulk bar is hidden below `md`, and the cards carried no buttons at all, so
  // the whole queue was read-only on a phone.
  const { app, sandbox } = bootApp(makeStorage());
  sandbox.window.matchMedia = () => ({ matches: true });
  const html = app.renderAdminJobsSection([job(1, 'draft'), job(2, 'published')]);

  assert.ok(html.includes(`app.adminApproveJob('${'00000001-2222-3333-4444-555555555555'}')`), 'a draft card can be published');
  assert.ok(html.includes(`app.adminRejectJob('${'00000001-2222-3333-4444-555555555555'}')`), 'and rejected');
  assert.ok(html.includes(`app.adminUnpublishJob('${'00000002-2222-3333-4444-555555555555'}')`), 'a published card goes back to draft');
  // The cards still cost nothing on a desktop, where they are not shown.
  sandbox.window.matchMedia = () => ({ matches: false });
  const desktop = app.renderAdminJobsSection([job(1, 'draft')]);
  assert.ok(!desktop.includes('admin-mobile-card'), 'and are not built at all when the screen is wide');
});

test('no free-text field reaches an inline handler anywhere in the admin page', () => {
  // A candidate's name and handle, and an admin's email, are strings a stranger
  // chose. The handlers used to be built with only `'` escaped inside a
  // double-quoted attribute, so a quote in the name closed the attribute.
  const src = read('app.js');
  // Scanned by the place each method is defined rather than by one slice of the
  // file: the dashboard, and the two methods it now delegates rows to.
  const windows = [
    ['async renderAdminDashboardPass()', 'repaintAdminCandidates() {'],
    ['adminCandidatesMarkup(list) {', 'repaintAdminCandidates() {'],
    ['renderAdminJobsSection(jobs) {', 'adminJobsMarkup(jobs, views) {']
  ];
  let handlers = [];
  windows.forEach(([from, to]) => {
    const a = src.indexOf(from);
    const b = src.indexOf(to);
    assert.ok(a > -1 && b > a, `window not found: ${from}`);
    handlers = handlers.concat((src.slice(a, b).match(/onclick="app\.[A-Za-z]+\(([^)]*)\)"/g) || []));
  });
  assert.ok(handlers.length >= 9, `expected the admin row buttons to be found, saw ${handlers.length}`);
  handlers.forEach(h => {
    // `c.id` is a uuid and the second argument of the review toggle is a literal,
    // so those are safe. The three fields below are strings a stranger chose.
    assert.ok(!/\$\{[^\}]*\b(c|a)\.(name|username|email)\b/.test(h), `a handler interpolates free text: ${h}`);
  });
  // The values they need are still there, just carried in attributes instead.
  const pass = read('app.js');
  assert.ok(pass.includes('app.adminViewCandidateProfile(this.dataset.username)'), 'the handle is read from the element');
  assert.ok(pass.includes('app.adminDeleteCandidate(this.dataset.id, this.dataset.name)'), 'as is the name to confirm');
  assert.ok(pass.includes('app.adminRemoveAdmin(this.dataset.uid, this.dataset.email)'), 'and the admin email');
});

// --- searching and paging -------------------------------------------------
// Three long lists, one behaviour: fifteen rows, a search box, and a way to see
// the rest. The danger is not that the maths is wrong, it is that a list lies —
// fifteen rows on screen that read as the whole queue, or a count that says forty
// while the admin has only ever seen fifteen of them.
const manyJobs = (n, status) => Array.from({ length: n }, (_, i) => ({
  id: `0000${String(i).padStart(4, '0')}-2222-3333-4444-555555555555`,
  title: `Role ${String(i).padStart(3, '0')}`,
  company: i % 2 ? 'Acme' : 'Globex',
  location: i % 3 ? 'Pune' : 'Bengaluru',
  status
}));

const rowsRendered = html => (html.match(/class="admin-job-check /g) || []).length;

// The pager is drawn with the rows rather than patched afterwards, so these read
// the markup that is actually on screen instead of a stand-in the code mutates.
const btnDisabled = (html, attr) => {
  const m = html.match(new RegExp(`<button[^>]*data-admin-${attr}="[^"]*"([^>]*)>`));
  return !!m && /\sdisabled/.test(m[1]);
};
const pageInfo = (html, key) => (html.match(new RegExp(`data-admin-pageinfo="${key}"[^>]*>([^<]*)<`)) || [])[1];
const hasPager = html => /data-admin-pager="/.test(html);

test('a long queue shows fifteen rows and offers the rest', () => {
  const { app } = bootApp(makeStorage());
  const html = app.renderAdminJobsSection(manyJobs(41, 'draft'));

  assert.strictEqual(rowsRendered(html), 15, 'fifteen rows, not forty-one');
  assert.ok(!html.includes('Role 015'), 'and the sixteenth is not on the page');
  assert.ok(html.includes('Role 014'), 'but the fifteenth is');
  assert.match(html, /41 rows/, 'the count is the whole queue, and the pager says how much of it is on screen');
  assert.match(html, /Page 1 of 3/, 'and which page this is');
  assert.match(html, /Show more/, 'and there is a way to see the rest');
  // The pager sits under the rows, not in the toolbar above them: it is the
  // control you reach for once you have read the fifteen.
  const pagerAt = html.indexOf('data-admin-pager="draft"');
  const lastRowAt = html.lastIndexOf('Role 014');
  assert.ok(pagerAt > lastRowAt, 'the pager comes after the rows it pages');
  // The heading counts the whole queue, not the page: the number an admin sizes
  // their sitting around is how much work there is, not how much is on screen.
  assert.match(html, /Job Review<\/h3>\s*<span[^>]*data-admin-total="draft"[^>]*>41</, 'the badge is the whole queue');
});

test('Show more moves to the next page rather than growing the list', () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  app._adminJobs = manyJobs(41, 'draft');
  app.repaintAdminJobs();

  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 1 of 3');
  app.adminShowMore('draft');
  assert.strictEqual(rowsRendered(dom.draftInner.innerHTML), 15, 'still fifteen rows');
  assert.ok(!dom.draftInner.innerHTML.includes('Role 000'), 'and the first page is gone, not kept above');
  assert.ok(dom.draftInner.innerHTML.includes('Role 015'), 'the next fifteen are here instead');
  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 2 of 3');

  app.adminShowMore('draft');
  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 3 of 3');
  assert.ok(dom.draftInner.innerHTML.includes('Role 040'), 'the last page holds the remainder');
  assert.ok(!dom.draftInner.innerHTML.includes('Role 015'), 'and only the remainder');
  assert.strictEqual(btnDisabled(dom.draftInner.innerHTML, 'more'), true, 'Show more is spent');
  assert.strictEqual(btnDisabled(dom.draftInner.innerHTML, 'prev'), false, 'while Back is available');
});

test('Back returns to the previous page and stops at the first', () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  app._adminJobs = manyJobs(41, 'draft');
  app.repaintAdminJobs();

  assert.strictEqual(btnDisabled(dom.draftInner.innerHTML, 'prev'), true, 'Back is dead on the first page');

  app.adminShowMore('draft');
  app.adminShowMore('draft');
  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 3 of 3');

  app.adminPrevPage('draft');
  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 2 of 3', 'one page back at a time');
  assert.ok(dom.draftInner.innerHTML.includes('Role 015'));

  app.adminPrevPage('draft');
  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 1 of 3');
  assert.ok(dom.draftInner.innerHTML.includes('Role 000'), 'the first page is back');

  app.adminPrevPage('draft');
  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 1 of 3', 'and Back stops at the first rather than wrapping');
});

test('a page that no longer exists falls back to one that does', () => {
  // Deleting a row on the last page, or a search that narrows, can leave the admin
  // on a page number with nothing behind it. A pager reading "Page 4 of 2" is
  // worse than one that moves itself.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  app._adminJobs = manyJobs(41, 'draft');
  app.repaintAdminJobs();
  app.adminShowMore('draft');
  app.adminShowMore('draft');
  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 3 of 3');

  app._adminJobs = manyJobs(20, 'draft');
  app.repaintAdminJobs();
  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 2 of 2', 'it moved itself back to a page that exists');
  assert.ok(dom.draftInner.innerHTML.includes('Role 015'), 'showing the five that are left');

  app.adminOnSearch('draft', 'acme');
  assert.strictEqual(hasPager(dom.draftInner.innerHTML), false,
    'a search that fits on one page leaves nothing to page through');
  assert.ok(dom.draftInner.innerHTML.includes('Role 001'), 'and it shows the match from the top');
  assert.ok(!dom.draftInner.innerHTML.includes('Role 030'), 'not from wherever the admin had got to');
});

test('a search narrows the queue without re-reading anything', () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  let renders = 0;
  app.renderAdminDashboard = async () => { renders++; };
  app._adminJobs = manyJobs(41, 'draft');
  app.repaintAdminJobs();

  app.adminOnSearch('draft', 'acme');
  assert.strictEqual(renders, 0, 'no full reload, so no skeleton and no six queries');
  assert.strictEqual(rowsRendered(dom.draftInner.innerHTML), 15, 'fifteen of the twenty Acme drafts');
  assert.strictEqual(dom.counters.draft.textContent, '20 matching', 'the count is the whole match, not the page');
  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 1 of 2', 'and the pager admits there is a second page');
  // A search always starts at page one: carrying the page number over would land
  // the admin on page two of a result that only has one page.
  app.adminShowMore('draft');
  app.adminOnSearch('draft', 'bengaluru');
  assert.strictEqual(rowsRendered(dom.draftInner.innerHTML), 14, 'a new search starts at the top again');
  assert.strictEqual(dom.counters.draft.textContent, '14 matching', 'and never shows more than matched');
  assert.strictEqual(dom.counters.draft.textContent.includes('15'), false, 'the page is not padded to a full one');
});

test('a search that matches nothing says so instead of saying the queue is empty', () => {
  const { app } = bootApp(makeStorage());
  app._adminLists = { draft: { q: 'nothing here', shown: 15, dir: 1 } };
  const html = app.renderAdminJobsSection(manyJobs(41, 'draft'));

  assert.strictEqual(rowsRendered(html), 0);
  assert.match(html, /No drafts match/, 'the empty state names the search as the reason');
  assert.ok(!html.includes('Nothing to review'), 'because that would read as a queue the admin had just cleared');
  assert.match(html, /nothing matches/, 'and the count agrees');
});

test('the two tables are searched and paged separately', () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  const list = manyJobs(20, 'draft').concat(manyJobs(20, 'published').map((j, i) => ({ ...j, id: `1000${String(i).padStart(4, '0')}-2222-3333-4444-555555555555` })));
  app._adminJobs = list;
  app.repaintAdminJobs();

  app.adminOnSearch('draft', 'acme');
  app.adminOnSearch('published', 'bengaluru');
  // Ten Acme drafts and seven Bengaluru published jobs in this fixture. One box
  // typed into the other table's list is the mistake a shared control invites.
  assert.strictEqual(dom.counters.draft.textContent, '10 matching');
  assert.strictEqual(dom.counters.published.textContent, '7 matching');
  assert.strictEqual(dom.headings.draft.textContent, '20', 'and the headings still count their whole list');
  assert.strictEqual(dom.headings.published.textContent, '20');
  const html = app.renderAdminJobsSection(list);
  assert.ok(/data-admin-search="draft"/.test(html) && /data-admin-search="published"/.test(html), 'one search box per table');
});

test('a search box survives a decision, because it is outside the repainted block', () => {
  // The whole page is rebuilt when a job is decided. Had the box been inside that
  // block, the first keystroke would replace the element being typed into and the
  // second character would go nowhere.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  const html = app.renderAdminJobsSection(manyJobs(41, 'draft'));

  const box = /<input[^>]*data-admin-search="draft"[^>]*>/.exec(html)[0];
  assert.ok(!/admin-draft-inner/.test(box), 'the box is not inside the block a decision rewrites');
  assert.ok(/value=""/ .test(box) || /value=""/.test(box), 'and it renders what was typed, not a blank');
  // There are two repaint hosts now, so a repaint that only knew one of them
  // would leave half the queue stale.
  assert.ok(html.includes('id="admin-draft-inner"') && html.includes('id="admin-published-inner"'), 'one host per table');
});

test('candidates are sorted by name, and the sort flips', () => {
  const { app } = bootApp(makeStorage());
  const people = [
    { id: '1', name: 'Chandra', username: 'c', email: 'c@x.com' },
    { id: '2', name: 'anil', username: 'a', email: 'a@x.com' },
    { id: '3', name: 'Bhavna', username: 'b', email: 'b@x.com' },
    { id: '4', username: 'n', email: 'n@x.com' }
  ];
  const page = app.adminCandidatePage(people);
  assert.deepStrictEqual(Array.from(page.page, p => p.name), ['anil', 'Bhavna', 'Chandra', undefined]);
  assert.strictEqual(page.total, 4);

  app.adminListState('candidates').dir = -1;
  const back = app.adminCandidatePage(people);
  assert.deepStrictEqual(Array.from(back.page, p => p.name), ['Chandra', 'Bhavna', 'anil', undefined]);
  assert.strictEqual(back.total, 4, 'and the total is the whole list either way');
});

test('the candidate list is searched by name, handle, email and phone', () => {
  const { app } = bootApp(makeStorage());
  const people = [
    { id: '1', name: 'Chandra', username: 'chand', email: 'c@x.com', phone: '111' },
    { id: '2', name: 'Anil', username: 'anil', email: 'a@x.com', phone: '222' },
    { id: '3', name: 'Bhavna', username: 'bha', email: 'b@x.com', phone: '333' }
  ];
  const by = q => { app.adminListState('candidates').q = q; return Array.from(app.adminCandidatePage(people).page, p => p.name); };

  assert.deepStrictEqual(by('bha'), ['Bhavna'], 'by handle');
  assert.deepStrictEqual(by('222'), ['Anil'], 'by phone');
  assert.deepStrictEqual(by('a@x'), ['Anil'], 'by email');
  assert.deepStrictEqual(by('an bha'), [], 'two words have to both be there');
  assert.deepStrictEqual(by(''), ['Anil', 'Bhavna', 'Chandra'], 'and an empty search is no search');
});

test('the published table pages fifteen at a time, separately from the review queue', () => {
  // Published has its own page number, so paging it must not move the review
  // queue beside it. Sharing one counter would mean clicking "Show more" on one
  // table silently scroll the other, and the two tables are different sizes.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  app._adminJobs = manyJobs(22, 'published').concat(manyJobs(41, 'draft'));
  app.repaintAdminJobs();

  assert.strictEqual(rowsRendered(dom.publishedInner.innerHTML), 15, 'fifteen published to start');
  assert.strictEqual(rowsRendered(dom.draftInner.innerHTML), 15, 'and fifteen drafts');
  assert.strictEqual(pageInfo(dom.publishedInner.innerHTML, 'published'), 'Page 1 of 2', 'it admits there is a second page');

  app.adminShowMore('published');
  assert.strictEqual(rowsRendered(dom.publishedInner.innerHTML), 7, 'the last page is the seven that were left');
  assert.strictEqual(pageInfo(dom.publishedInner.innerHTML, 'published'), 'Page 2 of 2');
  assert.strictEqual(rowsRendered(dom.draftInner.innerHTML), 15, 'and the review queue did not move');
  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 1 of 3', 'nor did its pager');

  assert.strictEqual(btnDisabled(dom.publishedInner.innerHTML, 'more'), true, 'nothing left to offer on this table');
  assert.strictEqual(btnDisabled(dom.publishedInner.innerHTML, 'prev'), false, 'but there is somewhere to go back to');
});

test('paging the candidates ignores whatever the job lists are holding', () => {
  // "Show more" works out the current page by asking the list itself where it is.
  // If the candidates ever borrowed the job queue's answer, the candidate page
  // would follow the job queue's size, which is unrelated to it.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  app._adminCandidatesCache = Array.from({ length: 40 }, (_, i) => ({
    id: String(i), username: 'u' + i, name: `Person ${String(i).padStart(2, '0')}`, profile_status: 'draft'
  }));
  app._adminJobs = manyJobs(41, 'draft').concat(manyJobs(22, 'published'));
  app.repaintAdminCandidates();
  app.repaintAdminJobs();

  app.adminShowMore('candidates');
  assert.strictEqual(pageInfo(dom.candidatesPager.innerHTML, 'candidates'), 'Page 2 of 3',
    'three candidate pages, not however many pages the job lists have');
  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 1 of 3', 'the review queue stayed put');
});

test('the candidates view describes the candidates', () => {
  // adminViewFor is how a list is asked where it currently is. Answering that
  // question from the other list would still land on the right page whenever the
  // answer came back as one, which is most of the time, and on the wrong one
  // otherwise. The total is what gives it away.
  const { app } = bootApp(makeStorage());
  app._adminCandidatesCache = Array.from({ length: 40 }, (_, i) => ({
    id: String(i), username: 'u' + i, name: `Person ${i}`, profile_status: 'draft'
  }));
  app._adminJobs = manyJobs(41, 'draft').concat(manyJobs(22, 'published'));

  assert.strictEqual(app.adminViewFor('candidates').total, 40, 'the candidates, all forty');
  assert.strictEqual(app.adminViewFor('candidates').pageCount, 3);
  assert.strictEqual(app.adminViewFor('draft').total, 41, 'and the review queue still describes itself');
});

test('both pager buttons are wired to the methods that move the page', () => {
  // A pager that renders but does nothing is the worst outcome: it looks like
  // paging works, and the admin finds out at the worst moment.
  const { app } = bootApp(makeStorage());
  const html = app.adminPager('draft', { pageNo: 2, pageCount: 3, hasPrev: true, hasNext: true });
  assert.ok(html.includes(`onclick="app.adminPrevPage('draft')"`), 'Back goes back a page');
  assert.ok(html.includes(`onclick="app.adminShowMore('draft')"`), 'Show more goes forward a page');
  assert.ok(/data-admin-prev="draft"/.test(html), 'and Back carries its hook');
  assert.ok(/data-admin-more="draft"/.test(html), 'and so does Show more');
});

test('the candidate pager host in the markup is the host the repaint looks for', () => {
  // Those two ids are a pair nothing else connects. The dashboard markup names the
  // element; repaintAdminCandidates finds it by id to draw the next page into it.
  // Renaming one without the other leaves the pager permanently stale, and the
  // lookup is guarded by `if (pager)` so it fails quietly rather than loudly.
  // The test harness supplies its own host, so only reading the source can catch it.
  const source = read('app.js');

  const looked = source.match(/const pager = document\.getElementById\('([^']+)'\)/);
  assert.ok(looked, 'the repaint looks the pager host up by id');
  const hostId = looked[1];
  assert.ok(
    source.includes(`id="${hostId}"`),
    `the dashboard markup declares id="${hostId}", the id the repaint looks for`
  );
  assert.ok(
    /<div id="admin-candidates-pager">\$\{this\.adminPager\('candidates'/.test(source),
    'and that host is drawn with the candidates pager, not left empty'
  );
});

test('the page number on screen is the page number that is stored', () => {
  // The clamp is written back rather than just applied for this render. Without
  // that, the stored number and the one being shown drift apart, and a later move
  // would jump from a page the admin was never on.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  app._adminJobs = manyJobs(41, 'draft');
  app.repaintAdminJobs();
  app.adminShowMore('draft');
  app.adminShowMore('draft');
  app._adminJobs = manyJobs(20, 'draft');
  app.repaintAdminJobs();

  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 2 of 2');
  assert.strictEqual(app.adminListState('draft').page, 2,
    'the stored page agrees with the one on screen, not the stale page three');
});

test('the job pagers sit below the rows and the mobile cards', () => {
  // The pager moved out of the toolbar to sit under the list, so it has to come
  // after both renderings of the list. Landing it after the table would leave it
  // above the cards on a phone, where the cards are the list that is being read.
  const { app } = bootApp(makeStorage());
  const jobs = manyJobs(30, 'draft').concat(manyJobs(22, 'published'));
  const blocks = app.adminJobsMarkup(jobs, {
    draft: app.adminJobPage(jobs, 'draft'),
    published: app.adminJobPage(jobs, 'published')
  });

  for (const key of ['draft', 'published']) {
    const html = blocks[key];
    const pager = html.indexOf(`data-admin-pager="${key}"`);
    assert.ok(pager !== -1, `${key} has a pager`);
    assert.ok(pager > html.lastIndexOf('</table>'), `${key}: the pager is below the table`);
    const cards = html.indexOf('md:hidden', html.lastIndexOf('</table>'));
    assert.ok(cards === -1 || pager > cards, `${key}: and below the mobile cards`);
  }
});

test('a list that fits on one page gets no pager at all', () => {
  // Not a disabled pager: none. Two dead buttons on a nine-row list is noise, and
  // "Back" and "Show more" both promising nothing is worse than neither existing.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  app._adminJobs = manyJobs(9, 'published');
  app.repaintAdminJobs();

  assert.strictEqual(rowsRendered(dom.publishedInner.innerHTML), 9, 'all nine are shown');
  assert.strictEqual(hasPager(dom.publishedInner.innerHTML), false, 'and there is nothing to page through');
  assert.match(dom.counters.published.textContent, /9 rows/, 'the count says this is all of them');
});

test('a new search starts at fifteen even when the previous one was paged deep', () => {
  // The existing search test proves the reset only because its own search matched
  // fewer than a page. This one pages deep first and then searches something with
  // more than a page behind it, which is the case where carrying the old depth
  // over would drop the admin on page two of a fresh search.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  app._adminJobs = manyJobs(41, 'draft');
  app.repaintAdminJobs();

  app.adminShowMore('draft');
  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 2 of 3', 'paged deep');

  app.adminOnSearch('draft', 'acme');
  // 41 drafts, half of them Acme, so the match is bigger than one page.
  assert.strictEqual(pageInfo(dom.draftInner.innerHTML, 'draft'), 'Page 1 of 2',
    'a fresh search starts at one page, not at the page the last one reached');
  assert.strictEqual(rowsRendered(dom.draftInner.innerHTML), 15);
});

test('the candidate list pages fifteen at a time', () => {
  const { app } = bootApp(makeStorage());
  const people = Array.from({ length: 40 }, (_, i) => ({ id: String(i), name: `Person ${String(i).padStart(2, '0')}` }));
  const first = app.adminCandidatePage(people);
  assert.strictEqual(first.shown, 15);
  assert.strictEqual(first.matched, 40);
  assert.strictEqual(first.pageNo, 1);
  assert.strictEqual(first.pageCount, 3, 'forty names is three pages of fifteen');
  assert.strictEqual(first.hasPrev, false, 'nothing behind the first page');
  assert.strictEqual(first.hasNext, true, 'and two pages ahead');

  app.adminListState('candidates').page = 2;
  const second = app.adminCandidatePage(people);
  assert.strictEqual(second.page.length, 15, 'a page is fifteen rows, not thirty');
  assert.strictEqual(second.page[0].name, 'Person 15', 'the second page starts where the first stopped');
  assert.strictEqual(second.page[14].name, 'Person 29');
  assert.strictEqual(second.hasPrev, true, 'and there is a page to go back to');
});

test('the candidate pager is drawn under the list and follows the page', () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  app._adminCandidatesCache = Array.from({ length: 40 }, (_, i) => ({
    id: String(i), username: 'u' + i, name: `Person ${String(i).padStart(2, '0')}`, profile_status: 'draft'
  }));
  app.repaintAdminCandidates();

  assert.strictEqual(pageInfo(dom.candidatesPager.innerHTML, 'candidates'), 'Page 1 of 3');
  assert.strictEqual(btnDisabled(dom.candidatesPager.innerHTML, 'prev'), true, 'Back is dead on page one');

  app.adminShowMore('candidates');
  assert.strictEqual(pageInfo(dom.candidatesPager.innerHTML, 'candidates'), 'Page 2 of 3');
  assert.ok(dom.candidatesTbody.innerHTML.includes('Person 15'), 'and the rows moved with it');
  assert.ok(!dom.candidatesTbody.innerHTML.includes('Person 00'), 'the first page is not still on top');

  app.adminPrevPage('candidates');
  assert.strictEqual(pageInfo(dom.candidatesPager.innerHTML, 'candidates'), 'Page 1 of 3');
  assert.ok(dom.candidatesTbody.innerHTML.includes('Person 00'), 'and Back brings it back');
});

test('a candidate list that fits on one page gets no pager', () => {
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  app._adminCandidatesCache = Array.from({ length: 11 }, (_, i) => ({
    id: String(i), username: 'u' + i, name: `Person ${i}`, profile_status: 'draft'
  }));
  app.repaintAdminCandidates();

  assert.strictEqual(hasPager(dom.candidatesPager.innerHTML), false, 'eleven names need no paging');
});

test('the sort button says which way round the names run', () => {
  // The rows are repainted, the button is not: if the label is not told, it keeps
  // saying A-Z over a list that is now Z-A.
  const { app, sandbox } = bootApp(makeStorage());
  const dom = makeJobsDom();
  sandbox.document = dom.document;
  app._adminCandidatesCache = [{ id: '1', name: 'B' }, { id: '2', name: 'A' }];
  app.repaintAdminCandidates();

  assert.strictEqual(dom.sortLabel.textContent, 'A–Z', 'to begin with');
  app.adminSortCandidates();
  assert.strictEqual(dom.sortLabel.textContent, 'Z–A', 'and to follow the list when it flips');
  assert.strictEqual(app.adminCandidatePage(app._adminCandidatesCache).page[0].name, 'B', 'which really is the order on screen');
});

test('a search term cannot break out of the empty state it is printed in', () => {
  // The search box is fed by a person, and the "nothing matched" line prints what
  // they typed. Escaped at the one place that renders a message, so no caller has
  // to remember to.
  const { app } = bootApp(makeStorage());
  const hostile = '"><img src=x onerror=alert(1)>';

  app.adminListState('draft').q = hostile;
  const jobs = app.renderAdminJobsSection(manyJobs(3, 'draft'));
  assert.ok(!jobs.includes('<img src=x'), 'the job table does not render it as markup');
  assert.match(jobs, /&lt;img src=x/, 'it is printed as the text that was typed');

  app.adminListState('candidates').q = hostile;
  const page = app.adminCandidatePage([]);
  assert.match(app.adminEmptyState(6, 'badge', app.adminCandidateEmptyText(page)), /&lt;img src=x/);
  assert.ok(!app.adminCandidateCardsEmpty(page).includes('<img src=x'), 'and the phone card is safe too');

  // The other two empty states are literals, and stay readable.
  assert.match(app.adminEmptyState(5, 'work_off', 'Nothing to review.'), /Nothing to review\./);
});
