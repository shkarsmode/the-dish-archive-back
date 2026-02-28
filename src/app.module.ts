import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { ChangelogModule } from './changelog/changelog.module';
import { DatabaseModule } from './database/database.module';
import { DishesModule } from './dishes/dishes.module';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dish-archive-super-secret-key-change-me';

@Module({
    imports: [
        JwtModule.register({
            global: true,
            secret: JWT_SECRET,
            signOptions: { expiresIn: '7d' },
        }),
        DatabaseModule,
        AuthModule,
        DishesModule,
        ChangelogModule,
    ],
})
export class AppModule {}
