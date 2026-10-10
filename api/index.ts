import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from '../src/app.module';
import { applyCors, configureApp } from '../src/shared/configure-app';

// Vercel serverless entry. Nest is booted once per warm lambda behind a shared
// Express instance; the `ready` promise guards against a double-init race.
const server = express();
let ready: Promise<void> | null = null;

async function bootstrap() {
    const app = await NestFactory.create(AppModule, new ExpressAdapter(server), { logger: ['error', 'warn'] });
    configureApp(app);
    app.setGlobalPrefix('api');
    await app.init();
}

export default async function handler(req: express.Request, res: express.Response) {
    // CORS preflights are answered before Nest boots, so a cold start never delays them.
    if (req.method === 'OPTIONS' && applyCors(req, res)) return;
    if (!ready) ready = bootstrap();
    await ready;
    server(req, res);
}
