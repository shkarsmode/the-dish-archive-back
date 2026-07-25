import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

// Salvaged from the old backend. Uploads recipe/family imagery to Cloudinary and
// returns a stable, public HTTPS URL (the only shape the SPA consumes).
@Injectable()
export class CloudinaryService {
    private readonly logger = new Logger(CloudinaryService.name);

    constructor() {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? '',
            api_key: process.env.CLOUDINARY_API_KEY ?? '',
            api_secret: process.env.CLOUDINARY_API_SECRET ?? '',
        });
    }

    async uploadImage(
        file: Express.Multer.File,
        folder = 'dish-archive',
    ): Promise<{ url: string; publicId: string }> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    resource_type: 'image',
                    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
                },
                (error, result?: UploadApiResponse) => {
                    if (error || !result) {
                        this.logger.error('Cloudinary upload failed', error as Error);
                        return reject(error ?? new Error('Empty Cloudinary result'));
                    }
                    resolve({ url: result.secure_url, publicId: result.public_id });
                },
            );
            const stream = new Readable();
            stream.push(file.buffer);
            stream.push(null);
            stream.pipe(uploadStream);
        });
    }
}
