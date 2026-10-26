const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const PC_URL = pathToFileURL(path.join(ROOT, 'functions', 'lib', 'page-cache.js')).href;

/** A stand-in for `caches.default` that remembers whole responses by key. */
function fakeCaches() {
  const store = new Map();
  return {
    store,
    default: {
      async match(key) {
        const entry = store.get(key);
        return entry
          ? new Response(entry.body, { status: entry.status, headers: entry.headers })
          : undefined;
      },
      async put(key, res) {
        store.set(key, {
          status: res.status,
          body: await res.text(),
          headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/html; charset=utf-8' }
        });
      }
    }
  };
}

/** A handler context of the shape Cloudflare Pages actually passes. */
const ctxOf = (url = 'https://swapiki.com/jobs') => ({
  request: new Request(url),
  waitUntil: () => {}
});

async function withCaches(fake, fn) {
  const previous = globalThis.caches;
  globalThis.caches = fake;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete globalThis.caches;
    else globalThis.caches = previous;
  }
}

test('without a Cache API the helpers do nothing and never throw', async () => {
  const pc = await import(PC_URL);
  const previous = globalThis.caches;
  delete globalThis.caches;
  try {
    assert.equal(await pc.cacheMatch(ctxOf()), null);
    assert.doesNotThrow(() => pc.cachePut(ctxOf(), new Response('body', { status: 200 })));
  } finally {
    if (previous !== undefined) globalThis.caches = previous;
  }
});

test('a context without waitUntil is not treated as cacheable', async () => {
  const pc = await import(PC_URL);
  const fake = fakeCaches();
  await withCaches(fake, async () => {
    const noWait = { request: new Request('https://swapiki.com/jobs') };
    assert.equal(await pc.cacheMatch(noWait), null);
    pc.cachePut(noWait, new Response('body', { status: 200 }));
    await new Promise((r) => setImmediate(r));
    assert.equal(fake.store.size, 0, 'a context with no waitUntil must opt out of caching');
  });
});

test('only a complete 200 is worth storing', async () => {
  const pc = await import(PC_URL);
  const fake = fakeCaches();
  await withCaches(fake, async () => {
    for (const status of [200, 301, 404, 500]) {
      pc.cachePut(ctxOf(`https://swapiki.com/jobs/x/${status}`), new Response('body', { status }));
    }
    await new Promise((r) => setImmediate(r));
    const statuses = [...fake.store.values()].map((e) => e.status);
    assert.deepEqual(statuses, [200], `stored ${JSON.stringify(statuses)}, want only the 200`);
  });
});

test('the key carries the hour, so no page outlives its content', async () => {
  const pc = await import(PC_URL);
  const fake = fakeCaches();
  const HOUR = 1_000_000;
  const realNow = Date.now;
  await withCaches(fake, async () => {
    try {
      Date.now = () => HOUR * 36e5 + 5_000;
      pc.cachePut(ctxOf('https://swapiki.com/jobs'), new Response('board', { status: 200 }));
      await new Promise((r) => setImmediate(r));

      const [key] = [...fake.store.keys()];
      assert.match(key, new RegExp(`_ch=${HOUR}(&|$)`), `cache key ${key} is not stamped with the hour`);

      // Warm within the same hour.
      Date.now = () => HOUR * 36e5 + 60_000;
      const warm = await pc.cacheMatch(ctxOf('https://swapiki.com/jobs'));
      assert.ok(warm, 'a copy stored moments ago must be found');
      assert.equal(await warm.text(), 'board');

      // The hour rolls: the old copy must never be served again, because a role
      // that stopped being published has to stop appearing within the hour.
      Date.now = () => (HOUR + 1) * 36e5 + 1_000;
      assert.equal(await pc.cacheMatch(ctxOf('https://swapiki.com/jobs')), null);
    } finally {
      Date.now = realNow;
    }
  });
});

test('cached() runs the builder once and reuses the stored copy', async () => {
  const pc = await import(PC_URL);
  const fake = fakeCaches();
  await withCaches(fake, async () => {
    let builds = 0;
    const build = async () => {
      builds += 1;
      return new Response(`built ${builds}`, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    };
    const first = await pc.cached(ctxOf('https://swapiki.com/jobs.json'), build);
    assert.equal(await first.text(), 'built 1');
    const second = await pc.cached(ctxOf('https://swapiki.com/jobs.json'), build);
    assert.equal(await second.text(), 'built 1', 'the second call rebuilt instead of reading the edge');
    assert.equal(builds, 1);
  });
});

test('the body is left intact for the caller, because the copy is a clone', async () => {
  const pc = await import(PC_URL);
  const fake = fakeCaches();
  await withCaches(fake, async () => {
    const res = new Response('<html>page</html>', { status: 200 });
    pc.cachePut(ctxOf(), res);
    assert.equal(await res.text(), '<html>page</html>', 'put() consumed the response the route returns');
    await new Promise((r) => setImmediate(r));
    const stored = await pc.cacheMatch(ctxOf());
    assert.equal(await stored.text(), '<html>page</html>');
  });
});
