# V393 — Logic & Guide Schedule Area live DB fix

## Sửa lỗi

- Sửa bảng **14.9 · Schedule Area → Planner → Main Operation** báo `column s.id does not exist`.
- `md_schedule_area` dùng `schedule_area_code` làm primary key; query không còn tham chiếu `s.id`.
- Planner hiện đọc từ `md_planner_work_assignment` (nguồn hiện hành), fallback về `md_schedule_area.planner_owner` chỉ để tương thích dữ liệu cũ.
- 14.0 và 14.0.1 dùng cùng nguồn Planner để tránh Logic & Guide hiển thị khác với Configuration/Scheduling.
- Không thay đổi dữ liệu mapping, Planning Chain, Batch, Recipe hay Scheduling.
- Không cần migration database mới.
