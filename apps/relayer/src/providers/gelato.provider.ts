import { Injectable } from '@nestjs/common';
import { CallWithERC2771Request, GelatoRelay } from '@gelatonetwork/relay-sdk';
import { ethers } from 'ethers';

@Injectable()
export class GelatoProvider {
  private readonly relay = new GelatoRelay();
  private readonly apiKey = process.env.GELATO_API_KEY!;
  // Gelato's `sponsoredCallERC2771` requires a `SignerOrProvider` to sign the ERC2771
  // meta-transaction server-side. We reuse the configured oracle key as the signer.
  private readonly signer: ethers.Wallet;

  constructor() {
    const relayerKey = process.env.RELAYER_PRIVATE_KEY ?? process.env.ORACLE_PRIVATE_KEY;
    if (!relayerKey) {
      throw new Error(
        'RELAYER_PRIVATE_KEY (or ORACLE_PRIVATE_KEY as fallback) is required to sign Gelato ERC2771 relay calls',
      );
    }
    const rpcProvider = process.env.RPC_URL
      ? new ethers.JsonRpcProvider(process.env.RPC_URL)
      : undefined;
    this.signer = new ethers.Wallet(relayerKey, rpcProvider);
  }

  async sponsorCallERC2771(request: CallWithERC2771Request) {
    const response = await this.relay.sponsoredCallERC2771(request, this.signer, this.apiKey, {
      retries: 3,
      gasLimit: 500000n,
    });

    return { taskId: response.taskId };
  }

  async getTaskStatus(taskId: string) {
    return this.relay.getTaskStatus(taskId);
  }
}
