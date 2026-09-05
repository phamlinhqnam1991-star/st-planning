# V467 · Production Added Job → Next Main Attention

## Logic chốt
Khi Production thêm một Job ngoài lô vào Batch hiện tại, hệ thống không chỉ ghi nhận Job ở Batch nguồn mà còn tự tìm **Next Main thực tế của Job** theo `planning_job_operation.planning_seq`.

Ví dụ:
- `BSA_00001` có J001/J002/J003.
- `PRI_00002` ở Main PRIMER đang chứa các Job đi tiếp từ `BSA_00001`.
- Production thêm J008 vào `BSA_00001`.
- V467 tự nhận diện PRIMER là Next Main và tìm `PRI_00002` bằng mức overlap Job lớn nhất giữa Batch nguồn và các Batch của Next Main.
- Scheduling Board của lô đích hiện `Attention` và Handover Alert.
- Production Report của `PRI_00002` hiện dòng **Chú ý từ Main trước: J008 · BSA_00001 · BSAUNSLD → PRIMER** cùng nút **Thêm Job này**.

## Khi Production bấm “Thêm Job này” ở lô Next Main
- Job được thêm trực tiếp vào Batch đích.
- Job ở Batch đích bắt đầu với trạng thái Production `WAITING`, **không tự đánh dấu DONE**.
- Attention nguồn được ACK tự động.
- Nếu Job còn Next Main tiếp theo và đã có Batch tương ứng, hệ thống tạo attention tiếp theo theo cùng logic.

## Không hard-code route
Không hard-code `BSAUNSLD → PRIMER`. Next Main lấy từ route thật của từng Job.

## Không tạo bảng mới
V467 tái sử dụng `planning_handover_change_event` đã có, nên **không cần migration SQL mới**.

## Phạm vi không đổi
Carry Over, Daily Production Adjustment, Batch Size, Recipe validation, Scheduling resource logic và Planning Board không đổi ngoài phần Attention nêu trên.
