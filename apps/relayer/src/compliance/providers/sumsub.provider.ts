import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@arena/shared-prisma';
import crypto from 'crypto';

@Injectable()
export class SumsubProvider {
  private readonly logger = new Logger(SumsubProvider.name);
  private readonly baseUrl = 'https://api.sumsub.com';
  private readonly appToken = process.env.SUMSUB_APP_TOKEN || '';
  private readonly secretKey = process.env.SUMSUB_SECRET_KEY || '';

  constructor(private readonly prisma: PrismaService) {}

  async createApplicant(userId: string, levelName: string) {
    const timestamp = Date.now();
    const path = `/resources/applicants?levelName=${encodeURIComponent(levelName)}`;
    const body = JSON.stringify({ externalUserId: userId });
    const signature = this.sign('POST', path, timestamp, body);

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'X-App-Token': this.appToken,
        'X-App-Access-Sig': signature,
        'X-App-Access-Ts': timestamp.toString(),
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      throw new BadRequestException(`Sumsub API error: ${response.status}`);
    }

    return response.json();
  }

  async handleWebhook(rawBody: Buffer, signature: string, payloadDigest?: string) {
    if (!this.verifyWebhook(rawBody, signature, payloadDigest)) {
      this.logger.error('Invalid Sumsub webhook signature');
      throw new BadRequestException('Invalid signature');
    }

    let webhookPayload: any;
    try {
      webhookPayload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    if (!webhookPayload.externalUserId) throw new BadRequestException('Missing externalUserId');

    await this.prisma.user.update({
      where: { id: webhookPayload.externalUserId },
      data: {
        kycStatus: webhookPayload.reviewResult?.reviewStatus ?? 'unknown',
        kycLevel: webhookPayload.levelName ?? 'unknown',
      },
    });

    this.logger.log(`Updated KYC status for user ${webhookPayload.externalUserId}`);
  }

  private sign(method: string, path: string, timestamp: number, body: string) {
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(`${timestamp}${method.toUpperCase()}${path}${body}`)
      .digest('hex');
  }

  private verifyWebhook(rawBody: Buffer, webhookSignature: string, payloadDigest?: string): boolean {
    const calculated = crypto.createHmac('sha256', this.secretKey).update(rawBody).digest('hex');

    const safeCompare = (hexStringA: string, hexStringB: string) => {
      try {
        const bufA = Buffer.from(hexStringA, 'hex');
        const bufB = Buffer.from(hexStringB, 'hex');
        return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
      } catch {
        return false;
      }
    };

    if (payloadDigest && !safeCompare(calculated, payloadDigest)) return false;
    return safeCompare(calculated, webhookSignature);
  }
}
