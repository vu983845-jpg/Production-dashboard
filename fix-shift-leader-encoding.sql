-- ============================================================
-- FIX: Cleanup corrupted shift_leader names in shelling_line_daily
-- Only 3 valid leaders: Mr. Trí / Mrs. Tâm / Ms. Linh
-- Run this once in Supabase SQL Editor
-- ============================================================

-- Step 0: Preview what will be changed
SELECT shift_leader, COUNT(*) as records
FROM shelling_line_daily
WHERE shift_leader IS NOT NULL
  AND shift_leader NOT IN ('Mr. Trí', 'Mrs. Tâm', 'Ms. Linh')
GROUP BY shift_leader
ORDER BY records DESC;

-- ── Step 1: Fix Ms. Linh (easiest — "linh" is unique) ──────────────────────
UPDATE shelling_line_daily
SET shift_leader = 'Ms. Linh'
WHERE shift_leader IS NOT NULL
  AND shift_leader NOT IN ('Mr. Trí', 'Mrs. Tâm', 'Ms. Linh')
  AND (
    LOWER(shift_leader) LIKE '%linh%'
  );

-- ── Step 2: Fix Mrs. Tâm (check "tam" variations) ──────────────────────────
UPDATE shelling_line_daily
SET shift_leader = 'Mrs. Tâm'
WHERE shift_leader IS NOT NULL
  AND shift_leader NOT IN ('Mr. Trí', 'Mrs. Tâm', 'Ms. Linh')
  AND (
    LOWER(shift_leader) LIKE '%tâm%'
    OR LOWER(shift_leader) LIKE '%tam%'
    OR shift_leader LIKE '%TÃ¢m%'   -- mojibake of Tâm
    OR shift_leader LIKE '%Tâm%'
  );

-- ── Step 3: Fix Mr. Trí (everything remaining) ─────────────────────────────
-- At this point all that's left should be corrupted "Trí" variants
UPDATE shelling_line_daily
SET shift_leader = 'Mr. Trí'
WHERE shift_leader IS NOT NULL
  AND shift_leader NOT IN ('Mr. Trí', 'Mrs. Tâm', 'Ms. Linh');

-- ── Step 4: Verify — should only show 3 names ──────────────────────────────
SELECT shift_leader, COUNT(*) as records
FROM shelling_line_daily
WHERE shift_leader IS NOT NULL
GROUP BY shift_leader
ORDER BY records DESC;
