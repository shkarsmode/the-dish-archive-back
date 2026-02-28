import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { ChangelogService } from './changelog.service';

@Controller('changelog')
export class ChangelogController {
    constructor(private readonly changelogService: ChangelogService) {}

    @Get()
    async getAll() {
        return this.changelogService.getGroupedByDate();
    }

    @Post()
    @UseGuards(AdminGuard)
    async create(@Body() body: any) {
        return this.changelogService.create(body);
    }
}
