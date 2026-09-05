# V476 - READY First Main -> Scheduled/Done bucket

## Yêu cầu
Khi một Main Planning là Main đầu tiên trong chain và đã READY, hệ thống phải hiển thị ở `READY · Previous Main Scheduled / Done`, không phải `READY · Previous Main Unscheduled / START`.

## Logic
- First Main không có Previous Main nên không có upstream dependency cần chờ.
- `ready_previous_schedule = SCHEDULED` khi Previous Main rỗng / START.
- Planning Board drill-down dùng cùng classifier với Workload Summary.
- Previous Main chưa Schedule/chưa DONE thật sự mới thuộc `READY_PREV_UNSCHEDULED`.

## Không thay đổi
- Sequential READY/WAIT
- Batch/Recipe/Batch Size/Process Time
- Scheduling/Production Execution
- Database schema

Không cần migration SQL.
