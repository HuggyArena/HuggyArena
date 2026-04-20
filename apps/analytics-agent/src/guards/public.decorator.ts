import { SetMetadata } from '@nestjs/common';

/** Metadata key used by ApiKeyGuard to identify public routes. */
export const PUBLIC_KEY = 'isPublic';

/** Mark a controller or route handler as publicly accessible (no API key required). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
