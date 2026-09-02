# ST Planning — ERP Template Kit

## Trạng thái hiện tại

ERP Kit đã được áp dụng cho production UI. `/erp-kit` vẫn được giữ như showcase/reference, nhưng không còn là nơi duy nhất dùng ERP components.

Nguồn chuẩn presentation hiện tại:
- `ERP_STANDARD_V3.md`
- `src/components/erp/erp-kit.css`
- `src/components/erp/*`
- `src/lib/erp/st-navigation.ts`

## Component chuẩn

- `ErpAppShell`: shell native ERP dùng cho Planning và các subview liên quan.
- `ErpAppHeader`: masthead dùng chung cho các production page còn dùng server shell hiện tại.
- `ErpPageHeader`: object/page title, description, status và action.
- `ErpToolbar`: command/search/filter/bulk action.
- `ErpDataGrid`: data grid compact/comfortable, sticky header, selected/empty/footer.
- `ErpFormGrid` + `ErpField`: form hierarchy chuẩn.
- `ErpStatus`: status badge dùng cấu hình status chung.
- `ErpKpiCard`: KPI summary.
- `ErpSection`: panel/section.
- `ErpTabs`: page-level tabs.
- `ErpEmptyState`: empty state.

## Nguyên tắc kiến trúc

1. Presentation không tự tạo business rule mới.
2. API/DB/Planning/Batch/Recipe/Schedule engine không bị fork chỉ để phục vụ UI.
3. Navigation dùng `ST_ERP_MODULES` làm nguồn chuẩn duy nhất.
4. Cùng một pattern giao diện phải dùng cùng token/component/class; không tạo CSS song song.
5. Khi design mới thay design cũ, CSS/presentation cũ liên quan phải được loại thay vì chồng patch lâu dài.
6. Desktop data-density là primary; mobile/tablet responsive nhưng không làm mất chức năng.

## Showcase

`/erp-kit` dùng mock data để xem các pattern ERP và không đọc/ghi database.
