SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'daily_energy'
ORDER BY ordinal_position;
