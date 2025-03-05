import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import { User } from '../../users/schemas/user.schema'

export type DeviceDocument = Device & Document

@Schema({ timestamps: true })
export class Device {
  _id?: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: User.name })
  user: User

  @Prop({ type: Boolean, default: false })
  enabled: boolean

  @Prop({ type: String })
  fcmToken: string

  @Prop({ type: String })
  brand: string

  @Prop({ type: String })
  manufacturer: string

  @Prop({ type: String })
  model: string

  @Prop({ type: String })
  serial: string

  @Prop({ type: String })
  buildId: string

  @Prop({ type: String })
  os: string

  @Prop({ type: String })
  osVersion: string

  @Prop({ type: String })
  appVersionName: string

  @Prop({ type: Number })
  appVersionCode: number

  @Prop({ type: Number, default: 0 })
  sentSMSCount: number

  @Prop({ type: Number, default: 0 })
  receivedSMSCount: number

  @Prop({ type: String })
  name: string

  @Prop({ type: String })
  ip: string

  @Prop({ type: String })
  machineKey: string

  @Prop({ type: String })
  proxyUsername: string

  @Prop({ type: String })
  proxyPassword: string

  @Prop({ type: Number })
  proxyPort: number

  @Prop({ type: String })
  followUpSchedulePlain: string

  @Prop({ type: Array })
  followUpSchedule: number[]

  @Prop({ type: Number })
  assistantReplyDelay: number

  @Prop({ type: Number })
  adbPort: number

  @Prop({ type: String })
  adbId: string
}

export const DeviceSchema = SchemaFactory.createForClass(Device)
