
// supabase.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://camhjokfxzzelqlirxir.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbWhqb2tmeHp6ZWxxbGlyeGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4Mjc1MTYsImV4cCI6MjA2NDQwMzUxNn0.WpJ2AWmbgCWHKwxrP9EmqEO4CGT65OjQsW2YSJcVCwM";

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
