-- CreateEnum
CREATE TYPE "MessagingChannel" AS ENUM ('ZALO');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'STICKER', 'OTHER');

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'MESSAGE';

-- AlterTable
ALTER TABLE "activity" ADD COLUMN     "messageThreadId" TEXT;

-- CreateTable
CREATE TABLE "messagingAccount" (
    "id" TEXT NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "externalId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "tokenRefreshedAt" TIMESTAMP(3),
    "tokenError" TEXT,
    "connectedById" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "lastWebhookAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messagingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactChannelIdentity" (
    "id" TEXT NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "contactId" TEXT,
    "followedAt" TIMESTAMP(3),
    "unfollowedAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contactChannelIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messageThread" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "contactId" TEXT,
    "companyId" TEXT,
    "firstMessageAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messageThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "attachments" JSONB,
    "externalId" TEXT,
    "clientRequestId" TEXT,
    "sentById" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messageReceipt" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messageReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messagingAccount_channel_externalId_key" ON "messagingAccount"("channel", "externalId");

-- CreateIndex
CREATE INDEX "contactChannelIdentity_contactId_idx" ON "contactChannelIdentity"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "contactChannelIdentity_channel_accountId_externalId_key" ON "contactChannelIdentity"("channel", "accountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "messageThread_identityId_key" ON "messageThread"("identityId");

-- CreateIndex
CREATE INDEX "messageThread_contactId_lastMessageAt_idx" ON "messageThread"("contactId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "messageThread_lastMessageAt_idx" ON "messageThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "message_externalId_idx" ON "message"("externalId");

-- CreateIndex
CREATE INDEX "message_threadId_queuedAt_idx" ON "message"("threadId", "queuedAt");

-- CreateIndex
CREATE INDEX "message_status_idx" ON "message"("status");

-- CreateIndex
CREATE UNIQUE INDEX "message_threadId_externalId_key" ON "message"("threadId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "message_threadId_clientRequestId_key" ON "message"("threadId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "messageReceipt_accountId_externalId_kind_key" ON "messageReceipt"("accountId", "externalId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "activity_messageThreadId_key" ON "activity"("messageThreadId");

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_messageThreadId_fkey" FOREIGN KEY ("messageThreadId") REFERENCES "messageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messagingAccount" ADD CONSTRAINT "messagingAccount_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactChannelIdentity" ADD CONSTRAINT "contactChannelIdentity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "messagingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactChannelIdentity" ADD CONSTRAINT "contactChannelIdentity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messageThread" ADD CONSTRAINT "messageThread_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "messagingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messageThread" ADD CONSTRAINT "messageThread_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "contactChannelIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messageThread" ADD CONSTRAINT "messageThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messageThread" ADD CONSTRAINT "messageThread_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "messageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messageReceipt" ADD CONSTRAINT "messageReceipt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "messagingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

