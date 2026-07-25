import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// The authenticated principal attached to the request by JwtStrategy.validate().
export type RequestUser = {
    id: string;
    email: string;
    displayName: string | null;
    globalRole: string;
    // Derived: super-admin OR has ≥1 approved family membership.
    approved: boolean;
};

export const CurrentUser = createParamDecorator(
    (_: unknown, context: ExecutionContext): RequestUser | null => {
        const request = context.switchToHttp().getRequest();
        return request.user || null;
    },
);
