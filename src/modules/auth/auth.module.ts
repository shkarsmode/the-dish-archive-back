import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './google.strategy';
import { JwtStrategy } from './jwt.strategy';

@Module({
    imports: [
        PassportModule,
        JwtModule.register({
            secret: process.env.JWT_SECRET || 'development-only-secret',
            signOptions: { expiresIn: '14d' },
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, GoogleStrategy, JwtStrategy],
    exports: [AuthService],
})
export class AuthModule {}
