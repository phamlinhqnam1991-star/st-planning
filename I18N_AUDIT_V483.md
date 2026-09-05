# I18N Audit V483

## Result

- Catalog rows: 1,623
- EN → VI normalized conflicts: 0
- VI → EN normalized conflicts: 0
- Duplicate normalized rows: 0
- Risky grammar fragments left in phrase mode: 0
- Required canonical navigation/security terms: PASS
- Legacy mixed labels checked by the quality gate: PASS
- Catalog JSON parse: PASS

## Canonical terminology policy

Keep these production terms as identifiers where useful for cross-checking the real system: Job, Batch, Recipe, Main Operation, Operation Code, ST Group, Planning Board, All Open Jobs, Resource, Planner, Loading, Unloading, NDT, READY, WAIT, DONE and technical database/code identifiers.

Translate ordinary UI/prose terms into natural Vietnamese: Scheduling Board → Bảng điều độ; Process Time → Thời gian xử lý; Compatibility → tương thích; rule → quy tắc; condition → điều kiện; dependency → quan hệ phụ thuộc; flow → luồng; issue → vấn đề; handoff → bàn giao; runtime → đang chạy; reload → tải lại; database → cơ sở dữ liệu; Duration → Thời lượng; Start Time → thời gian bắt đầu.

## Source normalization

Current ERP navigation, Login and Users & Permissions are EN-first. The selected locale renders VI through the same catalog. Legacy labels such as `Board Điều Độ`, `Training người mới`, `Cảnh báo thay đổi SX`, `Điều chỉnh đầu ngày`, `Thời gian Process` and `Công thức & Rule` were removed from current TS/TSX UI source where they were UI labels.

## Future gate

Run:

```bash
npm run i18n:check
```

The check fails if a future change introduces duplicate/conflicting pairs, dangerous phrase fragments, required-term drift or selected obsolete mixed-language wording.
