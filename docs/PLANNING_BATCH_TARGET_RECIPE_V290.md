# Planning Batch Target Recipe v290

## Lỗi
Một Candidate row có thể đại diện cho Main trước (ví dụ CPBILP) trong khi Route Matrix đã mở READY cho Main kế tiếp (ví dụ TSAUNSLD). Batch Builder đã lấy `candidate.effective_recipe_key`, vì vậy Operation hiển thị TSAUNSLD nhưng Recipe lại thuộc CPBILP.

## Nguồn chuẩn mới
Recipe của Batch Builder luôn resolve theo đúng `planning_job_operation_id` đang được checkbox chọn. Route Matrix enrich từng source occurrence bằng live Recipe theo `standard_operation + source_operation + Job data`.

- Candidate target trực tiếp: dùng Recipe của Candidate.
- Target nằm ở Route Matrix: dùng Recipe của route occurrence đó.
- Toolbar Recipe chỉ được truyền vào Create Batch khi Standard Operation filter trùng Operation target đang build.
- API Create Batch vốn đã validate/resolve Recipe theo exact Planning Job Operation và tiếp tục là lớp bảo vệ cuối.

Không thay đổi Recipe mapping, Batch Key rules, Planning Chain hay Schedule Handoff.
