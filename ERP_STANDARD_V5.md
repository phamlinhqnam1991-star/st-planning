# ST Planning · ERP Standard V5

V5 là nguồn chuẩn presentation/interaction hiện tại của ST Planning. Vòng này **không thay business logic, API contract, database schema, Planning/Batch/Schedule engine**.

## Kiến trúc UI chuẩn

- `src/components/erp/erp-kit.css`: design system và work-surface production chuẩn V5.
- `src/components/erp/erp-app-header.tsx`: masthead dùng chung.
- `src/components/app-dialog-provider.tsx`: confirm dialog ERP dùng chung; không dùng popup confirm native.
- `src/components/app-toast-provider.tsx`: toast ERP dùng chung; source production không dùng `alert()` native.
- Navigation dùng một nguồn `ST_ERP_MODULES`.

## V5 deep interaction

1. **Configuration split workspace** trên desktop: editor trái sticky + data grid phải; inline editor/detail trải full workspace.
2. **Sticky action column** cho data grid rộng để thao tác luôn nằm trong tầm nhìn.
3. **ERP confirm dialog** thay toàn bộ `window.confirm/confirm`; destructive action có tone và action label rõ.
4. **ERP toast trực tiếp** thay toàn bộ `window.alert/alert`; không còn monkey-patch browser API.
5. Field state chuẩn: focus-visible, invalid, readonly, disabled, checkbox/radio accent.
6. Filter/disclosure/popover được chuẩn hóa border, elevation và keyboard focus.
7. Schedule area command row sticky trên desktop khi chỉnh grid dài.
8. Tracker/object summary được chuẩn thành fact-sheet grid.
9. Action bar/bulk/row-action dùng chung density và alignment.
10. Responsive: sticky action/dense workspace tự trả về flow bình thường trên mobile.

## Quy tắc không thay flow

- Planning Matrix/Focus Mode/Recipe compatibility giữ logic hiện tại.
- Candidate/READY/WAIT/Batch Key/Recipe proposal giữ engine hiện tại.
- Board Điều Độ giữ Schedule engine và Chemical Line timeline hiện tại.
- Configuration chỉ thay presentation/editor interaction, không đổi dữ liệu nguồn.

## Validation tối thiểu trước khi giao

- TypeScript/TSX parse sạch.
- Transpile syntax sạch.
- Không thiếu local import.
- CSS brace balance OK.
- `alert()/confirm()/prompt()` native trong source production = 0.
- `/planning-old` = 0.
