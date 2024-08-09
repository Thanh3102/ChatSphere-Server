import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Observable } from 'rxjs';

@Injectable()
export class RefreshGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) throw new UnauthorizedException();
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_REFRESH_TOKEN_SECRET,
      });
      request['user'] = payload;
    } catch (error) {
      console.log('Invalid refresh token');
      throw new UnauthorizedException();
    }

    return true;
  }

  private extractTokenFromHeader(req: Request) {
    const [type, token] = req.headers.authorization.split(' ') ?? [];
    return type === 'Refresh' ? token : undefined;
  }
}
