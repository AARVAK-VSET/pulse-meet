/**
 * Runs before every test file (Jest `setupFiles`).
 *
 * Forces a deterministic, test-only environment so that tests never pick up real
 * credentials from the developer's shell or a `.env` file.
 */
export const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 32 bytes, test-only

process.env.NODE_ENV = 'test';
process.env.APP_PORT = '0';
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
process.env.OAUTH_CLIENT_ID = 'test-client-id';
process.env.OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.OAUTH_REDIRECT_URL = 'http://localhost/oauth/callback';
