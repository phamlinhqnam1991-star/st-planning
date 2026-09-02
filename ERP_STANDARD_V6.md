# ST Planning · ERP Standard V6

V6 là nguồn chuẩn presentation/navigation hiện tại của ST Planning. Vòng này **không thay business logic, API contract, database schema, Planning/Batch/Schedule engine**.

## Kiến trúc navigation ERP mới

Navigation không còn 10 tab ngang hàng. Toàn hệ thống dùng 2 cấp:

### Cấp 1 · Business Module / Work Center

1. **Vận hành**
2. **Theo dõi**
3. **Master Data**
4. **Quản trị**

### Cấp 2 · Workspace / Function

- **Vận hành** → All Open Jobs · Planning Board · Masking / Unmasking · Board Điều Độ
- **Theo dõi** → Job Tracker · Part Tracker
- **Master Data** → Master Data · Import Master
- **Quản trị** → Cấu hình · Logic & Hướng dẫn

Nguồn chuẩn duy nhất: `src/lib/erp/st-navigation.ts`.

`AppTabs` và native `ErpAppShell` đều dùng cùng module hierarchy; Planning không có menu riêng.

## Local navigation sâu hơn

Master Data sidebar được chia theo domain thay vì danh sách phẳng:

- **Sản phẩm** → Part · Part Revision · Material Finish · Process Requirement
- **Operation & Routing** → Source Operation · Routing Detail
- **ST Model** → ST Routing Master · ST Routing Chain · Part → Routing

Configuration tiếp tục dùng dependency/flow groups làm navigation rail.

## Interaction / workspace chuẩn kế thừa V5

- Configuration split workspace: editor trái + data grid phải.
- Sticky action column cho data grid rộng.
- ERP confirm dialog và ERP toast; không dùng browser alert/confirm/prompt.
- Field state, filter/disclosure/popover, object fact-sheet, schedule command row và responsive workspace dùng chung design system.
- Planning Matrix/Focus Mode/Recipe compatibility giữ nguyên logic hiện tại.

## Quy tắc không thay flow

- Candidate/READY/WAIT/Batch Key/Recipe proposal không đổi.
- Batch Create/Add/Reset không đổi business logic.
- Board Điều Độ giữ Scheduling engine hiện tại.
- Master/Configuration chỉ thay information architecture và presentation.

## Validation tối thiểu trước khi giao

- TypeScript/TSX parse sạch.
- Không thiếu local import.
- CSS brace balance OK.
- `/planning-old` = 0.
- Navigation production lấy từ một nguồn `ST_ERP_MODULE_GROUPS`.
