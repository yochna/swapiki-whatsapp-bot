// Swapiki subdomain proxy — forwards any *.swapiki.com request to the
// existing swapiki.pages.dev deployment, unchanged apart from the hostname.
// The visitor's browser still shows the real khushi.swapiki.com address the
// whole time; this rewrite happens server-side, so js/app.js's existing
// window.location.hostname routing logic keeps working exactly as written.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const originalHost = request.headers.get('Host') || url.hostname;
    url.hostname = "swapiki.pages.dev";
    const headers = new Headers(request.headers);
    headers.set('X-Original-Host', originalHost);
    const proxied = new Request(url.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual'
    });
    return fetch(proxied);
  }
};
