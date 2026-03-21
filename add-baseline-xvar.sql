-- Add x_var to support RCN vs CK Baseline calculation
ALTER TABLE public.iso50001_baseline_model ADD COLUMN IF NOT EXISTS x_var varchar(10) DEFAULT 'rcn';
