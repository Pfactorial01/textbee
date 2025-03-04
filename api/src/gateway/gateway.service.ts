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
import {
  Conversation,
  ConversationDocument,
} from './schemas/conversation.schema'
import fetch from 'node-fetch'
import { spawn } from 'child_process'
import { promisify } from 'util'
import { exec } from 'child_process'

@Injectable()
export class GatewayService {
  constructor(
    @InjectModel(Device.name) private deviceModel: Model<DeviceDocument>,
    @InjectModel(SMS.name) private smsModel: Model<SMS>,
    @InjectModel(SMSBatch.name) private smsBatchModel: Model<SMSBatch>,
    @InjectModel(Log.name) private logModel: Model<LogDocument>,
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
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
      const proxyConfig = {
        username: device.proxyUsername,
        password: device.proxyPassword,
        port: device.proxyPort,
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
        assistantReplyDelay: 10,
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

  async sendSMS(
    deviceId: string,
    smsData: SendSMSInputDTO,
    authHeader: string,
  ): Promise<any> {
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
    const mediaUrl = smsData.mediaUrl

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
        mediaUrl: smsData.mediaUrl,
        mediaType: smsData.mediaType,
      })
      const followUpSchedule = device.followUpSchedule
      let conversation = await this.conversationModel.findOne({
        device: device.id,
        number: recipient,
      })
      if (followUpSchedule.length > 0) {
        if (!conversation) {
          conversation = await this.conversationModel.create({
            device: device.id,
            number: recipient,
            thread_id: '',
            human_interaction: false,
            channel_id: '',
            followUpDue: new Date(new Date().getTime() + followUpSchedule[0]),
          })
        } else {
          const lastFollowUpSent = conversation.lastFollowUpSent
          if (lastFollowUpSent && smsData.isFollowUp) {
            const indexOfLastFollowUpSent = followUpSchedule.findIndex(
              (item) => item === lastFollowUpSent,
            )
            let indexOfNextFollowUp
            if (
              indexOfLastFollowUpSent !== -1 &&
              indexOfLastFollowUpSent < followUpSchedule.length - 1
            ) {
              indexOfNextFollowUp = indexOfLastFollowUpSent + 1
            }
            if (indexOfNextFollowUp === undefined) {
              await this.conversationModel.findByIdAndUpdate(conversation._id, {
                followUpDue: null,
                lastFollowUpSent: null,
                firstFollowUpDate: null,
              })
            } else {
              const unsentFollowUp = followUpSchedule[indexOfNextFollowUp]
              await this.conversationModel.findByIdAndUpdate(conversation._id, {
                followUpDue: new Date(
                  conversation.firstFollowUpDate.getTime() + unsentFollowUp,
                ),
                lastFollowUpSent: unsentFollowUp,
              })
            }
          } else {
            if (smsData.isFollowUp) {
              await this.conversationModel.findByIdAndUpdate(conversation._id, {
                ...(followUpSchedule.length > 1 && {
                  followUpDue: new Date(
                    new Date().getTime() + followUpSchedule[1],
                  ),
                }),
                firstFollowUpDate: new Date(),
                lastFollowUpSent: followUpSchedule[1],
              })
            } else {
              await this.conversationModel.findByIdAndUpdate(conversation._id, {
                followUpDue: new Date(
                  new Date().getTime() + followUpSchedule[0],
                ),
              })
            }
          }
        }
      } else {
        if (!conversation) {
          conversation = await this.conversationModel.create({
            device: device.id,
            number: recipient,
            thread_id: '',
            human_interaction: false,
            channel_id: '',
            followUpDue: new Date(new Date().getTime() + followUpSchedule[0]),
          })
        }
      }

      const updatedSMSData = {
        smsId: sms._id,
        smsBatchId: smsBatch._id,
        message,
        recipients: [recipient],
        mediaUrl,
        smsType: mediaUrl ? 'mms' : 'sms',

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
    if (mediaUrl) {
      try {
        await fetch(
          `http://100.90.39.86:3005/api/v1/gateway/devices/${device.id}/shell`,
          {
            method: 'POST',
            body: JSON.stringify({
              command:
                'monkey -p com.vernu.smsmodified -c android.intent.category.LAUNCHER 1',
            }),
            headers: {
              'Content-Type': 'application/json',
              Authorization: authHeader,
            },
          },
        )
      } catch (e) {}
      await new Promise((resolve) => setTimeout(resolve, 2000))
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
      if (mediaUrl) {
        await new Promise((resolve) => setTimeout(resolve, 10000))
        try {
          await fetch(
            `http://100.90.39.86:3005/api/v1/gateway/devices/${device.id}/shell`,
            {
              method: 'POST',
              body: JSON.stringify({
                command: `input tap ${(242.94291338477242 * 1080) / 270} ${(543.2303951620445 * 2400) / 600}`,
              }),
              headers: {
                'Content-Type': 'application/json',
                Authorization: authHeader,
              },
            },
          )
        } catch (e) {}
        return response
      }
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
    let conversation = await this.conversationModel.findOne({
      device: device.id,
      number: dto.sender,
    })
    if (!conversation) {
      conversation = await this.conversationModel.create({
        device: device.id,
        number: dto.sender,
        thread_id: '',
        human_interaction: false,
        channel_id: '',
      })
    }
    await this.conversationModel.findByIdAndUpdate(conversation._id, {
      followUpDue: null,
      firstFollowUpDate: null,
      lastFollowUpSent: null,
    })

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

    const receivedMesages = await this.smsModel
      .find(
        {
          device: device._id,
          type: SMSType.RECEIVED,
          sender: dto.sender,
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
        recipient: dto.sender,
      },
      null,
      { sort: { sentAt: -1 }, limit: 200 },
    )

    const previousChat = [...receivedMesages, ...sentMessages]
    const messageHistory = previousChat
      // @ts-ignore
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((message) => ({
        message: message.message,
        direction: message.type === SMSType.SENT ? 'outbound' : 'inbound',
      }))
    const sms = await this.smsModel.create({
      device: device._id,
      message: dto.message,
      type: SMSType.RECEIVED,
      sender: dto.sender,
      receivedAt,
      read: false,
    })

    const res = await fetch(
      'https://n8n.airebrokers.com/webhook/28b6c43b-0da1-4f7c-934d-d0d922400854/',
      {
        method: 'post',
        body: JSON.stringify({
          device: device._id,
          message: dto.message,
          type: SMSType.RECEIVED,
          sender: dto.sender,
          receivedAt,
          read: false,
          thread_id: conversation.thread_id,
          human_interaction: conversation.human_interaction,
          channel_id: conversation.channel_id,
          assistantReplyDelay: device.assistantReplyDelay,
          meta_data: {
            message_history: messageHistory,
          },
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer k326ds93dngrltyuhewtmlaoeccmru',
        },
      },
    )
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
      const res = {
        username: 'defaultUsername',
        password: 'defaultPassword',
        port: 3000,
      }
      return res
    }
    const device = await this.deviceModel.findOne({ _id: deviceId })
    const data = {
      username: device.proxyUsername,
      password: device.proxyPassword,
      port: device.proxyPort,
    }
    return data
  }
  async receivePing() {
    Logger.log('Proxy alive and receiving requests')
    return
  }
  async scrapeWebsiteThroughDeviceWebview(input) {
    const { deviceId, url } = input
    if (!url) {
      throw new HttpException('Website URL is required', HttpStatus.BAD_REQUEST)
    }
    if (!deviceId) {
      throw new HttpException('DeviceIp is required', HttpStatus.BAD_REQUEST)
    }
    const device = await this.deviceModel.findOne({ _id: deviceId })
    const res = await fetch(`http://${device.ip}:8080/fetch?url=${url}`, {
      method: 'get',
    })
    const html = await res.text()
    return html
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
  async updateConversationData(deviceId, conversationData) {
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
    const conversation = await this.conversationModel.updateOne(
      {
        device: device.id,
        number: conversationData.sender,
      },
      {
        ...(conversationData.thread_id && {
          thread_id: conversationData.thread_id,
        }),
        ...(conversationData.human_interaction && {
          human_interaction: conversationData.human_interaction,
        }),
        ...(conversationData.channel_id && {
          channel_id: conversationData.channel_id,
        }),
      },
    )
    return conversation
  }
  async fetchFollowUpDueConversations() {
    const currentTime = new Date()
    const dueConversations = await this.conversationModel.find({
      followUpDue: { $lte: currentTime },
    })
    return dueConversations
  }

  async pairToDeviceADB(deviceId, body) {
    const device = await this.deviceModel.findById(deviceId)
    const { adbPort, pairingCode, pairingPort } = body

    if (!adbPort || !pairingCode || !pairingPort) {
      throw new HttpException(
        {
          success: false,
          error: 'adbPort, pairingCode and pairingPort required',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    if (!device) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    return new Promise((resolve, reject) => {
      const adbProcess = spawn('adb', [
        'pair',
        `${device.ip}:${pairingPort}`,
        pairingCode,
      ])

      let pairingOutput = ''
      let pairingError = ''

      adbProcess.stdout.on('data', (data) => {
        pairingOutput += data.toString()
      })

      adbProcess.stderr.on('data', (data) => {
        pairingError += data.toString()
      })

      adbProcess.on('error', (error) => {
        reject(
          new HttpException(
            {
              success: false,
              error: 'Failed to start ADB process',
              details: error.message,
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          ),
        )
      })

      adbProcess.on('close', async (code) => {
        if (code !== 0) {
          reject(
            new HttpException(
              {
                success: false,
                error: 'ADB pairing failed',
                details: pairingError || 'Unknown error occurred',
                code,
              },
              HttpStatus.BAD_REQUEST,
            ),
          )
          return
        }

        // After successful pairing, try to connect
        const connectProcess = spawn('adb', [
          'connect',
          `${device.ip}:${adbPort}`,
        ])

        let connectOutput = ''
        let connectError = ''

        connectProcess.stdout.on('data', (data) => {
          connectOutput += data.toString()
        })

        connectProcess.stderr.on('data', (data) => {
          connectError += data.toString()
        })

        connectProcess.on('error', (error) => {
          reject(
            new HttpException(
              {
                success: false,
                error: 'Failed to start ADB connect process',
                details: error.message,
              },
              HttpStatus.INTERNAL_SERVER_ERROR,
            ),
          )
        })

        connectProcess.on('close', async (connectCode) => {
          if (connectCode !== 0) {
            reject(
              new HttpException(
                {
                  success: false,
                  error: 'ADB connection failed',
                  details: connectError || 'Unknown error occurred',
                  code: connectCode,
                },
                HttpStatus.BAD_REQUEST,
              ),
            )
            return
          }

          try {
            const keepAliveProcess = spawn('bash', [
              '-c',
              `while true; do adb -s ${device.ip}:${adbPort} shell "echo 'Keeping ADB alive'"; sleep 3000; done`,
            ])
            // Only update device if both pairing and connection were successful
            await this.deviceModel.findByIdAndUpdate(
              device.id,
              { adbPort },
              { new: true },
            )

            resolve({
              success: true,
              message: 'Device paired and connected successfully',
              pairingOutput,
              connectOutput,
            })
          } catch (error) {
            reject(
              new HttpException(
                {
                  success: false,
                  error: 'Failed to update device settings',
                  details: error.message,
                },
                HttpStatus.INTERNAL_SERVER_ERROR,
              ),
            )
          }
        })
      })

      // Set a timeout for the entire operation
      setTimeout(() => {
        adbProcess.kill()
        reject(
          new HttpException(
            {
              success: false,
              error: 'Operation timed out',
            },
            HttpStatus.REQUEST_TIMEOUT,
          ),
        )
      }, 30000) // 30 second timeout
    })
  }

  async connectToDeviceADB(deviceId) {
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

    return new Promise((resolve, reject) => {
      const connectProcess = spawn('adb', [
        'connect',
        `${device.ip}:${device.adbPort}`,
      ])

      let connectOutput = ''
      let connectError = ''

      connectProcess.stdout.on('data', (data) => {
        connectOutput += data.toString()
      })

      connectProcess.stderr.on('data', (data) => {
        connectError += data.toString()
      })

      connectProcess.on('error', (error) => {
        reject(
          new HttpException(
            {
              success: false,
              error: 'Failed to start ADB connect process',
              details: error.message,
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          ),
        )
      })

      connectProcess.on('close', async (connectCode) => {
        if (connectCode === null || connectCode !== 0) {
          reject(
            new HttpException(
              {
                success: false,
                error: 'ADB connection failed',
                details: connectError || 'Unknown error occurred',
                code: connectCode,
              },
              HttpStatus.BAD_REQUEST,
            ),
          )
          return
        }
        if (connectOutput.startsWith('failed to connect to')) {
          reject(
            new HttpException(
              {
                success: false,
                error: 'ADB connection failed',
                details: connectError || 'Unknown error occurred',
                code: connectCode,
              },
              HttpStatus.BAD_REQUEST,
            ),
          )
        } else {
          const keepAliveProcess = spawn('bash', [
            '-c',
            `while true; do adb -s ${device.ip}:${device.adbPort} shell "echo 'Keeping ADB alive'"; sleep 3000; done`,
          ])

          resolve({
            success: true,
            message: 'Device connected successfully',
            connectOutput,
            data: { ip: device.ip, adbPort: device.adbPort },
          })
        }
      })
      // Set a timeout for the entire operation
      setTimeout(() => {
        connectProcess.kill()
        reject(
          new HttpException(
            {
              success: false,
              error: 'Operation timed out',
            },
            HttpStatus.REQUEST_TIMEOUT,
          ),
        )
      }, 2000) // 2 second timeout
    })
  }

  async executeAdbShell(deviceId: string, command: string): Promise<any> {
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

    if (!device.adbPort) {
      throw new HttpException(
        {
          success: false,
          error: 'Device is not connected via ADB',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    const execPromise = promisify(exec)

    try {
      // First ensure we're connected
      await execPromise(`adb connect ${device.ip}:${device.adbPort}`)

      // Execute the shell command
      const { stdout, stderr } = await execPromise(
        `adb -s ${device.ip}:${device.adbPort} shell ${command}`,
      )

      if (stderr) {
        throw new Error(stderr)
      }

      return {
        success: true,
        output: stdout,
      }
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: 'Failed to execute ADB command',
          details: error.message,
        },
        HttpStatus.BAD_REQUEST,
      )
    }
  }

  async deleteDeviceMessages(
    deviceId: string,
    body: { messageIds: string[] },
  ): Promise<any> {
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

    const { messageIds } = body

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      throw new HttpException(
        {
          success: false,
          error: 'Invalid messageIds',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    await this.smsModel.deleteMany({
      _id: { $in: messageIds },
      device: device._id,
    })

    return {
      success: true,
      message: 'Messages deleted successfully',
    }
  }

  async deleteDeviceConversation(
    deviceId: string,
    body: { contactId: string },
  ): Promise<any> {
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

    const { contactId } = body

    if (!contactId) {
      throw new HttpException(
        {
          success: false,
          error: 'Invalid contactId',
        },
        HttpStatus.BAD_REQUEST,
      )
    }
    await this.smsModel.deleteMany({
      $or: [{ sender: contactId }, { recipient: contactId }],
      device: device._id,
    })
    return {
      success: true,
      message: 'Conversations deleted successfully',
    }
  }

  async scrapeWebsiteThroughDeviceProxy(input) {
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

  async restartDeviceNetwork(deviceId: string) {
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

    if (!device.adbPort) {
      throw new HttpException(
        {
          success: false,
          error: 'Device is not connected via ADB',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    return new Promise((resolve, reject) => {
      // First turn off mobile data
      const turnOffProcess = spawn('adb', [
        '-s',
        `${device.ip}:${device.adbPort}`,
        'shell',
        'svc data disable',
      ])

      let turnOffError = ''

      turnOffProcess.stderr.on('data', (data) => {
        turnOffError += data.toString()
      })

      turnOffProcess.on('error', (error) => {
        reject(
          new HttpException(
            {
              success: false,
              error: 'Failed to turn off mobile data',
              details: error.message,
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          ),
        )
      })

      turnOffProcess.on('close', (code) => {
        if (code !== 0) {
          reject(
            new HttpException(
              {
                success: false,
                error: 'Failed to turn off mobile data',
                details: turnOffError || 'Unknown error occurred',
                code,
              },
              HttpStatus.BAD_REQUEST,
            ),
          )
          return
        }

        // Wait 15 seconds before turning it back on
        setTimeout(() => {
          const turnOnProcess = spawn('adb', [
            '-s',
            `${device.ip}:${device.adbPort}`,
            'shell',
            'svc data enable',
          ])

          let turnOnError = ''

          turnOnProcess.stderr.on('data', (data) => {
            turnOnError += data.toString()
          })

          turnOnProcess.on('error', (error) => {
            reject(
              new HttpException(
                {
                  success: false,
                  error: 'Failed to turn on mobile data',
                  details: error.message,
                },
                HttpStatus.INTERNAL_SERVER_ERROR,
              ),
            )
          })

          turnOnProcess.on('close', (code) => {
            if (code !== 0) {
              reject(
                new HttpException(
                  {
                    success: false,
                    error: 'Failed to turn on mobile data',
                    details: turnOnError || 'Unknown error occurred',
                    code,
                  },
                  HttpStatus.BAD_REQUEST,
                ),
              )
              return
            }

            resolve({
              success: true,
              message: 'Device network restarted successfully',
              data: 'Mobile data restarted successfully',
            })
          })
        }, 15000) // 15 seconds delay
      })

      // Set a timeout for the entire operation
      setTimeout(() => {
        turnOffProcess.kill()
        reject(
          new HttpException(
            {
              success: false,
              error: 'Operation timed out',
            },
            HttpStatus.REQUEST_TIMEOUT,
          ),
        )
      }, 30000) // 30 second timeout for the entire operation
    })
  }
}
