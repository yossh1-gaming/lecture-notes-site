
// supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://camhjokfxzzelqlirxir.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbWhqb2tmeHp6ZWxxbGlyeGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4Mjc1MTYsImV4cCI6MjA2NDQwMzUxNn0.WpJ2AWmbgCWHKwxrP9EmqEO4CGT65OjQsW2YSJcVCwM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);