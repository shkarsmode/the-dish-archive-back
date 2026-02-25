import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from '../src/app.module';

const server = express();
let isInitialized = false;

async function bootstrap() {
    if (isInitialized) return;
    const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
    app.enableCors({ origin: true, credentials: true });
    app.setGlobalPrefix('api');
    await app.init();
    isInitialized = true;
}

export default async function handler(req: any, res: any) {
    await bootstrap();
    server(req, res);
}
