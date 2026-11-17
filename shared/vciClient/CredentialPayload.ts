/**
 * Normalize the MOSIP VCI SDK's credential response using the same principle
 * as Manas Wallet's responseCredential + unwrapCredential + parseCredential.
 *
 * This is deliberately format-preserving: JSON-LD objects are parsed once,
 * and JWT/SD-JWT/mdoc strings remain exactly as issued. Never reconstruct
 * or modify issuer-signed claims or cryptographic proof material.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function unwrapIssuedCredential(response: unknown): unknown {
  let value = response;
  for (let i = 0; i < 5; i++) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) break;
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          value = JSON.parse(trimmed);
          continue;
        } catch {
          // The native SDK may return a string credential format.
        }
      }
    }
    if (!isRecord(value)) break;
    if ('credentialSubject' in value || '@context' in value ||
        'proof' in value || 'issuerSigned' in value) break;
    const next = value.credential ?? value.verifiableCredential ?? value.vc;
    if (next == null || next === value) break;
    value = next;
  }
  return value;
}

export function normalizeVciCredentialResponse(response: unknown): {
  credential: unknown;
  credentialConfigurationId: string;
  credentialIssuer: string;
} {
  let decoded: unknown = response;
  if (typeof decoded === 'string') {
    try { decoded = JSON.parse(decoded); }
    catch { throw new Error('Invalid native VCI credential response'); }
  }
  if (!isRecord(decoded)) {
    throw new Error('Native VCI returned an empty credential response');
  }

  const credential = unwrapIssuedCredential(
    decoded.credential ?? decoded.verifiableCredential ?? decoded.vc,
  );
  if (!(isRecord(credential) || (typeof credential === 'string' && credential.trim()))) {
    throw new Error('Native VCI response does not contain a credential');
  }
  const credentialConfigurationId = decoded.credentialConfigurationId;
  const credentialIssuer = decoded.credentialIssuer;
  return {
    credential,
    credentialConfigurationId: typeof credentialConfigurationId === 'string'
      ? credentialConfigurationId : '',
    credentialIssuer: typeof credentialIssuer === 'string' ? credentialIssuer : '',
  };
}
