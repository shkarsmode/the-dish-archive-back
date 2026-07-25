import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { isSuperAdmin } from './admin';
import { RequestUser } from './current-user.decorator';

// Restricts a route to the global super-admin.
@Injectable()
export class SuperAdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const user = context.switchToHttp().getRequest().user as RequestUser | undefined;
        if (!isSuperAdmin(user)) {
            throw new ForbiddenException('Лише для головного адміністратора');
        }
        return true;
    }
}
