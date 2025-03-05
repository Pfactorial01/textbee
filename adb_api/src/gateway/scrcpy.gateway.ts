import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { spawn } from 'child_process'
import { exec } from 'child_process'
import { promisify } from 'util'

interface StreamProcess {
  scrcpy: any
  ffmpeg: any
  client: Socket
}

const execAsync = promisify(exec)

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ScrcpyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private logger = new Logger('ScrcpyGateway')
  private activeStreams = new Map<string, StreamProcess>()

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`)
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`)
    this.cleanupStreams(client) // Use a separate cleanup function
  }

  @SubscribeMessage('start_stream')
  async handleStartStream(
    @MessageBody() data: { deviceId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // Check if the client is still connected before starting the stream
      if (!client || !client.connected) {
        this.logger.warn(`Client disconnected before start_stream`)
        return { success: false, error: 'Client disconnected' } // Return error immediately
      }

      await this.startStreaming(data.deviceId, client)
      return { success: true }
    } catch (error) {
      this.logger.error('Failed to start streaming:', error)
      return { success: false, error: error.message }
    }
  }

  @SubscribeMessage('stop_stream')
  handleStopStream(@MessageBody() data: { deviceId: string }, client: Socket) {
    const stream = this.activeStreams.get(data.deviceId)
    if (stream && stream.client.id === client.id) {
      this.stopStreaming(data.deviceId)
    }
    return { success: true }
  }

  @SubscribeMessage('input')
  async handleInput(
    @MessageBody()
    data: {
      deviceId: string
      type: 'touch' | 'scroll' | 'longpress'
      x: number
      y: number
      dy?: number // For vertical scroll
      dx?: number // For horizontal scroll
      duration?: number // For long press
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const stream = this.activeStreams.get(data.deviceId)
      if (!stream || stream.client.id !== client.id) {
        throw new Error('No active stream found for device')
      }

      // Convert coordinates based on device screen size
      const deviceX = Math.round((data.x * 1080) / 270)
      const deviceY = Math.round((data.y * 2400) / 600)

      if (data.type === 'touch') {
        await execAsync(
          `adb -s ${data.deviceId} shell input tap ${deviceX} ${deviceY}`,
        )
        this.logger.log(`Touch event at ${deviceX},${deviceY}`)
      } else if (data.type === 'longpress') {
        // Use swipe command with same start and end coordinates for long press
        const duration = data.duration || 1000 // Default to 1 second if duration not provided
        await execAsync(
          `adb -s ${data.deviceId} shell input swipe ${deviceX} ${deviceY} ${deviceX} ${deviceY} ${duration}`,
        )
        this.logger.log(
          `Long press event at ${deviceX},${deviceY} for ${duration}ms`,
        )
      } else if (data.type === 'scroll') {
        // Calculate scroll amounts
        const scrollY = Math.round((data.dy || 0) * (2400 / 600))
        const scrollX = Math.round((data.dx || 0) * (1080 / 270))

        // Use swipe command for scrolling
        await execAsync(
          `adb -s ${data.deviceId} shell input swipe ${deviceX} ${deviceY} ${
            deviceX - scrollX
          } ${deviceY - scrollY} 100`,
        )
        this.logger.log(
          `Scroll event from ${deviceX},${deviceY} by ${scrollX},${scrollY}`,
        )
      }

      return { success: true }
    } catch (error) {
      this.logger.error('Input error:', error)
      return { success: false, error: error.message }
    }
  }

  private async startStreaming(deviceId: string, client: Socket) {
    this.logger.log(`Starting stream for device: ${deviceId}`)

    this.stopStreaming(deviceId)

    // Start scrcpy with fixed position and size
    const scrcpy = spawn('scrcpy', [
      '-s',
      deviceId,
      '--no-audio',
      '--window-title',
      deviceId,
      '--window-width',
      '800',
      '--window-height',
      '600',
      '--window-x',
      '0', // Force window to start at x=0
      '--window-y',
      '0', // Force window to start at y=0
      '--stay-awake',
      '--show-touches',
      '--video-bit-rate',
      '1M',
      '--max-fps=60',
      '--force-adb-forward',
      '--video-codec',
      'h264',
      '--no-mipmaps',
      '--window-borderless', // Remove window decorations
      '--always-on-top', // Keep window on top to prevent overlap
      // '--crop',
      // '1080:2400:0:0', // Crop the window to show only the device screen
      '--render-driver',
      'opengl',
    ], {
      env: {
        ...process.env,
        DISPLAY: ':99'  // Explicitly set DISPLAY
      }
    })

    // Start ffmpeg with precise capture coordinates and scaling
    const ffmpeg = spawn('ffmpeg', [
      '-f',
      'x11grab',
      '-framerate',
      '60',
      '-video_size',
      '270x600', // Capture only the device screen area
      '-i',
      ':99+265,0', // Start capture from the device screen position
      '-vf',
      'scale=270:600', // Scale to 2x size while maintaining aspect ratio
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-tune',
      'zerolatency',
      '-profile:v',
      'baseline',
      '-pix_fmt',
      'yuv420p',
      '-f',
      'mp4',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      '-g',
      '30',
      '-bf',
      '0',
      '-b:v',
      '0',
      '-maxrate',
      '2M',
      '-bufsize',
      '4M',
      '-',
    ])

    // Wait a bit longer for the window to be properly positioned
    await new Promise((resolve) => setTimeout(resolve, 1000))

    this.activeStreams.set(deviceId, { scrcpy, ffmpeg, client })

    let frameCount = 0
    const startTime = Date.now()

    // Handle ffmpeg output
    ffmpeg.stdout.on('data', (data) => {
      frameCount++
      if (frameCount % 30 === 0) {
        // Log every 30 frames
        const elapsed = (Date.now() - startTime) / 1000
        this.logger.log(
          `Streaming stats - FPS: ${(frameCount / elapsed).toFixed(2)}, Frame size: ${data.length} bytes`,
        )
      }

      const stream = this.activeStreams.get(deviceId)
      if (stream && stream.client && stream.client.connected) {
        stream.client.emit('frame', data)
      } else {
        this.logger.warn(
          `Client disconnected, stopping stream for device: ${deviceId}`,
        )
        this.stopStreaming(deviceId)
      }
    })

    // Log scrcpy output
    scrcpy.stdout.on('data', (data) => {
      this.logger.log(`scrcpy stdout: ${data}`)
    })

    scrcpy.stderr.on('data', (data) => {
      const msg = data.toString()
      if (msg.includes('error')) {
        this.logger.error(`scrcpy error: ${msg}`)
      } else {
        this.logger.log(`scrcpy info: ${msg}`)
      }
    })

    // Log ffmpeg output
    ffmpeg.stderr.on('data', (data) => {
      const msg = data.toString()
      if (msg.includes('error') && !msg.includes('Error marking filters')) {
        this.logger.error(`ffmpeg error: ${msg}`)
      } else {
        // this.logger.log(`ffmpeg info: ${msg}`)
      }
    })

    // Handle process exit
    scrcpy.on('close', (code) => {
      this.logger.log(`scrcpy process exited with code ${code}`)
      const stream = this.activeStreams.get(deviceId)
      if (stream && stream.client.connected) {
        stream.client.emit('stream_closed', { code })
      }
      this.stopStreaming(deviceId)
    })

    ffmpeg.on('close', (code) => {
      this.logger.log(`ffmpeg process exited with code ${code}`)
      const stream = this.activeStreams.get(deviceId)
      if (stream && stream.client.connected) {
        stream.client.emit('stream_closed', { code })
      }
      this.stopStreaming(deviceId)
    })

    return { scrcpy, ffmpeg }
  }

  private stopStreaming(deviceId: string) {
    const stream = this.activeStreams.get(deviceId)
    if (stream) {
      this.logger.log(`Stopping stream for device: ${deviceId}`)
      stream.scrcpy?.kill()
      stream.ffmpeg?.kill()
      this.activeStreams.delete(deviceId)
    }
  }

  private cleanupStreams(client: Socket) {
    for (const [deviceId, stream] of this.activeStreams.entries()) {
      if (stream.client.id === client.id) {
        this.stopStreaming(deviceId) // Use stopStreaming for cleanup
      }
    }
  }
}
