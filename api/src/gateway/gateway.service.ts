import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { InjectModel } from '@nestjs/mongoose'
import { Device, DeviceDocument } from './schemas/device.schema'
import { Model } from 'mongoose'
import * as firebaseAdmin from 'firebase-admin'
import {
  ReceivedSMSDTO,
  RegisterDeviceInputDTO,
  RetrieveSMSDTO,
  SendBulkSMSInputDTO,
  SendSMSInputDTO,
} from './gateway.dto'
import { User } from '../users/schemas/user.schema'
import { AuthService } from 'src/auth/auth.service'
import { SMS } from './schemas/sms.schema'
import { SMSType } from './sms-type.enum'
import { SMSBatch } from './schemas/sms-batch.schema'
import {
  BatchResponse,
  Message,
} from 'firebase-admin/lib/messaging/messaging-api'
import { Log, LogDocument } from './schemas/log.schema'
import fetch from 'node-fetch'

@Injectable()
export class GatewayService {
  constructor(
    @InjectModel(Device.name) private deviceModel: Model<DeviceDocument>,
    @InjectModel(SMS.name) private smsModel: Model<SMS>,
    @InjectModel(SMSBatch.name) private smsBatchModel: Model<SMSBatch>,
    @InjectModel(Log.name) private logModel: Model<LogDocument>,
    private authService: AuthService,
  ) {}

  async registerDevice(
    input: RegisterDeviceInputDTO,
    user: User,
  ): Promise<any> {
    const device = await this.deviceModel.findOne({
      user: user._id,
      model: input.model,
      buildId: input.buildId,
    })

    if (device) {
      return await this.updateDevice(device._id.toString(), {
        ...input,
        enabled: true,
      })
    } else {
      return await this.deviceModel.create({
        ...input,
        user,
        name: input.model,
        proxyUsername: 'defaultUsername',
        proxyPassword: 'defaultPassword',
        proxyPort: 3000,
      })
    }
  }

  async getDevicesForUser(user: User): Promise<any> {
    return await this.deviceModel.find({ user: user._id })
  }

  async getDeviceById(deviceId: string): Promise<any> {
    return await this.deviceModel.findById(deviceId)
  }

  async updateDevice(
    deviceId: string,
    input: RegisterDeviceInputDTO,
  ): Promise<any> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          error: 'Device not found',
        },
        HttpStatus.NOT_FOUND,
      )
    }
    if (input?.proxyUsername || input?.proxyPassword || input?.proxyPort) {
      const proxyConfig = {
        username: input.proxyUsername,
        password: input.proxyPassword,
        port: input.proxyPort,
      }
      const response = await fetch(`http://${device.ip}:8080`, {
        method: 'POST',
        body: JSON.stringify(proxyConfig),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const logData = new this.logModel({
        device: device._id,
        message: 'Device proxy settings updated',
        type: 'info',
      })
      await logData.save()
    }

    return await this.deviceModel.findByIdAndUpdate(
      deviceId,
      { $set: input },
      { new: true },
    )
  }

  async deleteDevice(deviceId: string): Promise<any> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          error: 'Device not found',
        },
        HttpStatus.NOT_FOUND,
      )
    }

    return {}
    // return await this.deviceModel.findByIdAndDelete(deviceId)
  }

  async sendSMS(deviceId: string, smsData: SendSMSInputDTO): Promise<any> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device?.enabled) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist or is not enabled',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    const message = smsData.message || smsData.smsBody
    const recipients = smsData.recipients || smsData.receivers

    if (!message) {
      throw new HttpException(
        {
          success: false,
          error: 'Message cannot be blank',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new HttpException(
        {
          success: false,
          error: 'Invalid recipients',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    // TODO: Implement a queue to send the SMS if recipients are too many

    let smsBatch: SMSBatch

    try {
      smsBatch = await this.smsBatchModel.create({
        device: device._id,
        message,
        recipientCount: recipients.length,
        recipientPreview: this.getRecipientsPreview(recipients),
      })
    } catch (e) {
      throw new HttpException(
        {
          success: false,
          error: 'Failed to create SMS batch',
          additionalInfo: e,
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    const fcmMessages: Message[] = []

    for (const recipient of recipients) {
      const sms = await this.smsModel.create({
        device: device._id,
        smsBatch: smsBatch._id,
        message: message,
        type: SMSType.SENT,
        recipient,
        requestedAt: new Date(),
      })
      const updatedSMSData = {
        smsId: sms._id,
        smsBatchId: smsBatch._id,
        message,
        recipients: [recipient],

        // Legacy fields to be removed in the future
        smsBody: message,
        receivers: [recipient],
      }
      const stringifiedSMSData = JSON.stringify(updatedSMSData)
      const fcmMessage: Message = {
        data: {
          smsData: stringifiedSMSData,
        },
        token: device.fcmToken,
        android: {
          priority: 'high',
        },
      }
      fcmMessages.push(fcmMessage)
    }

    try {
      const response = await firebaseAdmin.messaging().sendEach(fcmMessages)

      console.log(response)

      if (response.successCount === 0) {
        throw new HttpException(
          {
            success: false,
            error: 'Failed to send SMS',
            additionalInfo: response,
          },
          HttpStatus.BAD_REQUEST,
        )
      }

      this.deviceModel
        .findByIdAndUpdate(deviceId, {
          $inc: { sentSMSCount: response.successCount },
        })
        .exec()
        .catch((e) => {
          console.log('Failed to update sentSMSCount')
          console.log(e)
        })
      return response
    } catch (e) {
      throw new HttpException(
        {
          success: false,
          error: 'Failed to send SMS',
          additionalInfo: e,
        },
        HttpStatus.BAD_REQUEST,
      )
    }
  }

  async sendBulkSMS(deviceId: string, body: SendBulkSMSInputDTO): Promise<any> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device?.enabled) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist or is not enabled',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    if (
      !Array.isArray(body.messages) ||
      body.messages.length === 0 ||
      body.messages.map((m) => m.recipients).flat().length === 0
    ) {
      throw new HttpException(
        {
          success: false,
          error: 'Invalid message list',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    if (body.messages.map((m) => m.recipients).flat().length > 50) {
      throw new HttpException(
        {
          success: false,
          error: 'Maximum of 50 recipients per batch is allowed',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    const { messageTemplate, messages } = body

    const smsBatch = await this.smsBatchModel.create({
      device: device._id,
      message: messageTemplate,
      recipientCount: messages
        .map((m) => m.recipients.length)
        .reduce((a, b) => a + b, 0),
      recipientPreview: this.getRecipientsPreview(
        messages.map((m) => m.recipients).flat(),
      ),
    })

    const fcmResponses: BatchResponse[] = []
    for (const smsData of messages) {
      const message = smsData.message
      const recipients = smsData.recipients

      if (!message) {
        continue
      }

      if (!Array.isArray(recipients) || recipients.length === 0) {
        continue
      }

      const fcmMessages: Message[] = []

      for (const recipient of recipients) {
        const sms = await this.smsModel.create({
          device: device._id,
          smsBatch: smsBatch._id,
          message: message,
          type: SMSType.SENT,
          recipient,
          requestedAt: new Date(),
        })
        const updatedSMSData = {
          smsId: sms._id,
          smsBatchId: smsBatch._id,
          message,
          recipients: [recipient],

          // Legacy fields to be removed in the future
          smsBody: message,
          receivers: [recipient],
        }
        const stringifiedSMSData = JSON.stringify(updatedSMSData)

        const fcmMessage: Message = {
          data: {
            smsData: stringifiedSMSData,
          },
          token: device.fcmToken,
          android: {
            priority: 'high',
          },
        }
        fcmMessages.push(fcmMessage)
      }

      try {
        const response = await firebaseAdmin.messaging().sendEach(fcmMessages)

        console.log(response)
        fcmResponses.push(response)

        this.deviceModel
          .findByIdAndUpdate(deviceId, {
            $inc: { sentSMSCount: response.successCount },
          })
          .exec()
          .catch((e) => {
            console.log('Failed to update sentSMSCount')
            console.log(e)
          })
      } catch (e) {
        console.log('Failed to send SMS: FCM')
        console.log(e)
      }
    }

    const successCount = fcmResponses.reduce(
      (acc, m) => acc + m.successCount,
      0,
    )
    const failureCount = fcmResponses.reduce(
      (acc, m) => acc + m.failureCount,
      0,
    )
    const response = {
      success: successCount > 0,
      successCount,
      failureCount,
      fcmResponses,
    }
    return response
  }

  async receiveSMS(deviceId: string, dto: ReceivedSMSDTO): Promise<any> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    if (
      (!dto.receivedAt && !dto.receivedAtInMillis) ||
      !dto.sender ||
      !dto.message
    ) {
      console.log('Invalid received SMS data')
      throw new HttpException(
        {
          success: false,
          error: 'Invalid received SMS data',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    const receivedAt = dto.receivedAtInMillis
      ? new Date(dto.receivedAtInMillis)
      : dto.receivedAt

    const sms = await this.smsModel.create({
      device: device._id,
      message: dto.message,
      type: SMSType.RECEIVED,
      sender: dto.sender,
      receivedAt,
      read: false,
    })

    const res = await fetch(
      'https://192.168.12.109/webhook/28b6c43b-0da1-4f7c-934d-d0d922400854/',
      {
        method: 'post',
        body: JSON.stringify(sms),
        headers: { 'Content-Type': 'application/json' },
      },
    )
    console.log(await res.json())

    this.deviceModel
      .findByIdAndUpdate(deviceId, {
        $inc: { receivedSMSCount: 1 },
      })
      .exec()
      .catch((e) => {
        console.log('Failed to update receivedSMSCount')
        console.log(e)
      })

    // TODO: Implement webhook to forward received SMS to user's callback URL

    return sms
  }

  async getReceivedSMS(deviceId: string): Promise<RetrieveSMSDTO[]> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    // @ts-ignore
    return await this.smsModel
      .find(
        {
          device: device._id,
          type: SMSType.RECEIVED,
        },
        null,
        { sort: { receivedAt: -1 }, limit: 200 },
      )
      .populate({
        path: 'device',
        select: '_id brand model buildId enabled',
      })
  }

  async getStatsForUser(user: User) {
    const devices = await this.deviceModel.find({ user: user._id })
    const apiKeys = await this.authService.getUserApiKeys(user)

    const totalSentSMSCount = devices.reduce((acc, device) => {
      return acc + (device.sentSMSCount || 0)
    }, 0)

    const totalReceivedSMSCount = devices.reduce((acc, device) => {
      return acc + (device.receivedSMSCount || 0)
    }, 0)

    const totalDeviceCount = devices.length
    const totalApiKeyCount = apiKeys.length

    return {
      totalSentSMSCount,
      totalReceivedSMSCount,
      totalDeviceCount,
      totalApiKeyCount,
    }
  }

  private getRecipientsPreview(recipients: string[]): string {
    if (recipients.length === 0) {
      return null
    } else if (recipients.length === 1) {
      return recipients[0]
    } else if (recipients.length === 2) {
      return `${recipients[0]} and ${recipients[1]}`
    } else if (recipients.length === 3) {
      return `${recipients[0]}, ${recipients[1]}, and ${recipients[2]}`
    } else {
      return `${recipients[0]}, ${recipients[1]}, and ${
        recipients.length - 2
      } others`
    }
  }
  async getConfig(input) {
    const { deviceId } = input
    if (!deviceId) {
      return {
        username: 'proxyUsername',
        password: 'proxyPassword',
        port: 3000,
      }
    }
    const device = await this.deviceModel.findOne({ _id: deviceId })
    return {
      username: device.proxyUsername,
      password: device.proxyPassword,
      port: device.proxyPort,
    }
  }
  async receivePing() {
    Logger.log('Proxy alive and receiving requests')
    return
  }
  async scrapeWebsiteThroughDevice(input) {
    const { deviceId, url } = input
    if (!url) {
      throw new HttpException('Website URL is required', HttpStatus.BAD_REQUEST)
    }
    if (!deviceId) {
      throw new HttpException('DeviceIp is required', HttpStatus.BAD_REQUEST)
    }
    const device = await this.deviceModel.findOne({ _id: deviceId })
    const username = device.proxyUsername
    const password = device.proxyPassword
    const port = device.proxyPort
    const proxyUrl = `socks5://${username}:${password}@${device.ip}:${port}`
    const proxyAgent = new SocksProxyAgent(proxyUrl)

    const httpService = new HttpService()

    const res = await httpService.axiosRef({
      method: 'GET',
      url,
      httpAgent: proxyAgent,
      httpsAgent: proxyAgent, // for HTTPS requests if needed
    })
    return res.data
  }
  async getChatWithNumber(deviceId, number) {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    // @ts-ignore
    const receivedMesages = await this.smsModel
      .find(
        {
          device: device._id,
          type: SMSType.RECEIVED,
          sender: number,
        },
        null,
        { sort: { receivedAt: -1 }, limit: 200 },
      )
      .populate({
        path: 'device',
        select: '_id brand model buildId enabled',
      })
    const sentMessages = await this.smsModel.find(
      {
        device: device._id,
        type: SMSType.SENT,
        recipient: number,
      },
      null,
      { sort: { sentAt: -1 }, limit: 200 },
    )
    await this.smsModel.updateMany(
      {
        device: device._id,
        type: SMSType.RECEIVED,
        read: false,
      },
      {
        read: true,
      },
    )
    return [...receivedMesages, ...sentMessages]
  }
  async getDevicesContacts(deviceId) {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist',
        },
        HttpStatus.BAD_REQUEST,
      )
    }
    const contacts = await this.smsModel.aggregate([
      {
        $match: {
          device: device._id, // Replace with your actual device ObjectId
        },
      },
      {
        $project: {
          _id: 1,
          number: { $ifNull: ['$recipient', '$sender'] }, // Combine sender and recipient into a single 'number' field
          message: 1,
          createdAt: 1,
          type: 1,
          read: 1,
        },
      },
      {
        $sort: {
          number: 1, // Sort by number for grouping
          createdAt: -1, // Sort by createdAt descending to get the last message first
        },
      },
      {
        $group: {
          _id: '$number',
          lastMessage: { $first: '$message' }, // Get the first message (which is the last due to sorting)
          lastMessageType: { $first: '$type' },
          lastMessageCreatedAt: { $first: '$createdAt' },
          read: { $first: '$read' },
          sms: {
            $push: {
              _id: '$_id',
              message: '$message',
              type: '$type',
              createdAt: '$createdAt',
              read: '$read',
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          lastMessage: 1,
          lastMessageType: 1,
          lastMessageCreatedAt: 1,
          read: 1,
        },
      },
    ])
    return contacts
  }
  async getDeviceMessageStats(deviceId) {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    const sentSMSCount = await this.smsModel.countDocuments({
      device: device._id,
      type: SMSType.SENT,
    })

    const receivedSMSCount = await this.smsModel.countDocuments({
      device: device._id,
      type: SMSType.RECEIVED,
    })

    return {
      sentSMSCount,
      receivedSMSCount,
    }
  }
  async addLog(deviceId: string, log: Log) {
    const device = await this.deviceModel.findById(deviceId)
    if (!device) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist',
        },
        HttpStatus.BAD_REQUEST,
      )
    }
    const logData = new this.logModel({
      device: device._id,
      message: log.message,
      type: log.type,
    })
    await logData.save()
    return logData
  }
  async getDeviceLogs(deviceId: string) {
    const device = await this.deviceModel.findById(deviceId)
    if (!device) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist',
        },
        HttpStatus.BAD_REQUEST,
      )
    }
    const logs = await this.logModel.find({ device: device._id })
    return logs
  }
}
