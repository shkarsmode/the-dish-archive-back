import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApprovedGuard } from '../../shared/approved.guard';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { JwtAuthGuard } from '../../shared/jwt-auth.guard';
import { AccessRequestsService } from './access-requests.service';
import { ApproveDto } from './dto/approve.dto';
import { RejectDto } from './dto/reject.dto';
import { RequestAccessDto } from './dto/request-access.dto';

@Controller('access-requests')
export class AccessRequestsController {
    constructor(private readonly accessRequests: AccessRequestsService) {}

    // Any authenticated user (even not-yet-approved) may file an access request.
    @Post()
    @UseGuards(JwtAuthGuard)
    request(@CurrentUser() user: RequestUser, @Body() body: RequestAccessDto) {
        return this.accessRequests.requestAccess(user, body);
    }
}

@Controller('admin/access-requests')
export class AdminAccessRequestsController {
    constructor(private readonly accessRequests: AccessRequestsService) {}

    // Review surface: scoped in the service to what the caller may see.
    @Get()
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    list(@CurrentUser() user: RequestUser) {
        return this.accessRequests.listForAdmin(user);
    }

    @Post(':id/approve')
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    approve(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: ApproveDto) {
        return this.accessRequests.approve(user, id, body);
    }

    @Post(':id/reject')
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    reject(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: RejectDto) {
        return this.accessRequests.reject(user, id, body);
    }
}
