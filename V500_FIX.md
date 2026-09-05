# V500 · Scheduling detail-only + Dashboard READY-first

## Tab Điều độ
- Xóa toàn bộ dòng `MAIN TOTAL` khỏi `ST Workload Summary · By Area`.
- Chỉ giữ các dòng detail theo Recipe.
- Vì không còn dòng tổng chứa tên Main, mỗi Recipe detail row hiển thị trực tiếp `Main Operation`.
- Giữ nguyên click detail Recipe của V499 để mở Planning Board Quick View.
- Không đổi READY/WAIT classifier, Recipe resolver, Batch, Schedule hay Auto Planning.

## Tab Dashboard · ST Workload Summary · By Area
Thứ tự cột mới:
1. `READY · Previous Main Scheduled`
2. `READY · Previous Main Unscheduled / START`
3. `WAIT · Next Main`
4. `WAIT · Future Mains`
5. `PLANNED-UNSCHEDULED`
6. `SCHEDULED`
7. `HOLD`
8. `ST ONLY`
9. `Total`

Chỉ thay đổi thứ tự hiển thị, không đổi phép tính workload.
