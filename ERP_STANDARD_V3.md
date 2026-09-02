# ST Planning · ERP Standard V3

Phạm vi: presentation/UI architecture. Không thay đổi business logic, API contract, database schema hoặc scheduling/planning engine.

## Nguồn chuẩn UI

- `src/components/erp/erp-app-header.tsx`: masthead chuẩn cho các page còn dùng server shell hiện tại.
- `src/lib/erp/st-navigation.ts`: nguồn duy nhất cho module navigation; `AppTabs` và Planning ERP cùng dùng.
- `src/components/config-nav.tsx`: object header chuẩn cho Configuration (title, purpose, downstream impact, previous/next).
- `src/components/config-sidebar-client.tsx`: configuration rail + readiness summary.
- `src/components/erp/erp-kit.css`: design tokens và presentation standard dùng toàn app.

## Chuẩn giao diện chung

- Masthead 56 px + module navigation 44 px.
- Segoe UI Variable / Segoe UI; số dùng tabular numerics.
- Navigation rail 242 px trên desktop, chuyển horizontal rail trên tablet/mobile.
- Object page hierarchy: eyebrow → title → description → contextual actions.
- Command/filter bar: panel trắng, controls 32 px, focus ring thống nhất.
- Data grid: sticky header, row density 34 px, numeric alignment, hover/focus nhẹ.
- Form/editor: field label nhỏ, group theo surface, không dùng card trang trí dư.
- Status/message/empty state dùng cùng palette và spacing.
- Motion được giữ tối thiểu; hỗ trợ `prefers-reduced-motion`.

## Configuration

- Sidebar theo dependency flow, có readiness count.
- Mỗi page có Object Header + Mục đích + Ảnh hưởng phía sau.
- Recipe / Time / Auto Planning / Mapping / Area / Planner editors dùng cùng command-bar, form, panel, grid language.
- Configuration overview chuyển thành readiness dashboard, không dùng emoji/decorative alerts.

## Các workspace khác

- Master Data: KPI + dense master grid.
- Part / Job Tracker: search command bar + object summary + expandable detail sections.
- All Open Jobs: segmented status, command bar, dense snapshot grid, import history.
- Planning: giữ ERP Matrix/Focus Mode hiện tại làm canonical Planning UI.
- Masking / Unmasking: date/filter workspace + grouped Main Operation panels.
- Schedule: planner workspace + unscheduled pool + direct grid + timeline/resource sections.
- Import: compact upload workspace + metrics/history.
- Logic Guide: sticky section navigation + rule cards.
- Login: ERP identity + compact authentication surface.

## Validation

- TypeScript/TSX syntax parse: 182 files, 0 syntax diagnostics.
- Local import resolution: 0 missing imports.
- CSS brace balance: OK.
- Production UI class coverage: all discovered classes have a CSS definition; remaining demo helpers are also covered.
- Full `npm ci` / production build could not complete in the audit container because dependency installation timed out; do not treat this document as a full Next.js build certificate.
