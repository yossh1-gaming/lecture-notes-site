// supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm"

export const supabase = createClient(
  "https://camhjokfxzzelqlirxir.supabase.co", // あなたの Supabase URL に置き換えてください
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbWhqb2tmeHp6ZWxxbGlyeGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4Mjc1MTYsImV4cCI6MjA2NDQwMzUxNn0.WpJ2AWmbgCWHKwxrP9EmqEO4CGT65OjQsW2YSJcVCwM"              // あなたの anon 公開キーに置き換えてください
)
