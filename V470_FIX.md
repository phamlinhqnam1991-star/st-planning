# V470 — Logic Guide Refresh + New User Training

## Phạm vi
Chỉ cập nhật tài liệu trong app và điều hướng. Không thay đổi database schema, Planning Chain, Recipe resolver, Batch, Scheduling, Production Execution hay các API nghiệp vụ.

## 1. Logic & Hướng dẫn
- Đổi tài liệu runtime lên V470.
- Bổ sung đầy đủ logic V465–V469:
  - Production Add Job trực tiếp, không approve ở Điều chỉnh đầu ngày.
  - V466 bigint/text fix được phản ánh trong mô tả kỹ thuật.
  - V467 Next Main Attention theo route thật, không hard-code BSA → PRIMER.
  - V468 Production Change Alerts read-only.
  - V469 Batch Job membership load từ `planning_batch_job`, Job Production-added không mất sau reload/tab change.
  - Carry Over 06:00–05:59, Cross-Main Dependency và Resource Cascade.
  - Phân biệt Sequential READY (Batch là handoff Planning) với schedule feasibility (Start Main sau phải tôn trọng Effective End Main trước khi điều độ/điều chỉnh).
- Sửa lại thứ tự section cuối: 16 Điều chỉnh đầu ngày, 17 Cảnh báo thay đổi SX, 18 FAQ.

## 2. Training người mới
Route mới: `/training`.

Mục tiêu: nếu có nhân sự mới, họ không cần đọc toàn bộ cấu hình trước. Training bắt đầu bằng một Job thật và theo hết vòng đời Job.

Nội dung:
1. Cách trainer hướng dẫn.
2. 6 nguyên tắc bắt buộc.
3. Lộ trình 6 module.
4. Bài thực hành bắt buộc.
5. Tình huống sai/lệch.
6. Checklist đạt trước khi thao tác độc lập.
7. Quiz tự kiểm tra.

## 3. Navigation
Thêm `Training người mới` vào module `Quản trị`, cạnh `Logic & Hướng dẫn`.

## Database
Không có migration SQL mới.
