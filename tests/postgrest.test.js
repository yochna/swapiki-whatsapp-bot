const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const urlOf = (p) => pathToFileURL(p).href;

async function lib() {
  return import(urlOf(path.join(ROOT, 'functions', 'lib', 'postgrest.js')));
}

test('isMissingColumnError recognises the PostgREST undefined_column shape', async () => {
  const { isMissingColumnError } = await lib();
  // The message the importer's rest() helper actually produces: status, then a
  // slice of the PostgREST JSON body.
  assert.equal(
    isMissingColumnError(new Error('Supabase POST jobs -> 400 {"code":"42703","message":"column jobs.salary_min does not exist"}')),
    true
  );
  // The message alone, for builds that flatten the body to text.
  assert.equal(isMissingColumnError(new Error('column public.jobs.salary_max does not exist')), true);
});

test('isMissingColumnError does not swallow unrelated failures', async () => {
  const { isMissingColumnError } = await lib();
  // A genuinely malformed request is also a 400, and must be reported as a real
  // failure rather than silently triggering the fallback.
  assert.equal(isMissingColumnError(new Error('Supabase POST jobs -> 400 {"code":"22P02","message":"invalid input syntax"}')), false);
  assert.equal(isMissingColumnError(new Error('Supabase GET jobs -> 401 Unauthorized')), false);
  assert.equal(isMissingColumnError(new Error('relation "jobs" does not exist')), false, 'a missing TABLE is not a missing column');
  assert.equal(isMissingColumnError(new Error('duplicate key value violates unique constraint')), false);
  // A job title containing "column ... does not exist" must not trip the check,
  // because the pattern does not interpolate a column name.
  assert.equal(isMissingColumnError(new Error('title: this column does not exist in the data')), false);
  assert.equal(isMissingColumnError(null), false);
  assert.equal(isMissingColumnError(undefined), false);
  assert.equal(isMissingColumnError(new Error('')), false);
});

test('numericOrNull turns a PostgREST numeric string into a number', async () => {
  const { numericOrNull } = await lib();
  // PostgREST serialises `numeric` as a JSON string to keep precision.
  assert.strictEqual(numericOrNull('1200000'), 1200000);
  assert.strictEqual(numericOrNull('1500000.50'), 1500000.5);
  // A real number passes through unchanged.
  assert.strictEqual(numericOrNull(2400000), 2400000);
});

test('numericOrNull refuses to invent a value from nothing', async () => {
  const { numericOrNull } = await lib();
  // Everything that is not a finite positive number collapses to null, so a
  // missing bound and a corrupt one take the same "omit it" path.
  for (const v of [null, undefined, '', 'not-a-number', NaN, 0, -1, Infinity, -Infinity, '0', '-5', {}, []]) {
    assert.strictEqual(numericOrNull(v), null, `${JSON.stringify(v)} must not become a salary`);
  }
});
