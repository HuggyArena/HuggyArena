import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PUBLIC_KEY } from './public.decorator';

/**
 * Global guard requiring a valid `x-api-key` header on all endpoints.
 *
 * Routes decorated with @Public() bypass the check (e.g. health probes).
 * When ANALYTICS_API_KEY is unset the guard is permissive — every request
 * passes — so local development works without extra env config.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly apiKey: string | undefined;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.apiKey = config.get<string>('ANALYTICS_API_KEY');
  }

  canActivate(context: ExecutionContext): boolean {
    // 1. Skip auth for routes marked @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2. If no API key is configured, allow all requests (dev mode)
    if (!this.apiKey) return true;

    // 3. Validate the x-api-key header
    const request = context.switchToHttp().getRequest();
    const provided = request.headers['x-api-key'] as string | undefined;

    if (!provided || provided !== this.apiKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}
