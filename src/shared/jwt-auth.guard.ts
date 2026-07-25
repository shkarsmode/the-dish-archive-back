import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Requires a valid session (cookie or Bearer). 401 otherwise.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
