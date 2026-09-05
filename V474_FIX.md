# V474 — Training dùng dữ liệu thật từ database

## Phạm vi thay đổi
Chỉ cập nhật Training, Logic & Hướng dẫn và CSS hỗ trợ Training. Không thay đổi business logic, Planning/Scheduling/Production API hay database schema.

## Training Live Database
`/training` giờ đọc trực tiếp database mỗi lần mở:
- `md_st_operation_mapping`: Operation Code → ST Group/Main.
- `md_operation_master`: Main Planning Order + Batch Prefix/Sequence/Padding/Common Batch Size/Auto Split.
- `md_operation_recipe_batch_size`: Batch Size override theo Recipe.
- `md_process_recipe`: Recipe thật.
- `md_recipe_time_rule`: Process Time Rule thật.
- `md_area`, `md_area_operation_group`: Physical Area thật.
- `md_schedule_area`, `md_schedule_area_operation`, `md_planner_work_assignment`: Schedule Area + Planner thật.
- `open_job_current`: chọn một Open Job thật làm bài mẫu.
- `planning_job_operation`, `planning_batch_job`, `planning_batch`, `planning_schedule`: trace Job thật qua Main → Batch → Schedule.

Trainer có thể nhập Job Number ngay trên Training để load đúng Job cần hướng dẫn.

## Nguyên tắc
Training không tạo logic mới. Nó chỉ trình bày Source of Truth hiện có bằng dữ liệu live để học viên hiểu rõ hơn.
