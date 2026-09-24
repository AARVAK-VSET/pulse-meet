import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { _Request } from './interfaces';
import { EncryptionService } from './encryption.service';

interface SessionPayload {
  email: string;
  hd: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private encryptionService: EncryptionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: _Request = context.switchToHttp().getRequest();

    if (!request.cookies?.accessToken || !request.cookies?.accessTokenIv || !request.cookies?.session || !request.cookies?.sessionIv) {
      throw new UnauthorizedException('No access token found');
    }

    try {
      request.accessToken = await this.encryptionService.decrypt(request.cookies.accessToken, request.cookies.accessTokenIv);
      const session = await this.encryptionService.decrypt(request.cookies.session, request.cookies.sessionIv);
      const payload = this.parseSessionPayload(session);

      request.hd = payload.hd;
      request.email = payload.email;
    } catch (error) {
      throw new UnauthorizedException('Invalid access token');
    }

    return true;
  }

  private parseSessionPayload(session: string | null): SessionPayload {
    try {
      const payload = JSON.parse(session ?? '{}') as Partial<SessionPayload>;
      if (typeof payload.email !== 'string' || typeof payload.hd !== 'string' || !payload.email || !payload.hd) {
        throw new Error('Missing session identity');
      }

      return { email: payload.email, hd: payload.hd };
    } catch (error) {
      throw new UnauthorizedException('Invalid session payload');
    }
  }
}
