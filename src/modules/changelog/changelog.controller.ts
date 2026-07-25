import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { OptionalJwtAuthGuard } from '../../shared/optional-jwt-auth.guard';
import { ChangelogService } from './changelog.service';

@Controller('changelog')
export class ChangelogController {
    constructor(private readonly changelog: ChangelogService) {}

    // Read: optional auth — an anonymous caller sees only global + public-family
    // rows; a member additionally sees their families' rows (mirrors changelog_select).
    @Get()
    @UseGuards(OptionalJwtAuthGuard)
    list(@CurrentUser() user: RequestUser | null) {
        return this.changelog.list(user);
    }
}
