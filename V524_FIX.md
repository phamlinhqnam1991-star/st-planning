# V524 Fix

- Sửa `ST Output` nguồn `INTERMEDIATE_NO_CHAIN` thành đúng 2 bước:
  1. Lấy danh sách Job theo audit Intermediate/Bridge chưa resolve current Planning Board row (`LOCKED` / `ELIGIBLE` / `PLANNED`).
  2. Lọc tiếp chỉ giữ Job có `NextOperation` là active `PLANNING_OPERATION` và có active `Source -> Main Mapping`.
- Không còn dùng legacy ST scope rộng hoặc nhãn `INTERMEDIATE` Dashboard-only để tính output dm² cho `INTERMEDIATE_NO_CHAIN`.
- Cập nhật `Logic & Hướng dẫn` và `Training New User` cùng định nghĩa trên.
