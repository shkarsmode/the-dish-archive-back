import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(configService: ConfigService) {
        super({
            clientID: configService.get<string>('GOOGLE_CLIENT_ID') || 'missing-google-client-id',
            clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || 'missing-google-client-secret',
            callbackURL:
                configService.get<string>('GOOGLE_CALLBACK_URL') ||
                'http://localhost:3000/api/auth/google/callback',
            scope: ['email', 'profile'],
        });
    }

    validate(accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) {
        const email = profile.emails?.[0]?.value;
        if (!email) {
            return done(new Error('Google account has no email'), false);
        }
        done(null, {
            googleId: profile.id,
            email: email.toLowerCase(),
            displayName: profile.displayName || email,
            avatarUrl: profile.photos?.[0]?.value || null,
            accessToken,
            refreshToken,
        });
    }
}
