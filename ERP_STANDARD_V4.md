# ST Planning · ERP Standard V4

V4 là nguồn chuẩn presentation/UI hiện tại. Phạm vi chỉ là giao diện và interaction presentation; không thay business logic, API contract, database schema, Planning/Batch/Schedule engine.

## Kiến trúc chuẩn

- `src/components/erp/erp-app-header.tsx`: masthead dùng chung, hiển thị Workspace + Environment.
- `src/lib/erp/st-navigation.ts`: một nguồn duy nhất cho module navigation.
- `src/components/config-nav.tsx`: Configuration object header, mục đích, ảnh hưởng phía sau và bước trước/sau.
- `src/components/config-sidebar-client.tsx`: configuration rail/readiness.
- `src/components/erp/erp-kit.css`: canonical ERP design system V4.

## V4 deep work-surface

Toàn app dùng cùng hierarchy:

`App Header -> Module Rail -> Workspace -> Object/Page Header -> Command/Filter Bar -> Editor/Form -> Data Grid/Detail -> Action Bar`

Chuẩn V4:

- Segoe UI Variable / Segoe UI, tabular numerics.
- Canvas xám nhạt, surface trắng, border/shadow rất nhẹ.
- Header + module rail compact; module rail sticky.
- Sidebar/navigation rail dependency-aware và responsive.
- Control 30–32 px, data row 32 px, sticky table headers.
- Form/editor dùng field grid, context note và sticky action bar thay card rời.
- Selection/mapping dùng check-card trạng thái rõ; không dùng hiệu ứng trang trí mạnh.
- Tracker dùng object summary + expandable sections.
- Schedule dùng resource-centric workspace, unscheduled strip/direct grid/timeline.
- Configuration editor dùng cùng ngôn ngữ UI cho Mapping, Main Operation, ST Group, Area, Schedule Area, Planner, Recipe, Time Rule, Auto Planning.
- Native `prompt()` trong Area/Schedule Area đã được loại, thay bằng inline ERP editor; API/behavior giữ nguyên.
- Planning Matrix/Focus Mode/Recipe compatibility giữ nguyên logic đã chốt.

## Configuration V4

Các màn hình editor được chuẩn hóa sâu hơn:

- ST Group: editor + master grid + action bar.
- Source -> Main Mapping: form chuẩn + search command + master grid.
- Physical Area: form thêm mới + master grid + inline edit + assignment workspace.
- Schedule Area: lane form + master grid + inline edit + ST Group/Main Operation assignment workspace.
- Recipe / Process Time / Auto Planning / Open Job Column Values dùng cùng panel, form, grid và action hierarchy.

## Validation

V4 phải được kiểm tối thiểu trước khi giao:

- Parse tất cả TS/TSX/config: 0 syntax diagnostics.
- Local import resolution: 0 missing imports.
- CSS brace balance: OK.
- Không có `/planning-old`.
- Không chứa `.env.local`, `.next`, `node_modules`, `tsconfig.tsbuildinfo` trong ZIP giao.

Full `npm ci`/`npm build` chỉ được coi là pass khi chạy thành công trong môi trường có dependency/network đầy đủ.
