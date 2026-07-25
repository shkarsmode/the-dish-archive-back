import { IsOptional, IsString } from 'class-validator';

// Body for POST /admin/access-requests/:id/reject (was reject_access_request).
export class RejectDto {
    @IsOptional()
    @IsString()
    note?: string;
}
