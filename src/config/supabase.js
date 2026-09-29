import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// service_role key ใช้ได้เฉพาะฝั่งเซิร์ฟเวอร์เท่านั้น
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });