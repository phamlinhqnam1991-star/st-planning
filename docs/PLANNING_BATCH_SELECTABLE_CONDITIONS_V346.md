# Planning Batch Selectable Conditions v346

## Mục tiêu
Planner có thể chọn subset condition của Recipe dùng để khóa Job khi gom Batch.

Ví dụ Recipe có `Program=A320` và `Category=CAT3`:

- tích Program + Category: chỉ Job A320/CAT3 được mở;
- chỉ tích Program: mọi Job A320 cùng Recipe được mở;
- chỉ tích Category: mọi Job CAT3 cùng Recipe được mở;
- bỏ hết: chỉ khóa theo cùng Recipe.

## Quy tắc
- Main Operation vẫn phải giống nhau.
- Recipe luôn phải giống nhau.
- Condition checkbox chỉ điều khiển Batch membership compatibility.
- Process Time conditions vẫn dùng rule Process Time độc lập.
- Mặc định tích tất cả condition.
- Selection được lưu trong `planning_batch.compatibility_conditions`.
- Existing Batch tự khôi phục selection đã lưu.
- API Create/Add Batch kiểm tra lại server-side.

## Migration
Chạy `063_batch_compatibility_selected_conditions.sql` trước khi deploy source v346.
