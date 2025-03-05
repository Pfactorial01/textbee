import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Device, DeviceSchema } from './schemas/device.schema'
import { Log, LogSchema } from './schemas/log.schema'
import { Conversation, ConversationSchema } from './schemas/conversation.schema'
import { GatewayController } from './gateway.controller'
import { GatewayService } from './gateway.service'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { SMS, SMSSchema } from './schemas/sms.schema'
import { SMSBatch, SMSBatchSchema } from './schemas/sms-batch.schema'
import { ScrcpyGateway } from './scrcpy.gateway'
import { ScheduleModule } from '@nestjs/schedule'
import { ApkMonitorService } from './apk-monitor.service'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      {
        name: Device.name,
        schema: DeviceSchema,
      },
      {
        name: SMS.name,
        schema: SMSSchema,
      },
      {
        name: SMSBatch.name,
        schema: SMSBatchSchema,
      },
      {
        name: Log.name,
        schema: LogSchema,
      },
      {
        name: Conversation.name,
        schema: ConversationSchema,
      },
    ]),
    AuthModule,
    UsersModule,
  ],
  controllers: [GatewayController],
  providers: [GatewayService, ScrcpyGateway, ApkMonitorService],
  exports: [MongooseModule, GatewayService],
})
export class GatewayModule {}
