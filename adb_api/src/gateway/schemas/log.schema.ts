import { Document, Types } from 'mongoose'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Device } from './device.schema'

export type LogDocument = Log & Document

@Schema({ timestamps: true })
export class Log {
  _id?: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: Device.name, required: true })
  device: Device

  @Prop({ type: String, required: true })
  message: string

  @Prop({ type: String })
  type: string

  @Prop({ type: Date })
  createdAt: Date
}

export const LogSchema = SchemaFactory.createForClass(Log)
