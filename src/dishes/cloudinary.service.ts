import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
    private readonly logger = new Logger(CloudinaryService.name);

    constructor() {
        cloudinary.config({
            cloud_name: process.env['CLOUDINARY_CLOUD_NAME'] ?? '',
            api_key: process.env['CLOUDINARY_API_KEY'] ?? '',
            api_secret: process.env['CLOUDINARY_API_SECRET'] ?? '',
        });
        this.logger.log(
            `Cloudinary configured for cloud: ${process.env['CLOUDINARY_CLOUD_NAME'] ?? '(not set)'}`,
        );
    }

    async uploadImage(file: Express.Multer.File): Promise<{ url: string; publicId: string }> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'dish-archive',
                    resource_type: 'image',
                    transformation: [
                        { quality: 'auto', fetch_format: 'auto' },
                    ],
                },
                (error, result?: UploadApiResponse) => {
                    if (error || !result) {
                        this.logger.error('Cloudinary upload failed', error);
                        return reject(error ?? new Error('Empty Cloudinary result'));
                    }
                    resolve({
                        url: result.secure_url,
                        publicId: result.public_id,
                    });
                },
            );

            const stream = new Readable();
            stream.push(file.buffer);
            stream.push(null);
            stream.pipe(uploadStream);
        });
    }

    async deleteImage(publicId: string): Promise<void> {
        try {
            await cloudinary.uploader.destroy(publicId);
            this.logger.log(`Deleted image: ${publicId}`);
        } catch (error) {
            this.logger.error(`Failed to delete image: ${publicId}`, error);
        }
    }
}
