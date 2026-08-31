# Findings

- Code source là v277, giải nén tại `/home/user/.workspace/project-review/app`.
- `requireUser()` đã có tại `src/lib/auth.ts`, nhưng các route Planning/Schedule chưa gọi.
- `safeJson`, parser tương thích selection_rule cũ/mới, ISO start time và `visibleOpsQ as any` đã tồn tại ở nhiều khu vực; nhiệm vụ là rà soát và tạo guard/contract để lỗi không tái diễn.
- User yêu cầu sửa tất cả pitfall trong screenshot, trừ timeout/chia nhỏ Rebuild Chain.
