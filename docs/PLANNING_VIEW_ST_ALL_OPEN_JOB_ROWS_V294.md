# v294 — VIEW ST owns Candidate row membership

## Mục tiêu

`VIEW CÔNG ĐOẠN ST` quyết định Job nào xuất hiện trên Candidate Jobs bằng RAW `open_job_current.next_operation`.

Planning Chain (`planning_job_operation`) chỉ enrich trạng thái Main Operation và quyền thêm Job vào Batch; trạng thái `LOCKED` hoặc chưa có live chain không được phép làm Job biến mất khỏi danh sách.

## Logic

1. Candidate query bắt đầu từ `open_job_current` (`is_open=true`).
2. Lọc RAW `NextOperation` bằng danh sách VIEW ST trước pagination.
3. `planning_job_operation` được LEFT JOIN theo Job để chọn một row đại diện:
   - exact NextOperation nếu ELIGIBLE/PLANNED;
   - nếu không, Main ELIGIBLE sớm nhất;
   - nếu không, exact NextOperation LOCKED;
   - sau đó PLANNED/LOCKED fallback.
4. Job không có live planning chain vẫn hiện với trạng thái UI `NO CHAIN`; không thể tick vào Batch cho tới khi Rebuild Chain tạo Planning Operation ID thật.
5. Count query cũng bắt đầu từ `open_job_current`, vì vậy số `X/Y job` trong VIEW ST và tổng Candidate không còn bị gate bởi `ELIGIBLE/PLANNED`.

## Không thay đổi

- Planning Chain canonical AllOperation v288.
- Schedule handoff.
- Recipe/Batch Key.
- Create Batch validation.
- Route Matrix business status logic.
- Không có migration database mới.
