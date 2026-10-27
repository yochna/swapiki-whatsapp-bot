import { getProfileForHandle, injectProfileMeta, injectNoindex, renderProfileHTML } from './profile-ssr.js';

// Handles three things, in this order:
//
//   1. Profile SSR. A candidate profile lives at https://<handle>.swapiki.com/.
//      The wildcard DNS record sends those requests to the subdomain-proxy
//      Worker, which forwards them here and stamps the real host into
//      X-Original-Host. For a published handle we serve the deployed shell with
//      its <head> rewritten (title, description, canonical, Open Graph, Person
//      JSON-LD) so the profile is crawlable while every visitor still gets the
//      full SPA. A non-published handle falls through to the SPA unchanged.
//
//   2. /u/<handle> and /sites/<handle> on the apex get the same treatment.
//
//   3. The production pages.dev host still 301s to swapiki.com so it cannot be
//      indexed separately — but never when X-Original-Host is present, since
//      that header means the proxy worker deliberately fronted a real subdomain.
//
// CRITICAL: the redirect must only match the PRODUCTION project's hostnames.
// The test/preview environment (swapiki-test.pages.dev and its <hash>.swapiki-test
// subdomains) must NOT be redirected, or the test site is unreachable.

const CANONICAL_HOST = 'swapiki.com';
const PROD_PAGES_HOST = 'swapiki.pages.dev';

const cacheHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=900, s-maxage=3600'
};

// A profile subdomain is a real host with no robots.txt of its own, so a request
// for one would otherwise fall through to the SPA and return HTML. Google reads
// an unparseable robots.txt as "allow all", but a real file removes the warning
// and points every crawler at the one sitemap that lists these profiles.
const ROBOTS_TXT = [
  'User-agent: *',
  'Allow: /',
  '',
  `Sitemap: https://${CANONICAL_HOST}/sitemap.xml`,
  ''
].join('\n');

const robotsHeaders = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, s-maxage=86400'
};

async function shellResponse(request, env, transform, fallback) {
  // Prefer rewriting the real shell so the visitor keeps the full SPA. Fall
  // back to a self-contained page if the asset cannot be read.
  try {
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const shellUrl = new URL('/', request.url).toString();
      const res = await env.ASSETS.fetch(new Request(shellUrl, { headers: { Accept: 'text/html' } }));
      if (res.ok) {
        return new Response(transform(await res.text()), { status: 200, headers: cacheHeaders });
      }
    }
  } catch (e) {
    // fall through to the standalone page
  }
  return fallback ? new Response(fallback, { status: 200, headers: cacheHeaders }) : null;
}

/**
 * Resolve a handle to a response, or null when we genuinely could not tell
 * (a transient Supabase failure), in which case the caller falls through to the
 * SPA. A definitive miss serves the SPA shell marked noindex so the wildcard
 * DNS cannot turn every random subdomain into an indexable homepage duplicate.
 */
async function profileResponse(request, env, handle) {
  let profile;
  try {
    profile = await getProfileForHandle(handle, env);
  } catch (e) {
    return null;
  }

  if (profile) {
    return shellResponse(
      request, env,
      (html) => injectProfileMeta(html, handle, profile),
      renderProfileHTML(handle, profile)
    );
  }

  // Definitely not a published profile (unknown handle or a draft): keep the
  // SPA so a draft owner can still preview, but keep crawlers out.
  return shellResponse(request, env, injectNoindex, null);
}

// Paths that must never be served, whatever the asset store happens to hold.
//
// A Pages deployment publishes the staged runtime directory as static assets.
// If a secret file ever lands in that directory - a .env, a key, a service
// account JSON - it becomes a public URL, and Cloudflare's edge will keep
// serving the cached copy for as long as the asset TTL lasts, even after the
// deployment is deleted. The only reliable fix is to never publish it AND to
// refuse the path at the edge, which is what this list does.
//
// The check is on the PATH SEGMENTS, not on an exact path, so a file nested
// deeper (whatsapp-bot/.env, worker/scheduler/.dev.vars) is caught too.
const DENIED_PATH_SEGMENTS = new Set([
  '.env', '.env.local', '.env.production', '.dev.vars', '.dev.vars.local',
  'node_modules', '.git', '.wrangler', '.ssh', '.aws', '.config',
  'whatsapp-bot', 'worker_setup', 'worker', 'workers', 'supabase'
]);

const DENIED_FILE_SUFFIXES = [
  '.env', '.pem', '.key', '.p12', '.pfx', '.crt', '.cer',
  'id_rsa', 'id_ed25519', 'credentials', 'service-account.json'
];

const isDeniedPath = (pathname) => {
  const parts = pathname.split('/').filter(Boolean);
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (DENIED_PATH_SEGMENTS.has(lower)) return true;
    if (DENIED_FILE_SUFFIXES.some((s) => lower.endsWith(s))) return true;
    if (lower.endsWith('.json') && (lower.includes('service-account') || lower.includes('service_account'))) return true;
  }
  return false;
};

// Files the page loads after the HTML document: scripts, styles, images, fonts,
// media. On a profile subdomain these MUST come straight from the Pages asset
// store. The profile branch below answers every request with the HTML shell, so
// without this exemption /dist/js/app.js came back as HTML, the browser threw
// "Unexpected token '<'" on every script, and the candidate link sat on its
// loading spinner forever. Feeds and documents (.xml, .json, .txt, .html) are
// deliberately NOT listed, so they keep the behaviour they always had.
const STATIC_ASSET_EXT = /\.(?:js|mjs|css|map|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp3|m4a|wav|mp4|webm)$/i;
const isStaticAssetPath = (pathname) => STATIC_ASSET_EXT.test(pathname);

const deniedHeaders = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex'
};

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const request = context.request;
  const env = context.env || {};

  // The proxy worker rewrites the hostname to swapiki.pages.dev, so the real
  // visitor host only survives in X-Original-Host. Fall back to the Host
  // header (a direct hit on a configured custom domain) and then to url.
  const forwardedHost = request.headers.get('X-Original-Host');
  const host = (forwardedHost || request.headers.get('host') || url.hostname).toLowerCase();
  const pathname = url.pathname;

  // 0. Never serve a path that could carry a secret, regardless of what the
  //    asset store holds. This runs before anything else so a stray .env in
  //    the published directory is a 404, not a public key.
  if (isDeniedPath(pathname)) {
    return new Response('Not found', { status: 404, headers: deniedHeaders });
  }

  // 1. Subdomain profile page: https://<handle>.swapiki.com/
  if (host.endsWith('.' + CANONICAL_HOST) && host !== 'www.' + CANONICAL_HOST) {
    const sub = host.slice(0, -(CANONICAL_HOST.length + 1));
    if (sub && sub !== 'www') {
      if (pathname === '/robots.txt') {
        return new Response(ROBOTS_TXT, { status: 200, headers: robotsHeaders });
      }
      // Static files are never a profile page: let Pages serve the real file.
      if (isStaticAssetPath(pathname)) {
        return context.next();
      }
      const response = await profileResponse(request, env, sub);
      return response || context.next();
    }
  }

  // 2. Apex profile URLs: /u/<handle> and /sites/<handle>
  if (host === CANONICAL_HOST || host === 'www.' + CANONICAL_HOST) {
    const match = pathname.match(/^\/(?:u|sites)\/([^/?#]+)/);
    if (forwardedHost === null && match) {
      const response = await profileResponse(request, env, decodeURIComponent(match[1]));
      if (response) return response;
    }
  }

  // 3. The prod pages.dev host 301s to the canonical apex, unless the proxy
  //    worker deliberately forwarded a real subdomain (X-Original-Host set).
  const isProdPagesHost =
    url.hostname === PROD_PAGES_HOST ||
    url.hostname.endsWith('.' + PROD_PAGES_HOST);

  if (isProdPagesHost && forwardedHost === null) {
    url.hostname = CANONICAL_HOST;
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}