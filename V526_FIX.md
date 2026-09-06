# V526 · ST Output quay lại cách tính V523

- Chỉ thay đổi nguồn `INTERMEDIATE_NO_CHAIN` của ST Output.
- Khôi phục đúng logic V523/V521-V522:
  1. Job có `NextOperation` thuộc active Intermediate/Bridge.
  2. Job chưa có current Planning Board row active ở trạng thái `LOCKED` / `ELIGIBLE` / `PLANNED`.
  3. `NextOperation` thuộc `st_ops` của ST Output V523: active `PLANNING_OPERATION` / `ST_SCOPE_ONLY` / `INTERMEDIATE`, hoặc active Intermediate Bridge.
- Bỏ logic V524 yêu cầu `PLANNING_OPERATION + Source -> Main Mapping`.
- Bỏ logic V525 dùng Audit precedence + explicit active ST Scope.
- Không thay đổi CHEMMILL, Final ST Operation, FINSST/CFINM-VN, dedup priority, Batch, Planning Chain hoặc Scheduling.
- Cập nhật Logic & Hướng dẫn và New User Training để mô tả lại cách tính V523.
