# V529 — Configuration Operation Inbox

## Scope
Chỉ bổ sung luồng review Operation mới/chưa cấu hình trong tab Configuration. Không thay đổi logic ST Output V527/V528, Candidate, Batch, Planning Chain hay Scheduling.

## New / Unconfigured Operations
- Trang mới: `Configuration → New / Unconfigured Operations`.
- Quét unique Operation Code từ `open_job_current.NextOperation` và `AllOperation` của toàn bộ Open Job.
- Hiển thị: Operation Code/Name, NextOperation Jobs, Total Jobs, Parts, Programs, Found In, trạng thái, Bridge và gợi ý Main/ST Group.
- Filter: Need review, NextOperation only, New, Inactive, Partial config, Ignored, All.

## Review actions
Người dùng quyết định thủ công:
- `ST_SCOPE_ONLY`: thêm ST Scope, không tạo Main Planning.
- `PLANNING_OPERATION`: bắt buộc Main Operation → ST Group → Physical Area → Schedule Area → Planner; dùng API ST Operation Flow hiện hành.
- `INTERMEDIATE`: chỉ cho Operation có active Intermediate Bridge; chỉ tạo Dashboard ST membership theo logic hiện hành.
- `NOT_ST`: lưu quyết định review riêng; không sửa All Open Job/Planning Chain/Batch/Schedule.

## Health Dashboard
- Issue cũ dạng “Job chưa đủ cấu hình ST” được thay bằng issue có thể xử lý trực tiếp: `Jobs affected · Operations chưa review ST`.
- Bấm issue mở Operation Inbox.
- `NOT_ST` được loại khỏi cảnh báo ở các lần import sau.

## Schema
- Migration `089_operation_review_inbox.sql` tạo `md_operation_review` để lưu quyết định `NOT_ST`.
- API review có fallback `create table if not exists` khi dùng Not ST lần đầu; migration vẫn là cách triển khai chuẩn.

## Compatibility
- Khi Operation được Add vào ST, review `NOT_ST` cũ được xóa tự động.
- Không đổi logic ST Output / ST Final Steps đã chốt ở V527 và ERP UI V528.
