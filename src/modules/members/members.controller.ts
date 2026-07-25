import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApprovedGuard } from '../../shared/approved.guard';
import { CurrentUser, RequestUser } from '../../shared/current-user.decorator';
import { JwtAuthGuard } from '../../shared/jwt-auth.guard';
import { AddMemberDto } from './dto/add-member.dto';
import { SetRoleDto } from './dto/set-role.dto';
import { MembersService } from './members.service';

// Family membership management. familyId comes from the path; authz is always
// derived from the DB entity, never trusted from the client.
@Controller('families/:familyId/members')
export class MembersController {
    constructor(private readonly members: MembersService) {}

    @Get()
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    list(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string) {
        return this.members.list(user, familyId);
    }

    @Post()
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    add(@CurrentUser() user: RequestUser, @Param('familyId') familyId: string, @Body() body: AddMemberDto) {
        return this.members.add(user, familyId, body);
    }

    @Patch(':memberId/role')
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    setRole(
        @CurrentUser() user: RequestUser,
        @Param('familyId') familyId: string,
        @Param('memberId') memberId: string,
        @Body() body: SetRoleDto,
    ) {
        return this.members.setRole(user, familyId, memberId, body);
    }

    @Delete(':memberId')
    @UseGuards(JwtAuthGuard, ApprovedGuard)
    remove(
        @CurrentUser() user: RequestUser,
        @Param('familyId') familyId: string,
        @Param('memberId') memberId: string,
    ) {
        return this.members.remove(user, familyId, memberId);
    }
}
