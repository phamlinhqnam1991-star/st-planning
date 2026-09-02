# ERP Standard V7 — Vertical Navigation

Nguồn chuẩn UI/navigation hiện tại của ST Planning.

## Kiến trúc điều hướng

Navigation production dùng cấu trúc dọc cố định bên trái:

1. Work Center
2. Workspace/function của Work Center đang chọn
3. Local section của trang (Master Data / Configuration khi có)
4. Nội dung nghiệp vụ

Work Center hiện tại:
- Vận hành
- Theo dõi
- Master Data
- Quản trị

## Nguyên tắc

- Không dùng thanh tab module trải ngang ở desktop.
- Planning Board và các page production dùng cùng kiểu vertical ERP rail.
- Active Work Center và active Workspace phải phân biệt rõ bằng background + left indicator.
- Local sidebar của Master Data/Configuration vẫn giữ riêng vì đây là navigation cấp sâu hơn.
- Không thay đổi business logic, API, database, Planning/Batch/Recipe/Schedule engine.

## Responsive

- Desktop: rail 210 px.
- Tablet: rail 176 px.
- Màn hình hẹp: rail 148 px, ẩn short-code để ưu tiên tên chức năng.
