import {VCMetadata} from '../VCMetadata';
import {getMosipIdentifier} from '../commonUtil';

// Public, versioned asset owned by the Haiti project. GitHub raw serves the
// template directly; no Certify DB, template endpoint or GitHub API token.
export const HAITI_WALLET_SVG_URL =
  'https://raw.githubusercontent.com/Manas0606/inji-config/haiti-0.14.0-aws/haiti-national-id-wallet-v2.svg';

const MAX_TEMPLATE_LENGTH = 50_000;
const REFRESH_AFTER_MS = 15 * 60 * 1000;
let cache: {source: string; loadedAt: number} | undefined;

function validateSvg(source: string): void {
  if (source.length > MAX_TEMPLATE_LENGTH ||
      !/<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/i.test(source) ||
      !/<\/svg>\s*$/i.test(source)) {
    throw new Error('Invalid Haiti SVG template');
  }
  // Remote SVG must be declarative only: do not allow scripts, references,
  // external images, event handlers, or SVG animation.
  if (/<\s*\/?\s*(script|foreignObject|image|use|iframe|animate|animateTransform|set)\b/i.test(source) ||
      /\bon[a-z]+\s*=/i.test(source) ||
      /\b(?:href|xlink:href)\s*=/i.test(source) ||
      /url\(\s*['"]?https?:/i.test(source)) {
    throw new Error('Unsupported active content in Haiti SVG template');
  }
}

export async function fetchHaitiSvgTemplate(): Promise<string> {
  if (cache && Date.now() - cache.loadedAt < REFRESH_AFTER_MS) {
    return cache.source;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(HAITI_WALLET_SVG_URL, {
      method: 'GET',
      headers: {Accept: 'image/svg+xml, text/plain'},
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Haiti template HTTP ' + response.status);
    const source = await response.text();
    validateSvg(source);
    cache = {source, loadedAt: Date.now()};
    return source;
  } catch (error) {
    // Display the last known trusted template if GitHub is temporarily offline.
    if (cache) return cache.source;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function claimText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (Array.isArray(value)) {
    const fr = value.find(entry => entry && typeof entry === 'object' &&
      ['fra', 'fr', 'fr-HT'].includes(String(entry.language ?? entry.locale ?? '')));
    if (fr) return claimText(fr.value);
    return value.length === 1 ? claimText(value[0]) : '';
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['fra', 'fr', 'fr-HT', 'eng', 'en', 'value']) {
      if (obj[key] != null) return claimText(obj[key]);
    }
  }
  return '';
}

function xmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function fillHaitiSvgTemplate(
  template: string,
  credential: unknown,
  meta: VCMetadata,
): string {
  validateSvg(template);
  const wrapped = credential as {credential?: unknown} | null;
  const actual = wrapped?.credential && typeof wrapped.credential === 'object'
    ? wrapped.credential as any : credential as any;
  const subjects = actual?.credentialSubject;
  const subject = Array.isArray(subjects) ? subjects[0] : subjects;
  const claims: Record<string, unknown> =
    subject && typeof subject === 'object' ? subject : {};
  const actualIdentifier = getMosipIdentifier(claims as any);
  // The ID comes only from credential claims; an old metadata value is not
  // a substitute for an absent claim in a newly processed signed credential.
  const identifier = actualIdentifier || '';
  return template.replace(/\{\{\s*(credentialSubject|wallet)\/([\w/-]+)\s*\}\}/g, (_, scope: string, path: string) => {
    if (scope === 'wallet') {
      return path === 'individualId' ? xmlText(identifier) : '';
    }
    let value: unknown = claims;
    for (const segment of path.split('/')) {
      if (!value || typeof value !== 'object') {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[segment];
    }
    let text = claimText(value);
    if (path === 'gender') {
      const normalized = text.toLowerCase();
      if (['male', 'm', 'masculin'].includes(normalized)) text = 'Masculin';
      if (['female', 'f', 'feminin', 'féminin'].includes(normalized)) text = 'Féminin';
    }
    // Restrict free-text width in this compact printed-card design only.
    // Full signed claims remain unchanged and accessible in the VC itself.
    if (text.length > 26) text = text.slice(0, 25) + '…';
    return xmlText(text);
  });
}
