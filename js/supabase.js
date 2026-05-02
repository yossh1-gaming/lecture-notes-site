
// supabase.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://lhluebakxcqbyejzsgmu.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxobHVlYmFreGNxYnllanpzZ211Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MDA1MzgsImV4cCI6MjA5MzI3NjUzOH0.MxpXaqjdLT5RgP2sXx1rel0OFI87zAqAjHL6dOgJDvE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function isAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (error) return false;
  return !!data?.is_admin;
}
