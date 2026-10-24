// Only requests under the reserved short-link prefixes (/a, /w, /t) reach this code; see
// run_worker_first in wrangler.jsonc. Everything else is served straight from static assets.
// Short links are not built yet, so these paths answer with the site's 404 page.

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
};

export default {
  async fetch(request, env) {
    const page = await env.ASSETS.fetch(new URL('/404', request.url));
    // _headers rules don't apply to Worker responses, so carry the asset's CSP over explicitly.
    const csp = page.headers.get('Content-Security-Policy');
    return new Response(page.body, {
      status: 404,
      headers: csp ? { ...HEADERS, 'Content-Security-Policy': csp } : HEADERS,
    });
  },
};
