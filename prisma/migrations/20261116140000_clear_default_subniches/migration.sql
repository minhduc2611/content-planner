-- Clear the old pre-filled niche/sub-niches, but only where the user never changed them
UPDATE "Plan" SET "niche" = '', "subs" = ''
WHERE "niche" = 'Building on socials'
  AND "subs" = E'Product business optimisation\nProduct development with domain knowledge\nProduct optimisation\nMindset\nLife automation for productivity';
