import { LookupAddress, lookup as dnsLookup } from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import { createBrotliDecompress, createGunzip, createInflate } from 'zlib';

// Outbound HTTP for the link importer. Every hop (including redirects) is checked
// against private, loopback and link-local ranges at connect time through a custom
// DNS lookup, so a hostname that re-resolves to an internal address is refused too.

export class SafeHttpError extends Error {
    constructor(
        public readonly code: 'BLOCKED_URL' | 'TIMEOUT' | 'TOO_LARGE' | 'HTTP_ERROR' | 'NETWORK' | 'TOO_MANY_REDIRECTS',
        message: string,
        public readonly status = 0,
    ) {
        super(message);
        this.name = 'SafeHttpError';
    }
}

export interface SafeResponse {
    url: string;
    status: number;
    contentType: string;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
}

export interface SafeRequestOptions {
    method?: 'GET' | 'POST';
    /** Request body (POST only); sent as-is with the caller's Content-Type header. */
    body?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    /** Return non-2xx responses instead of throwing (the caller inspects status). */
    allowErrorStatus?: boolean;
}

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

function isPrivateIPv4(ip: string): boolean {
    const [a, b] = ip.split('.').map(Number);
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
        a >= 224
    );
}

/** 16 bytes of an IPv6 address (handles "::" and an embedded dotted IPv4 tail), or null. */
function ipv6Bytes(ip: string): number[] | null {
    let text = ip.toLowerCase().split('%')[0];
    const v4 = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) {
        if (!net.isIPv4(v4[1])) return null;
        const [a, b, c, d] = v4[1].split('.').map(Number);
        text = text.slice(0, -v4[1].length) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
    }
    const halves = text.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const fill = 8 - head.length - tail.length;
    if (halves.length === 1 ? head.length !== 8 : fill < 1) return null;
    const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill('0'), ...tail];
    const bytes: number[] = [];
    for (const group of groups) {
        if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
        const value = parseInt(group, 16);
        bytes.push(value >> 8, value & 0xff);
    }
    return bytes.length === 16 ? bytes : null;
}

export function isPrivateAddress(ip: string): boolean {
    if (net.isIPv4(ip)) return isPrivateIPv4(ip);
    const bytes = ipv6Bytes(ip);
    if (!bytes) return true; // unparseable: fail closed
    const embedded = (offset: number) => bytes.slice(offset, offset + 4).join('.');
    const zeros = (from: number, to: number) => bytes.slice(from, to).every((x) => x === 0);
    if (zeros(0, 16)) return true; // ::
    if (zeros(0, 15) && bytes[15] === 1) return true; // ::1
    if (zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return isPrivateIPv4(embedded(12)); // ::ffff:a.b.c.d
    if (zeros(0, 12)) return isPrivateIPv4(embedded(12)); // ::a.b.c.d (IPv4-compatible)
    if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) return true; // 64:ff9b::/96 NAT64
    if (bytes[0] === 0x20 && bytes[1] === 0x02) return isPrivateIPv4(embedded(2)); // 2002::/16 6to4
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true; // documentation
    if ((bytes[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique local
    if (bytes[0] === 0xfe && (bytes[1] & 0xc0) >= 0x80) return true; // fe80::/10 link-local, fec0::/10 site-local
    if (bytes[0] === 0xff) return true; // multicast
    return false;
}

export function assertAllowedUrl(url: URL): void {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new SafeHttpError('BLOCKED_URL', 'Only http(s) links are supported');
    }
    if (url.username || url.password) {
        throw new SafeHttpError('BLOCKED_URL', 'Links with credentials are not allowed');
    }
    if (url.port && url.port !== '80' && url.port !== '443') {
        throw new SafeHttpError('BLOCKED_URL', 'Non-standard ports are not allowed');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!host || host === 'localhost' || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
        throw new SafeHttpError('BLOCKED_URL', 'This host is not allowed');
    }
    // No recipe lives at a bare IPv6 address, and the URL parser normalises
    // [::ffff:127.0.0.1] into hex forms: refuse IPv6 literals outright.
    if (net.isIPv6(host) || (net.isIP(host) && isPrivateAddress(host))) {
        throw new SafeHttpError('BLOCKED_URL', 'This host is not allowed');
    }
    if (!net.isIP(host) && !host.includes('.')) {
        throw new SafeHttpError('BLOCKED_URL', 'This host is not allowed');
    }
}

// Resolves like the default lookup but refuses private targets. Passed to
// http(s).request so the check happens on the exact address the socket uses.
function guardedLookup(
    hostname: string,
    options: any,
    callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, '', 0);
        const list = (addresses as unknown as LookupAddress[]) || [];
        const bad = list.find((entry) => isPrivateAddress(entry.address));
        if (!list.length || bad) {
            const error = new Error('Blocked private address') as NodeJS.ErrnoException;
            error.code = 'EBLOCKED';
            return callback(error, '', 0);
        }
        if (options?.all) return callback(null, list);
        callback(null, list[0].address, list[0].family);
    });
}

function requestOnce(url: URL, options: SafeRequestOptions): Promise<SafeResponse> {
    const timeoutMs = options.timeoutMs ?? 8000;
    const maxBytes = options.maxBytes ?? 3_000_000;
    const transport = url.protocol === 'https:' ? https : http;

    return new Promise<SafeResponse>((resolve, reject) => {
        let settled = false;
        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            fn();
        };

        const request = transport.request(
            url,
            {
                method: options.method ?? 'GET',
                lookup: guardedLookup as any,
                headers: {
                    'Accept-Encoding': 'gzip, deflate, br',
                    ...(options.body ? { 'Content-Length': String(Buffer.byteLength(options.body)) } : {}),
                    ...options.headers,
                },
            },
            (response) => {
                const encoding = String(response.headers['content-encoding'] || '').toLowerCase();
                let stream: NodeJS.ReadableStream = response;
                if (encoding.includes('br')) stream = response.pipe(createBrotliDecompress());
                else if (encoding.includes('gzip')) stream = response.pipe(createGunzip());
                else if (encoding.includes('deflate')) stream = response.pipe(createInflate());

                const chunks: Buffer[] = [];
                let size = 0;
                stream.on('data', (chunk: Buffer) => {
                    size += chunk.length;
                    if (size > maxBytes) {
                        // Keep what fits: a truncated HTML page still carries its <head>.
                        chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - maxBytes))));
                        response.destroy();
                        finish(() =>
                            resolve({
                                url: url.toString(),
                                status: response.statusCode || 0,
                                contentType: String(response.headers['content-type'] || '').toLowerCase(),
                                headers: response.headers,
                                body: Buffer.concat(chunks),
                            }),
                        );
                        return;
                    }
                    chunks.push(chunk);
                });
                stream.on('end', () =>
                    finish(() =>
                        resolve({
                            url: url.toString(),
                            status: response.statusCode || 0,
                            contentType: String(response.headers['content-type'] || '').toLowerCase(),
                            headers: response.headers,
                            body: Buffer.concat(chunks),
                        }),
                    ),
                );
                stream.on('error', (error) =>
                    finish(() => reject(new SafeHttpError('NETWORK', `Read failed: ${error.message}`))),
                );
            },
        );

        const timer = setTimeout(() => {
            request.destroy();
            finish(() => reject(new SafeHttpError('TIMEOUT', `Timed out after ${timeoutMs}ms`)));
        }, timeoutMs);

        request.on('error', (error: NodeJS.ErrnoException) =>
            finish(() =>
                reject(
                    error.code === 'EBLOCKED'
                        ? new SafeHttpError('BLOCKED_URL', 'This host is not allowed')
                        : new SafeHttpError('NETWORK', `Request failed: ${error.code || error.message}`),
                ),
            ),
        );
        request.end(options.body);
    });
}

/** GET (or a POST without redirects) with re-validated redirects, a hard timeout and a body size cap. */
export async function safeGet(input: string | URL, options: SafeRequestOptions = {}): Promise<SafeResponse> {
    let url = typeof input === 'string' ? new URL(input) : input;
    const maxRedirects = options.maxRedirects ?? 5;
    for (let hop = 0; hop <= maxRedirects; hop++) {
        assertAllowedUrl(url);
        const response = await requestOnce(url, options);
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.location;
            if (!location) throw new SafeHttpError('HTTP_ERROR', 'Redirect without location', response.status);
            url = new URL(String(location), url);
            continue;
        }
        if (!options.allowErrorStatus && (response.status < 200 || response.status >= 300)) {
            throw new SafeHttpError('HTTP_ERROR', `HTTP ${response.status}`, response.status);
        }
        return response;
    }
    throw new SafeHttpError('TOO_MANY_REDIRECTS', 'Too many redirects');
}

/** Decode an HTML/text body using the charset from the header or the <meta> tag. */
export function decodeBody(response: SafeResponse): string {
    const fromHeader = response.contentType.match(/charset=([\w-]+)/i)?.[1];
    let charset = fromHeader;
    if (!charset) {
        const head = response.body.subarray(0, 4096).toString('latin1');
        charset =
            head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ||
            head.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)?.[1] ||
            'utf-8';
    }
    try {
        return new TextDecoder(charset.toLowerCase()).decode(response.body);
    } catch {
        return response.body.toString('utf8');
    }
}
