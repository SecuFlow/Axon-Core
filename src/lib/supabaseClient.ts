import { createClient } from "@supabase/supabase-js";

// In manchen Setups sind Werte versehentlich mit Whitespace versehen.
// Damit der Client nicht "falsch" als nicht konfiguriert betrachtet wird,
// entfernen wir URL und ANON_KEY Whitespace (auch NBSP/CRLF-Varianten).
const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
