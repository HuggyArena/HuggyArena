import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@arena/shared-prisma';
import { SanctionsProvider } from '../providers/sanctions.provider';

@Injectable()
export class SanctionsGuard implements CanActivate {
  constructor(
    private readonly sanctions: SanctionsProvider,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const address = request.body?.userAddress || request.body?.user || request.params?.address;
    if (!address) return true;

    const normalized = String(address).toLowerCase();
    const cached = await this.prisma.sanctionCheck.findFirst({
      where: {
        address: normalized,
        checkedAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });

    if (cached?.severity === 'HIGH' || cached?.severity === 'SEVERE') {
      throw new ForbiddenException('Address restricted by compliance policy');
    }

    if (!cached) {
      const result = await this.sanctions.screenAddress(normalized);
      await this.prisma.sanctionCheck.create({
        data: {
          address: normalized,
          severity: result.risk,
          source: this.sanctions.providerName,
        },
      });

      if (result.risk === 'HIGH' || result.risk === 'SEVERE') {
        throw new ForbiddenException('Address restricted by compliance policy');
      }
    }

    return true;
  }
}
