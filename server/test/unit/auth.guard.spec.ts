import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from 'src/auth/auth.guard';
import { EncryptionService } from 'src/auth/encryption.service';
import { TEST_ENCRYPTION_KEY } from '../setup/test-env';

const contextFor = (request: Record<string, any>) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

describe('AuthGuard', () => {
  const encryption = new EncryptionService({ encryptionKey: TEST_ENCRYPTION_KEY } as any);
  const guard = new AuthGuard(encryption);

  it('decrypts the access token cookie onto the request', async () => {
    const { encryptedData, iv } = await encryption.encrypt('google-access-token');
    const request = { cookies: { accessToken: encryptedData, accessTokenIv: iv, hd: 'example.com', email: 'alice@example.com' } } as any;

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request).toMatchObject({ accessToken: 'google-access-token', hd: 'example.com', email: 'alice@example.com' });
  });

  it.each([
    ['no cookies', {}],
    ['no IV', { cookies: { accessToken: 'abc' } }],
    ['no token', { cookies: { accessTokenIv: 'abc' } }],
  ])('rejects requests with %s', async (_, request) => {
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow('No access token found');
  });

  it('rejects a forged token', async () => {
    const request = { cookies: { accessToken: 'deadbeef', accessTokenIv: 'ab'.repeat(16) } };

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(UnauthorizedException);
  });
});
