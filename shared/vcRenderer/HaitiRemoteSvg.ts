import {VCMetadata} from '../VCMetadata';
import {getHaitiCredentialRows, getHaitiCredentialSubject} from './HaitiCredentialClaims';
import {getMosipIdentifier} from '../commonUtil';

// Public, versioned asset owned by the Haiti project. GitHub raw serves the
// template directly; no Certify DB, template endpoint or GitHub API token.
export const HAITI_WALLET_SVG_URL =
  'https://raw.githubusercontent.com/Manas0606/inji-config/haiti-0.14.0-aws/haiti-national-id-wallet-v3.svg';

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

function xmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const norm = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase();

function splitWords(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const result: string[] = [];
  for (const word of words) {
    // Split long identifiers and single-token addresses instead of dropping
    // everything after the first characters.
    if (word.length > maxChars) {
      for (let i = 0; i < word.length && result.length < maxLines; i += maxChars) {
        result.push(word.slice(i, i + maxChars));
      }
      continue;
    }
    const last = result.length - 1;
    if (last >= 0 && result[last].length + 1 + word.length <= maxChars) {
      result[last] += ' ' + word;
    } else if (result.length < maxLines) {
      result.push(word);
    }
  }
  if (!result.length) return [];
  if (result.join(' ').length < text.trim().length && result.length === maxLines) {
    result[result.length - 1] = result[result.length - 1].slice(0, maxChars - 1) + '…';
  }
  return result;
}

export function fillHaitiSvgTemplate(
  template: string,
  credential: unknown,
  _meta: VCMetadata,
): string {
  validateSvg(template);
  // Manas Wallet's credentialClaimRows reads localized, array and nested
  // claims. Use the same principle here instead of fixed exact-name fields.
  const rows = getHaitiCredentialRows(credential);
  const nameRow = rows.find(row => ['fullname', 'name'].includes(norm(row.key)));
  const given = rows.find(row => ['firstname', 'givenname'].includes(norm(row.key)));
  const family = rows.find(row => ['lastname', 'familyname', 'surname'].includes(norm(row.key)));
  const fullName = nameRow?.value ||
    [given?.value, family?.value].filter(Boolean).join(' ');
  const nameLines = splitWords(fullName, 21, 2);
  // Use only explicit UIN/VID claims, as in Manas Wallet's MOSIP link login.
  // credentialSubject.id may be a DID and must never be used as a UIN.
  const subject = getHaitiCredentialSubject(credential);
  const individualId = getMosipIdentifier(subject as any);
  // Log schema information only, never UIN, name or credential values.
  const subjectRecord = subject && typeof subject === 'object' && !Array.isArray(subject)
    ? subject as Record<string, unknown> : {};
  console.warn('HAITI_VC_SCHEMA', JSON.stringify({
    keys: Object.keys(subjectRecord).slice(0, 45),
    hasUinOrVid: !!individualId,
    hasClaim169: !!subjectRecord.claim169,
    claimRowCount: rows.length,
  }));
  const idPresentInRows = rows.some(row =>
    ['uin', 'vid', 'individualid', 'mosipindividualid'].includes(norm(row.key)));

  const cardRows = rows.filter(row => {
    const key = norm(row.key);
    return !['fullname', 'name'].includes(key);
  }).slice(0, 40);
  if (individualId && !idPresentInRows) {
    cardRows.unshift({
      path: 'UIN', key: 'UIN', label: 'UIN / VID',
      value: individualId, priority: 6,
    });
  }
  if (!individualId) {
    cardRows.unshift({
      path: 'UIN', key: 'UIN', label: 'UIN / VID',
      value: 'Absent du justificatif émis', priority: 6,
    });
  }

  let y = 355;
  const dynamic: string[] = [];
  for (const row of cardRows) {
    const label = xmlText(row.label);
    const lines = splitWords(row.value, 36, 4);
    dynamic.push(
      `<text x="28" y="${y + 12}" font-size="10" fill="#5b7488" font-family="sans-serif">${label}</text>`,
    );
    for (let i = 0; i < lines.length; i++) {
      dynamic.push(
        `<text x="28" y="${y + 32 + i * 17}" font-size="13" font-weight="bold" fill="#163149" font-family="sans-serif">${xmlText(lines[i])}</text>`,
      );
    }
    y += 44 + Math.max(0, lines.length - 1) * 17;
    dynamic.push(
      `<line x1="26" y1="${y}" x2="324" y2="${y}" stroke="#e7edf2" />`,
    );
    y += 9;
  }
  const footerY = y + 17;
  const flagY = footerY + 17;
  const cardHeight = flagY + 6;
  const dimensions: Record<string, string> = {
    cardHeight: String(cardHeight),
    bodyHeight: String(flagY - 139),
    panelHeight: String(Math.max(225, footerY - 192)),
    footerY: String(footerY),
    flagY: String(flagY),
    fullNameLine1: xmlText(nameLines[0] || ''),
    fullNameLine2: xmlText(nameLines[1] || ''),
    claimRowsSvg: dynamic.join('\n'),
  };

  const rendered = template.replace(
    /\{\{\s*wallet\/([\w]+)\s*\}\}/g,
    (_, key: string) => dimensions[key] ?? '',
  );
  // Reject unexpected/unfilled placeholders instead of showing raw braces.
  if (/\{\{[^}]*\}\}/.test(rendered)) {
    throw new Error('Haiti SVG contains unsupported placeholders');
  }
  return rendered;
}
