import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { EncryptionService } from 'src/auth/encryption.service';
import { TEST_ENCRYPTION_KEY } from '../setup/test-env';

const createService = (encryptionKey = TEST_ENCRYPTION_KEY) => new EncryptionService({ encryptionKey } as any);

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    service = createService();
  });

  describe('constructor', () => {
    it('rejects a missing key', () => {
      expect(() => new EncryptionService({ encryptionKey: undefined } as any)).toThrow();
    });

    it.each([
      ['empty', ''],
      ['too short', 'abcd'],
      ['too long', TEST_ENCRYPTION_KEY + '00'],
    ])('rejects a %s key', (_, key) => {
      expect(() => createService(key)).toThrow(InternalServerErrorException);
    });
  });

  describe('encrypt / decrypt', () => {
    it('round-trips plaintext', async () => {
      const { encryptedData, iv } = await service.encrypt('ya29.secret-token');

      await expect(service.decrypt(encryptedData, iv)).resolves.toBe('ya29.secret-token');
    });

    it('produces hex output with a 16-byte IV and never leaks the plaintext', async () => {
      const { encryptedData, iv } = await service.encrypt('ya29.secret-token');

      expect(iv).toMatch(/^[0-9a-f]{32}$/);
      expect(encryptedData).toMatch(/^[0-9a-f]+$/);
      expect(encryptedData).not.toContain('secret');
    });

    it('uses a fresh IV per call so equal inputs give different ciphertexts', async () => {
      const a = await service.encrypt('same');
      const b = await service.encrypt('same');

      expect(a.iv).not.toBe(b.iv);
      expect(a.encryptedData).not.toBe(b.encryptedData);
    });

    it('returns null for empty input', async () => {
      await expect(service.encrypt('')).resolves.toBeNull();
      await expect(service.encrypt(undefined)).resolves.toBeNull();
      await expect(service.decrypt('', 'ab'.repeat(16))).resolves.toBeNull();
    });

    it('cannot be decrypted with a different key', async () => {
      const { encryptedData, iv } = await service.encrypt('ya29.secret-token');
      const other = createService('f'.repeat(64));

      await expect(other.decrypt(encryptedData, iv)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('decrypt input validation', () => {
    let payload: { encryptedData: string; iv: string };

    beforeEach(async () => {
      payload = await service.encrypt('ya29.secret-token');
    });

    it.each([
      ['missing', undefined],
      ['non-hex', 'z'.repeat(32)],
      ['wrong length', 'ab'.repeat(8)],
    ])('rejects a %s IV', async (_, iv) => {
      await expect(service.decrypt(payload.encryptedData, iv)).rejects.toThrow('Invalid initialization vector');
    });

    it('rejects a non-hex payload', async () => {
      await expect(service.decrypt('not-hex!', payload.iv)).rejects.toThrow('Invalid encrypted payload');
    });

    it('rejects a tampered payload', async () => {
      const tampered = payload.encryptedData.slice(0, -2) + (payload.encryptedData.endsWith('00') ? '11' : '00');

      await expect(service.decrypt(tampered, payload.iv)).rejects.toThrow(UnauthorizedException);
    });
  });
});
