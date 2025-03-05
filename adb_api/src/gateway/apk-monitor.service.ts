import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Device, DeviceDocument } from './schemas/device.schema';
import { Model } from 'mongoose';
import { Interval } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

@Injectable()
export class ApkMonitorService {
  private readonly logger = new Logger(ApkMonitorService.name);
  private lastProcessedApks: Set<string> = new Set();

  constructor(
    @InjectModel(Device.name) private deviceModel: Model<DeviceDocument>,
  ) {
    // Initialize with current APKs
    this.updateProcessedApks();
  }

  private updateProcessedApks() {
    const apkDir = path.join(process.cwd(), 'apk');
    if (!fs.existsSync(apkDir)) {
      fs.mkdirSync(apkDir, { recursive: true });
      return;
    }

    const currentApks = fs.readdirSync(apkDir)
      .filter(file => file.endsWith('.apk'));
    
    this.lastProcessedApks = new Set(currentApks);
  }

  private async installApk(deviceId: string, apkPath: string): Promise<void> {
    try {
      this.logger.log(`Installing APK on device ${deviceId}: ${apkPath}`);
      await execAsync(`adb -s ${deviceId} install -r "${apkPath}"`);
      this.logger.log(`Successfully installed APK on device ${deviceId}`);
    } catch (error) {
      this.logger.error(`Failed to install APK on device ${deviceId}: ${error.message}`);
      throw error;
    }
  }

  @Interval(3000) // Run every 30s
  async checkForNewApks() {
    try {
      const apkDir = path.join(process.cwd(), 'apk');
      if (!fs.existsSync(apkDir)) {
        fs.mkdirSync(apkDir, { recursive: true });
        return;
      }

      const currentApks = fs.readdirSync(apkDir)
        .filter(file => file.endsWith('.apk'));

      // Find new APKs
      const newApks = currentApks.filter(apk => !this.lastProcessedApks.has(apk));

      if (newApks.length === 0) {
        return;
      }

      this.logger.log(`Found new APKs: ${newApks.join(', ')}`);

      // Get all active devices
      const devices = await this.deviceModel.find().exec();

      if (devices.length === 0) {
        this.logger.warn('No devices found in database');
        return;
      }

      // Install each new APK on all devices
      for (const apk of newApks) {
        const apkPath = path.join(apkDir, apk);
        
        for (const device of devices) {
          try {
            if (device?.adbId) {
                await this.installApk(device.adbId, apkPath);
            }
          } catch (error) {
            this.logger.error(`Failed to install ${apk} on device ${device.adbId}: ${error.message}`);
            // Continue with next device even if one fails
            continue;
          }
        }
      }

      // Update processed APKs list
      this.updateProcessedApks();
      
    } catch (error) {
      this.logger.error('Error in APK monitoring:', error);
    }
  }
} 