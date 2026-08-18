-- DropForeignKey
ALTER TABLE "deal" DROP CONSTRAINT "deal_companyId_fkey";

-- AlterTable
ALTER TABLE "deal" ALTER COLUMN "companyId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
