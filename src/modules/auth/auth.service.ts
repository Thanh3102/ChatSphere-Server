import { Injectable } from '@nestjs/common';
import { CreateUserDTO, SignInDTO } from '../../shared/types';
import { PrismaService } from '../../config/db/prisma.service';
import { Response } from 'express';
import { defaultErrorMessage } from '../../shared/constants/constants';
import * as bcrypt from 'bcrypt';
import MailSender from '../../utils/mailSender';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private userService: UserService,
  ) {}

  async signup(credentials: CreateUserDTO, res: Response) {
    try {
      await this.prisma.$transaction(async (p) => {
        const newUser = await this.userService.create(credentials);

        const otp = Math.floor(1000 + Math.random() * 9000);
        const hashOTP = await bcrypt.hash(otp.toString(), 10);
        const verifyLink = `${process.env.CLIENT_BASE_URL}/verify-email?id=${newUser.id}&otp=${hashOTP}`;
        await p.emailVerifyOTP.create({
          data: {
            otp: hashOTP,
            userId: newUser.id,
            expiredAt: new Date(
              new Date().getTime() + parseInt(process.env.EMAIL_VERIFY_EXPIRE),
            ),
          },
        });
        const mailsender = new MailSender();
        mailsender.sendEmailVerifyOTP(credentials.email, hashOTP, verifyLink);
      });

      return res.status(200).json({
        statusCode: 200,
        message:
          'Tạo tài khoản thành công. Mã xác minh đã được gửi tới email của bạn',
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        statusCode: 500,
        message: error.message ?? defaultErrorMessage,
      });
    }
  }

  async signin(credentials: SignInDTO, res: Response) {
    try {
      const user = await this.userService.findByEmail(credentials.email);
      if (user && (await bcrypt.compare(credentials.password, user.password))) {
        const payload = {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };

        const accessToken = await this.jwtService.signAsync(payload, {
          expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRE,
          secret: process.env.JWT_ACCESS_TOKEN_SECRET,
        });

        const refreshToken = await this.jwtService.signAsync(payload, {
          expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRE,
          secret: process.env.JWT_REFRESH_TOKEN_SECRET,
        });

        return res.status(200).json({
          statusCode: 200,
          message: 'Đăng nhập thành công',
          user: payload,
          accessToken: accessToken,
          refreshToken: refreshToken,
          expiresIn: new Date().setTime(
            new Date().getTime() +
              parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRE_NUMBER),
          ),
        });
      }

      return res.status(401).json({
        statusCode: 401,
        message: 'Tài khoản hoặc mật khẩu không chính xác',
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        statusCode: 500,
        message: error.message ?? defaultErrorMessage,
      });
    }
  }

  async refreshToken(user: any) {
    console.log('refresh new token...');

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRE,
      secret: process.env.JWT_ACCESS_TOKEN_SECRET,
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRE,
      secret: process.env.JWT_REFRESH_TOKEN_SECRET,
    });

    return {
      accessToken: accessToken,
      refreshToken: refreshToken,
      expiresIn: new Date().setTime(
        new Date().getTime() +
          parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRE_NUMBER),
      ),
    };
  }

  async verifyEmailOTP(userId: string, verifyOTP: string, res: Response) {
    try {
      const emailOTP = await this.prisma.user.findFirst({
        where: {
          id: userId,
        },
        select: {
          verifyEmail: true,
        },
      });

      if (!emailOTP) {
        return res.status(404).json({
          statusCode: 404,
          message: 'Tài khoản đã xóa',
        });
      }

      if (emailOTP.verifyEmail) {
        return res.status(200).json({
          statusCode: 200,
          message: 'Tài khoản đã được kích hoạt',
        });
      }

      const { otp, expiredAt } = await this.prisma.emailVerifyOTP.findFirst({
        where: {
          userId: userId,
        },
        select: {
          otp: true,
          expiredAt: true,
        },
      });

      const now = new Date();

      if (now > expiredAt) {
        return res.status(500).json({
          statusCode: 500,
          message:
            'Xác thực thất bại, mã kích hoạt đã hết hạn, vui lòng nhận mã xác thực mới',
        });
      }

      const isCorrectOTP = otp === verifyOTP;

      if (isCorrectOTP) {
        await this.prisma.$transaction(async (p) => {
          await p.user.update({
            where: {
              id: userId,
            },
            data: {
              verifyEmail: true,
            },
          });

          await p.emailVerifyOTP.deleteMany({
            where: {
              userId: userId,
            },
          });
        });

        return res.status(200).json({
          statusCode: 200,
          message: 'Xác thực thành công, tài khoản của bạn đã được kích hoạt',
        });
      } else {
        return res.status(500).json({
          statusCode: 500,
          message:
            'Xác thực thất bại, mã kích hoạt không chính xác, vui lòng thử lại lại',
        });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        statusCode: 500,
        message: 'Xác thực thất bại, vui lòng nhận mã xác thực mới',
      });
    }
  }

  async sendNewEmailVerifyOTP(userId: string, res: Response) {
    try {
      await this.prisma.$transaction(async (p) => {
        await p.emailVerifyOTP.deleteMany({
          where: {
            userId: userId,
          },
        });

        const user = await p.user.findUnique({
          where: {
            id: userId,
          },
          select: {
            email: true,
            id: true,
          },
        });

        const otp = Math.floor(1000 + Math.random() * 9000);
        const hashOTP = await bcrypt.hash(otp.toString(), 10);
        const verifyLink = `${process.env.CLIENT_BASE_URL}/verify-email?id=${user.id}&otp=${hashOTP}`;
        await p.emailVerifyOTP.create({
          data: {
            otp: hashOTP,
            userId: userId,
            expiredAt: new Date(
              new Date().getTime() + parseInt(process.env.EMAIL_VERIFY_EXPIRE),
            ),
          },
        });
        const mailsender = new MailSender();
        mailsender.sendEmailVerifyOTP(user.email, hashOTP, verifyLink);
      });
      return res.status(200).json({
        statusCode: 200,
        message: 'Mã OTP mới được gửi tới email của bạn',
      });
    } catch (error) {
      console.log(error);
      return res.status(200).json({
        statusCode: 500,
        message: 'Tạo mã OTP thất bại, vui lòng thử lại',
      });
    }
  }
}
