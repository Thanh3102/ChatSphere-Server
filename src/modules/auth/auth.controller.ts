import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Response } from 'express';
import { CreateUserDTO } from '../user/user.dto';
import { SignInDTO } from './auth.dto';
import { RefreshGuard } from 'src/guards/jwt/refresh.guard';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('/signup')
  signup(@Body() credentials: CreateUserDTO, @Res() res: Response) {
    return this.authService.signup(credentials, res);
  }

  @Post('/signin')
  signin(@Body() credentials: SignInDTO, @Res() res: Response) {
    return this.authService.signin(credentials, res);
  }

  @UseGuards(RefreshGuard)
  @Post('/refresh')
  refresh(@Req() req) {
    return this.authService.refreshToken(req.user);
  }

  @Post('/verify-email')
  verifyEmail(
    @Query('id') userId: string,
    @Query('otp') otp: string,
    @Res() res: Response,
  ) {
    return this.authService.verifyEmailOTP(userId, otp, res);
  }

  @Post('/resend-verify-email')
  sendNewEmailVerifyOTP(@Query('id') userId: string, @Res() res: Response) {
    return this.authService.sendNewEmailVerifyOTP(userId, res);
  }
}
