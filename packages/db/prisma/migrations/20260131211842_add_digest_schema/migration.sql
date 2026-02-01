-- AlterTable
ALTER TABLE "Clip" ADD COLUMN     "digestId" TEXT;

-- AlterTable
ALTER TABLE "Digest" ADD COLUMN     "episodeIds" TEXT[],
ADD COLUMN     "podcastId" TEXT;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "Digest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
