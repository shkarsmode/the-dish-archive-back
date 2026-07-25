import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './shared/configure-app';

// Local dev entrypoint (`npm run start:dev`). On Vercel the app boots via api/index.ts.
async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    configureApp(app);
    app.setGlobalPrefix('api');
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    // eslint-disable-next-line no-console
    console.log(`🍽️  The Dish Archive API on http://localhost:${port}/api`);
}
bootstrap();
