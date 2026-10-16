const encoder = new TextEncoder();
const TOKEN_ISSUER = 'xv-antonella';
const TOKEN_AUDIENCE = 'xv-invitation';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function signingKey(secret: string): Promise<CryptoKey> {
  if (!secret || new TextEncoder().encode(secret).length < 32) {
    throw new Error('Invitation signing secret is not configured');
  }
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signInvitation(id: string, expiresAt: string, secret: string): Promise<string> {
  if (!UUID_RE.test(id)) throw new Error('Invalid invitation id');
  const header = encodeBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = encodeBase64Url(
    encoder.encode(
      JSON.stringify({
        iss: TOKEN_ISSUER,
        aud: TOKEN_AUDIENCE,
        sub: id,
        exp: Math.floor(new Date(expiresAt).getTime() / 1000),
      }),
    ),
  );
  const unsigned = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(unsigned)));
  return `${unsigned}.${encodeBase64Url(signature)}`;
}

export async function verifyInvitation(
  token: unknown,
  secret: string,
): Promise<{ id: string; exp: number } | null> {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedHeader))) as {
      alg?: unknown;
      typ?: unknown;
    };
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as {
      iss?: unknown;
      aud?: unknown;
      sub?: unknown;
      exp?: unknown;
    };
    if (
      header.alg !== 'HS256' ||
      header.typ !== 'JWT' ||
      payload.iss !== TOKEN_ISSUER ||
      payload.aud !== TOKEN_AUDIENCE ||
      typeof payload.sub !== 'string' ||
      !UUID_RE.test(payload.sub) ||
      typeof payload.exp !== 'number' ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(secret),
      decodeBase64Url(encodedSignature),
      encoder.encode(`${encodedHeader}.${encodedPayload}`),
    );
    return valid ? { id: payload.sub, exp: payload.exp } : null;
  } catch {
    return null;
  }
}
