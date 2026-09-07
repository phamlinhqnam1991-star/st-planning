# V534 — Operation Inbox classification + Intermediate onboarding

## Phạm vi sửa
Chỉ gộp 2 logic đã chốt trên nền V533.

### 1. Operation Inbox không báo sai Inactive
- Loại `FINSST` và `CFINM-VN` khỏi New / Unconfigured Operations vì đây là Final-Out marker của ST Output.
- Operation đã có active Intermediate Bridge được coi là Intermediate đã nhận diện; không hiện `Inactive ST config` chỉ vì legacy `md_st_operation_scope.is_active=false`.
- Active `PLANNING_OPERATION` thiếu Source → Main Mapping vẫn giữ `PARTIAL_CONFIG` để người dùng xử lý.
- NEW / INACTIVE / NOT_ST còn lại giữ nguyên logic.

### 2. Cho phép chọn INTERMEDIATE trực tiếp trong Inbox
- Không còn disable `INTERMEDIATE` khi chưa có Bridge.
- Nếu Operation chưa có active Bridge, UI bắt buộc chọn `Intermediate Segment / Bridge`.
- Khi Add to ST Operation:
  - lấy sequence của Segment đã chọn,
  - tạo/activate một `MANUAL` Bridge mới dựa trên sequence đó,
  - append Operation mới ở cuối Intermediate sequence, ngay trước Next Main,
  - bật `md_st_operation_scope.operation_type = INTERMEDIATE`.
- Không tạo Source → Main Mapping, Main Planning, Batch hay Schedule.
- Nếu Operation đã có active Bridge thì chỉ bật ST Scope = INTERMEDIATE như trước.

## Không thay đổi
- ST Output / ST Final Steps.
- Planning Operation mapping logic.
- Batch / Scheduling.
- ST_SCOPE_ONLY / PLANNING_OPERATION onboarding.
