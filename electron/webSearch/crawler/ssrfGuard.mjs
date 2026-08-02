import dns from 'node:dns/promises';
import net from 'node:net';
import { WebSearchError } from '../types.mjs';

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain']);
const HTTP_AUTHORITY_URL_PATTERN = /^https?:\/\//i;
const MAX_PUBLIC_HTTP_URL_CHARS = 4096;
const MAX_IP_LITERAL_CHARS = 128;
const SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):/;
const UNSAFE_PUBLIC_URL_CHARS_PATTERN = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069\uFFFD]/;
const BLOCKED_IPV6_PREFIXES = [
  { words: [0x0064, 0xff9b, 0, 0, 0, 0], bits: 96 },
  { words: [0x0064, 0xff9b, 0x0001], bits: 48 },
  { words: [0x0100, 0, 0, 0], bits: 64 },
  { words: [0x2001, 0], bits: 23 },
  { words: [0x2001, 0x0db8], bits: 32 },
  { words: [0x2002], bits: 16 },
  { words: [0x3fff, 0], bits: 20 },
  { words: [0x5f00], bits: 16 },
];

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function normalizeIpLiteral(ip) {
  if (typeof ip !== 'string' || ip.length > MAX_IP_LITERAL_CHARS) {
    return '';
  }
  return ip.trim().replace(/^\[|\]$/g, '').split('%')[0];
}

function parseIpv6Words(ip) {
  let normalized = normalizeIpLiteral(ip).toLowerCase();
  if (normalized.includes('.')) {
    const match = normalized.match(/(.+:)(\d+\.\d+\.\d+\.\d+)$/);
    if (!match || isPrivateIpv4(match[2])) {
      return null;
    }
    const octets = match[2].split('.').map((part) => Number(part));
    normalized = `${match[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const [leftPart, rightPart = ''] = normalized.split('::');
  if (normalized.split('::').length > 2) {
    return null;
  }

  const left = leftPart ? leftPart.split(':') : [];
  const right = rightPart ? rightPart.split(':') : [];
  const missing = normalized.includes('::') ? 8 - left.length - right.length : 0;
  const parts = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right];
  if (parts.length !== 8) {
    return null;
  }

  const words = parts.map((part) => Number.parseInt(part, 16));
  return words.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff) ? words : null;
}

function hasIpv6Prefix(words, prefix) {
  let remainingBits = prefix.bits;
  for (let index = 0; remainingBits > 0; index += 1) {
    const bits = Math.min(remainingBits, 16);
    const mask = (0xffff << (16 - bits)) & 0xffff;
    if ((words[index] & mask) !== ((prefix.words[index] ?? 0) & mask)) {
      return false;
    }
    remainingBits -= bits;
  }
  return true;
}

function isPrivateIpv6(ip) {
  const words = parseIpv6Words(ip);
  if (!words) {
    return true;
  }

  const isIpv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (isIpv4Mapped) {
    const ipv4 = [
      words[6] >> 8,
      words[6] & 0xff,
      words[7] >> 8,
      words[7] & 0xff,
    ].join('.');
    return isPrivateIpv4(ipv4);
  }

  const first = words[0];
  return (
    words.every((word) => word === 0) ||
    (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) ||
    first === 0 ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xffc0) === 0xfec0 ||
    (first & 0xff00) === 0xff00 ||
    BLOCKED_IPV6_PREFIXES.some((prefix) => hasIpv6Prefix(words, prefix))
  );
}

export function isBlockedIp(ip) {
  const normalized = normalizeIpLiteral(ip);
  const version = net.isIP(normalized);
  if (version === 4) return isPrivateIpv4(normalized);
  if (version === 6) return isPrivateIpv6(normalized);
  return false;
}

export function normalizePublicHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length > MAX_PUBLIC_HTTP_URL_CHARS) {
    throw new WebSearchError('invalid_url', 'Invalid URL.');
  }
  const trimmed = rawUrl.trim();
  if (!trimmed || UNSAFE_PUBLIC_URL_CHARS_PATTERN.test(trimmed) || trimmed.includes('\\')) {
    throw new WebSearchError('invalid_url', 'Invalid URL.');
  }

  const scheme = SCHEME_PATTERN.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    throw new WebSearchError('invalid_url', 'Only HTTP and HTTPS URLs are supported.');
  }
  if (!HTTP_AUTHORITY_URL_PATTERN.test(trimmed)) {
    throw new WebSearchError('invalid_url', 'Invalid URL.');
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new WebSearchError('invalid_url', 'Invalid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new WebSearchError('invalid_url', 'Only HTTP and HTTPS URLs are supported.');
  }

  if (parsed.username || parsed.password) {
    throw new WebSearchError('invalid_url', 'URL credentials are not supported.');
  }

  parsed.hash = '';
  return parsed;
}

function isBlockedHostname(hostname) {
  const normalized = hostname.replace(/\.+$/g, '').toLowerCase();
  return (
    BLOCKED_HOSTS.has(normalized) ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.localdomain') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.home.arpa') ||
    (!normalized.includes('.') && !normalized.includes(':')) ||
    isBlockedIp(normalized)
  );
}

export async function resolvePublicUrl(rawUrl) {
  const parsed = normalizePublicHttpUrl(rawUrl);
  const hostname = parsed.hostname.toLowerCase();

  if (isBlockedHostname(hostname)) {
    throw new WebSearchError('blocked_url', 'This URL is not allowed.');
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: false });
  } catch (error) {
    throw new WebSearchError('dns_error', 'Could not resolve the URL host.', error);
  }

  if (addresses.length === 0 || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new WebSearchError('blocked_url', 'This URL resolves to a blocked address.');
  }

  return {
    url: parsed.toString(),
    parsed,
    addresses,
  };
}

export async function assertPublicUrl(rawUrl) {
  return (await resolvePublicUrl(rawUrl)).url;
}
