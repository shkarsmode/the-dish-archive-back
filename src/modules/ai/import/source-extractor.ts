import { Injectable, Logger } from '@nestjs/common';
import { ImportPlatform } from '../ai.types';
import {
    cleanText,
    extractJsonLdRecipe,
    extractMeta,
    extractReadableText,
    JsonLdRecipe,
    PageMeta,
    parseHtml,
} from './html';
import { decodeBody, safeGet, SafeHttpError, SafeResponse } from './safe-http';

// Turns a pasted link into source material for the model: the post caption or
// page text, schema.org Recipe data when the page has it, cover image candidates
// and, for YouTube, the video itself. No AI here - this part is free.

export interface ExtractedSource {
    platform: ImportPlatform;
    url: string;
    finalUrl: string;
    title: string;
    author: string;
    /** Post caption, video description or message text. */
    caption: string;
    recipe: JsonLdRecipe | null;
    /** Readable page text (websites without structured data, or as a supplement). */
    pageText: string;
    imageUrls: string[];
    youtube?: { videoId: string; lengthSeconds: number | null };
    /** Direct video file of a post (Instagram reels), for when the recipe is only spoken in it. */
    videoFileUrl?: string;
    /** Login wall, consent page or an error page instead of the content. */
    blocked: boolean;
    via: string[];
    /** Facts about the fetch the model should know (e.g. the linked original refused access). */
    notes: string[];
}

const UA_CHROME =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const UA_LINK_PREVIEW = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
// Instagram's embed and TikTok's page serve their JSON to plain HTTP clients, while a
// cookie-less desktop browser gets an empty app shell or a "please wait" wall.
const UA_CLI = 'curl/8.9.1';
// Facebook and Threads render the full post text into the page only for search crawlers.
const UA_GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
/** For images behind crawler-only URLs (Facebook's lookaside, Meta CDN). */
export const UA_IMAGE = UA_LINK_PREVIEW;
const ACCEPT_HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const ACCEPT_LANGUAGE = 'uk-UA,uk;q=0.9,en;q=0.8,ru;q=0.6';

const TRACKING_PARAMS = /^(utm_\w+|igsh|igshid|fbclid|gclid|mc_\w+|si|feature|ref|ref_src|_r|_t|share_\w+|mibextid|rdid|is_from_webapp|sender_device|web_id|xmt)$/i;

export class SourceError extends Error {
    constructor(
        public readonly code: 'BAD_URL' | 'UNAVAILABLE' | 'EMPTY',
        message: string,
    ) {
        super(message);
        this.name = 'SourceError';
    }
}

/** Pull the first URL out of pasted text ("Look: https://...") and tidy it. */
export function normalizeLink(raw: string): URL {
    const text = String(raw ?? '').trim();
    let candidate = text.match(/https?:\/\/[^\s<>"'«»]+/i)?.[0] ?? '';
    if (!candidate && /^(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(text)) candidate = `https://${text}`;
    candidate = candidate.replace(/[)\].,;!?»"']+$/, '');
    let url: URL;
    try {
        url = new URL(candidate);
    } catch {
        throw new SourceError('BAD_URL', 'Це не схоже на посилання. Скопіюйте адресу допису або сторінки повністю.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new SourceError('BAD_URL', 'Підтримуються лише посилання http(s).');
    }
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
        if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    return url;
}

export function detectPlatform(url: URL): ImportPlatform {
    const host = url.hostname.toLowerCase().replace(/^www\.|^m\.|^mobile\.|^mbasic\./, '');
    if (host === 'instagram.com' || host === 'instagr.am' || host.endsWith('.instagram.com')) return 'instagram';
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
    if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com') {
        return 'youtube';
    }
    if (host === 'facebook.com' || host === 'fb.com' || host === 'fb.watch' || host.endsWith('.facebook.com')) return 'facebook';
    if (host === 't.me' || host === 'telegram.me' || host === 'telegram.dog') return 'telegram';
    if (/^(\w+\.)?pinterest\.[a-z.]+$/.test(host) || host === 'pin.it') return 'pinterest';
    if (host === 'threads.net' || host === 'threads.com') return 'threads';
    if (host === 'x.com' || host === 'twitter.com') return 'x';
    return 'website';
}

function youtubeId(url: URL): string | null {
    const host = url.hostname.toLowerCase();
    if (host.endsWith('youtu.be')) return url.pathname.split('/')[1] || null;
    const v = url.searchParams.get('v');
    if (v) return v;
    const match = url.pathname.match(/^\/(?:shorts|live|embed|v)\/([\w-]{6,})/);
    return match?.[1] ?? null;
}

/** Read a JSON string literal that starts right after `marker` in raw page source. */
function jsonStringAfter(source: string, marker: string, from = 0): string | null {
    const start = source.indexOf(marker, from);
    if (start < 0) return null;
    let i = start + marker.length;
    let raw = '';
    while (i < source.length) {
        const char = source[i];
        if (char === '\\') {
            raw += char + source[i + 1];
            i += 2;
            continue;
        }
        if (char === '"') break;
        raw += char;
        i++;
    }
    try {
        return JSON.parse(`"${raw}"`);
    } catch {
        return null;
    }
}

function youtubePanelDescription(html: string): string | null {
    const panel = html.indexOf('engagement-panel-structured-description');
    const marker = '"attributedDescription":{"content":"';
    return jsonStringAfter(html, marker, Math.max(0, panel)) ?? jsonStringAfter(html, marker);
}

/** Caption, cover, owner and reel video from Instagram's /embed/captioned/ page. */
export function parseInstagramEmbed(html: string): { caption: string; image: string; owner: string; videoUrl: string } {
    const out = { caption: '', image: '', owner: '', videoUrl: '' };
    const context = jsonStringAfter(html, '"contextJSON":"');
    if (context) {
        try {
            const media = JSON.parse(context)?.gql_data?.shortcode_media;
            out.caption = cleanText(media?.edge_media_to_caption?.edges?.[0]?.node?.text, 12000);
            out.image = media?.display_url || '';
            out.owner = media?.owner?.username || '';
            out.videoUrl = media?.video_url || '';
        } catch {
            /* fall back to the HTML caption */
        }
    }
    if (!out.caption) {
        const block = html.match(/<div class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/i)?.[1];
        if (block) {
            out.owner ||= cleanText(block.match(/class="CaptionUsername"[^>]*>([^<]+)</)?.[1], 60);
            const text = block
                .replace(/<a[^>]*class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/i, '')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, ' ');
            out.caption = cleanText(text, 12000);
        }
    }
    if (!out.image) {
        const img = html.match(/<img[^>]*class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i)?.[1]
            || html.match(/<img[^>]*src="([^"]+)"[^>]*class="EmbeddedMediaImage"/i)?.[1];
        if (img) out.image = cleanText(img, 2000);
    }
    return out;
}

interface ThreadsPost {
    code: string;
    user: string;
    text: string;
    replyToAuthor: string;
    takenAt: number;
}

/** Every post object (code + caption) in the JSON blocks of a Threads page. */
export function threadsPosts(html: string): ThreadsPost[] {
    const posts = new Map<string, ThreadsPost>();
    const walk = (node: any, depth = 0): void => {
        if (!node || typeof node !== 'object' || depth > 400) return;
        if (Array.isArray(node)) {
            node.forEach((item) => walk(item, depth + 1));
            return;
        }
        if (typeof node.code === 'string' && (node.caption || node.text_post_app_info)) {
            const fragments = node.text_post_app_info?.text_fragments?.fragments ?? [];
            const fragmentText = fragments.map((f: any) => f?.plaintext || f?.link_fragment?.display_text || '').join('');
            const post: ThreadsPost = {
                code: node.code,
                user: node.user?.username || '',
                text: cleanText(node.caption?.text || fragmentText, 8000),
                replyToAuthor: node.text_post_app_info?.reply_to_author?.username || '',
                takenAt: Number(node.taken_at) || 0,
            };
            const known = posts.get(post.code);
            if (!known || (!known.text && post.text)) posts.set(post.code, post);
        }
        for (const key of Object.keys(node)) walk(node[key], depth + 1);
    };
    for (const match of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
        try {
            walk(JSON.parse(match[1]));
        } catch {
            /* not JSON we can read */
        }
    }
    return [...posts.values()];
}

function instagramCode(url: URL): { kind: string; code: string } | null {
    const match = url.pathname.match(/\/(p|reel|reels|tv)\/([\w-]{5,})/);
    return match ? { kind: match[1] === 'reels' ? 'reel' : match[1], code: match[2] } : null;
}

function emptySource(platform: ImportPlatform, url: URL): ExtractedSource {
    return {
        platform,
        url: url.toString(),
        finalUrl: url.toString(),
        title: '',
        author: '',
        caption: '',
        recipe: null,
        pageText: '',
        imageUrls: [],
        blocked: false,
        via: [],
        notes: [],
    };
}

async function getHtml(
    url: string | URL,
    userAgent: string,
    timeoutMs = 9000,
    extraHeaders: Record<string, string> = {},
): Promise<{ html: string; response: SafeResponse }> {
    const response = await safeGet(url, {
        timeoutMs,
        maxBytes: 2_500_000,
        allowErrorStatus: true,
        headers: { 'User-Agent': userAgent, Accept: ACCEPT_HTML, 'Accept-Language': ACCEPT_LANGUAGE, ...extraHeaders },
    });
    return { html: decodeBody(response), response };
}

/** Google shows EU visitors (our servers run in Frankfurt) a consent wall unless this is set. */
const GOOGLE_CONSENT = { Cookie: 'SOCS=CAI; CONSENT=YES+cb' };

async function getJson<T>(url: string, timeoutMs = 7000): Promise<T | null> {
    try {
        const response = await safeGet(url, {
            timeoutMs,
            maxBytes: 600_000,
            allowErrorStatus: true,
            headers: { 'User-Agent': UA_CHROME, Accept: 'application/json', 'Accept-Language': ACCEPT_LANGUAGE },
        });
        if (response.status !== 200) return null;
        return JSON.parse(decodeBody(response)) as T;
    } catch {
        return null;
    }
}

/** Instagram/Facebook/Threads put the caption in og:description behind a "N likes - user on date:" prefix. */
export function socialCaption(description: string): string {
    const text = cleanText(description, 8000);
    const head = text.slice(0, 280);
    const colon = head.search(/:\s*["“«]/);
    const prefix = colon >= 0 ? head.slice(0, colon) : '';
    if (colon >= 0 && /likes?|comments?|подоба|коментар|отмет|комментар|instagram|threads|facebook/i.test(prefix)) {
        const caption = text
            .slice(colon)
            .replace(/^:\s*["“«]/, '')
            .replace(/["”»]\.?\s*$/, '')
            .trim();
        if (caption.length > 10) return caption;
    }
    return text;
}

function isLoginWall(meta: PageMeta, html: string): boolean {
    const title = meta.title.toLowerCase();
    return (
        /log in|login|увійти|войти|sign up|вход/.test(title) && !meta.description
    ) || /<title>\s*(Instagram|Facebook)\s*<\/title>/i.test(html) && !meta.description;
}

function dedupe(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

@Injectable()
export class SourceExtractor {
    private readonly logger = new Logger(SourceExtractor.name);
    /** Short-lived per-instance cache so the preview call and the import share one fetch. */
    private readonly cache = new Map<string, { at: number; promise: Promise<ExtractedSource> }>();

    extract(rawUrl: string): Promise<ExtractedSource> {
        const url = normalizeLink(rawUrl);
        const key = url.toString();
        const now = Date.now();
        for (const [cacheKey, entry] of this.cache) {
            if (now - entry.at > 120_000) this.cache.delete(cacheKey);
        }
        const hit = this.cache.get(key);
        if (hit) return hit.promise;
        const promise = this.extractFresh(url).catch((error) => {
            this.cache.delete(key);
            throw error;
        });
        this.cache.set(key, { at: now, promise });
        return promise;
    }

    private async extractFresh(url: URL): Promise<ExtractedSource> {
        const platform = detectPlatform(url);
        try {
            switch (platform) {
                case 'instagram':
                    return await this.instagram(url);
                case 'tiktok':
                    return await this.tiktok(url);
                case 'youtube':
                    return await this.youtube(url);
                case 'telegram':
                    return await this.telegram(url);
                case 'pinterest':
                    return await this.pinterest(url);
                case 'facebook':
                    return await this.facebook(url);
                case 'threads':
                    return await this.threads(url);
                case 'x':
                    return await this.x(url);
                default:
                    return await this.website(url, platform);
            }
        } catch (error) {
            if (error instanceof SourceError) throw error;
            if (error instanceof SafeHttpError && error.code === 'BLOCKED_URL') {
                throw new SourceError('BAD_URL', 'Це посилання не можна відкрити.');
            }
            this.logger.warn(`extract ${platform} failed: ${(error as Error).message}`);
            throw new SourceError('UNAVAILABLE', 'Не вдалося відкрити посилання. Перевірте, що допис публічний.');
        }
    }

    // ── Instagram ───────────────────────────────────────────────────────────
    // embed/captioned answers a non-browser client with server-rendered JSON
    // (contextJSON: full caption, full-size image, owner, the reel's video file);
    // og:description from a link-preview crawler is the backup for the caption.
    private async instagram(url: URL): Promise<ExtractedSource> {
        const source = emptySource('instagram', url);
        const post = instagramCode(url);
        const canonical = post ? `https://www.instagram.com/${post.kind}/${post.code}/` : url.toString();
        source.finalUrl = canonical;

        const [embed, page] = await Promise.allSettled([
            post
                ? getHtml(`https://www.instagram.com/p/${post.code}/embed/captioned/`, UA_CLI, 9000, { 'Accept-Language': 'en-US,en;q=0.9' })
                : Promise.reject(new Error('no shortcode')),
            getHtml(canonical, UA_LINK_PREVIEW),
        ]);

        if (embed.status === 'fulfilled') {
            const parsed = parseInstagramEmbed(embed.value.html);
            if (parsed.caption) {
                source.caption = parsed.caption;
                source.via.push('caption');
            }
            if (parsed.owner) source.author = `@${parsed.owner}`;
            if (parsed.image) source.imageUrls.push(parsed.image);
            if (parsed.videoUrl) source.videoFileUrl = parsed.videoUrl;
        }

        if (page.status === 'fulfilled') {
            const root = parseHtml(page.value.html);
            const meta = extractMeta(root, canonical);
            source.title = meta.title;
            const caption = socialCaption(meta.description);
            if (caption.length > source.caption.length) {
                source.caption = caption;
                if (!source.via.includes('caption')) source.via.push('caption');
            }
            if (!source.author) {
                // "1,603 likes, 32 comments - zoshyt.receptiv [on] May 22, 2025: ..." -> @zoshyt.receptiv
                const prefix = meta.description.split(/:\s*["“«]/)[0].slice(0, 200);
                const username = prefix.match(/[-\u2013\u2014]\s*([A-Za-z0-9._]{2,30})(?:\s|,|$)/)?.[1];
                const displayName = meta.title.match(/^(.+?)\s+(?:on|в|у)\s+Instagram/i)?.[1];
                source.author = username ? `@${username}` : cleanText(displayName, 80);
            }
            if (meta.image) source.imageUrls.push(meta.image);
            if (!source.caption && isLoginWall(meta, page.value.html)) source.blocked = true;
        }

        source.imageUrls = dedupe(source.imageUrls);
        if (!source.caption && !source.imageUrls.length) {
            throw new SourceError('UNAVAILABLE', 'Instagram не віддав цей допис. Можливо, акаунт приватний або допис видалено.');
        }
        return source;
    }

    // ── TikTok ──────────────────────────────────────────────────────────────
    // The page's rehydration JSON has the caption with its line breaks (contents[].desc);
    // /embed/v2 is the fallback when the page answers with a "please wait" wall, and the
    // public oEmbed (often rate limited for anonymous callers) is the last resort.
    private async tiktok(url: URL): Promise<ExtractedSource> {
        const source = emptySource('tiktok', url);
        let canonical = url.toString();
        let item: any = null;
        for (const agent of [UA_CLI, UA_CHROME]) {
            try {
                const { html, response } = await getHtml(canonical, agent, 9000, { 'Accept-Language': 'en-US,en;q=0.9' });
                canonical = response.url.split('?')[0];
                const raw = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
                item = raw ? JSON.parse(raw)?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct : null;
                if (item) break;
            } catch {
                /* try the next client */
            }
        }
        source.finalUrl = canonical;
        if (item) {
            const lines = (item.contents ?? []).map((part: any) => part?.desc).filter(Boolean);
            source.caption = cleanText(lines.length ? lines.join('\n') : item.desc, 6000);
            if (item.author?.uniqueId) source.author = `@${item.author.uniqueId}`;
            const cover = item.video?.originCover || item.video?.cover || item.imagePost?.images?.[0]?.imageURL?.urlList?.[0];
            if (cover) source.imageUrls.push(cover);
        }
        const videoId = canonical.match(/\/(?:video|photo)\/(\d+)/)?.[1];
        if (!source.caption && videoId) {
            try {
                const { html } = await getHtml(`https://www.tiktok.com/embed/v2/${videoId}`, UA_CLI);
                const raw = html.match(/<script[^>]*id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
                const data = raw ? JSON.parse(raw)?.source?.data?.[`/embed/v2/${videoId}`]?.videoData : null;
                if (data?.itemInfos?.text) source.caption = cleanText(data.itemInfos.text, 6000);
                const cover = data?.itemInfos?.covers?.[0] || data?.itemInfos?.coversOrigin?.[0];
                if (cover) source.imageUrls.push(cover);
                if (!source.author && data?.authorInfos?.uniqueId) source.author = `@${data.authorInfos.uniqueId}`;
            } catch {
                /* fall through to oEmbed */
            }
        }
        if (!source.caption) {
            const oembed = await getJson<{ title?: string; author_unique_id?: string; author_name?: string; thumbnail_url?: string }>(
                `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonical)}`,
            );
            if (oembed?.title) source.caption = cleanText(oembed.title, 6000);
            if (!source.author && (oembed?.author_unique_id || oembed?.author_name)) {
                source.author = oembed.author_unique_id ? `@${oembed.author_unique_id}` : cleanText(oembed.author_name, 80);
            }
            if (oembed?.thumbnail_url) source.imageUrls.push(oembed.thumbnail_url);
        }
        if (source.caption) source.via.push('caption');
        source.imageUrls = dedupe(source.imageUrls);
        if (!source.caption && !source.imageUrls.length) {
            throw new SourceError('UNAVAILABLE', 'TikTok не віддав це відео. Перевірте, що воно публічне.');
        }
        return source;
    }

    // ── Facebook ────────────────────────────────────────────────────────────
    // A crawler request gets the server-rendered Relay JSON with the full post text
    // ("message":{"text":...}); reels carry their caption in <title>. og:description
    // (cut at ~200 characters) is the last resort.
    private async facebook(url: URL): Promise<ExtractedSource> {
        const source = emptySource('facebook', url);
        const { html, response } = await getHtml(url, UA_GOOGLEBOT, 10000, { 'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8' });
        source.finalUrl = response.url;
        const root = parseHtml(html);
        const meta = extractMeta(root, response.url);
        const messages: string[] = [];
        for (const match of html.matchAll(/"message":\{(?:"[a-z_]+":[^{}]*?,)?"text":"((?:[^"\\]|\\.)*)"/g)) {
            try {
                messages.push(JSON.parse(`"${match[1]}"`));
            } catch {
                /* skip a malformed fragment */
            }
        }
        const longest = messages.sort((a, b) => b.length - a.length)[0] || '';
        const titleCaption = cleanText(root.querySelector('title')?.text, 4000).replace(/\s*\|\s*[^|]+$/, '');
        let caption = longest;
        if (titleCaption.length > caption.length && !/(\.\.\.|…)$/.test(titleCaption)) caption = titleCaption;
        if (!caption) caption = socialCaption(meta.description);
        source.caption = cleanText(caption, 12000);
        if (source.caption) source.via.push('caption');
        source.title = meta.title;
        // Reel titles start with view and reaction counts instead of the page name.
        const author = cleanText(meta.title.split(/\s[-|]\s/)[0], 80);
        source.author = /\d.*(переглядів|перегляди|views|реакц|reactions|likes)/i.test(author) ? '' : author;
        if (meta.image) source.imageUrls.push(meta.image);
        if (!source.caption && !source.imageUrls.length) {
            throw new SourceError('UNAVAILABLE', 'Цей допис доступний лише після входу. Скопіюйте текст або зробіть скриншот.');
        }
        source.blocked = !longest && source.caption.length < 220;
        return source;
    }

    // ── Threads ─────────────────────────────────────────────────────────────
    // Recipes on Threads are often a chain: the post plus the author's own replies.
    // The crawler page embeds them as JSON; join the root caption and self-replies.
    private async threads(url: URL): Promise<ExtractedSource> {
        const source = emptySource('threads', url);
        const match = url.pathname.match(/@([A-Za-z0-9_.]+)\/post\/([A-Za-z0-9_-]+)/);
        if (!match) return this.website(url, 'threads');
        const [, user, code] = match;
        const canonical = `https://www.threads.com/@${user}/post/${code}`;
        source.finalUrl = canonical;
        source.author = `@${user}`;
        const { html } = await getHtml(canonical, UA_GOOGLEBOT, 10000, { 'Accept-Language': 'en-US,en;q=0.9' });
        const posts = threadsPosts(html);
        const rootPost = posts.find((post) => post.code === code);
        const replies = posts
            .filter((post) => post.user === user && post.replyToAuthor === user && post.code !== code)
            .sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
        const meta = extractMeta(parseHtml(html), canonical);
        const parts = [rootPost?.text || socialCaption(meta.description), ...replies.map((post) => post.text)].filter(Boolean);
        source.caption = cleanText(parts.join('\n\n'), 12000);
        if (source.caption) source.via.push(replies.length ? 'caption+thread' : 'caption');
        source.title = meta.title;
        if (meta.image) source.imageUrls.push(meta.image);
        if (!source.caption && !source.imageUrls.length) {
            throw new SourceError('UNAVAILABLE', 'Не вдалося прочитати цей допис Threads.');
        }
        return source;
    }

    // ── YouTube ─────────────────────────────────────────────────────────────
    private async youtube(url: URL): Promise<ExtractedSource> {
        const source = emptySource('youtube', url);
        const id = youtubeId(url);
        if (!id) throw new SourceError('BAD_URL', 'Не бачу ідентифікатора відео в посиланні YouTube.');
        const watchUrl = `https://www.youtube.com/watch?v=${id}`;
        source.finalUrl = watchUrl;
        source.youtube = { videoId: id, lengthSeconds: null };

        const [oembed, page] = await Promise.allSettled([
            getJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(
                `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
            ),
            getHtml(`${watchUrl}&hl=uk`, UA_CHROME, 9000, GOOGLE_CONSENT),
        ]);
        if (oembed.status === 'fulfilled' && oembed.value) {
            source.title = cleanText(oembed.value.title, 300);
            source.author = cleanText(oembed.value.author_name, 80);
        }
        const applyDetails = (details: any) => {
            if (!details) return;
            if (details.shortDescription && !source.caption) {
                source.caption = cleanText(details.shortDescription, 12000);
                source.via.push('description');
            }
            if (!source.title && details.title) source.title = cleanText(details.title, 300);
            if (!source.author && details.author) source.author = cleanText(details.author, 80);
            const seconds = Number(details.lengthSeconds);
            if (Number.isFinite(seconds) && seconds > 0) source.youtube!.lengthSeconds = seconds;
        };
        if (page.status === 'fulfilled') {
            const raw = page.value.html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;\s*(?:var\s|<\/script>)/)?.[1];
            if (raw) {
                try {
                    applyDetails(JSON.parse(raw)?.videoDetails);
                } catch {
                    /* fall back to the player API / meta description */
                }
            }
        }
        // Server IPs get YouTube's "confirm you're not a bot" player, but the page still
        // carries the full description in ytInitialData (the description panel).
        if (!source.caption && page.status === 'fulfilled') {
            const description = youtubePanelDescription(page.value.html);
            if (description) {
                source.caption = cleanText(description, 12000);
                source.via.push('description');
            }
        }
        if (!source.caption) applyDetails(await this.youtubePlayer(id));
        if (page.status === 'fulfilled') {
            if (!source.caption) {
                const meta = extractMeta(parseHtml(page.value.html), watchUrl);
                if (meta.description) {
                    source.caption = meta.description;
                    source.via.push('description');
                }
                if (!source.title) source.title = meta.title;
            }
        }
        source.imageUrls = [`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`];
        return source;
    }

    /** YouTube's internal player API (no key): returns videoDetails incl. the full description. */
    private async youtubePlayer(videoId: string): Promise<any | null> {
        const clients = [
            {
                context: { client: { clientName: 'ANDROID', clientVersion: '19.44.38', androidSdkVersion: 30, hl: 'uk' } },
                userAgent: 'com.google.android.youtube/19.44.38 (Linux; U; Android 11) gzip',
            },
            {
                context: { client: { clientName: 'WEB', clientVersion: '2.20250925.01.00', hl: 'uk' } },
                userAgent: UA_CHROME,
            },
        ];
        for (const client of clients) {
            try {
                const response = await safeGet('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
                    method: 'POST',
                    body: JSON.stringify({ context: client.context, videoId }),
                    timeoutMs: 7000,
                    maxBytes: 3_000_000,
                    allowErrorStatus: true,
                    headers: { 'Content-Type': 'application/json', 'User-Agent': client.userAgent, ...GOOGLE_CONSENT },
                });
                if (response.status !== 200) continue;
                const details = JSON.parse(decodeBody(response))?.videoDetails;
                if (details?.shortDescription || details?.lengthSeconds) return details;
            } catch {
                /* try the next client */
            }
        }
        return null;
    }

    // ── Telegram ────────────────────────────────────────────────────────────
    private async telegram(url: URL): Promise<ExtractedSource> {
        const source = emptySource('telegram', url);
        const match = url.pathname.match(/^\/(?:s\/)?([\w]{4,})\/(\d+)/);
        if (!match) throw new SourceError('BAD_URL', 'Потрібне посилання на конкретний допис каналу (t.me/канал/номер).');
        const [, channel, id] = match;
        source.finalUrl = `https://t.me/${channel}/${id}`;
        const { html } = await getHtml(`https://t.me/${channel}/${id}?embed=1&mode=tme`, UA_CHROME);
        const root = parseHtml(html);
        const textEl = root.querySelector('.tgme_widget_message_text');
        if (textEl) {
            const text = cleanText(textEl.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '), 12000);
            if (text) {
                source.caption = text;
                source.via.push('caption');
            }
        }
        source.author = cleanText(root.querySelector('.tgme_widget_message_owner_name')?.text, 80) || `@${channel}`;
        for (const node of root.querySelectorAll('.tgme_widget_message_photo_wrap, .tgme_widget_message_video_thumb')) {
            const style = node.getAttribute('style') || '';
            const image = style.match(/url\(['"]?([^'")]+)['"]?\)/)?.[1];
            if (image) source.imageUrls.push(image);
        }
        source.imageUrls = dedupe(source.imageUrls);
        if (!source.caption && !source.imageUrls.length) {
            throw new SourceError('UNAVAILABLE', 'Не вдалося прочитати допис Telegram. Канал має бути публічним.');
        }
        return source;
    }

    // ── Pinterest: read the pin, then follow it to the original recipe page ─
    private async pinterest(url: URL): Promise<ExtractedSource> {
        const { html, response } = await getHtml(url, UA_CHROME);
        const root = parseHtml(html);
        const meta = extractMeta(root, response.url);
        // og:see_also points at the page the pin was saved from: that is where the recipe is.
        const outbound =
            root.querySelector('meta[property="og:see_also"]')?.getAttribute('content') ||
            html.match(/"(?:link|sourceUrl|tracked_link)"\s*:\s*"(https?:\\?\/\\?\/[^"]+)"/)?.[1]?.replace(/\\\//g, '/') || '';
        if (outbound && !/pinterest\.|pin\.it/.test(outbound)) {
            try {
                const site = await this.website(new URL(outbound), 'website');
                if (site.recipe || site.pageText.length > 400) {
                    site.platform = 'pinterest';
                    site.url = url.toString();
                    site.via.unshift('pinterest');
                    if (!site.imageUrls.length && meta.image) site.imageUrls.push(meta.image);
                    return site;
                }
            } catch {
                /* fall back to the pin itself */
            }
        }
        const source = emptySource('pinterest', url);
        if (outbound) {
            source.notes.push(`The pin links to ${new URL(outbound).hostname}, but that page could not be read (it blocks automated access).`);
        }
        source.finalUrl = response.url;
        source.title = meta.title;
        source.caption = meta.description;
        if (meta.image) source.imageUrls.push(meta.image);
        if (source.caption) source.via.push('caption');
        return source;
    }

    // ── X / Twitter: the public oEmbed returns the post text ──────────────────
    private async x(url: URL): Promise<ExtractedSource> {
        const source = emptySource('x', url);
        const oembed = await getJson<{ html?: string; author_name?: string }>(
            `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(url.toString())}`,
        );
        if (oembed?.html) {
            source.caption = cleanText(oembed.html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '), 6000);
            source.author = cleanText(oembed.author_name, 80);
            source.via.push('caption');
        }
        if (!source.caption) throw new SourceError('UNAVAILABLE', 'Не вдалося прочитати цей допис.');
        return source;
    }

    // ── Websites, Facebook and Threads (Open Graph + JSON-LD + page text) ───
    private async website(url: URL, platform: ImportPlatform): Promise<ExtractedSource> {
        const source = emptySource(platform, url);
        const social = platform === 'facebook' || platform === 'threads';
        const agents = social ? [UA_LINK_PREVIEW, UA_CHROME] : [UA_CHROME, UA_LINK_PREVIEW];
        let lastStatus = 0;
        for (const agent of agents) {
            const { html, response } = await getHtml(url, agent, 10000);
            lastStatus = response.status;
            if (response.status >= 400 && response.status !== 404) continue;
            if (response.status === 404) {
                throw new SourceError('UNAVAILABLE', 'Сторінку не знайдено (404). Перевірте посилання.');
            }
            const isHtml = !response.contentType || /html|xml/.test(response.contentType);
            if (!isHtml) {
                throw new SourceError('UNAVAILABLE', 'За посиланням не сторінка, а файл. Якщо це фото рецепта - завантажте його як фото.');
            }
            source.finalUrl = response.url;
            const root = parseHtml(html);
            const meta = extractMeta(root, response.url);
            source.title = meta.title;
            source.author = meta.author || meta.siteName;
            source.recipe = extractJsonLdRecipe(root, response.url);
            if (source.recipe) source.via.push('structured-data');
            if (social) {
                source.caption = socialCaption(meta.description);
                if (source.caption) source.via.push('caption');
                if (isLoginWall(meta, html)) source.blocked = !source.caption;
            } else {
                source.caption = meta.description;
                // Structured data already has the recipe; page text is a supplement for notes/tips.
                source.pageText = extractReadableText(root, source.recipe ? 5000 : 14000);
                if (source.pageText) source.via.push('page-text');
            }
            source.imageUrls = dedupe([...(source.recipe?.images ?? []), meta.image]);
            if (source.caption || source.recipe || source.pageText.length > 200) return source;
        }
        if ([401, 402, 403, 429, 503].includes(lastStatus)) {
            throw new SourceError('UNAVAILABLE', 'Сайт не пустив нашого робота. Скопіюйте текст рецепта або зробіть скриншот.');
        }
        if (social) {
            throw new SourceError('UNAVAILABLE', 'Цей допис доступний лише після входу. Скопіюйте текст або зробіть скриншот.');
        }
        throw new SourceError('EMPTY', 'На сторінці не знайшлося тексту рецепта.');
    }
}
