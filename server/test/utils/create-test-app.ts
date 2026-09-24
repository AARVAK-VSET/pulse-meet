import { INestApplication, ValidationPipe } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import { AuthModule } from 'src/auth/auth.module';
import { EncryptionService } from 'src/auth/encryption.service';
import { CalenderModule } from 'src/calender/calender.module';
import appConfig from 'src/config/env/app.config';
import { HttpExceptionFilter } from 'src/helpers';
import { InMemoryGoogleApi } from './in-memory-google-api';

export interface TestApp {
  app: INestApplication;
  googleApi: InMemoryGoogleApi;
  encryption: EncryptionService;
  /** Cookie header for an authenticated user, built with the app's own EncryptionService. */
  authCookies: (email?: string) => Promise<string[]>;
}

/**
 * Boots the real Auth + Calendar modules with the same global pipes/filters as main.ts,
 * but with:
 *  - the request-scoped 'GoogleApiService' replaced by an InMemoryGoogleApi instance
 *  - an in-memory cache store (never shared between test files)
 *  - config read only from the test env (ignoreEnvFile), never from a local .env
 */
export async function createTestApp(): Promise<TestApp> {
  const googleApi = new InMemoryGoogleApi();

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [appConfig] }),
      CacheModule.register({ isGlobal: true }),
      AuthModule,
      CalenderModule,
    ],
  })
    .overrideProvider('GoogleApiService')
    .useValue(googleApi)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  const encryption = app.get(EncryptionService);

  const authCookies = async (email = googleApi.userEmail): Promise<string[]> => {
    const accessToken = (await encryption.encrypt('google-access-token'))!;
    const session = (await encryption.encrypt(JSON.stringify({ email, hd: 'example.com' })))!;

    return [
      `accessToken=${accessToken.encryptedData}`,
      `accessTokenIv=${accessToken.iv}`,
      `session=${session.encryptedData}`,
      `sessionIv=${session.iv}`,
      'email=forged@example.com',
      'hd=forged.example',
    ];
  };

  return { app, googleApi, encryption, authCookies };
}
