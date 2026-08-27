# HƯỚNG DẪN TRIỂN KHAI — Bản v188 (Batch Key / Recipe Rules cho mọi công đoạn)

> Dành cho người không rành code. Làm đúng theo thứ tự dưới đây là chạy được.

---

## A. Nếu bạn ĐANG có hệ thống chạy trên Supabase + Vercel rồi

### Bước 1 — Cập nhật Database (quan trọng nhất)
1. Vào **Supabase** → **SQL Editor**.
2. Chạy lần lượt (mỗi file copy toàn bộ nội dung, dán vào, bấm **Run**):
   - `supabase/migrations/037_production_day_recipe_routing.sql` (file MỚI đã sửa 6 lỗi)
   - `supabase/migrations/038_batch_key_column.sql`
   - `supabase/migrations/039_open_job_column_values_all_columns.sql`
3. Nếu database đã chạy 037/038 trước rồi thì chỉ cần chạy thêm **039**.
4. Sau khi chạy 039: vào **Cấu hình → Open Job Column Values** → bấm **Scan / Rebuild** (hoặc import lại All Open Job) để thấy đủ 140+ cột.

### Bước 2 — Cập nhật code lên Vercel
1. Giải nén bản zip này thành project `st-planning` (thay thế code cũ).
2. Đẩy lên GitHub repository cũ của bạn (commit toàn bộ).
3. Vercel tự deploy lại (hoặc vào Vercel → project → **Deploy**).

### Bước 3 — Bật tính năng mới
1. Mở app → **Planning Board** → bấm nút **Rebuild Planning Chain** (một lần).
   - Hoặc đơn giản hơn: vào **Import Master** → import lại file **All Open Job** (hệ thống tự rebuild + tự quét cột).
2. Vào **Cấu hình → Open Job Column Values** → bấm **Scan / Rebuild**.
3. Vào **Cấu hình → Batch Key / Recipe Rules** → tạo các rule (hướng dẫn chi tiết ở phần C).

---

## B. Nếu cài mới hoàn toàn (chưa có gì)

1. Tạo project Supabase mới, tạo user đầu tiên (nếu dùng login), lấy các key.
2. Vào SQL Editor chạy LẦN LƯỢT: `001` → `002` → `003` → … → `038` (theo đúng thứ tự số, mỗi file chạy một lần).
3. Tạo repo GitHub, push toàn bộ project.
4. Import vào Vercel, khai báo 5 biến môi trường:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `SUPABASE_DB_URL` (dùng pooler URL :6543 như trong file `.env.example`)
   - `ADMIN_EMAILS`
   - (tùy chọn) `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT_MS`
5. Import file Master lần đầu, rồi import All Open Job, rồi làm theo Bước 3 ở trên.

---

## C. Cách dùng tính năng mới (hướng dẫn nghiệp vụ)

### 1. Open Job Column Values (Cấu hình → Open Job Column Values)
- Bấm **Scan / Rebuild** để hệ thống quét mọi cột trong All Open Job hiện tại và liệt kê giá trị unique.
- Lọc theo cột, tìm giá trị, sửa tên hiển thị, bật/tắt giá trị.
- Hệ thống TỰ quét lại sau mỗi lần import All Open Job — không cần nhớ bấm.

### 2. Batch Key / Recipe Rules (Cấu hình → Batch Key / Recipe Rules)
Mỗi rule = 1 công đoạn chính + các điều kiện đọc từ cột All Open Job:

| Trường | Ý nghĩa | Ví dụ |
|---|---|---|
| Rule Name | Tên dễ nhớ | "PRIMER sơn 20-T3-10" |
| Main Operation | Công đoạn đang plan | PRIMER |
| Match Mode | ALL = mọi điều kiện đúng; ANY = đúng ít nhất 1 | ALL |
| Priority | Số nhỏ chạy trước | 10 |
| Suggested Recipe | Recipe hệ thống đề xuất khi rule khớp | chọn từ danh sách |
| Batch Key Template | Khóa gom lô; dùng `{TEN_COT}` để lấy giá trị thật của Job | `PAINT\|PRIMER\|{PRIMER1}` |
| Batch No Prefix | 3 ký tự sinh số lô (ưu tiên hơn Operation Master) | PRI |
| Conditions | Cột + toán tử (bằng/chứa/không rỗng/bắt đầu bằng/kết thúc bằng) + giá trị | PRIMER1 · không rỗng |

**Cách làm nhanh:** chọn cột → danh sách giá trị hiện ra để chọn (không gõ tay). Mỗi rule phải có ít nhất 1 điều kiện.

### 3. Planning Board — tự đề xuất Recipe + Batch Key
- Chọn Job (bấm READY / tick checkbox) → ô **Batch Builder** bên phải hiện ngay:
  - `✓ Rule khớp: …` kèm Recipe + Batch Key + Prefix đề xuất.
  - Hoặc `✕ Chưa có rule khớp` → bạn chọn Recipe tay ở bộ lọc phía trên, hoặc bấm link **tạo rule** (mở sẵn đúng công đoạn).
- Bấm **Create New Batch** → hệ thống:
  - Tự dùng Recipe + Batch Key + Prefix của rule (nếu khớp và thống nhất giữa các Job);
  - **Chặn** nếu các Job thuộc Batch Key khác nhau (không gom sai);
  - **Báo lỗi** nếu nhiều rule cùng ưu tiên khớp (bạn chọn tay, không tự chọn bừa);
  - Vẫn cho tạo Batch không Recipe khi chưa cấu hình rule (như cũ).
- Số lô vẫn theo luật `XXX_DDMMM_NNN`; nếu rule có Prefix hợp lệ thì dùng Prefix của rule.

### 4. Process Time + Recipe cho mọi công đoạn (Cấu hình → Process Recipe)
- **Process Time**: không còn giới hạn Chemical/Paint. Chọn kiểu `FIXED_HOURS` (giờ cố định) hoặc `QTY_SURFACE` (theo khoảng Qty + Surface) cho bất kỳ recipe nào.
- **Main Operation · Operation Code → Recipe**: gán nhiều recipe cho mọi operation code, kèm Standard Operation tùy chọn, priority, default.

### 5. Chemical Line — tự chọn Flybar
- Ở lưới điều độ vùng Chemical (FB), **chỉ cần nhập Date + Loading Start + Duration** → hệ thống TỰ đề xuất FB trống sớm nhất (khoảng nửa giây), không cần bấm nút từng dòng. Vẫn có nút **Suggest FB** để bấm lại khi muốn.
- Thứ tự cột hiển thị: Loading → Process → NDT → Unloading (NDT chỉ với recipe preclean 001/009/016/025, 5 giờ, cách nhau ≥1h30).

### 6. Timeline mở rộng qua 06:00
- Nếu Batch/NDT/Unloading kéo dài sang hôm sau, Timeline của ngày hôm đó **tự kéo dài** (tối đa 48h) để thấy FB/CAB còn bận khi plan ngày tiếp theo.

---

## D. Lưu ý bảo mật

- File **`vv.txt`** (chứa key kết nối) đã được LOẠI khỏi bản đóng gói. Không đưa key lên GitHub.
- Nếu trước đây bạn từng đẩy `vv.txt` hoặc `.env.local` lên GitHub → vào Supabase **đổi service_role key và mật khẩu database ngay**, rồi xóa file đó khỏi repo.

---

## E. Nếu gặp lỗi

| Lỗi | Nguyên nhân & cách xử lý |
|---|---|
| Trang Planning báo "relation md_main_operation_recipe does not exist" | Chưa chạy migration 037. Chạy 036 → 037 → 038 rồi reload. |
| Bấm Create Batch báo "Chưa có rule khớp" | Đúng thiết kế: chọn Recipe tay hoặc tạo rule. |
| Báo "Job thuộc Batch Key khác nhau" | Đúng thiết kế: chọn Job cùng nhóm hoặc chọn Recipe tay. |
| Báo "nhiều rule cùng ưu tiên khớp" | Đúng thiết kế: vào Cấu hình chỉnh Priority rule, hoặc chọn Recipe tay. |
| Màn hình Open Job Column Values trống | Bấm **Scan / Rebuild** hoặc import lại All Open Job. |
