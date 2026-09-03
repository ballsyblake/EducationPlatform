-- Whether a pool's retained-evidence domains were carried over from last season
-- rather than assessed fresh this one. See the Pool model for why it is per
-- pool rather than per cycle.
--
-- Written as an ADD COLUMN rather than the table rebuild Prisma generates for
-- this: two tables carry a foreign key to Pool, and dropping and recreating it
-- to add one boolean with a constant default buys nothing and risks more.
ALTER TABLE "Pool" ADD COLUMN "retainedEvidence" BOOLEAN NOT NULL DEFAULT false;
