-- The club's crest, for the documents FQ sends them. See the Club model.
--
-- ADD COLUMN rather than the table rebuild Prisma generates: ClubAssessment,
-- ClubMembership and ClubAmbassador all carry a foreign key to Club, and
-- dropping and recreating it to add one nullable reference buys nothing.
ALTER TABLE "Club" ADD COLUMN "logoId" TEXT REFERENCES "Upload" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One crest per club, and one club per upload: the relation is one-to-one, the
-- same shape as a coach's photo.
CREATE UNIQUE INDEX "Club_logoId_key" ON "Club"("logoId");
