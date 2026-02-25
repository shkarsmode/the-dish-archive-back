import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.enableCors({ origin: true, credentials: true });
    app.setGlobalPrefix('api');
    const port = process.env['PORT'] ?? 3000;
    await app.listen(port);
    console.log(`🍽️  The Dish Archive API running on http://localhost:${port}/api`);
}
bootstrap();
