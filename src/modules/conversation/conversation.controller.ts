import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { JwtGuard } from 'src/guards/jwt/jwt.guard';
import { CreateConversationDto } from 'src/shared/types';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('/api/conversation')
export class ConversationController {
  constructor(private conversationService: ConversationService) {}

  @UseGuards(JwtGuard)
  @Post('/createConversation')
  createConversation(
    @Body() dto: CreateConversationDto,
    @Req() req,
    @Res() res: Response,
  ) {
    return this.conversationService.createConversation(dto, req, res);
  }

  @UseGuards(JwtGuard)
  @Get('/getUserConversations')
  getUserConversations(@Req() req, @Res() res: Response) {
    return this.conversationService.getUserConversations(req.user.id, res);
  }

  @UseGuards(JwtGuard)
  @Get('/getConversationInfo')
  getConversationInfo(
    @Query('id') conversationId: string,
    @Req() req,
    @Res() res: Response,
  ) {
    return this.conversationService.getConversationInfo(
      conversationId,
      req,
      res,
    );
  }

  @UseGuards(JwtGuard)
  @Post('/checkConversationExists')
  checkConversationExists(@Body() body, @Req() req, @Res() res: Response) {
    return this.conversationService.checkConversationExists(
      body.userIds,
      req,
      res,
    );
  }

  @UseGuards(JwtGuard)
  @Get('/getConversationFile')
  getConversationFile(@Query() { id, before, type }, @Res() res: Response) {
    if (!id) {
      throw new BadRequestException();
    }
    const payload: any = { conversationId: id, type: type };
    if (before) payload.before = new Date(before);

    return this.conversationService.getConversationFile(payload, res);
  }

  @UseGuards(JwtGuard)
  @Put('/updateConversationSetting')
  @UseInterceptors(FileInterceptor('image'))
  updateConversationSetting(
    @UploadedFile() image: Express.Multer.File,
    @Body()
    dto: { id: string; emoji: string; groupName: string },
    @Req() req,
    @Res() res: Response,
  ) {
    return this.conversationService.updateConversationSetting(
      { ...dto, groupImage: image },
      req,
      res,
    );
  }

  @UseGuards(JwtGuard)
  @Post('/addNewMember')
  addNewMember(
    @Body() body: { conversationId: string; newMemberIds: string[] },
    @Req() req,
    @Res() res: Response,
  ) {
    return this.conversationService.addNewMember(
      {
        addedUserId: req.user.id,
        conversationId: body.conversationId,
        newMemberIds: body.newMemberIds,
      },
      res,
    );
  }

  @UseGuards(JwtGuard)
  @Delete('/removeMember')
  removeMember(
    @Body() body: { conversationId: string; removeId: string },
    @Req() req,
    @Res() res: Response,
  ) {
    return this.conversationService.removeMember(
      {
        conversationId: body.conversationId,
        removeId: body.removeId,
        removeUserId: req.user.id,
      },
      res,
    );
  }

  @UseGuards(JwtGuard)
  @Put('/promoteMember')
  promoteMember(
    @Body() body: { memberId: string },
    @Req() req,
    @Res() res: Response,
  ) {
    return this.conversationService.promoteMember(body.memberId, req, res);
  }

  @UseGuards(JwtGuard)
  @Put('/downgradeMember')
  downgradeMember(
    @Body() body: { memberId: string },
    @Req() req,
    @Res() res: Response,
  ) {
    return this.conversationService.downgradeMember(body.memberId, req, res);
  }

  @UseGuards(JwtGuard)
  @Put('/leftGroup')
  leftGroup(
    @Body() body: { memberId: string },
    @Res() res: Response,
  ) {
    return this.conversationService.leftConversation(body.memberId, res);
  }
}
