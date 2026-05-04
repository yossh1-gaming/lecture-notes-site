
// supabase.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://lhluebakxcqbyejzsgmu.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_w1x6L94Vi7uhut6xOghYnw_JTfk53rR";

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
