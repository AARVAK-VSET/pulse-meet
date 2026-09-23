import { BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { caching, Cache } from 'cache-manager';
import { AuthService } from 'src/auth/auth.service';
import { EncryptionService } from 'src/auth/encryption.service';
import { TEST_ENCRYPTION_KEY } from '../setup/test-env';
import { conferenceRooms, directoryPeople, directoryRooms, people } from '../utils/fixtures';

describe('AuthService', () => {
  let service: AuthService;
  let cache: Cache;
  let encryption: EncryptionService;
  let oauthClient: { setCredentials: jest.Mock; refreshAccessToken: jest.Mock; revokeCredentials: jest.Mock };
  let googleApi: Record<string, jest.Mock>;
  let jwt: JwtService;
  const logger = { log: jest.fn(), error: jest.fn() } as unknown as Logger;

  const createService = (environment = 'production') => new AuthService({ environment } as any, googleApi as any, encryption, cache, jwt, logger);

  beforeEach(async () => {
    // a real, in-memory cache store: isolated per test and never shared with the running app
    cache = await caching('memory');
    encryption = new EncryptionService({ encryptionKey: TEST_ENCRYPTION_KEY } as any);
    jwt = new JwtService();
    oauthClient = {
      setCredentials: jest.fn(),
      refreshAccessToken: jest.fn(),
      revokeCredentials: jest.fn(),
    };
    googleApi = {
      getOAuthClient: jest.fn().mockReturnValue(oauthClient),
      getToken: jest.fn(),
      getCalendarResources: jest.fn().mockResolvedValue({ items: directoryRooms() }),
      listPeople: jest.fn().mockResolvedValue(directoryPeople()),
    };
    service = createService();
  });

  describe('login', () => {
    it('exchanges the code, warms the cache and returns encrypted tokens', async () => {
      const id_token = jwt.sign({ hd: 'example.com', email: 'alice@example.com' }, { secret: 'test' });
      googleApi.getToken.mockResolvedValue({ tokens: { access_token: 'access', refresh_token: 'refresh', id_token } });

      const result = await service.login('auth-code');

      expect(googleApi.getToken).toHaveBeenCalledWith(oauthClient, 'auth-code');
      expect(result).toMatchObject({ hd: 'example.com', email: 'alice@example.com' });
      expect(result.accessToken).not.toBe('access');
      await expect(encryption.decrypt(result.accessToken, result.accessTokenIv)).resolves.toBe('access');
      await expect(encryption.decrypt(result.refreshToken, result.refreshTokenIv)).resolves.toBe('refresh');
      expect(await cache.get('conference_rooms')).toHaveLength(3);
      expect(await cache.get('people')).toHaveLength(2);
    });

    it('omits the refresh token when Google does not return one', async () => {
      const id_token = jwt.sign({ hd: 'example.com', email: 'alice@example.com' }, { secret: 'test' });
      googleApi.getToken.mockResolvedValue({ tokens: { access_token: 'access', id_token } });

      const result = await service.login('auth-code');

      expect(result.refreshToken).toBeUndefined();
      expect(result.refreshTokenIv).toBeUndefined();
    });
  });

  describe('refreshAppToken', () => {
    it('throws BadRequest when there is no refresh token', async () => {
      await expect(service.refreshAppToken(undefined)).rejects.toThrow(BadRequestException);
      expect(googleApi.getOAuthClient).not.toHaveBeenCalled();
    });

    it('returns the new access token', async () => {
      oauthClient.refreshAccessToken.mockResolvedValue({ credentials: { access_token: 'new-access' } });

      await expect(service.refreshAppToken('refresh')).resolves.toBe('new-access');
      expect(oauthClient.setCredentials).toHaveBeenCalledWith({ refresh_token: 'refresh' });
    });

    it('maps Google errors to Unauthorized', async () => {
      oauthClient.refreshAccessToken.mockRejectedValue(new Error('invalid_grant'));

      await expect(service.refreshAppToken('refresh')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('returns true when the token is revoked', async () => {
      oauthClient.revokeCredentials.mockResolvedValue({});

      await expect(service.logout(oauthClient as any)).resolves.toBe(true);
    });

    it('returns false (and does not throw) when revocation fails', async () => {
      oauthClient.revokeCredentials.mockRejectedValue(new Error('network down'));

      await expect(service.logout(oauthClient as any)).resolves.toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('directory resources', () => {
    it('maps Google calendar resources to conference rooms and caches them', async () => {
      const rooms = await service.getDirectoryResources(oauthClient as any);

      expect(rooms).toEqual(conferenceRooms());
      expect(await cache.get('conference_rooms')).toEqual(conferenceRooms());
    });

    it('serves subsequent calls from the cache', async () => {
      await service.getDirectoryResources(oauthClient as any);
      await service.getDirectoryResources(oauthClient as any);

      expect(googleApi.getCalendarResources).toHaveBeenCalledTimes(1);
    });

    it('sorts rooms by seat count', async () => {
      await cache.set('conference_rooms', [{ seats: 10 }, { seats: 2 }, { seats: 6 }]);

      const rooms = await service.getDirectoryResources(oauthClient as any);

      expect(rooms.map((r) => r.seats)).toEqual([2, 6, 10]);
    });

    it('returns floors de-duplicated and in natural order', async () => {
      const floors = await service.getFloors(oauthClient as any);

      expect(floors).toEqual(['F1', 'F2', 'F10']);
    });
  });

  describe('people', () => {
    it('only exposes primary + verified emails', async () => {
      const result = await service.getPeopleResources(oauthClient as any);

      expect(result).toEqual(people());
    });

    it('serves subsequent calls from the cache', async () => {
      await service.getPeopleResources(oauthClient as any);
      await service.getPeopleResources(oauthClient as any);

      expect(googleApi.listPeople).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCookieOptions', () => {
    it('uses secure, httpOnly, strict cookies outside development', () => {
      expect(service.getCookieOptions(1000)).toEqual({ httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 1000 });
    });

    it('allows insecure cookies in development only', () => {
      expect(createService('development').getCookieOptions().secure).toBe(false);
    });
  });
});
