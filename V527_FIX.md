# V527 · ST Final Steps

- Baseline: V526.
- Giữ nguyên cách xác định candidate theo logic V523.
- Thêm bộ lọc cuối riêng cho ST Final Steps theo `NextOperation`.
- Chỉ tính khi `NextOperation` nằm trong active `md_st_operation_scope` và `operation_type` thuộc một trong ba nhóm:
  - `ST_SCOPE_ONLY`
  - `PLANNING_OPERATION` (Main Planning)
  - `INTERMEDIATE`
- Không dùng `md_intermediate_bridge_operation` để mở rộng bộ lọc cuối; Bridge chỉ còn phục vụ bước xác định candidate V523.
- Operation ngoài ba nhóm ST trên bị loại khỏi ST Output.
- Đổi nhãn UI `Intermediate No Chain` thành `ST Final Steps`.
- Giữ nguyên internal source key `INTERMEDIATE_NO_CHAIN` để không phá filter/API/report cũ.
- Không thay đổi CHEMMILL, Final ST Operation, FINSST/CFINM-VN, dedup, Batch, Planning Chain hoặc Scheduling.
- Cập nhật Logic & Hướng dẫn và New User Training theo logic đã chốt.
