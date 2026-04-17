import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '@arena/shared-prisma';
import { GelatoProvider } from './providers/gelato.provider';

type OracleSignatureDto = {
  user: string;
  outcome: string;
  amount: string;
  nonce?: number;
  marketAddress: string;
  chainId: number;
};

type SubmitRelayInput = {
  chainId: number;
  target: string;
  userAddress: string;
  marketId: string;
  amount: string;
  data: string;
  deadline?: number;
};

// ABI fragment used for decoding placeBet calldata in submit().
const PLACE_BET_IFACE = new ethers.Interface([
  'function placeBet(bytes32 outcome, uint256 amount, uint256 nonce, uint256 deadline, bytes calldata sig)',
]);

// EIP-712 type definition for a Bet struct (mirrors ArenaMarket.BET_TYPEHASH).
const BET_TYPES = {
  Bet: [
    { name: 'market', type: 'address' },
    { name: 'user', type: 'address' },
    { name: 'outcome', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

@Injectable()
export class RelayService implements OnApplicationShutdown {
  private readonly logger = new Logger(RelayService.name);
  private readonly activeTimers = new Map<string, NodeJS.Timeout>();
  private readonly MAX_POLLING_DURATION = 15 * 60 * 1000;
  private shuttingDown = false;

  // Cached RPC provider — avoids creating a new connection on every call (#18).
  private readonly rpcProvider: ethers.JsonRpcProvider;

  // Cached oracle wallet — validated at startup to catch mis-configuration early (#17).
  private readonly oracleWallet: ethers.Wallet;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gelato: GelatoProvider,
  ) {
    const oracleKey = process.env.ORACLE_PRIVATE_KEY;
    if (!oracleKey) {
      throw new Error('ORACLE_PRIVATE_KEY is required but not configured');
    }
    try {
      this.oracleWallet = new ethers.Wallet(oracleKey);
    } catch {
      throw new Error('ORACLE_PRIVATE_KEY is invalid — cannot construct wallet');
    }

    this.rpcProvider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  }

  async generateOracleSignature(dto: OracleSignatureDto) {
    const nonce = dto.nonce ?? Math.floor(Date.now() / 1000);
    const deadline = Math.floor(Date.now() / 1000) + 300;

    if (!ethers.isAddress(dto.user)) throw new BadRequestException('Invalid user address');
    if (!ethers.isAddress(dto.marketAddress)) throw new BadRequestException('Invalid market address');

    const domain = {
      name: 'ArenaMarket',
      version: '1',
      chainId: dto.chainId,
      verifyingContract: dto.marketAddress,
    };

    const betTypedDataValue = {
      market: dto.marketAddress,
      user: dto.user,
      outcome: dto.outcome,
      amount: dto.amount,
      nonce,
      deadline,
    };

    const signature = await this.oracleWallet.signTypedData(domain, BET_TYPES, betTypedDataValue);
    return { nonce, signature, deadline, marketAddress: dto.marketAddress };
  }

  async submit(dto: SubmitRelayInput) {
    // Decode calldata and verify oracle signature before any other processing (#3).
    const { nonce } = this.decodeAndVerifyCalldata(dto);
    await this.validateBalance(dto.userAddress, dto.target, dto.amount);
    await this.validateDeadline(dto.deadline);

    // Idempotency key is based purely on stable parameters — no time bucketing (#16).
    const idempotencyKey = ethers.keccak256(
      ethers.toUtf8Bytes(
        `${dto.userAddress}-${dto.target}-${dto.amount}-${dto.marketId}-${nonce.toString()}-${dto.chainId}`,
      ),
    );

    const existing = await this.prisma.relayedTransaction.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      return {
        taskId: existing.gelatoTaskId,
        estimatedExecution: 0,
        txHash: existing.txHash,
        status: existing.status,
      };
    }

    const relayResult = await this.gelato.sponsorCallERC2771({
      chainId: dto.chainId,
      target: dto.target,
      data: dto.data,
      user: dto.userAddress,
    } as any);

    const tx = await this.prisma.relayedTransaction.create({
      data: {
        idempotencyKey,
        userAddress: dto.userAddress,
        target: dto.target,
        amount: dto.amount,
        marketId: dto.marketId,
        chainId: dto.chainId,
        gelatoTaskId: relayResult.taskId,
        status: 'PENDING',
      },
    });

    this.pollForCompletion(tx.id, relayResult.taskId).catch((pollingError) => {
      this.logger.error('Relay polling failed', pollingError as any);
    });

    return {
      taskId: relayResult.taskId,
      estimatedExecution: 15,
      txHash: null,
      status: 'PENDING',
    };
  }

  async getTaskStatus(taskId: string) {
    return this.gelato.getTaskStatus(taskId);
  }

  onApplicationShutdown() {
    this.shuttingDown = true;
    this.activeTimers.forEach((timer) => clearInterval(timer));
    this.activeTimers.clear();
    this.logger.log('Cleaned up relay polling timers');
  }

  private async validateDeadline(deadline?: number) {
    if (!deadline) return;
    const now = Math.floor(Date.now() / 1000);
    if (deadline < now) throw new BadRequestException('Transaction deadline expired');
    if (deadline > now + 6 * 60) throw new BadRequestException('Deadline too far in future');
  }

  /**
   * Decodes `dto.data` as `placeBet(...)` calldata and verifies that:
   *  1. The encoded `amount` matches `dto.amount` (prevents amount-swap attacks).
   *  2. The oracle signature embedded in the calldata was produced by this oracle for
   *     exactly these parameters (user, market, outcome, amount, nonce, deadline).
   *
   * Issue #3: without this check a caller could obtain a valid oracle sig for 1 USDC
   * and relay calldata encoding an arbitrarily large amount.
   */
  private decodeAndVerifyCalldata(dto: SubmitRelayInput): { nonce: bigint } {
    let decoded: ethers.Result;
    try {
      decoded = PLACE_BET_IFACE.decodeFunctionData('placeBet', dto.data);
    } catch {
      throw new BadRequestException('Invalid calldata: unable to decode placeBet');
    }

    const [outcome, calldataAmount, nonce, deadline, sig] = decoded;

    // 1. Amount in calldata must match the amount used for balance validation.
    if (calldataAmount.toString() !== dto.amount) {
      throw new BadRequestException('Calldata amount does not match submitted amount');
    }

    // 2. Recover the signer from the embedded oracle signature and verify it matches
    //    the oracle key configured on this service.
    const domain = {
      name: 'ArenaMarket',
      version: '1',
      chainId: dto.chainId,
      verifyingContract: dto.target,
    };
    const betTypedDataValue = {
      market: dto.target,
      user: dto.userAddress,
      outcome: outcome as string,
      amount: calldataAmount as bigint,
      nonce: nonce as bigint,
      deadline: deadline as bigint,
    };

    let recoveredSigner: string;
    try {
      recoveredSigner = ethers.verifyTypedData(domain, BET_TYPES, betTypedDataValue, sig as string);
    } catch {
      throw new BadRequestException('Oracle signature in calldata is malformed');
    }

    if (recoveredSigner.toLowerCase() !== this.oracleWallet.address.toLowerCase()) {
      throw new BadRequestException('Oracle signature in calldata is invalid');
    }

    return { nonce: nonce as bigint };
  }

  private async validateBalance(user: string, spender: string, amount: string) {
    const usdcAddress = process.env.USDC_ADDRESS;
    if (!usdcAddress) throw new BadRequestException('USDC address not configured');
    const usdcTokenContract = new ethers.Contract(
      usdcAddress,
      [
        'function balanceOf(address) view returns (uint256)',
        'function allowance(address owner, address spender) view returns (uint256)',
      ],
      this.rpcProvider,
    );
    const balance = await usdcTokenContract.balanceOf(user);
    if (balance < BigInt(amount)) throw new BadRequestException('Insufficient USDC balance');
    const allowance = await usdcTokenContract.allowance(user, spender);
    if (allowance < BigInt(amount)) throw new BadRequestException('Insufficient USDC allowance — user must approve the market contract');
  }

  private async pollForCompletion(dbId: string, taskId: string) {
    if (this.shuttingDown) return;

    const safetyTimeout = setTimeout(() => {
      const timer = this.activeTimers.get(taskId);
      if (timer) {
        clearInterval(timer);
        this.activeTimers.delete(taskId);
        this.logger.warn(`Force cleared timer for ${taskId}`);
      }
    }, this.MAX_POLLING_DURATION);

    let attempts = 0;
    const timer = setInterval(async () => {
      if (this.shuttingDown) {
        this.clearTimer(taskId, safetyTimeout);
        return;
      }

      attempts += 1;
      try {
        const status = await this.gelato.getTaskStatus(taskId);
        if (!status) {
          // Gelato returned no status yet; time out after the 60-attempt ceiling.
          if (attempts > 60) {
            await this.prisma.relayedTransaction.update({
              where: { id: dbId },
              data: { status: 'FAILED', error: 'Polling timeout exceeded (no status from Gelato)' },
            });
            this.clearTimer(taskId, safetyTimeout);
          }
          return;
        }
        if (status.taskState === 'ExecSuccess') {
          await this.prisma.relayedTransaction.update({
            where: { id: dbId },
            data: { status: 'EXECUTED', txHash: status.transactionHash, executedAt: new Date() },
          });
          this.clearTimer(taskId, safetyTimeout);
        } else if (status.taskState === 'ExecReverted' || attempts > 60) {
          await this.prisma.relayedTransaction.update({
            where: { id: dbId },
            data: { status: 'FAILED', error: status.lastCheckMessage ?? 'Polling timeout exceeded' },
          });
          this.clearTimer(taskId, safetyTimeout);
        }
      } catch (error) {
        this.logger.error(`Polling error for ${taskId}`, error as any);
        if (attempts > 60) this.clearTimer(taskId, safetyTimeout);
      }
    }, 15000);

    this.activeTimers.set(taskId, timer);
  }

  private clearTimer(taskId: string, safetyTimeout: NodeJS.Timeout) {
    const timer = this.activeTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      this.activeTimers.delete(taskId);
    }
    clearTimeout(safetyTimeout);
  }
}
