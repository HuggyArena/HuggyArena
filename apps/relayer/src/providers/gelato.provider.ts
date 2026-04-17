import { Injectable } from '@nestjs/common';
import { GelatoRelay, SponsoredCallRequest } from '@gelatonetwork/relay-sdk';

@Injectable()
export class GelatoProvider {
  private readonly relay = new GelatoRelay();
  private readonly apiKey = process.env.GELATO_API_KEY!;

  /**
   * Submit a plain (non-ERC2771) sponsored call through Gelato. The end-user is
   * identified by the oracle-signed EIP-712 `Bet` struct embedded in the
   * calldata, so the relayer does not need to inject a signer or forward a
   * user-side meta-transaction signature.
   */
  async sponsorCall(request: SponsoredCallRequest) {
    const response = await this.relay.sponsoredCall(request, this.apiKey, {
      retries: 3,
      gasLimit: 500000n,
    });

    return { taskId: response.taskId };
  }

  async getTaskStatus(taskId: string) {
    return this.relay.getTaskStatus(taskId);
  }
}
