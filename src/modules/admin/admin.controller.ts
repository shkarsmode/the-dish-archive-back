import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/jwt-auth.guard';
import { SuperAdminGuard } from '../../shared/super-admin.guard';
import { AdminService } from './admin.service';

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

    @Get('users')
    users() {
        return this.admin.users();
    }

    @Get('activity')
    activity(@Query('limit') limit?: string) {
        return this.admin.activity(limit);
    }
}
