# Build fix — stale source files khi cập nhật bằng cách copy đè

## Nguyên nhân

Bản deep-clean đã xóa nhiều file legacy khỏi source chuẩn. Nếu chỉ giải nén/copy đè lên repo cũ, Windows **không tự xóa** các file đã biến mất trong bản mới. TypeScript vẫn quét `**/*.ts` và `**/*.tsx`, vì vậy file orphan cũ vẫn có thể làm `next build` lỗi dù bản clean không còn dùng chúng.

Lỗi đã gặp:

- `src/components/missing-jobs-panel.tsx` import `@/lib/planning/missing-config-jobs`
- `src/components/missing-operations-manager.tsx` import `@/lib/planning/missing-config-jobs`

Cả 2 component và `missing-config-jobs.ts` đều là orphan trong flow hiện tại, nên phải xóa đồng bộ thay vì khôi phục fallback legacy.

## Cách dùng trên Windows

Từ thư mục project:

```bat
npm run clean:stale
npm run build
```

Hoặc chạy trực tiếp:

```bat
remove-stale-legacy.cmd
npm run build
```

Script dùng **manifest 39 source file legacy** đã được loại khỏi bản chuẩn và đồng thời xóa `.next` + `tsconfig.tsbuildinfo` để tránh cache cũ.

Script **không xóa `.env.local`**.

## Cách an toàn nhất khi thay toàn bộ source

Nếu không có chỉnh sửa local chưa merge trong `src`, có thể xóa thư mục `src` cũ rồi copy nguyên thư mục `src` từ ZIP mới vào. Cách này đảm bảo không còn file orphan từ các version trước.
