# Configuration ERP Work Center V1

## Mục tiêu

Thiết kế lại tab **Cấu hình** theo kiến trúc ERP Work Center nhưng giữ nguyên business logic, API và database hiện tại.

## Kiến trúc điều hướng

Configuration được chia theo domain nghiệp vụ:

1. **Operation Architecture**
   - ST Operation Flow
   - ST Scope & Operation Code
   - Source → Main Mapping
   - Main Operation
2. **Organization & Resource**
   - ST Group
   - Physical Area
   - Schedule Area
   - Planner Assignment
3. **Recipe & Batch**
   - Recipe & Batch Rules
   - Open Job Column Values
4. **Time & Scheduling**
   - Loading / Unloading Time
   - Process Time
5. **Automation**
   - Auto Planning Rules

`/settings` là **Configuration Health Dashboard**.

## Health Dashboard

Dashboard chỉ đọc dữ liệu health hiện có và hiển thị:

- Configuration readiness
- Planning Chain readiness
- Main Mapping coverage
- Recipe Rule coverage
- Open Job configuration issues
- Dependency Architecture từ ST Scope → Planner
- Batch & Time controls
- Danh sách issue có link đi thẳng tới workspace cần sửa

Không thêm rule nghiệp vụ mới.

## Workspace chuẩn

Mỗi trang cấu hình tiếp tục dùng manager/API hiện tại nhưng đặt trong presentation chuẩn:

- Configuration breadcrumb
- Object header
- Mục đích
- Ảnh hưởng phía sau
- Previous / Next theo dependency
- Editor / Form
- ERP Data Grid
- Sticky Action hiện có

## Không thay đổi

- Planning Chain logic
- READY / WAIT / Batch logic
- Recipe resolver
- Batch Compatibility
- Scheduling engine
- Database schema
- Board Điều Độ layout

Bảng Điều Độ đã được giữ nguyên theo yêu cầu người dùng.
