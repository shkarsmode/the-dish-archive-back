import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChangelogEntry } from '../database/entities/changelog.entity';
import { ChangelogController } from './changelog.controller';
import { ChangelogService } from './changelog.service';

@Module({
    imports: [TypeOrmModule.forFeature([ChangelogEntry])],
    controllers: [ChangelogController],
    providers: [ChangelogService],
    exports: [ChangelogService],
})
export class ChangelogModule {}
