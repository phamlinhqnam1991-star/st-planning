# Planning ERP migration — dual route

## Routes

- `/planning` — ERP version mới. Dùng cùng `PlanningCandidateShell`, `PlanningBoardClient`, API Planning, Route Matrix, Recipe, Batch Compatibility và Batch mutation hiện tại.
- `/planning/batches` — ERP list của Planning Batches.
- `/planning/batches/[id]` — ERP shell của Batch Detail; `BatchDetailManager` và logic cũ được giữ nguyên.
- `/planning-old` — baseline UI cũ để đối chiếu.
- `/planning-old/batches` — baseline Planning Batches cũ.
- `/planning-old/batches/[id]` — baseline Batch Detail cũ.

## Nguyên tắc migration

1. Không fork business logic giữa ERP và baseline.
2. Không đổi Planning API, Candidate resolver, Route Matrix, Recipe proposal, Batch Compatibility hoặc Batch create/add logic chỉ để đổi UI.
3. Query scope `area`, `op`, `recipe`, `prevBatch` được giữ khi chuyển giữa ERP và baseline hoặc giữa Matrix và Recent Batches.
4. `/planning` là canonical route; Login/App navigation tiếp tục đi vào `/planning`.
5. `/planning-old` chỉ dùng để regression/đối chiếu. Khi ERP được chốt mới xóa route baseline.
