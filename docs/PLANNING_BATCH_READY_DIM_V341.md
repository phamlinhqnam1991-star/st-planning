# Planning Board - Batch READY dim v341

Trong Batch Selection Mode:

- READY thuộc Main Planning khác Main đang tạo Batch: làm mờ và không click được.
- READY cùng Main nhưng khác Recipe: làm mờ và không click được.
- READY cùng Recipe nhưng không khớp condition: làm mờ và không click được.
- Chỉ READY cùng Main + cùng Recipe + đúng toàn bộ Recipe Conditions giữ màu READY bình thường và cho phép chọn.
- Các cột thông tin Job bên trái không bị ảnh hưởng.

Lý do cần CSS riêng: `.route-status-ready` dùng `opacity/filter/background ... !important`, nên class dim generic ở v340 không thể làm mờ READY. v341 thêm selector READY cụ thể để override đúng trạng thái.
