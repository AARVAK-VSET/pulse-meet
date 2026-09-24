import * as request from 'supertest';
import { createTestApp, TestApp } from '../utils/create-test-app';

const cookieMap = (res: request.Response): Record<string, string> => {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  return Object.fromEntries((header ?? []).map((c) => c.split(';')[0].split('=')).map(([k, v]) => [k, decodeURIComponent(v ?? '')]));
};

describe('Auth API (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(() => {
    t.googleApi.reset();
  });

  describe('POST /auth/oauth2/callback', () => {
    it('sets encrypted, httpOnly session cookies', async () => {
      const res = await request(t.app.getHttpServer()).post('/auth/oauth2/callback').send({ code: 'valid-code' }).expect(201);

      expect(res.body).toMatchObject({ status: 'success', data: true });

      const cookies = cookieMap(res);
      expect(cookies.email).toBeUndefined();
      expect(cookies.hd).toBeUndefined();
      expect(cookies.accessToken).not.toBe('google-access-token');
      await expect(t.encryption.decrypt(cookies.accessToken, cookies.accessTokenIv)).resolves.toBe('google-access-token');
      await expect(t.encryption.decrypt(cookies.refreshToken, cookies.refreshTokenIv)).resolves.toBe('google-refresh-token');
      await expect(t.encryption.decrypt(cookies.session, cookies.sessionIv)).resolves.toBe(JSON.stringify({ email: 'organizer@example.com', hd: 'example.com' }));

      const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('accessToken='));
      expect(raw).toMatch(/HttpOnly/);
      expect(raw).toMatch(/SameSite=Strict/);
    });

    it('returns a 500 error envelope when Google rejects the code', async () => {
      const res = await request(t.app.getHttpServer()).post('/auth/oauth2/callback').send({ code: 'bad-code' }).expect(500);

      expect(res.body).toEqual({ statusCode: 500, status: 'error', message: 'Internal server error' });
    });
  });

  describe('GET /auth/token/refresh', () => {
    it('returns 401 with redirect when no refresh token cookie is present', async () => {
      const res = await request(t.app.getHttpServer()).get('/auth/token/refresh').expect(401);

      expect(res.body).toMatchObject({ status: 'error', redirect: true, message: 'No refresh token found' });
    });

    it('rotates the access token cookie', async () => {
      const { encryptedData, iv } = await t.encryption.encrypt('google-refresh-token');

      const res = await request(t.app.getHttpServer())
        .get('/auth/token/refresh')
        .set('Cookie', [`refreshToken=${encryptedData}`, `refreshTokenIv=${iv}`])
        .expect(200);

      const cookies = cookieMap(res);
      await expect(t.encryption.decrypt(cookies.accessToken, cookies.accessTokenIv)).resolves.toBe('refreshed-access-token');
    });

    it('returns 401 for a tampered refresh token', async () => {
      await request(t.app.getHttpServer())
        .get('/auth/token/refresh')
        .set('Cookie', ['refreshToken=deadbeef', `refreshTokenIv=${'ab'.repeat(16)}`])
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('clears session cookies without revoking by default', async () => {
      const res = await request(t.app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', await t.authCookies())
        .expect(201);

      const cookies = cookieMap(res);
      expect(cookies).toMatchObject({ accessToken: '', accessTokenIv: '', session: '', sessionIv: '', email: '', hd: '' });
      expect(cookies.refreshToken).toBeUndefined();
      expect(t.googleApi.revokedTokens).toEqual([]);
    });

    it('revokes the Google token when requested', async () => {
      await request(t.app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', await t.authCookies())
        .send({ revokeToken: true })
        .expect(201);

      expect(t.googleApi.revokedTokens).toEqual(['google-access-token']);
    });
  });

  it('GET /auth/oauth2/url returns the consent URL', async () => {
    const res = await request(t.app.getHttpServer()).get('/auth/oauth2/url?client=chrome').expect(200);

    expect(res.body.data).toBe('https://accounts.example.test/o/oauth2/auth?client=chrome');
  });
});
