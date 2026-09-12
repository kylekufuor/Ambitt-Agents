BEGIN;
-- CreateTable
CREATE TABLE IF NOT EXISTS "PlaybookRule" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sourceKind" TEXT NOT NULL DEFAULT 'onboarding',
    "sourceRef" TEXT,
    "sourceQuote" TEXT,
    "sourceAt" TIMESTAMP(3),
    "predicate" JSONB,
    "impactNote" TEXT,
    "impactData" JSONB,
    "proposedReason" TEXT,
    "proposedKey" TEXT,
    "supersedesId" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkspaceTool" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "appSlug" TEXT,
    "logoUrl" TEXT,
    "contextId" TEXT,
    "contentEncrypted" TEXT,
    "filename" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkspaceSession" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "providerId" TEXT,
    "connectionEncrypted" TEXT,
    "viewEncrypted" TEXT,
    "status" TEXT NOT NULL DEFAULT 'starting',
    "currentUrl" TEXT,
    "consentOrigin" TEXT,
    "consentAt" TIMESTAMP(3),
    "watching" BOOLEAN NOT NULL DEFAULT false,
    "watchedMs" INTEGER NOT NULL DEFAULT 0,
    "ownerTabId" TEXT NOT NULL,
    "heartbeatSeq" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkspaceObservation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "watchedMs" INTEGER NOT NULL,
    "contentEncrypted" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WorkspaceTurn" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "requestId" TEXT NOT NULL,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "response" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlaybookRule_agentId_status_group_idx" ON "PlaybookRule"("agentId", "status", "group");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlaybookRule_agentId_sortOrder_idx" ON "PlaybookRule"("agentId", "sortOrder");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlaybookRule_clientId_idx" ON "PlaybookRule"("clientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlaybookRule_agentId_proposedKey_idx" ON "PlaybookRule"("agentId", "proposedKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkspaceTool_agentId_createdAt_idx" ON "WorkspaceTool"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceTool_clientId_appSlug_key" ON "WorkspaceTool"("clientId", "appSlug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceTool_clientId_url_key" ON "WorkspaceTool"("clientId", "url");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkspaceSession_agentId_status_idx" ON "WorkspaceSession"("agentId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkspaceObservation_sessionId_startedAt_idx" ON "WorkspaceObservation"("sessionId", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkspaceObservation_expiresAt_idx" ON "WorkspaceObservation"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkspaceTurn_agentId_createdAt_idx" ON "WorkspaceTurn"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceTurn_clientId_requestId_key" ON "WorkspaceTurn"("clientId", "requestId");

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "PlaybookRule" ADD CONSTRAINT "PlaybookRule_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "PlaybookRule" ADD CONSTRAINT "PlaybookRule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "WorkspaceTool" ADD CONSTRAINT "WorkspaceTool_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "WorkspaceTool" ADD CONSTRAINT "WorkspaceTool_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "WorkspaceTool"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "WorkspaceObservation" ADD CONSTRAINT "WorkspaceObservation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkspaceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "WorkspaceTurn" ADD CONSTRAINT "WorkspaceTurn_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "WorkspaceTurn" ADD CONSTRAINT "WorkspaceTurn_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "WorkspaceTurn" ADD CONSTRAINT "WorkspaceTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkspaceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "WorkspaceTool" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "WorkspaceTurn" ADD COLUMN IF NOT EXISTS "automatic" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceSession_one_active_client" ON "WorkspaceSession"("clientId") WHERE "status" IN ('starting', 'running');
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceTurn_one_pending_agent" ON "WorkspaceTurn"("agentId") WHERE "status" = 'pending';
ALTER TABLE "WorkspaceTurn" ADD COLUMN IF NOT EXISTS "heartbeatAt" TIMESTAMP(3);
COMMIT;
