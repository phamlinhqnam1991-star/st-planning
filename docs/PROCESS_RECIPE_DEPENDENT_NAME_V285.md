# v285 — Recipe No → Recipe Name theo All Open Job

## Phạm vi

Chỉ thay phần tạo/sửa **Process Recipe**. Không đổi Planning Board Candidate SQL, READY, Batch, Schedule, Recipe mapping hoặc các tối ưu performance v284.

## Logic đã chốt

1. `Recipe No Source Column` và `Recipe Name Source Column` chỉ là metadata để chọn nguồn dữ liệu từ **Open Job Column Values**.
2. Khi lưu, `recipe_no` và `recipe_name` lưu **VALUE được chọn**, không lưu tên cột.
3. Validation Open Job Column Values so sánh `trim + case-insensitive` để không báo sai do chữ hoa/thường hoặc khoảng trắng từ Excel.
4. Khi Recipe No và Recipe Name source column đã được chọn, client gọi `/api/process-recipe/name-options`.
5. API đọc trực tiếp `open_job_current` và chỉ trả Recipe Name xuất hiện **trên cùng dòng Job** với Recipe No đã chọn.
6. Nếu chỉ có một Recipe Name phù hợp, UI tự chọn. Nếu có nhiều, Planner chọn từ dropdown.
7. Khi đổi Recipe No, Recipe Name cũ được reset và danh sách được đề xuất lại.
8. `Open Job Column Values` vẫn dùng để lấy danh sách source column/unique values ban đầu; quan hệ No → Name không suy ra từ bảng unique này.

## Tương thích

- Recipe cũ giữ nguyên `recipe_key` và lịch sử.
- Numeric Recipe No không dùng source column vẫn giữ padding 3 số theo logic cũ.
- Recipe No lấy từ All Open Job giữ nguyên value được chọn (sau trim), không tự upper-case value.
