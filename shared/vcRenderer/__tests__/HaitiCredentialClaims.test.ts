import {getHaitiCredentialRows, getHaitiCredentialSubject} from '../HaitiCredentialClaims';

describe('Haiti VC claims: reference Manas Wallet behavior', () => {
  test('reads localized fullName and Haiti section/localite values', () => {
    const vc = {credentialSubject: {
      id: 'did:example:holder',
      fullName: [
        {language: 'en', value: 'Jane Citizen'},
        {language: 'fra', value: 'Jeanne Citoyenne'},
      ],
      dateOfBirth: '1994/01/01',
      gender: [{language: 'en', value: 'Male'}],
      department: 'OUEST',
      commune: 'PORT-AU-PRINCE',
      section: '1re section',
      localite: 'Bel Air',
      claim169: {en: 'ISSUER-QRCODE'},
      face: 'data:image/png;base64,AABB',
    }};
    const rows = getHaitiCredentialRows(vc);
    const byLabel = (label: string) => rows.find(row => row.label === label)?.value;
    expect(byLabel('Nom complet')).toBe('Jeanne Citoyenne');
    expect(byLabel('Date de naissance')).toBe('1994/01/01');
    expect(byLabel('Sexe')).toBe('Masculin');
    expect(byLabel('Section communale')).toBe('1re section');
    expect(byLabel('Localité')).toBe('Bel Air');
    expect(rows.some(row => row.value === 'ISSUER-QRCODE')).toBe(false);
    expect(rows.some(row => row.value.includes('did:example'))).toBe(false);
  });

  test('unwraps stored credential and reads nested UIN', () => {
    const signedVc = {credential: {credentialSubject: {
      name: {fr: 'Jean-Pierre Exemple'},
      nested: {UIN: '123456789012'},
      dateOfBirth: '2000/06/09',
    }}};
    expect(getHaitiCredentialSubject(signedVc)).toEqual(signedVc.credential.credentialSubject);
    const rows = getHaitiCredentialRows(signedVc);
    expect(rows.find(row => row.label === 'UIN')?.value).toBe('123456789012');
    expect(rows.find(row => row.label === 'Nom')?.value).toBe('Jean-Pierre Exemple');
  });

  test('does not invent an identifier from credentialSubject.id', () => {
    const vc = {credentialSubject: {
      id: 'did:web:subject.example',
      fullName: [{language: 'en', value: 'A Person'}],
    }};
    const rows = getHaitiCredentialRows(vc);
    expect(rows.some(row => row.label === 'UIN' || row.label === 'VID')).toBe(false);
  });
});
