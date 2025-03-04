import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
  Request,
  Get,
  Delete,
  HttpCode,
  HttpStatus,
  HttpException,
  Res,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiProperty,
} from '@nestjs/swagger'
import { AuthGuard } from '../auth/guards/auth.guard'
import {
  ReceivedSMSDTO,
  RegisterDeviceInputDTO,
  RetrieveSMSResponseDTO,
  SendBulkSMSInputDTO,
  SendSMSInputDTO,
} from './gateway.dto'
import { GatewayService } from './gateway.service'
import { CanModifyDevice } from './guards/can-modify-device.guard'
import { Log } from './schemas/log.schema'
import { ScrcpyGateway } from './scrcpy.gateway'
import { Response } from 'express'
import * as path from 'path'
import * as fs from 'fs'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'

export class AdbShellInputDTO {
  @ApiProperty()
  command: string
}

@ApiTags('gateway')
@ApiBearerAuth()
@Controller('gateway')
export class GatewayController {
  constructor(
    private readonly gatewayService: GatewayService,
    private readonly scrcpyGateway: ScrcpyGateway,
  ) {}

  @UseGuards(AuthGuard)
  @Get('/stats')
  async getStats(@Request() req) {
    const data = await this.gatewayService.getStatsForUser(req.user)
    return { data }
  }

  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Register device' })
  @Post('/devices')
  async registerDevice(@Body() input: RegisterDeviceInputDTO, @Request() req) {
    const data = await this.gatewayService.registerDevice(input, req.user)
    return { data }
  }

  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List of registered devices' })
  @Get('/devices')
  async getDevices(@Request() req) {
    const data = await this.gatewayService.getDevicesForUser(req.user)
    return { data }
  }

  @ApiOperation({ summary: 'Get device by id' })
  @UseGuards(AuthGuard)
  @Get('/devices/:id')
  async getDevice(@Param('id') deviceId: string) {
    const data = await this.gatewayService.getDeviceById(deviceId)
    return { data }
  }

  @ApiOperation({ summary: 'Update device' })
  @UseGuards(AuthGuard, CanModifyDevice)
  @Patch('/devices/:id')
  async updateDevice(
    @Param('id') deviceId: string,
    @Body() input: RegisterDeviceInputDTO,
  ) {
    input.followUpSchedulePlain = input.followUpSchedule
    let followUpSchedule
    if (input?.followUpSchedule) {
      followUpSchedule = []
      input?.followUpSchedule.split(',').forEach((item) => {
        followUpSchedule.push(parseInt(item) * 24 * 60 * 60 * 1000)
      })
    }
    input.followUpSchedule = followUpSchedule
    const data = await this.gatewayService.updateDevice(deviceId, input)
    return { data }
  }

  @ApiOperation({ summary: 'Delete device' })
  @UseGuards(AuthGuard, CanModifyDevice)
  @Delete('/devices/:id')
  async deleteDevice(@Param('id') deviceId: string) {
    const data = await this.gatewayService.deleteDevice(deviceId)
    return { data }
  }

  @ApiOperation({ summary: 'Send SMS to a device' })
  @UseGuards(AuthGuard)
  @Post('/devices/:id/send-sms')
  @UseInterceptors(
    FileInterceptor('media', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9)
          cb(null, uniqueSuffix + path.extname(file.originalname))
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'video/3gp',
          'video/mp4',
        ]
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new Error('Invalid file type'), false)
        }
      },
      limits: {
        fileSize: 2048576, // 1MB
      },
    }),
  )
  async sendSMS(
    @Param('id') deviceId: string,
    @Body() smsData: SendSMSInputDTO,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    // If mediaUrl is provided in the request body, use it directly
    if (smsData.mediaUrl) {
      // Validate URL format if needed
      try {
        new URL(smsData.mediaUrl)
      } catch (e) {
        throw new HttpException('Invalid media URL', HttpStatus.BAD_REQUEST)
      }
      // Set mediaType based on URL extension or default to image/jpeg
      const extension = path.extname(smsData.mediaUrl).toLowerCase()
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.3gp': 'video/3gp',
        '.mp4': 'video/mp4',
      }
      smsData.mediaType = mimeTypes[extension] || 'image/jpeg'
    }
    // If file is uploaded, use the file
    else if (file) {
      const mediaUrl = `http://100.77.145.14:3005/api/v1/gateway/media/${file.filename}`
      smsData.mediaUrl = mediaUrl
      smsData.mediaType = file.mimetype
    }
    return this.gatewayService.sendSMS(deviceId, smsData)
  }

  @ApiOperation({ summary: 'Send Bulk SMS' })
  @UseGuards(AuthGuard, CanModifyDevice)
  @Post(['/devices/:id/send-bulk-sms'])
  async sendBulkSMS(
    @Param('id') deviceId: string,
    @Body() body: SendBulkSMSInputDTO,
  ) {
    const data = await this.gatewayService.sendBulkSMS(deviceId, body)
    return { data }
  }

  @ApiOperation({ summary: 'Received SMS from a device' })
  @HttpCode(HttpStatus.OK)
  // deprecate receiveSMS route in favor of receive-sms
  @Post(['/devices/:id/receiveSMS', '/devices/:id/receive-sms'])
  @UseGuards(AuthGuard, CanModifyDevice)
  async receiveSMS(@Param('id') deviceId: string, @Body() dto: ReceivedSMSDTO) {
    const sender = dto.sender
    const newSender = sender.replace(/-/g, '')
    dto.sender = newSender
    const data = await this.gatewayService.receiveSMS(deviceId, dto)
    return { data }
  }

  @ApiOperation({ summary: 'Get received SMS from a device' })
  @ApiResponse({ status: 200, type: RetrieveSMSResponseDTO })
  @UseGuards(AuthGuard, CanModifyDevice)
  // deprecate getReceivedSMS route in favor of get-received-sms
  @Get(['/devices/:id/getReceivedSMS', '/devices/:id/get-received-sms'])
  async getReceivedSMS(
    @Param('id') deviceId: string,
  ): Promise<RetrieveSMSResponseDTO> {
    const data = await this.gatewayService.getReceivedSMS(deviceId)
    return { data }
  }
  @ApiOperation({ summary: 'Get proxy config' })
  @Post('/get-config')
  async getConfig(@Request() req, @Body() input) {
    const data = await this.gatewayService.getConfig(input)
    return { data }
  }

  @ApiOperation({ summary: 'Receive ping' })
  @Get('/ping-server')
  async receivePing(@Request() req) {
    await this.gatewayService.receivePing()
    return { message: 'ping received' }
  }

  @ApiOperation({ summary: 'Scrape website through device webview' })
  @Post('/scrape-with-webview')
  async scrapeWithDevice(@Body() input, @Request() req) {
    const data =
      await this.gatewayService.scrapeWebsiteThroughDeviceWebview(input)
    return { data }
  }

  @ApiOperation({ summary: 'Get chat with specific number' })
  @ApiResponse({ status: 200 })
  @UseGuards(AuthGuard)
  @Get(['/devices/:id/:number/getChat'])
  async getChatWithNumber(
    @Param('id') deviceId: string,
    @Param('number') number: string,
  ) {
    const data = await this.gatewayService.getChatWithNumber(deviceId, number)
    return { data }
  }

  @ApiOperation({ summary: 'Get contacts list of device' })
  @ApiResponse({ status: 200 })
  @UseGuards(AuthGuard)
  @Get(['/devices/:id/getContacts'])
  async getDevicesContacts(@Param('id') deviceId: string) {
    const data = await this.gatewayService.getDevicesContacts(deviceId)
    return { data }
  }

  @ApiOperation({ summary: 'Get device stats' })
  @ApiResponse({ status: 200 })
  @UseGuards(AuthGuard)
  @Get(['/devices/:id/getDeviceStats'])
  async getDevicesStats(@Param('id') deviceId: string) {
    const data = await this.gatewayService.getDeviceMessageStats(deviceId)
    return { data }
  }

  @ApiOperation({ summary: 'Add to device Logs' })
  @ApiResponse({ status: 200 })
  @Post(['/devices/:id/log'])
  async addLog(@Param('id') deviceId: string, @Body() log: Log) {
    const data = await this.gatewayService.addLog(deviceId, log)
    return { data }
  }

  @ApiOperation({ summary: 'Get device logs' })
  @ApiResponse({ status: 200 })
  @UseGuards(AuthGuard)
  @Get(['/devices/:id/logs'])
  async getLogs(@Param('id') deviceId: string) {
    const data = await this.gatewayService.getDeviceLogs(deviceId)
    return { data }
  }

  @ApiOperation({ summary: 'Update conversation thread_id' })
  @ApiResponse({ status: 200 })
  @UseGuards(AuthGuard)
  @Post(['/devices/:id/update-conversation'])
  async updateConversation(
    @Param('id') deviceId: string,
    @Body() conversationData,
  ) {
    const data = await this.gatewayService.updateConversationData(
      deviceId,
      conversationData,
    )
    return { data }
  }
  @ApiOperation({ summary: 'Fetch Conversations Due for follow-up' })
  @ApiResponse({ status: 200 })
  @UseGuards(AuthGuard)
  @Get(['/get-follow-up-due-conversations'])
  async fetchConversationsDueForFollowUp() {
    const data = await this.gatewayService.fetchFollowUpDueConversations()
    return { data }
  }

  @ApiOperation({ summary: 'Pair to device ADB' })
  @ApiResponse({ status: 200 })
  @Post(['/devices/:id/pair-adb'])
  async pairToADB(@Param('id') deviceId: string, @Body() body) {
    await this.gatewayService.pairToDeviceADB(deviceId, body)
    return {}
  }

  @ApiOperation({ summary: 'Connect to device ADB' })
  @ApiResponse({ status: 200 })
  @Get(['/devices/:id/connect-adb'])
  async connectToADB(@Param('id') deviceId: string) {
    // @ts-ignore
    const { data } = await this.gatewayService.connectToDeviceADB(deviceId)
    return data
  }

  @ApiOperation({ summary: 'Execute ADB shell command' })
  @ApiResponse({ status: 200 })
  @UseGuards(AuthGuard)
  @Post(['/devices/:id/shell'])
  async executeAdbShell(
    @Param('id') deviceId: string,
    @Body() input: AdbShellInputDTO,
  ) {
    const data = await this.gatewayService.executeAdbShell(
      deviceId,
      input.command,
    )
    return { data }
  }

  @ApiOperation({ summary: 'Start device screen mirroring' })
  @ApiResponse({ status: 200 })
  @UseGuards(AuthGuard)
  @Post(['/devices/:id/mirror'])
  async startMirroring(@Param('id') deviceId: string) {
    const device = await this.gatewayService.getDeviceById(deviceId)
    if (!device?.adbPort) {
      throw new HttpException(
        {
          success: false,
          error: 'Device is not connected via ADB',
        },
        HttpStatus.BAD_REQUEST,
      )
    }
    return {
      success: true,
      wsUrl: 'http://100.77.145.14:3005',
      deviceId: `${device.ip}:${device.adbPort}`,
    }
  }

  @ApiOperation({ summary: 'Delete messages' })
  @ApiResponse({ status: 200 })
  @Post(['/devices/:id/delete-messages'])
  async deleteMessages(@Param('id') deviceId: string, @Body() body) {
    const data = await this.gatewayService.deleteDeviceMessages(deviceId, body)
    return data
  }

  @ApiOperation({ summary: 'Delete conversation' })
  @ApiResponse({ status: 200 })
  @Post(['/devices/:id/delete-conversation'])
  async deleteConversation(@Param('id') deviceId: string, @Body() body) {
    const data = await this.gatewayService.deleteDeviceConversation(
      deviceId,
      body,
    )
    return data
  }

  @ApiOperation({ summary: 'Scrape website through device proxy' })
  @Post('/scrape-with-proxy')
  async scrapeWithDeviceProxy(@Body() input, @Request() req) {
    const data =
      await this.gatewayService.scrapeWebsiteThroughDeviceProxy(input)
    return { data }
  }

  @Get('media/:filename')
  async serveMedia(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = path.join(__dirname, '../../uploads', filename)

    if (!fs.existsSync(filePath)) {
      throw new HttpException('File not found', HttpStatus.NOT_FOUND)
    }

    return res.sendFile(filePath)
  }
  @ApiOperation({ summary: 'Restart device mobile data' })
  @ApiResponse({ status: 200 })
  @Get(['/devices/:id/restart-mobile-data'])
  async restartNetwork(@Param('id') deviceId: string) {
    await this.gatewayService.restartDeviceNetwork(deviceId)
    return
  }
}
