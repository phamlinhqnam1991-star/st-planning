import type { SupabaseClient } from "@supabase/supabase-js";

export const IMPORT_STORAGE_BUCKET = "master-imports";

export async function ensureImportStorageBucket(admin: SupabaseClient) {
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) throw listError;

  if (buckets?.some((bucket) => bucket.id === IMPORT_STORAGE_BUCKET)) return;

  const { error: createError } = await admin.storage.createBucket(IMPORT_STORAGE_BUCKET, {
    public: false,
  });

  // Another concurrent request may have created it after listBuckets().
  if (createError) {
    const message = String(createError.message || createError).toLowerCase();
    if (!message.includes("already") && !message.includes("exist") && !message.includes("duplicate")) {
      throw createError;
    }
  }
}
