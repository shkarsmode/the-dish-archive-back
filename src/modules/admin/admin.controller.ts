import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { JwtAuthGuard } from '../../shared/jwt-auth.guard';
import { SuperAdminGuard } from '../../shared/super-admin.guard';
import { AdminService } from './admin.service';
import { CreateFamilyDto } from './dto/create-family.dto';

// Super-admin-only dashboard. Note: /admin/access-requests lives in the
// access-requests module, not here.
@Controller('admin')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminController {
    constructor(private readonly admin: AdminService) {}

    @Get('stats')
    stats() {
        return this.admin.stats();
    }

    @Get('families')
    families() {
        return this.admin.families();
    }

    @Post('families')
    createFamily(@CurrentUser() user: RequestUser, @Body() body: CreateFamilyDto) {
        return this.admin.createFamily(user, body);
    }

    @Get('users')
    users() {
        return this.admin.users();
    }

    @Get('activity')
    activity(@Query('limit') limit?: string) {
        return this.admin.activity(limit);
    }
}
