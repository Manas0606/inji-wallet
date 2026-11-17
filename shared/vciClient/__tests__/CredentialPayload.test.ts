import {
  normalizeVciCredentialResponse,
  unwrapIssuedCredential,
} from '../CredentialPayload';

const ldpVc = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential', 'MOSIPVerifiableCredential'],
  credentialSubject: {
    fullName: [{language: 'fra', value: 'Marie Exemple'}],
    UIN: '123456789012',
    claim169: {en: 'signed-issuer-qr-data'},
  },
  proof: {type: 'Ed25519Signature2020', jws: 'signed-proof-test-only'},
};

describe('Manas Wallet compatible VCI response handling', () => {
  test('unwraps JSON-encoded LDP credential from native VCI response', () => {
    const response = JSON.stringify({
      credential: JSON.stringify(ldpVc),
      credentialConfigurationId: 'MOSIPVerifiableCredential',
      credentialIssuer: 'https://injicertify.haiti-pilot.mosip.net',
    });
    expect(normalizeVciCredentialResponse(response)).toEqual({
      credential: ldpVc,
      credentialConfigurationId: 'MOSIPVerifiableCredential',
      credentialIssuer: 'https://injicertify.haiti-pilot.mosip.net',
    });
  });

  test('unwraps nested VCI credential envelopes without altering proof', () => {
    const normalized = normalizeVciCredentialResponse({
      credential: {credential: {vc: ldpVc}},
    });
    expect(normalized.credential).toEqual(ldpVc);
  });

  test('keeps signed JWT and SD-JWT strings exactly as received', () => {
    const compactJwt = 'a.b.c~disclosure~';
    expect(normalizeVciCredentialResponse({credential: compactJwt}).credential)
      .toBe(compactJwt);
    expect(unwrapIssuedCredential(compactJwt)).toBe(compactJwt);
  });

  test('rejects empty or non-credential responses', () => {
    expect(() => normalizeVciCredentialResponse({credential: null})).toThrow();
    expect(() => normalizeVciCredentialResponse('{}')).toThrow();
  });
});
