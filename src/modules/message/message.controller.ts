import { JwtGuard } from 'src/guards/jwt/jwt.guard';
import { MessageService } from './message.service';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  CreateConversationDto,
  CreateMessageDto,
  UploadFileDto,
} from './message.dto';
import { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';

@Controller('/api/message')
export class MessageController {
  constructor(private messageService: MessageService) {}

  @UseGuards(JwtGuard)
  @Post('/createConversation')
  createConversation(
    @Body() dto: CreateConversationDto,
    @Req() req,
    @Res() res: Response,
  ) {
    return this.messageService.createConversation(dto, req, res);
  }

  @UseGuards(JwtGuard)
  @Post('/sendMessage')
  sendMessage(@Body() dto: CreateMessageDto, @Req() req, @Res() res: Response) {
    return this.messageService.createNewMessage(dto, req, res);
  }

  @UseGuards(JwtGuard)
  @Post('/uploadFileAttach')
  @UseInterceptors(FileInterceptor('attachFile'))
  uploadAttachFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadFileDto,
    @Req() req,
    @Res() res: Response,
  ) {
    return this.messageService.uploadFileAttach(
      { file: file, conversationId: body.conversationId },
      req,
      res,
    );
  }

  @UseGuards(JwtGuard)
  @Get('/getConversation')
  getConversation(@Req() req, @Res() res: Response) {
    return this.messageService.getUserConversation(req.user.id, res);
  }

  @UseGuards(JwtGuard)
  @Get('/getConversationInfo')
  getConversationInfo(
    @Query('id') conversationId: string,
    @Req() req,
    @Res() res: Response,
  ) {
    return this.messageService.getConversationInfo(conversationId, req, res);
  }

  @UseGuards(JwtGuard)
  @Get('/getConversationMessages')
  getConversationMessages(
    @Query('id') conversationId: string,
    @Req() req,
    @Res() res: Response,
  ) {
    return this.messageService.getConversationMessages(
      conversationId,
      req,
      res,
    );
  }

  @UseGuards(JwtGuard)
  @Get('/getOlderMessages')
  getOlderMessages(
    @Query()
    {
      id: conversationId,
      before,
      to,
    }: { id: string; before: string; to: string },
    @Res() res: Response,
  ) {
    const beforeDate = new Date(before);
    const toDate = to ? new Date(to) : undefined;

    return this.messageService.getOlderConversationMessages(
      {
        conversationId: conversationId,
        before: beforeDate,
        to: toDate,
      },
      res,
    );
  }

  @UseGuards(JwtGuard)
  @Post('/checkConversationExists')
  checkConversationExists(@Body() body, @Req() req, @Res() res: Response) {
    return this.messageService.checkConversationExists(body.userIds, req, res);
  }

  @UseGuards(JwtGuard)
  @Post('/recallMessage')
  recallMessage(@Query('id') id: string, @Res() res: Response) {
    return this.messageService.recallMessage(id, res);
  }
}
