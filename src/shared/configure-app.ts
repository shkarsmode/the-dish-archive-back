import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';

function normalizeOrigin(origin: string) {
    return origin.trim().replace(/\/+$/, '');
}

function buildAllowedOrigins(): string[] {
    const allowed = String(process.env.FRONTEND_URL || 'http://localhost:4200')
        .split(',')
        .map(normalizeOrigin)
        .filter(Boolean);

    ['http://localhost:4200', 'http://127.0.0.1:4200', 'https://the-dish-archive.vercel.app'].forEach(
        (origin) => {
            const normalized = normalizeOrigin(origin);
            if (!allowed.includes(normalized)) allowed.push(normalized);
        },
    );

    return allowed;
}

/**
 * Apply the CORS headers for this request. Returns true when the request was a
 * preflight and has been answered. Browsers cache a preflight for
 * Access-Control-Max-Age seconds (Chrome caps it at 2 h), so the SPA stops paying an
 * extra round trip in front of every authorized API call.
 */
export function applyCors(request: Request, response: Response, allowedOrigins = buildAllowedOrigins()): boolean {
    const origin = request.headers.origin;
    const normalized = typeof origin === 'string' ? normalizeOrigin(origin) : '';
    const isAllowed = !origin || allowedOrigins.includes(normalized);

    if (isAllowed && origin) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Credentials', 'true');
        response.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
        const requested = request.headers['access-control-request-headers'];
        response.setHeader(
            'Access-Control-Allow-Headers',
            Array.isArray(requested) ? requested.join(', ') : requested || 'Content-Type, Authorization',
        );
        response.setHeader('Access-Control-Max-Age', '7200');
    }

    if (request.method === 'OPTIONS') {
        response.status(isAllowed ? 204 : 403).end();
        return true;
    }
    return false;
}

// Credentialed CORS (cookies), JSON body limits, cookie parsing, and a strict
// validation pipe. Applied by both the local (main.ts) and serverless (api) entry.
export function configureApp(app: INestApplication) {
    const allowedOrigins = buildAllowedOrigins();

    app.use((request: Request, response: Response, next: NextFunction) => {
        if (!applyCors(request, response, allowedOrigins)) next();
    });

    // 4 MB fits the AI importer's downsized photos (Vercel caps request bodies at 4.5 MB).
    app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '4mb' }));
    app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || '4mb' }));
    app.use(cookieParser());

    app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
}
