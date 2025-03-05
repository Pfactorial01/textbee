import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Device, DeviceDocument } from './schemas/device.schema'
import { Model } from 'mongoose'
import { spawn } from 'child_process'
import { promisify } from 'util'
import { exec } from 'child_process'

@Injectable()
export class GatewayService {
  constructor(
    @InjectModel(Device.name) private deviceModel: Model<DeviceDocument>,
  ) {}

  async getDeviceById(deviceId: string): Promise<any> {
    return await this.deviceModel.findById(deviceId)
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

    const execPromise = promisify(exec)

    try {
      // Execute the shell command
      const { stdout, stderr } = await execPromise(
      // @ts-ignore
        `adb -s ${device.adbId} shell ${command}`,
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

    return new Promise((resolve, reject) => {
      // Turn off mobile data
      const turnOffMobileData = spawn('adb', [
        '-s',
        // @ts-ignore
        `${device.adbId}`,
        'shell',
        'svc data disable',
      ])

      let turnOffError = ''

      turnOffMobileData.stderr.on('data', (data) => {
        turnOffError += data.toString()
      })

      turnOffMobileData.on('error', (error) => {
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

      turnOffMobileData.on('close', (code) => {
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

        // Wait 30 seconds before turning it back on
        setTimeout(() => {
          const turnOnMobileData = spawn('adb', [
            '-s',
            // @ts-ignore
            `${device.adbId}`,
            'shell',
            'svc data enable',
          ])

          let turnOnError = ''

          turnOnMobileData.stderr.on('data', (data) => {
            turnOnError += data.toString()
          })

          turnOnMobileData.on('error', (error) => {
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

          turnOnMobileData.on('close', (code) => {
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
              data: 'Mobile data toggled successfully',
            })
          })
        }, 30000) // 30 seconds delay
      })

      // Set a timeout for the entire operation
      setTimeout(() => {
        turnOffMobileData.kill()
        reject(
          new HttpException(
            {
              success: false,
              error: 'Operation timed out',
            },
            HttpStatus.REQUEST_TIMEOUT,
          ),
        )
      }, 50000) // 50 second timeout for the entire operation
    })
  }
}
