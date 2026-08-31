# Kế hoạch ST Planning — v281 quản lý Standard Operation → Recipe

## Mục tiêu
Thêm màn hình quản lý bảng `md_operation_recipe_mapping` trong khu Master Data, để xem/tìm/thêm/sửa/ngưng sử dụng mapping cũ Standard Operation → Recipe mà không ảnh hưởng luồng đề xuất Recipe v280.

## Phases
- [in_progress] 1. Khảo sát màn Master Data và API mapping hiện có.
- [pending] 2. Thêm trang/bảng quản lý và điều hướng Master Data.
- [pending] 3. Typecheck/build, README và ZIP sạch.

## Quyết định
- `md_operation_recipe_mapping` chỉ để quản lý/reference; không bật lại làm nguồn đề xuất Recipe.
