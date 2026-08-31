# v282 — Process Recipe lấy từ Open Job Column Values

Phạm vi thay đổi chỉ ở phần **② Danh mục Recipe** trong trang Công thức & Rule.

- **Recipe Group**: dropdown danh sách `source_column` đang active trong `md_open_job_column_value`.
- **Recipe No**: hai dropdown: (1) chọn cột All Open Job, (2) chọn giá trị unique active của cột đó.
- **Recipe Name**: cùng cấu trúc với Recipe No.
- Giá trị dropdown dùng cùng nguồn với tab **Open Job Column Values**, gồm cả giá trị được thêm/chỉnh tay trong từ điển.
- `recipe_no` và `recipe_name` vẫn lưu giá trị thật (`source_value`); `display_name` chỉ dùng làm nhãn hiển thị nếu có.
- Thêm metadata nguồn vào `md_process_recipe`: `recipe_group_source_column`, `recipe_no_source_column`, `recipe_name_source_column`.
- Recipe cũ không bị đổi `recipe_key`, không backfill bắt buộc, không thay logic Planning Board / Candidate / Batch / Schedule.
- Khi sửa Recipe đã tồn tại, Process Family / Recipe Group / Recipe No tiếp tục khóa như kiến trúc cũ; Recipe Name có thể chọn lại từ cột nguồn khác.

Migration cần chạy: `045_process_recipe_open_job_value_sources.sql`.
