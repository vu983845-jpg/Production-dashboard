ALTER TABLE public.shelling_line_daily ADD COLUMN IF NOT EXISTS broken_pct numeric NOT NULL DEFAULT 0;
NOTIFY pgrst, 'reload schema';
