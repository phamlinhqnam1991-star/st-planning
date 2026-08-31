# Planning Board — Progressive (Chunked) Candidate Load — v328

## Vấn đề

Máy người dùng có độ trễ cao tới Supabase (~3s/round-trip, health đo được) nên load
toàn bộ Candidate trong 1 request dễ vượt timeout, kể cả sau khi đã light (1.3MB)
và chạy song song query phụ. Endpoint `candidate-metadata` tách metadata ra vẫn
không giải quyết được việc tải rows nặng.

## Giải pháp — KHÔNG đổi logic nghiệp vụ

Chuyển Planning Board sang **tải phân đoạn (progressive)** dùng **đúng đường pagination
legacy đã có sẵn** trong `loadPlanningCandidates`/route candidates (cùng SQL, cùng
resolver, cùng thứ tự ORDER BY ổn định v289):

- Client gọi `pageSize=200&page=1` → **board render ngay 200 dòng đầu** khi request
  đầu xong (request nhỏ, không timeout).
- Đọc `pagination.totalCandidates` → tải tiếp các trang 2..N với `knownTotal`
  (server bỏ qua count query — vốn đã cache 30s) → nối rows, cập nhật dần.
- Nếu trang sau lỗi: giữ nguyên rows đã hiển thị + notice "Tải tiếp bị lỗi… Thử lại".
- UI: notice "Đang tải tiếp Jobs… đã hiển thị X dòng".

Đo thật (643 candidates, light): page1 ~4.6s (gồm count) → 200 dòng; pages 2–4 tổng
~1.3s; 643 dòng, 0 trùng.

## Files

- `src/components/planning-candidate-shell.tsx` (+`loadingMore`, `loadSourceData` gọi
  sau khi tải đủ rows).
- Giữ nguyên: light mode, timeout 60s, self-diagnostic, latency probe, export
  `loadPlanningCandidateMetadata` (v327).

## Rollback

Chỉ đổi client Planning Board. Không đổi server SQL, không migration. Quay về
`pageSize=all` trong shell là về v327.
