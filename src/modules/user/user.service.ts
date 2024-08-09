import { Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { PrismaService } from '../../config/db/prisma.service';
import { CreateUserDTO, UpdateUserDTO } from '../..//shared/types';
import { defaultErrorMessage } from '../..//shared/constants/constants';
import {
  UserBasicSelect,
  UserDetailSelect,
} from 'src/shared/constants/prismaSelector';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  private async findById(userId: string, detail: boolean) {
    if (detail) {
      const user = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: UserDetailSelect,
      });
      return user;
    } else {
      const user = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: UserBasicSelect,
      });
      return user;
    }
  }

  private uploadAvatar(userId: string, file: Express.Multer.File) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const uploadPromise = new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: 'auto',
            public_id: `${userId}_${Date.now()}`,
            folder: `/avatar/${userId}`,
          },
          (error, result) => {
            if (error) {
              reject(error.message);
            } else {
              resolve(result);
            }
          },
        )
        .end(file.buffer);
    });

    return uploadPromise;
  }

  async updateAvatar(userId: string, file: Express.Multer.File, res: Response) {
    try {
      const response = await this.uploadAvatar(userId, file);
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          image: response.url,
        },
      });
      return res.status(200).json({ message: 'Cập nhật thành công' });
    } catch (error) {
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async getById(userId: string, getDetail: boolean, res: Response) {
    const user = await this.findById(userId, getDetail);
    if (user) {
      return res.status(200).json(user);
    }
    return res.status(404).json({
      message: 'Id không tồn tại',
    });
  }

  async searchByName(
    queryName: string,
    skipIds: string | string[],
    req: any,
    res: Response,
  ) {
    try {
      if (!queryName) {
        return res.status(200).json({ data: [] });
      }
      const requestUserId = req.user.id;

      const users = await this.prisma.user.findMany({
        where: {
          name: {
            startsWith: queryName,
          },
          NOT: {
            id: {
              in: skipIds
                ? typeof skipIds === 'string'
                  ? [skipIds, requestUserId]
                  : [requestUserId, ...skipIds]
                : [requestUserId],
            },
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      });

      return res.status(200).json({ data: users });
    } catch (error) {
      console.log(error);
      return res
        .status(500)
        .json({ message: error.message ?? defaultErrorMessage });
    }
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: email,
      },
    });
    return user;
  }

  async create(credentials: CreateUserDTO) {
    const existsEmail = await this.prisma.user.findFirst({
      where: {
        email: credentials.email,
      },
    });

    if (existsEmail) {
      throw new Error('Email đã được sử dụng');
    }

    const newUser = await this.prisma.user.create({
      data: {
        name: credentials.name,
        password: await bcrypt.hash(credentials.password, 10),
        email: credentials.email,
        image: null,
      },
    });
    return newUser;
  }

  async update(dto: UpdateUserDTO) {
    return null;
  }

  async updateSocket(userId: string, socketId: string) {
    try {
      await this.prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          socketId: socketId,
          isOnline: true,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  async clearSocket(socketId: string) {
    try {
      await this.prisma.user.updateMany({
        where: {
          socketId: socketId,
        },
        data: {
          socketId: null,
          isOnline: false,
          lastOnlineAt: new Date(),
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  async getUserBySocketId(socketId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        socketId: socketId,
      },
      select: UserBasicSelect,
    });
    return user;
  }
}
