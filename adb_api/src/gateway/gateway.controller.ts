import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
  Get,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiProperty,
} from '@nestjs/swagger'
import { AuthGuard } from '../auth/guards/auth.guard'
import { GatewayService } from './gateway.service'

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
  ) {}
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
    console.log(data)
    return { data }
  }

  @ApiOperation({ summary: 'Start device screen mirroring' })
  @ApiResponse({ status: 200 })
  @UseGuards(AuthGuard)
  @Post(['/devices/:id/mirror'])
  async startMirroring(@Param('id') deviceId: string) {
    const device = await this.gatewayService.getDeviceById(deviceId)
    return {
      success: true,
      wsUrl: 'http://100.90.39.86:3005',
      deviceId: device.adbId
    }
  }

  @ApiOperation({ summary: 'Restart device mobile data' })
  @ApiResponse({ status: 200 })
  @Get(['/devices/:id/restart-mobile-data'])
  async restartNetwork(@Param('id') deviceId: string) {
    await this.gatewayService.restartDeviceNetwork(deviceId)
    return
  }
}
