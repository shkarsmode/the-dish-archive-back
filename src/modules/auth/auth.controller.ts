import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { JwtAuthGuard } from '../../shared/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../shared/optional-jwt-auth.guard';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './google-auth.guard';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    // Begin Google OAuth (redirects to Google's consent screen).
    @Get('google')
    @UseGuards(GoogleAuthGuard)
    googleAuth() {
        return null;
    }

    // OAuth callback: provision the user, set the session cookie, and bounce back
    // to the SPA with the token in the URL fragment (Safari cross-site cookie fallback).
    @Get('google/callback')
    @UseGuards(GoogleAuthGuard)
    async googleCallback(@Req() request: Request, @Res() response: Response) {
        const user = await this.authService.upsertGoogleUser(request.user as any);
        this.authService.attachSessionCookie(response, user);
        const token = this.authService.createSessionToken(user);
        const frontend = (process.env.FRONTEND_URL || '/').split(',')[0].trim().replace(/\/$/, '');
        return response.redirect(`${frontend}/#token=${encodeURIComponent(token)}`);
    }

    // Current session: { user, profile, memberships } — or nulls when unauthenticated
    // (200, never 401, since the SPA calls this on every boot).
    @Get('session')
    @UseGuards(OptionalJwtAuthGuard)
    async session(@CurrentUser() user: RequestUser | null) {
        if (!user) return { user: null, profile: null, memberships: [] };
        return this.authService.getSessionData(user.id);
    }

    @Post('logout')
    logout(@Res({ passthrough: true }) response: Response) {
        this.authService.clearSessionCookie(response);
        return { ok: true };
    }

    @Post('touch-last-login')
    @UseGuards(JwtAuthGuard)
    async touchLastLogin(@CurrentUser() user: RequestUser) {
        await this.authService.touchLastLogin(user.id);
        return { ok: true };
    }
}
