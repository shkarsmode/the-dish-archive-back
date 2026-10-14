import { ExecutionContext, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Populates request.user when a valid session is present, but never rejects —
// used by public/shareable endpoints that behave differently for members.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
    canActivate(context: ExecutionContext) {
        return super.canActivate(context);
    }

    handleRequest(err: any, user: any) {
        // A missing, expired or forged token only means "anonymous" (passport reports
        // those without `err`). `err` is a failure while checking a valid token, e.g.
        // the database waking up: answering "signed out" then would make the SPA drop
        // a good session, so fail the request instead and let it keep the user.
        if (err) throw err instanceof HttpException ? err : new ServiceUnavailableException('Session check failed');
        return user || null;
    }
}
