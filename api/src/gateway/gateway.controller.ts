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
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
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

@ApiTags('gateway')
@ApiBearerAuth()
@Controller('gateway')
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

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
  @UseGuards(AuthGuard, CanModifyDevice)
  // deprecate sendSMS route in favor of send-sms, but allow both to prevent breaking changes
  @Post(['/devices/:id/sendSMS', '/devices/:id/send-sms'])
  async sendSMS(
    @Param('id') deviceId: string,
    @Body() smsData: SendSMSInputDTO,
  ) {
    const recipents = smsData.recipients || smsData.receivers
    const newRecipents = recipents.map((recipient) =>
      recipient.replace(/-/g, ''),
    )
    smsData.recipients = newRecipents
    smsData.receivers = newRecipents
    const data = await this.gatewayService.sendSMS(deviceId, smsData)
    return { data }
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

  @ApiOperation({ summary: 'Scrape website through device' })
  @Post('/scrape')
  async scrapeWithDevice(@Body() input, @Request() req) {
    const data = await this.gatewayService.scrapeWebsiteThroughDevice(input)
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
}
