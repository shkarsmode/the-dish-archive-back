import { HTMLElement, parse } from 'node-html-parser';

// HTML helpers for the link importer: Open Graph / meta tags, schema.org Recipe
// JSON-LD and a readable-text fallback for pages without structured data.

export interface PageMeta {
    title: string;
    description: string;
    image: string;
    siteName: string;
    author: string;
    type: string;
    canonical: string;
}

export interface JsonLdRecipe {
    name: string;
    description: string;
    ingredients: string[];
    instructions: string[];
    prepMinutes: number | null;
    cookMinutes: number | null;
    totalMinutes: number | null;
    yield: string;
    calories: number | null;
    images: string[];
    author: string;
    keywords: string;
    category: string;
    cuisine: string;
}

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-',
    hellip: '...', laquo: '«', raquo: '»', deg: '°', frac12: '1/2', frac14: '1/4', frac34: '3/4',
    times: 'x', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', bull: '-', middot: '·', shy: '',
    copy: '©', reg: '®', trade: '™', euro: '€', minus: '-', zwj: '', zwnj: '',
};

export function decodeEntities(value: string): string {
    return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, code: string) => {
        if (code[0] === '#') {
            const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
        }
        const named = NAMED_ENTITIES[code.toLowerCase()];
        return named ?? match;
    });
}

export function cleanText(value: unknown, max = 20000): string {
    return decodeEntities(String(value ?? ''))
        .replace(/ /g, ' ')
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, max);
}

export function parseHtml(html: string): HTMLElement {
    return parse(html, {
        lowerCaseTagName: true,
        comment: false,
        blockTextElements: { script: true, style: true, noscript: true, pre: true },
    });
}

export function extractMeta(root: HTMLElement, baseUrl: string): PageMeta {
    const map = new Map<string, string>();
    for (const meta of root.querySelectorAll('meta')) {
        const key = (meta.getAttribute('property') || meta.getAttribute('name') || meta.getAttribute('itemprop') || '')
            .trim()
            .toLowerCase();
        const content = meta.getAttribute('content');
        if (key && content && !map.has(key)) map.set(key, cleanText(content, 8000));
    }
    const pick = (...keys: string[]) => keys.map((key) => map.get(key)).find((value) => !!value) || '';
    const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href') || pick('og:url');
    return {
        title: pick('og:title', 'twitter:title') || cleanText(root.querySelector('title')?.text, 400),
        description: pick('og:description', 'twitter:description', 'description'),
        image: absolutize(pick('og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'), baseUrl),
        siteName: pick('og:site_name', 'application-name'),
        author: pick('author', 'article:author', 'twitter:creator'),
        type: pick('og:type'),
        canonical: absolutize(canonical, baseUrl),
    };
}

export function absolutize(value: string, baseUrl: string): string {
    if (!value) return '';
    try {
        return new URL(decodeEntities(value), baseUrl).toString();
    } catch {
        return '';
    }
}

// ── schema.org Recipe ─────────────────────────────────────────────────────────

function asArray<T>(value: T | T[] | null | undefined): T[] {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
}

function hasType(node: any, type: string): boolean {
    return asArray(node?.['@type']).some((t) => String(t).toLowerCase() === type.toLowerCase());
}

function collectNodes(value: any, out: any[], depth = 0): void {
    if (!value || depth > 6) return;
    if (Array.isArray(value)) {
        value.forEach((item) => collectNodes(item, out, depth + 1));
        return;
    }
    if (typeof value !== 'object') return;
    out.push(value);
    if (value['@graph']) collectNodes(value['@graph'], out, depth + 1);
    if (value.mainEntity) collectNodes(value.mainEntity, out, depth + 1);
    if (value.itemListElement && !hasType(value, 'Recipe')) collectNodes(value.itemListElement, out, depth + 1);
}

/** ISO-8601 duration (PT1H30M, P0DT0H45M) or a bare number of minutes -> minutes. */
export function isoDurationToMinutes(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
    const text = String(value ?? '').trim();
    if (!text) return null;
    const match = text.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
    if (match) {
        const [, d, h, m, s] = match.map((part) => Number(part || 0)) as unknown as number[];
        const total = Math.round(d * 1440 + h * 60 + m + s / 60);
        return total > 0 ? total : null;
    }
    // Free text: "1 год 20 хв", "1h 20m", "30-40 хв" (the first number of a range).
    const hours = text.match(/(\d+(?:[.,]\d+)?)\s*(?:год|h\b|hr|hour)/i);
    const mins = text.match(/(\d+)\s*(?:хв|min|m\b)/i);
    if (hours || mins) {
        const total = Math.round((hours ? Number(hours[1].replace(',', '.')) * 60 : 0) + (mins ? Number(mins[1]) : 0));
        return total > 0 ? total : null;
    }
    const first = text.match(/\d+(?:[.,]\d+)?/)?.[0];
    const minutes = first ? Number(first.replace(',', '.')) : NaN;
    return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null;
}

function textOf(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return cleanText(stripTags(String(value)), 4000);
    if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(', ');
    return cleanText(stripTags(String(value.text ?? value.name ?? value['@value'] ?? '')), 4000);
}

function flattenInstructions(value: any, out: string[], depth = 0): void {
    if (value == null || depth > 5) return;
    if (typeof value === 'string') {
        // Some sites put every step into one string separated by newlines or <li>.
        stripTags(value.replace(/<\/(li|p)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n'))
            .split(/\n+/)
            .map((line) => cleanText(line, 4000))
            .filter(Boolean)
            .forEach((line) => out.push(line));
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item) => flattenInstructions(item, out, depth + 1));
        return;
    }
    if (typeof value === 'object') {
        if (hasType(value, 'HowToSection')) {
            const name = textOf(value.name);
            if (name) out.push(`## ${name}`);
            flattenInstructions(value.itemListElement ?? value.steps, out, depth + 1);
            return;
        }
        if (value.itemListElement && !value.text) {
            flattenInstructions(value.itemListElement, out, depth + 1);
            return;
        }
        const text = textOf(value.text ?? value.description ?? value.name);
        if (text) out.push(text);
    }
}

function imageUrls(value: any, baseUrl: string): string[] {
    const urls: string[] = [];
    for (const item of asArray(value)) {
        if (!item) continue;
        if (typeof item === 'string') urls.push(absolutize(item, baseUrl));
        else if (typeof item === 'object') urls.push(absolutize(String(item.url ?? item.contentUrl ?? ''), baseUrl));
    }
    return [...new Set(urls.filter(Boolean))];
}

export function extractJsonLdRecipe(root: HTMLElement, baseUrl: string): JsonLdRecipe | null {
    const nodes: any[] = [];
    for (const script of root.querySelectorAll('script')) {
        const type = (script.getAttribute('type') || '').toLowerCase();
        if (!type.includes('ld+json')) continue;
        const raw = script.rawText.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').trim();
        if (!raw) continue;
        try {
            collectNodes(JSON.parse(raw), nodes);
        } catch {
            // Broken JSON-LD (trailing commas, raw newlines in strings) - try a lenient pass.
            try {
                collectNodes(JSON.parse(raw.replace(/,\s*([}\]])/g, '$1').replace(/[\r\n\t]+/g, ' ')), nodes);
            } catch {
                /* give up on this block */
            }
        }
    }
    const recipe = nodes.find((node) => hasType(node, 'Recipe'));
    if (!recipe) return null;

    const instructions: string[] = [];
    flattenInstructions(recipe.recipeInstructions, instructions);
    const ingredients = asArray(recipe.recipeIngredient ?? recipe.ingredients)
        .map((item) => cleanText(stripTags(String(item ?? '')), 400))
        .filter(Boolean);
    const caloriesText = textOf(recipe.nutrition?.calories);
    const calories = caloriesText ? Number(caloriesText.replace(',', '.').match(/\d+(?:\.\d+)?/)?.[0]) : NaN;
    const author = asArray(recipe.author).map(textOf).filter(Boolean).join(', ');

    return {
        name: textOf(recipe.name),
        description: textOf(recipe.description),
        ingredients,
        instructions,
        prepMinutes: isoDurationToMinutes(recipe.prepTime),
        cookMinutes: isoDurationToMinutes(recipe.cookTime),
        totalMinutes: isoDurationToMinutes(recipe.totalTime),
        yield: asArray(recipe.recipeYield).map(textOf).filter(Boolean).join(' / '),
        calories: Number.isFinite(calories) ? Math.round(calories) : null,
        images: imageUrls(recipe.image, baseUrl),
        author,
        keywords: textOf(recipe.keywords),
        category: textOf(recipe.recipeCategory),
        cuisine: textOf(recipe.recipeCuisine),
    };
}

// ── Readable text fallback ───────────────────────────────────────────────────

const RECIPE_CONTAINERS = [
    '.wprm-recipe-container',
    '.wprm-recipe',
    '.tasty-recipes',
    '.mv-create-card',
    '.recipe-card',
    '.easyrecipe',
    '[itemtype*="schema.org/Recipe"]',
    '.recipe',
    '#recipe',
    '.recipe-content',
    '.post-recipe',
    'article',
    'main',
    '[role="main"]',
    '.entry-content',
    '.post-content',
    '.content',
];

// <form> stays: old ASP.NET sites wrap the whole page in one.
const NOISE = 'script, style, noscript, svg, iframe, template, nav, header, footer, aside, button, select, ' +
    '.comments, #comments, .comment, .related, .share, .social, .advert, .ads, .ad, .cookie, .newsletter, .breadcrumbs';

export function stripTags(html: string): string {
    return String(html ?? '').replace(/<[^>]+>/g, ' ');
}

function elementToText(element: HTMLElement): string {
    const html = element.innerHTML
        .replace(/<li[^>]*>/gi, '\n- ')
        .replace(/<(br|hr)\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|table|section|article|blockquote|figure|figcaption|dd|dt)>/gi, '\n')
        .replace(/<(h[1-6])[^>]*>/gi, '\n## ');
    return cleanText(stripTags(html), 60000)
        .split('\n')
        .map((line) => line.trim())
        .filter((line, index, lines) => line && line !== lines[index - 1])
        .join('\n');
}

/** Best-effort readable text of the page, preferring recipe-plugin containers. */
export function extractReadableText(root: HTMLElement, maxChars = 14000): string {
    const body = root.querySelector('body') ?? root;
    body.querySelectorAll(NOISE).forEach((node) => node.remove());
    for (const selector of RECIPE_CONTAINERS) {
        const candidates = body.querySelectorAll(selector);
        // The longest matching container is usually the real content block.
        const best = candidates
            .map((element) => ({ element, text: elementToText(element) }))
            .sort((a, b) => b.text.length - a.text.length)[0];
        if (best && best.text.length > 400) return best.text.slice(0, maxChars);
    }
    return elementToText(body).slice(0, maxChars);
}
