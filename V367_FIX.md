# v367 — Paint fallback đúng occurrence

- Sửa Import Master: `PRIMER2` không còn dùng `PRIMER1`, `PRIMER3` không còn dùng `PRIMER1`; `TOPCOAT2` không còn kế thừa `TOPCOAT1`.
- Paint fallback lấy đúng field `md_material_finish` theo occurrence:
  - PRIMER -> primer1
  - PRIMER2 -> primer2
  - PRIMER3 -> primer3
  - TOPCOAT1 -> topcoat1
  - TOPCOAT2 -> topcoat2
- Giá trị Master được match với Process Recipe Master theo `recipe_name` trước, rồi `recipe_no`.
- Nếu giá trị dạng tên chưa tồn tại trong Process Recipe Master, Import không tạo Recipe No giả từ tên đó.
- Migration 065 rebuild `md_part_process_recipe` hiện tại để dữ liệu cũ không tiếp tục fallback sai.
- Không thay đổi Recipe Rule, READY/WAIT, Batch Compatibility, Process Time hay Scheduling.
