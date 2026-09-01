# v356 — Self-healing Import Storage

## Lỗi đã sửa
`Update All Open Job` có thể báo `Bucket not found` khi Supabase Storage chưa có bucket private `master-imports`.

## Logic mới
- Tên bucket được gom về `IMPORT_STORAGE_BUCKET` trong `src/lib/storage/import-storage.ts`.
- Server kiểm tra bucket trước khi upload/download và tự tạo private bucket nếu chưa tồn tại.
- Browser không upload trực tiếp bằng publishable key nữa.
- Server tạo Signed Upload URL, browser dùng `uploadToSignedUrl` để đưa file `.xlsx` lên private bucket.
- Áp dụng cho cả All Open Job Import và Master Import.
- API import vẫn download bằng server secret key như trước.

Không cần migration SQL mới.
