const encoder = new TextEncoder();

async function serveLibrary(request, env) {
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });

  if (!env.LIBRARY_PASSWORD) {
    return new Response('The private library is unavailable.', { status: 503, headers });
  }

  const authorization = request.headers.get('Authorization') || '';
  const credentials = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  let authenticated = false;

  if (credentials) {
    let supplied;
    try {
      supplied = Uint8Array.from(atob(credentials[1]), char => char.charCodeAt(0));
    } catch {
      // An invalid credential receives the same challenge as an absent one.
    }

    if (supplied) {
      const [expectedDigest, suppliedDigest] = await Promise.all([
        crypto.subtle.digest('SHA-256', encoder.encode(`library:${env.LIBRARY_PASSWORD}`)),
        crypto.subtle.digest('SHA-256', supplied),
      ]);
      authenticated = crypto.subtle.timingSafeEqual(expectedDigest, suppliedDigest);
    }
  }

  if (!authenticated) {
    headers.set('WWW-Authenticate', 'Basic realm="Snippet Library", charset="UTF-8"');
    return new Response('Sign in to the private Snippet Library.', { status: 401, headers });
  }

  const asset = await env.ASSETS.fetch(request);
  const response = new Response(asset.body, asset);
  response.headers.set('Cache-Control', headers.get('Cache-Control'));
  return response;
}

export default { fetch: serveLibrary };
