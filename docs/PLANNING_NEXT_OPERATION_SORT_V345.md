# V345 · Next Operation Sort Order

## Mục tiêu

Tách thứ tự sort của RAW `NextOperation` khỏi `Main Planning Order`.

- `md_operation.planning_sort_order` = **Next Op Sort** cho từng Operation Code thật.
- `md_operation_master.planning_sort_order` = **Main Planning Order** dùng nội bộ cho chuỗi Main/READY/WAIT.
- Hai giá trị độc lập và có thể khác nhau.

## Operation được hỗ trợ

`Next Op Sort` áp dụng cho tất cả Operation Code thuộc ST:

- Planning Operation
- ST_SCOPE_ONLY
- Bridge Intermediate (AUTO hoặc MANUAL)

Ví dụ:

| Operation | Loại | Next Op Sort |
|---|---|---:|
| CMSA | Planning | 10 |
| FMSKG-CM | Planning | 20 |
| INSPLM | Intermediate | 25 |
| SCRB-CM | Intermediate | 27 |
| CHEMMILL | Planning | 30 |
| UNMSK-CM | Intermediate | 35 |
| INSPCM | Intermediate | 36 |

## Planning Board

Candidate đọc `open_job_current.next_operation` và lookup `md_operation.planning_sort_order`.
Khi sort theo Next Operation, số nhỏ hơn đứng trước; Operation chưa cấu hình được đưa xuống cuối rồi sort ổn định theo tên.

## Không ảnh hưởng Planning Chain

Thay đổi `Next Op Sort` không gọi `syncAllStDerived()` và không rebuild Planning Chain.
Nó không thay đổi:

- Main Planning sequence
- Previous Main
- READY / WAIT
- Recipe
- Batch
- Schedule

## UI

Tại ST Operation Flow → Danh sách Operation, cột `Next Op Sort` cho phép chỉnh trực tiếp với cả Bridge Intermediate.
Trang Operation Code Order cũng hiển thị Intermediate và dùng cùng nguồn dữ liệu.
