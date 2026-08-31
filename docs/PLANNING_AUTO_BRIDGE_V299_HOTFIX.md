# v299 — Auto Bridge Start Rebuild hotfix

## Lỗi

PostgreSQL báo `invalid input syntax for type integer: "RUNNING"` khi bắt đầu Auto Bridge rebuild.

## Nguyên nhân

SQL `md_intermediate_bridge_rebuild_run` khai báo tham số theo thứ tự:

`run_id, mode, status, total_routings, ...`

nhưng v298 truyền `routingCodes.length` vào vị trí `status` và `"RUNNING"` vào vị trí `total_routings`. PostgreSQL vì vậy cố ép `RUNNING` sang integer.

## Sửa

Tách biến có kiểu rõ ràng:

```ts
const status: BridgeRebuildStatus = routingCodes.length ? "RUNNING" : "READY_TO_FINALIZE";
const totalRoutings = routingCodes.length;
```

và truyền đúng thứ tự:

```ts
[runId, mode, status, totalRoutings, chunkSize, planningMainCodes, excludedOperationCodes, fingerprint]
```

Không thay đổi discovery, staging, resume, chunking hay finalize. Không có migration mới.
