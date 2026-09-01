# v357 - Fix Invalid Compact JWS khi Import Storage

## Lỗi
Sau v356, Update All Open Job / Import Master có thể báo `Invalid Compact JWS` ở bước upload file.

## Nguyên nhân
Signed Upload URL được tạo đúng ở server, nhưng client lại gọi `supabase.storage.uploadToSignedUrl()` bằng browser Supabase client. Browser client mang các header auth của app (`Authorization` / `apikey`). Với publishable key kiểu mới, Storage có thể cố parse Authorization header như JWS và từ chối request trước khi dùng signed token trong URL.

## Sửa
- Server vẫn tự bảo đảm bucket `master-imports` tồn tại.
- Server trả `signedUrl` đầy đủ từ `createSignedUploadUrl()`.
- Browser upload trực tiếp bằng `fetch(..., { method: "PUT" })` vào `signedUrl`.
- Không gửi Authorization hoặc apikey của app trong signed upload request.
- Multipart upload gửi `cacheControl=3600` rõ ràng.
- Dùng chung helper `src/lib/storage/signed-upload-client.ts` cho All Open Job và Master Import.
- Không thay đổi logic xử lý Excel sau upload.

## Migration
Không cần migration SQL mới.
