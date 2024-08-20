import { Injectable } from '@nestjs/common';
import { UploadApiOptions } from 'cloudinary';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  uploadFile(file: Express.Multer.File, config: UploadApiOptions) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const uploadPromise = new Promise<any>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(config, (error, result) => {
          if (error) {
            reject(error.message);
          } else {
            resolve(result);
          }
        })
        .end(file.buffer);
    });

    return uploadPromise;
  }
}
