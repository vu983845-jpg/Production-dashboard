-- Fix: Close all stuck-open downtime events in Supabase
-- Events that are still is_ongoing=true but should have been closed
-- Run this in Supabase SQL Editor

-- Step 1: Preview what will be updated
SELECT 
    id,
    work_date,
    department_id,
    root_cause,
    start_time,
    end_time,
    duration_mins,
    is_ongoing,
    CASE
        WHEN end_time IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 60
        WHEN duration_mins > 0
            THEN duration_mins
        ELSE NULL
    END AS calculated_mins
FROM downtime_events
WHERE is_ongoing = true
ORDER BY work_date, start_time;

-- Step 2: Apply the fix (uncomment to run)
-- Case A: events WITH end_time → calculate duration from start→end
-- Case B: events WITHOUT end_time but WITH duration_mins → keep stored duration, just mark closed
-- Case C: events with NEITHER → skip (don't touch, too risky)

/*
UPDATE downtime_events
SET
    is_ongoing = false,
    status = 'Closed',
    duration_mins = CASE
        WHEN end_time IS NOT NULL 
            THEN GREATEST(1, ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 60))
        WHEN duration_mins > 0
            THEN duration_mins
        ELSE 0
    END
WHERE is_ongoing = true
  AND (end_time IS NOT NULL OR duration_mins > 0);
*/

-- Step 3: After running Step 2, verify no more ongoing events remain
-- SELECT COUNT(*) FROM downtime_events WHERE is_ongoing = true;
