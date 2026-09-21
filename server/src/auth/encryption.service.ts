import { Inject, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as crypto from 'crypto';
import appConfig from 'src/config/env/app.config';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private key: Buffer;

  constructor(@Inject(appConfig.KEY) private config: ConfigType<typeof appConfig>) {
    this.key = Buffer.from(this.config.encryptionKey, 'hex');

    if (this.key.length !== 32) {
      throw new InternalServerErrorException('Invalid ENCRYPTION_KEY: Must be 32 bytes.');
    }
  }

  async encrypt(text: string): Promise<{ iv: string; encryptedData: string } | null> {
    return new Promise((resolve, reject) => {
      try {
        if (!text) resolve(null);

        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.key), iv);

        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        resolve({
          iv: iv.toString('hex'),
          encryptedData: encrypted.toString('hex'),
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private static readonly HEX_REGEX = /^[0-9a-fA-F]+$/;

  async decrypt(encryptedData: string, iv: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      try {
        if (!encryptedData) {
          return resolve(null);
        }

        if (!iv || !EncryptionService.HEX_REGEX.test(iv) || Buffer.byteLength(iv, 'hex') !== 16) {
          return reject(new UnauthorizedException('Invalid initialization vector'));
        }

        if (!EncryptionService.HEX_REGEX.test(encryptedData)) {
          return reject(new UnauthorizedException('Invalid encrypted payload'));
        }

        const ivBuffer = Buffer.from(iv, 'hex');
        const encryptedText = Buffer.from(encryptedData, 'hex');
        const decipher = crypto.createDecipheriv(this.algorithm, Buffer.from(this.key), ivBuffer);

        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        resolve(decrypted.toString());
      } catch (error) {
        reject(new UnauthorizedException('Invalid access token'));
      }
    });
  }
}