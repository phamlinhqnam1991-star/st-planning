# Planning AllOperation First-Main Fallback — v311

## Mục tiêu

Sửa trường hợp Job không match Manual/Auto Intermediate Bridge và cặp `LastLaborOp + NextOperation` cũng không xuất hiện trong `AllOperation`, trong khi `AllOperation` vẫn có Main Planning hợp lệ.

## Resolver

```text
LastLaborOp + NextOperation
  -> MANUAL Segment
  -> AUTO Segment
  -> AllOperation fallback
  -> NO CHAIN
```

AllOperation fallback giữ logic v310 khi có thể định vị pair/1 member. Bổ sung duy nhất:

- Nếu `LastLaborOp` không có trong AllOperation;
- và `NextOperation` không có trong AllOperation;
- nhưng canonical Planning route `full[]` có ít nhất một Main;
- thì chọn `full[0]` làm Current Main.

Current Main này không yêu cầu Previous Main (`requiredPreviousInstanceKey = null`), vì đây là Main đầu tiên của Planning route. Trạng thái live chain vì vậy là `ELIGIBLE` nếu chưa có Batch history. Candidate UI hiển thị `READY`.

## Ví dụ

```text
LastLaborOp   = INSMA
NextOperation = MSKG-PC
AllOperation  = CPBILP-A | PIONBL | TSAUNSLD | PPRSLVT | PTCSLVT | ...
```

Không Segment match và cả `INSMA`/`MSKG-PC` đều không có trong AllOperation:

```text
Current Main = CPBILP-A   READY
Next Main    = TSAUNSLD   WAIT PREV
Next Main    = PRIMER     WAIT PREV
...
```

## Không thay đổi

- Manual/Auto Bridge logic.
- Recipe/Batch/Schedule.
- Schedule history không dùng để định vị Current Main.
- Không có migration mới.
