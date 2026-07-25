import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Populates request.user when a valid session is present, but never rejects —
// used by public/shareable endpoints that behave differently for members.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
    canActivate(context: ExecutionContext) {
        return super.canActivate(context);
    }

    handleRequest(_err: any, user: any) {
        // Swallow errors / missing user: return null instead of throwing.
        return user || null;
    }
}
