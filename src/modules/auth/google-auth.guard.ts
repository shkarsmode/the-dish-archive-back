import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Kicks off the Google OAuth redirect flow.
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}
