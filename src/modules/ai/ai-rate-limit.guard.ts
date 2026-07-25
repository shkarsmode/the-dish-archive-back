import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AI_COOLDOWN_MS, AI_MAX_PER_WINDOW, AI_WINDOW_MS } from './ai.constants';

// Per-user burst guard for the AI parse endpoint: a minimum cooldown between calls
// plus a rolling-window cap. In-memory + per-instance — a soft abuse guard, not the
// daily quota (that's enforced against the usage log in the service). On a block the
// client gets a 429 with retryAfterMs so the UI can show a countdown.
@Injectable()
export class AiRateLimitGuard implements CanActivate {
    private readonly hits = new Map<string, number[]>();
    private readonly last = new Map<string, number>();

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const key = request.user?.id || request.ip || 'anon';
        const now = Date.now();

        const lastAt = this.last.get(key) || 0;
        const sinceLast = now - lastAt;
        if (sinceLast < AI_COOLDOWN_MS) {
            this.reject('Зачекай трохи перед наступним AI-запитом.', AI_COOLDOWN_MS - sinceLast);
        }

        const stamps = (this.hits.get(key) || []).filter((stamp) => now - stamp < AI_WINDOW_MS);
        if (stamps.length >= AI_MAX_PER_WINDOW) {
            this.reject('Забагато AI-запитів. Спробуй за хвилину.', AI_WINDOW_MS - (now - stamps[0]));
        }

        stamps.push(now);
        this.hits.set(key, stamps);
        this.last.set(key, now);
        if (this.hits.size > 1000) {
            this.hits.clear();
            this.last.clear();
        }
        return true;
    }

    private reject(message: string, retryAfterMs: number): never {
        throw new HttpException(
            { code: 'AI_RATE_LIMIT', message, retryAfterMs: Math.max(0, Math.round(retryAfterMs)) },
            HttpStatus.TOO_MANY_REQUESTS,
        );
    }
}
