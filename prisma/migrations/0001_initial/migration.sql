CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "walletAddress" TEXT UNIQUE,
  "email" TEXT UNIQUE,
  "displayName" TEXT,
  "kycStatus" TEXT NOT NULL DEFAULT 'NONE',
  "kycLevel" TEXT NOT NULL DEFAULT 'NONE',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Creator" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "tier" TEXT NOT NULL DEFAULT 'applicant',
  "reputationScore" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "feeShareBps" INTEGER NOT NULL DEFAULT 100,
  "bondLocked" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Repository" (
  "id" TEXT PRIMARY KEY,
  "providerRepoId" TEXT UNIQUE NOT NULL,
  "repoType" TEXT NOT NULL,
  "ownerHandle" TEXT NOT NULL,
  "repoName" TEXT NOT NULL,
  "verifiedCreatorId" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Market" (
  "id" TEXT PRIMARY KEY,
  "contractAddress" TEXT UNIQUE NOT NULL,
  "status" TEXT NOT NULL,
  "creatorId" TEXT,
  "repositoryId" TEXT,
  "title" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "sourcePrimary" TEXT NOT NULL,
  "sourceFallback" TEXT,
  "closeTime" TIMESTAMP NOT NULL,
  "resolveTime" TIMESTAMP NOT NULL,
  "challengeWindow" INTEGER NOT NULL DEFAULT 86400,
  "totalPool" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "MarketOutcome" (
  "id" TEXT PRIMARY KEY,
  "marketId" TEXT NOT NULL,
  "outcomeKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "poolAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "odds" DECIMAL(30,18),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("marketId", "outcomeKey")
);

CREATE TABLE "Bet" (
  "id" TEXT PRIMARY KEY,
  "marketId" TEXT NOT NULL,
  "outcomeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" DECIMAL(20,6) NOT NULL,
  "oddsAtBet" DECIMAL(30,18),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Position" (
  "id" TEXT PRIMARY KEY,
  "marketId" TEXT NOT NULL,
  "outcomeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stakeAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "claimableAmount" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("marketId", "outcomeId", "userId")
);

CREATE TABLE "RelayedTransaction" (
  "id" TEXT PRIMARY KEY,
  "idempotencyKey" TEXT UNIQUE NOT NULL,
  "userAddress" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "amount" TEXT NOT NULL,
  "marketId" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "gelatoTaskId" TEXT UNIQUE NOT NULL,
  "txHash" TEXT,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "executedAt" TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RelayedTransaction_userAddress_idx" ON "RelayedTransaction"("userAddress");
CREATE INDEX "RelayedTransaction_gelatoTaskId_idx" ON "RelayedTransaction"("gelatoTaskId");

CREATE TABLE "SanctionCheck" (
  "id" TEXT PRIMARY KEY,
  "address" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "checkedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SanctionCheck_address_checkedAt_idx" ON "SanctionCheck"("address", "checkedAt");

CREATE TABLE "RepoSnapshot" (
  "id" TEXT PRIMARY KEY,
  "repositoryId" TEXT NOT NULL,
  "capturedAt" TIMESTAMP NOT NULL,
  "metrics" JSONB NOT NULL,
  "snapshotHash" TEXT UNIQUE NOT NULL,
  "signature" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Market" ADD CONSTRAINT "Market_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Market" ADD CONSTRAINT "Market_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketOutcome" ADD CONSTRAINT "MarketOutcome_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "MarketOutcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Position" ADD CONSTRAINT "Position_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Position" ADD CONSTRAINT "Position_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "MarketOutcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
