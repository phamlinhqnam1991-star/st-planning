# Planning Board V2 Candidate Load Fix — v320

## Phạm vi

Chỉ sửa độ bền đường tải Candidate cho Planning V2. Không đổi business logic Candidate, resolver, READY,
`NO_CHAIN_ALL_MAIN`, Recipe, Batch Key, Batch, Schedule hoặc Rebuild Chain.

## Nguyên nhân kiến trúc

- Tab V2 trước đây dùng link `/planning/v2` tĩnh nên khi chuyển từ Candidate Jobs cũ có thể làm mất scope đang dùng
  (`area`, `op`, `recipe`, `prevBatch`). V2 sau đó vô tình gọi Load All không scope và có thể tạo một Snapshot MISS nặng.
- `candidate-snapshot.ts` chỉ fallback canonical khi nhận diện lỗi thiếu table/column Snapshot. Một lỗi khác trong lớp cache
  (read/build/write Snapshot) có thể làm API Candidate trả 500 dù canonical Candidate vẫn dùng được.

## Sửa v320

1. Planning tabs giữ nguyên query-string scope thật đang có trên URL khi chuyển giữa Candidate Jobs / V2 / Recent Batches.
2. Snapshot được coi đúng vai trò read-cache: bất kỳ lỗi Snapshot nào đều fallback sang chính
   `resolvePlanningView() + loadPlanningCandidates()` hiện tại.
3. Nếu canonical cũng lỗi thì API vẫn trả lỗi thật; không nuốt lỗi nghiệp vụ/DB.
4. V2 Candidate fetch đọc response text trước để hiện đúng lỗi HTTP/server thay vì chỉ báo chung chung.
5. Không có migration SQL mới.

## Rollback

Quay lại v319 nếu cần. Không có thay đổi schema hoặc dữ liệu cần rollback.
