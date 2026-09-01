# Job Tracker v354

Thêm tab `/job-tracker` để tra cứu vòng đời đầy đủ của một Job mà không thay đổi dữ liệu.

## Nguồn dữ liệu
- `open_job_current` + `source_data`: snapshot All Open Job hiện tại.
- `planning_job_operation`: Planning Chain hiện tại.
- `loadPlanningRouteStatus()`: trạng thái Route Matrix giống Planning Board.
- Live Recipe resolver: Recipe + `mapping_id` đang match theo cấu hình hiện tại.
- `planning_batch_job` + `planning_batch`: Batch liên quan tới Job.
- `planning_schedule` + `md_schedule_resource`: Resource và thời gian điều độ.
- Chemical segments: Loading / Process / NDT / Unloading.
- Master theo Part/Revision: Routing Detail, ST Routing, Material Finish, Process Requirement.
- `open_job_history`: lịch sử snapshot.
- `planning_handover_change_event`: lịch sử handover/change impact.

## Hiển thị chính
1. Job Summary.
2. Planning Route / Job Lifecycle.
3. Batch & Schedule Detail.
4. All Open Job full source fields.
5. Part / Revision Master.
6. Open Job History.
7. Planning Handover / Change Impact.

Không cần migration SQL mới.
