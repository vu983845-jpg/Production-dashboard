import { createClient } from '@supabase/supabase-js';

const ddsSupabaseUrl = 'https://qktvbvyznxpugsxoxarx.supabase.co';
const ddsSupabaseAnonKey = 'sb_publishable_agrIIWuEfWaheajFAK2cKQ_NQgIiZsC';

export const ddsClient = createClient(ddsSupabaseUrl, ddsSupabaseAnonKey);
