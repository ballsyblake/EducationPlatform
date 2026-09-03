-- CreateTable
CREATE TABLE "_PoolRefreshedCriteria" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_PoolRefreshedCriteria_A_fkey" FOREIGN KEY ("A") REFERENCES "Criterion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_PoolRefreshedCriteria_B_fkey" FOREIGN KEY ("B") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_PoolRefreshedCriteria_AB_unique" ON "_PoolRefreshedCriteria"("A", "B");

-- CreateIndex
CREATE INDEX "_PoolRefreshedCriteria_B_index" ON "_PoolRefreshedCriteria"("B");
