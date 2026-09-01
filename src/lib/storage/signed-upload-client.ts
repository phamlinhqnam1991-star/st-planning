export async function uploadFileToSignedUrl(signedUrl: string, file: File) {
  const url = String(signedUrl || "").trim();
  if (!url) throw new Error("Signed Upload URL không hợp lệ.");

  const body = new FormData();
  // Match Supabase Storage's signed-upload multipart format, but deliberately
  // do not attach the app's Authorization/apikey headers. The signed URL token
  // itself authorizes this one upload.
  body.append("cacheControl", "3600");
  body.append("", file);

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "x-upsert": "false",
    },
    body,
  });

  if (response.ok) return;

  let message = `Storage upload failed (${response.status})`;
  try {
    const payload = await response.json() as Record<string, unknown>;
    message = String(payload.message || payload.error || payload.error_description || message);
  } catch {
    try {
      const text = await response.text();
      if (text.trim()) message = text.trim();
    } catch {
      // Keep the HTTP fallback message.
    }
  }

  throw new Error(message);
}
