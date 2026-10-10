import { ContentListUnion, GoogleGenAI, MediaResolution, ThinkingLevel } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { AI_ERROR, AI_MAX_OUTPUT_TOKENS, AI_TEMPERATURE, aiModel, aiTimeoutMs } from './ai.constants';
import { AiError } from './ai.types';

export interface GeminiUsage {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    cachedTokens: number | null;
    thoughtsTokens: number | null;
    /** Prompt tokens billed at the audio rate (video soundtracks, voice notes). */
    audioInputTokens?: number | null;
}

export interface GeminiStructuredResult {
    text: string;
    usage: GeminiUsage;
    model: string;
}

export interface GeminiStructuredOptions {
    systemInstruction: string;
    /** A plain prompt, or multimodal contents (text + inline images + file URIs). */
    prompt?: string;
    contents?: ContentListUnion;
    schema: unknown;
    model?: string;
    timeoutMs?: number;
    maxOutputTokens?: number;
    temperature?: number;
    mediaResolution?: MediaResolution;
    thinkingLevel?: ThinkingLevel;
}

// Thin wrapper around the official @google/genai SDK - the ONLY place Gemini is
// called. Enforces a hard timeout (the SDK's own timeout is unreliable, so we combine
// an AbortController with a Promise.race) and normalizes SDK errors into AiError codes.
@Injectable()
export class GeminiService {
    private readonly logger = new Logger(GeminiService.name);
    private client: GoogleGenAI | null = null;

    isConfigured(): boolean {
        return Boolean((process.env.GEMINI_API_KEY || '').trim());
    }

    getModel(): string {
        return aiModel();
    }

    private getClient(): GoogleGenAI {
        const apiKey = (process.env.GEMINI_API_KEY || '').trim();
        if (!apiKey) {
            throw new AiError(AI_ERROR.NOT_CONFIGURED, 'Gemini API key is not configured', 503);
        }
        if (!this.client) {
            this.client = new GoogleGenAI({ apiKey });
        }
        return this.client;
    }

    async generateStructured(options: GeminiStructuredOptions): Promise<GeminiStructuredResult> {
        const client = this.getClient();
        const model = options.model || this.getModel();
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, options.timeoutMs ?? aiTimeoutMs());

        try {
            const generation = client.models.generateContent({
                model,
                contents: options.contents ?? options.prompt ?? '',
                config: {
                    systemInstruction: options.systemInstruction,
                    responseMimeType: 'application/json',
                    responseSchema: options.schema as never,
                    temperature: options.temperature ?? AI_TEMPERATURE,
                    maxOutputTokens: options.maxOutputTokens ?? AI_MAX_OUTPUT_TOKENS,
                    ...(options.mediaResolution ? { mediaResolution: options.mediaResolution } : {}),
                    ...(options.thinkingLevel ? { thinkingConfig: { thinkingLevel: options.thinkingLevel } } : {}),
                    abortSignal: controller.signal,
                },
            });

            const timeout = new Promise<never>((_, reject) => {
                controller.signal.addEventListener('abort', () => {
                    reject(new AiError(AI_ERROR.TIMEOUT, 'Gemini request timed out', 504));
                });
            });

            const response = await Promise.race([generation, timeout]);
            const usage = response.usageMetadata;
            const audioInputTokens = (usage?.promptTokensDetails || [])
                .filter((detail) => String(detail.modality || '').toUpperCase() === 'AUDIO')
                .reduce((sum, detail) => sum + (Number(detail.tokenCount) || 0), 0);
            return {
                text: response.text ?? '',
                model,
                usage: {
                    inputTokens: numberOrNull(usage?.promptTokenCount),
                    outputTokens: numberOrNull(usage?.candidatesTokenCount),
                    totalTokens: numberOrNull(usage?.totalTokenCount),
                    cachedTokens: numberOrNull(usage?.cachedContentTokenCount),
                    thoughtsTokens: numberOrNull(usage?.thoughtsTokenCount),
                    audioInputTokens,
                },
            };
        } catch (error) {
            if (timedOut || (error instanceof AiError && error.code === AI_ERROR.TIMEOUT)) {
                throw new AiError(AI_ERROR.TIMEOUT, 'Gemini request timed out', 504);
            }
            throw this.normalizeError(error);
        } finally {
            clearTimeout(timer);
        }
    }

    // Map SDK/HTTP errors to safe codes - never surface raw provider messages.
    private normalizeError(error: unknown): AiError {
        if (error instanceof AiError) return error;
        const status = Number((error as { status?: number })?.status || 0);
        const message = String((error as { message?: string })?.message || '');
        this.logger.warn(`Gemini call failed: ${status || ''} ${message.slice(0, 300)}`);
        if (status === 429 || /rate limit|resource exhausted|quota/i.test(message)) {
            return new AiError(AI_ERROR.RATE_LIMIT, 'Gemini rate limit reached', 429);
        }
        if (status === 401 || status === 403 || /api key|permission/i.test(message)) {
            return new AiError(AI_ERROR.NOT_CONFIGURED, 'Gemini authentication failed', 503);
        }
        if (status === 400 && /video|youtube|file|uri|media/i.test(message)) {
            return new AiError(AI_ERROR.MEDIA_UNSUPPORTED, 'Gemini could not read the media', 422);
        }
        return new AiError(AI_ERROR.GEMINI_ERROR, 'Gemini request failed', 502);
    }
}

function numberOrNull(value: unknown): number | null {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
}
