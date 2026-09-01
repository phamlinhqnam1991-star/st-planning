# V364 — Repeated NextOperation occurrence resolver

## Mục tiêu
Sửa trường hợp một raw `NextOperation` xuất hiện nhiều lần trong cùng route (ví dụ `SIPT` → PRIMER1 rồi `SIPT` → PRIMER2) và cặp `LastLaborOp -> NextOperation` cũng lặp nên Bridge resolver trả `NO_CHAIN`.

## Logic mới
1. Vẫn ưu tiên bằng chứng physical pair như trước.
2. Nếu cùng raw `NextOperation` còn nhiều Main occurrence không phân biệt được, lấy Batch/Planning history theo `operation_instance_key`.
3. Chọn **occurrence sớm nhất chưa có non-cancelled Batch**.
4. Nếu occurrence trước đã có Batch, bỏ qua occurrence đó và chọn occurrence lặp kế tiếp chưa plan.
5. Nếu tất cả occurrence lặp đều đã có Batch, giữ occurrence đầu để sequential gating replay toàn chuỗi planned và mở Main chưa plan phía sau.
6. Không dùng Recipe hay Priority để xác định occurrence.
7. Áp dụng generic cho mọi Operation lặp, không hard-code SIPT/PRIMER.

## Debug
`Job Planning Debug` dùng cùng resolver/progress rule để hiển thị đúng nguyên nhân và Current Main sau v364.

## Ảnh hưởng
- Có thể chuyển Job từ `NO_CHAIN` sang `READY/WAIT/PLANNED` đúng occurrence sau khi `Rebuild Chain`.
- Không thay đổi Recipe occurrence rule, Batch Compatibility, Process Time, Scheduling hoặc Masking/Unmasking logic.
- Không cần migration SQL.
