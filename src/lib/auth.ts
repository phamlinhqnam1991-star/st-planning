import { createClient } from "@/lib/supabase/server";
export async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("UNAUTHENTICATED");
  const admins=(process.env.ADMIN_EMAILS || "").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  if (admins.length && !admins.includes((user.email || "").toLowerCase())) throw new Error("FORBIDDEN");
  return user;
}
