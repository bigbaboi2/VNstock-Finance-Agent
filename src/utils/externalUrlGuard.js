import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import axios from 'axios';

const isPrivateIpv4 = (address) => {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 || a >= 224
        || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && (b === 0 || b === 88 || b === 168))
        || (a === 198 && (b === 18 || b === 19 || b === 51))
        || (a === 203 && b === 0);
};

const isPublicAddress = (address) => {
    const family = isIP(address);
    if (family === 4) return !isPrivateIpv4(address);
    if (family !== 6) return false;
    // Permit global unicast only; reject mapped IPv4, local and reserved ranges.
    const normalized = address.toLowerCase();
    return /^[23][0-9a-f]{3}:/i.test(normalized) && !normalized.startsWith('2001:db8:');
};

export const parseExternalHttpUrl = (input) => {
    if (typeof input !== 'string' || input.length > 2048) return null;
    try {
        const url = new URL(input);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
        if (url.port && !['80', '443'].includes(url.port)) return null;
        const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
        if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')
            || hostname.endsWith('.local') || hostname.endsWith('.internal')) return null;
        if (isIP(hostname) && !isPublicAddress(hostname)) return null;
        return url;
    } catch {
        return null;
    }
};

export const isGoogleHostname = (hostname) => {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    return host === 'google.com' || host.endsWith('.google.com');
};

export const isHostnameOrSubdomain = (hostname, domain) => {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    const base = String(domain || '').toLowerCase().replace(/^\.|\.$/g, '');
    return host === base || host.endsWith(`.${base}`);
};

export const isGoogleNewsUrl = (input) => {
    const url = parseExternalHttpUrl(input);
    return Boolean(url && isGoogleHostname(url.hostname));
};

export const isNonGoogleHttpUrl = (input) => {
    const url = parseExternalHttpUrl(input);
    return Boolean(url && !isHostnameOrSubdomain(url.hostname, 'google.com')
        && !isHostnameOrSubdomain(url.hostname, 'googleusercontent.com'));
};

export const isSafePublicHttpUrl = async (input) => {
    const url = parseExternalHttpUrl(input);
    if (!url) return false;
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(hostname)) return isPublicAddress(hostname);
    try {
        const addresses = await lookup(hostname, { all: true, verbatim: true });
        return addresses.length > 0 && addresses.every(({ address }) => isPublicAddress(address));
    } catch {
        return false;
    }
};

const resolvePublicAddresses = async (url) => {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(hostname)) return isPublicAddress(hostname) ? [{ address: hostname, family: isIP(hostname) }] : null;
    try {
        const addresses = await lookup(hostname, { all: true, verbatim: true });
        return addresses.length && addresses.every(({ address }) => isPublicAddress(address)) ? addresses : null;
    } catch {
        return null;
    }
};

const pinnedLookup = (addresses) => (hostname, options, callback) => {
    const candidates = options?.family ? addresses.filter((entry) => entry.family === options.family) : addresses;
    if (!candidates.length) return callback(new Error('Host did not resolve to a permitted public address'));
    if (options?.all) return callback(null, candidates);
    return callback(null, candidates[0].address, candidates[0].family);
};

/** GET an external URL only after public-DNS validation; pin each hop to its checked IP. */
export const safeExternalGet = async (input, config = {}) => {
    const { followRedirects = true, ...requestConfig } = config;
    let current = parseExternalHttpUrl(input);
    if (!current) throw new Error('Blocked invalid external URL');
    let headers = config.headers ? { ...config.headers } : undefined;

    for (let hop = 0; hop <= 4; hop += 1) {
        const addresses = await resolvePublicAddresses(current);
        if (!addresses) throw new Error('Blocked external URL resolving to a non-public address');
        const lookupPinned = pinnedLookup(addresses);
        const agentOptions = { lookup: lookupPinned };
        const response = await axios.get(current.href, {
            ...requestConfig,
            headers,
            maxRedirects: 0,
            httpAgent: new http.Agent(agentOptions),
            httpsAgent: new https.Agent(agentOptions),
            proxy: false,
            validateStatus: (status) => status < 400,
            maxContentLength: requestConfig.maxContentLength ?? 5 * 1024 * 1024,
            maxBodyLength: requestConfig.maxBodyLength ?? 5 * 1024 * 1024,
        });

        if (response.status < 300 || response.status >= 400) return response;
        const location = response.headers.location;
        if (!location) return response;
        if (!followRedirects) return response;
        if (hop === 4) throw new Error('Too many external URL redirects');
        const next = parseExternalHttpUrl(new URL(location, current).href);
        if (!next) throw new Error('Blocked unsafe external URL redirect');
        if (next.origin !== current.origin && headers) {
            headers = { ...headers };
            for (const key of Object.keys(headers)) {
                if (['authorization', 'cookie', 'proxy-authorization'].includes(key.toLowerCase())) delete headers[key];
            }
        }
        current = next;
    }
    throw new Error('Too many external URL redirects');
};
