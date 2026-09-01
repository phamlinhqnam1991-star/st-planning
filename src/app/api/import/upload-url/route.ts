import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureImportStorageBucket, IMPORT_STORAGE_BUCKET } from "@/lib/storage/import-storage";

export const runtime = "nodejs";

function normalizePath(value: unknown) {
  const storagePath = String(value ?? "").trim().replace(/^\/+/, "");
  if (!storagePath || storagePath.includes("..") || storagePath.includes("\\")) return "";
  return storagePath;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const storagePath = normalizePath(body?.path);
    const fileName = String(body?.fileName ?? "").trim();

    if (!storagePath || !fileName.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "Chỉ chấp nhận file .xlsx hợp lệ." }, { status: 400 });
    }

    if (!storagePath.startsWith("open-jobs/") && !storagePath.startsWith("master/")) {
      return NextResponse.json({ error: "Đường dẫn upload không hợp lệ." }, { status: 400 });
    }

    const admin = createAdminClient();
    await ensureImportStorageBucket(admin);

    const { data, error } = await admin.storage
      .from(IMPORT_STORAGE_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.token || !data?.signedUrl) {
      throw error || new Error("Không tạo được Signed Upload URL cho file import.");
    }

    return NextResponse.json({
      bucket: IMPORT_STORAGE_BUCKET,
      path: storagePath,
      signedUrl: data.signedUrl,
      // Keep token for backward compatibility with any older client still open.
      token: data.token,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
