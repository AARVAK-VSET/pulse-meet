import * as https from 'https';
import { GoogleApiService } from 'src/google-api/google-api.service';
import { blockedHosts } from '../setup/no-network';
import { TEST_ENCRYPTION_KEY } from '../setup/test-env';

/**
 * Guards the guard rails: if these fail, tests could be talking to real Google APIs
 * or running with real credentials.
 */
describe('Test environment isolation', () => {
  beforeEach(() => {
    blockedHosts.length = 0;
  });

  it('runs with test-only configuration', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.ENCRYPTION_KEY).toBe(TEST_ENCRYPTION_KEY);
    expect(process.env.OAUTH_CLIENT_SECRET).toBe('test-client-secret');
  });

  it('blocks outbound HTTPS requests', () => {
    expect(() => https.request('https://www.googleapis.com/calendar/v3/freeBusy')).toThrow(/blocked/);
    expect(blockedHosts).toEqual(['www.googleapis.com']);
  });

  it('blocks outbound fetch', async () => {
    await expect(fetch('https://oauth2.googleapis.com/token')).rejects.toThrow(/blocked/);
  });

  it('makes the real GoogleApiService fail fast instead of reaching Google', async () => {
    const service = new GoogleApiService(
      { oAuthClientId: 'id', oAuthClientSecret: 'secret', oAuthRedirectUrl: 'http://localhost' } as any,
      { log: jest.fn(), error: jest.fn() } as any,
    );
    const client = service.getOAuthClient();
    client.setCredentials({ access_token: 'x' });

    await expect(service.getCalendarResources(client)).rejects.toThrow();
    expect(blockedHosts).toContain('admin.googleapis.com');
  });
});
