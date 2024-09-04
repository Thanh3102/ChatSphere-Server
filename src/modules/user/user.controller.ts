import { UserService } from './user.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { JwtGuard } from 'src/guards/jwt/jwt.guard';
import { ChangePasswordDTO, UpdateUserDTO } from './user.dto';

@Controller('api/user')
export class UserController {
  constructor(private userService: UserService) {}

  @UseGuards(JwtGuard)
  @Get('/search/name')
  searchByName(
    @Query('name') name: string,
    @Query('skipId') skipIds: string | string[],
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.userService.searchByName(name, skipIds, req, res);
  }

  @UseGuards(JwtGuard)
  @Get('/getById')
  async getById(@Query() { id, getDetail }, @Res() res: Response) {
    return this.userService.getById(id, getDetail === 'true', res);
  }

  @UseGuards(JwtGuard)
  @Post('/updateAvatar')
  @UseInterceptors(FileInterceptor('avatar'))
  async updateAvatar(
    @UploadedFile() avatarFile: Express.Multer.File,
    @Req() req: any,
    @Res() res: Response,
  ) {
    return this.userService.updateAvatar(req.user.id, avatarFile, res);
  }

  @UseGuards(JwtGuard)
  @Post('/update')
  async update(@Body() dto: UpdateUserDTO, @Res() res: Response) {
    return this.userService.update(dto, res);
  }

  @UseGuards(JwtGuard)
  @Post('/changePassword')
  async changePassword(@Body() dto: ChangePasswordDTO, @Res() res: Response) {
    return this.userService.changePassword(dto, res);
  }

  @Get('/checkEmailVerify')
  checkEmailVerify(@Query('id') id: string, @Res() res: Response) {
    return this.userService.checkEmailVerify(id, res);
  }
}
