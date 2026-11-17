// Haiti adaptation of Manas Wallet's credentialClaims.ts behavior:
// read the actual signed VC, recursively walk primitive/localized claims,
// exclude cryptographic and biometric internals, and preserve all visible fields.
// No database lookup and no synthetic UIN/VID.
export type HaitiClaimRow = {
  path: string;
  key: string;
  label: string;
  value: string;
  priority: number;
};

const normalizeKey = (value: string) =>
  value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const labels: Record<string, string> = {
  fullname: 'Nom complet',
  name: 'Nom',
  firstname: 'Prénom',
  givenname: 'Prénom',
  middlename: 'Deuxième prénom',
  lastname: 'Nom',
  familyname: 'Nom',
  surname: 'Nom',
  dateofbirth: 'Date de naissance',
  birthdate: 'Date de naissance',
  dob: 'Date de naissance',
  gender: 'Sexe',
  sex: 'Sexe',
  uin: 'UIN',
  vid: 'VID',
  individualid: 'Identifiant individuel',
  mosipindividualid: 'Identifiant individuel',
  nationalid: 'Numéro d’identification nationale',
  idnumber: 'Numéro d’identification',
  documentnumber: 'Numéro du document',
  personalnumber: 'Numéro personnel',
  nationality: 'Nationalité',
  citizenship: 'Nationalité',
  maritalstatus: 'État civil',
  email: 'Adresse e-mail',
  emailaddress: 'Adresse e-mail',
  phone: 'Téléphone',
  phonenumber: 'Téléphone',
  mobilenumber: 'Téléphone',
  mobile: 'Téléphone',
  telephone: 'Téléphone',
  department: 'Département',
  commune: 'Commune',
  communalsection: 'Section communale',
  locality: 'Localité',
  placeofbirth: 'Lieu de naissance',
  address: 'Adresse',
  addressline1: 'Adresse',
  addressline2: 'Complément d’adresse',
  city: 'Ville',
  state: 'État',
  district: 'District',
  postalcode: 'Code postal',
  country: 'Pays',
  profession: 'Profession',
  occupation: 'Profession',
  educationlevel: 'Niveau d’instruction',
  disability: 'Handicap',
};
const priority: Record<string, number> = {
  fullname: 1, name: 2,
  firstname: 3, givenname: 3,
  lastname: 4, familyname: 4, surname: 4, middlename: 5,
  uin: 6, vid: 6, individualid: 6, mosipindividualid: 6,
  nationalid: 7, idnumber: 7, documentnumber: 7, personalnumber: 7,
  dateofbirth: 8, birthdate: 8, dob: 8, gender: 9, sex: 9,
  nationality: 10, department: 11, commune: 12, communalsection: 13, locality: 14,
};
const excluded = new Set([
  'id', 'context', 'type', 'issuer', 'issuancedate', 'validfrom',
  'expirationdate', 'validuntil', 'proof', 'credentialstatus',
  'credentialstatusid', 'credentialschema', 'schema', 'rendermethod',
  'claim169', 'identityqrcode', 'faceqrcode', 'qrcode', 'qrcodedata',
  'qrcodeimage', 'qrdata', 'photo', 'portrait', 'picture', 'image',
  'face', 'biometrics', 'fingerprint', 'iris', 'signature',
  'termsofuse', 'evidence', 'refreshservice', 'iss', 'sub', 'aud',
  'iat', 'exp', 'nbf', 'jti', 'sd', 'sdalg', 'cnf', 'nonce', 'vct',
]);

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

export function getHaitiCredentialSubject(vc: unknown): unknown {
  let node: unknown = vc;
  // Matches Manas Wallet's wrapper normalization, but guards against loops.
  for (let depth = 0; depth < 4 && record(node); depth++) {
    if ('credentialSubject' in node) return node.credentialSubject;
    if (record(node.fullResolvedPayload) &&
        'credentialSubject' in node.fullResolvedPayload) {
      return node.fullResolvedPayload.credentialSubject;
    }
    const nested = node.credential ?? node.verifiableCredential ?? node.vc ??
      node.fullResolvedPayload;
    if (!nested || nested === node) break;
    node = nested;
  }
  return undefined;
}

const primitive = (value: unknown): string | undefined => {
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  if (!clean || clean.length > 5000 || /^(?:data:image|iVBOR|\/9j\/)/i.test(clean)) return undefined;
  return clean;
};

const localized = (value: unknown, language: string): string | undefined => {
  if (!record(value)) return undefined;
  if ('language' in value || 'locale' in value) {
    return primitive(value.value) ?? primitive(value.text) ?? primitive(value.name);
  }
  return primitive(value[language]) ?? primitive(value.value);
};

const displayValue = (value: unknown): string | undefined => {
  const plain = primitive(value);
  if (plain !== undefined) return plain;
  if (Array.isArray(value)) {
    for (const language of ['fra', 'fr', 'fr-HT', 'eng', 'en']) {
      for (const item of value) {
        if (record(item) &&
            String(item.language ?? item.locale ?? '').toLowerCase() === language.toLowerCase()) {
          const text = localized(item, language);
          if (text) return text;
        }
      }
    }
    if (value.length === 1) return displayValue(value[0]);
    if (value.every(item => primitive(item) !== undefined)) {
      return value.map(item => primitive(item)).join(', ');
    }
  }
  if (record(value)) {
    for (const language of ['fra', 'fr', 'fr-HT', 'eng', 'en', 'value']) {
      const result = displayValue(value[language]);
      if (result) return result;
    }
  }
  return undefined;
};

const fieldLabel = (key: string) => labels[normalizeKey(key)] ||
  key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');

const formatGender = (value: string, key: string) => {
  if (!['gender', 'sex'].includes(normalizeKey(key))) return value;
  const normalized = value.toLowerCase();
  if (['male', 'm', 'masculin'].includes(normalized)) return 'Masculin';
  if (['female', 'f', 'féminin', 'feminin'].includes(normalized)) return 'Féminin';
  return value;
};

export function getHaitiCredentialRows(vc: unknown): HaitiClaimRow[] {
  const subject = getHaitiCredentialSubject(vc);
  const rows: HaitiClaimRow[] = [];
  const walk = (value: unknown, path: string[], depth: number) => {
    if (depth > 5 || rows.length >= 40) return;
    const key = path[path.length - 1] || 'value';
    const normalized = normalizeKey(key);
    if (excluded.has(normalized)) return;
    const text = displayValue(value);
    if (text !== undefined) {
      rows.push({path: path.join('.'), key,
        label: fieldLabel(key), value: formatGender(text, key),
        priority: priority[normalized] ?? 100});
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 8).forEach((v, i) =>
        walk(v, [...path, String(i + 1)], depth + 1));
    } else if (record(value)) {
      Object.entries(value).forEach(([childKey, child]) =>
        walk(child, [...path, childKey], depth + 1));
    }
  };
  if (Array.isArray(subject)) {
    subject.slice(0, 5).forEach(item => walk(item, [], 0));
  } else {
    walk(subject, [], 0);
  }
  const seen = new Set<string>();
  return rows.filter(row => {
    const marker = normalizeKey(row.label) + ':' + row.value.toLowerCase();
    if (seen.has(marker)) return false;
    seen.add(marker);
    return true;
  }).sort((a, b) => a.priority - b.priority ||
    a.label.localeCompare(b.label, 'fr'));
}
