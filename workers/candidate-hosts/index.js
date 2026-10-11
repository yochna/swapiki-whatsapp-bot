// Swapiki subdomain proxy — forwards any *.swapiki.com request to the
// same app served at https://swapiki.com, unchanged apart from the hostname.
//
// Why this exists: the app routes by `window.location.hostname`, so
// `https://<username>.swapiki.com` must keep the candidate subdomain in the
// visitor's address bar WHILE serving the candidate's profile. The visitor's
// browser still shows khushi12.swapiki.com the whole time; the host rewrite
// happens server-side, so the Router's existing subdomain logic works as
// written.
//
// The previous version of this worker forwarded to `swapiki.pages.dev` — but
// Cloudflare Pages 301-redirects its own `pages.dev` domain to the attached
// custom domain (`swapiki.com`), so every candidate link bounced to the app
// dashboard. Fetching the custom domain itself (served with a 200) avoids
// that. Worker subrequests to swapiki.com do NOT re-enter this `*.swapiki.com`
// route, so there is no loop. Everything else is a pass-through: method, body,
// query string, headers.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      const target = `https://swapiki.com${url.pathname}${url.search}`;
      const proxied = new Request(target, request);
      proxied.headers.set('host', 'swapiki.com');
      const response = await fetch(proxied);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch (err) {
      return new Response(`subdomain proxy error: ${err.message}`, { status: 502 });
    }
  }
};