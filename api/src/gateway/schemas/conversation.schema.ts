import { Document, Types } from 'mongoose'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Device } from './device.schema'

export type ConversationDocument = Conversation & Document

@Schema({ timestamps: true })
export class Conversation {
  _id?: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: Device.name, required: true })
  device: Device

  @Prop({ type: String, required: true })
  number: string

  @Prop({ type: String })
  thread_id: string

  @Prop({ type: Boolean })
  human_interaction: boolean

  @Prop({ type: String })
  channel_id: string

  @Prop({ type: Date })
  followUpDue: Date

  @Prop({ type: Number })
  lastFollowUpSent: number

  @Prop({ type: Date })
  firstFollowUpDate: Date

  @Prop({ type: Date })
  createdAt: Date
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation)
