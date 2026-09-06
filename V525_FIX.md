# V525 Fix · ST Output Intermediate No Chain

- Giữ đúng 2 bước đã chốt cho nguồn `INTERMEDIATE_NO_CHAIN`:
  1. Lấy Job theo đúng precedence của Audit All Open Job với reason `INTERMEDIATE_NO_CHAIN`.
  2. Từ danh sách đó, chỉ giữ Job có `NextOperation` được khai báo active trong `md_st_operation_scope`.
- Bỏ điều kiện sai của V524 bắt `NextOperation` phải đồng thời là `PLANNING_OPERATION` và có active `Source -> Main Mapping`; điều kiện này làm Bridge Intermediate hợp lệ bị lọc về 0.
- ST membership ở bước 2 chấp nhận các loại scope active: `PLANNING_OPERATION`, `INTERMEDIATE`, `ST_SCOPE_ONLY`; tuy nhiên `ST_SCOPE_ONLY` đã bị loại ở bước Audit theo đúng precedence hiện hữu nên không đi vào `INTERMEDIATE_NO_CHAIN`.
- Không thay đổi CHEMMILL, Final ST Operation, FINSST/CFINM-VN, Batch, Planning Chain, Scheduling hay dedup priority.
- Cập nhật `Logic & Hướng dẫn` và `New User Training` theo logic V525.
