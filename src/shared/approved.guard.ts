import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { RequestUser } from './current-user.decorator';

// Requires an approved account (super-admin, or ≥1 approved family membership).
// `approved` is computed in JwtStrategy.validate() so this stays a cheap check.
@Injectable()
export class ApprovedGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const user = context.switchToHttp().getRequest().user as RequestUser | undefined;
        if (!user) {
            throw new ForbiddenException('Потрібна авторизація');
        }
        if (!user.approved) {
            throw new ForbiddenException('Доступ ще не підтверджено');
        }
        return true;
    }
}
