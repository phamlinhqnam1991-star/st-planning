"use client";

export type ErpPlanningMatrixMode = "compact" | "detail";

export type ErpPlanningMatrixStatus =
  | "READY"
  | "WAIT"
  | "BATCH"
  | "SCHEDULED"
  | "DONE"
  | "HOLD"
  | "NO_CHAIN";

export type ErpPlanningMatrixOperation = {
  key: string;
  label: string;
  shortLabel?: string;
  order: number;
};

export type ErpPlanningMatrixCell = {
  status: ErpPlanningMatrixStatus;
  rawOperation?: string;
  recipe?: string;
  batchNo?: string;
  previousBatch?: string;
  note?: string;
};

export type ErpPlanningMatrixRow = {
  id: string | number;
  job: string;
  part: string;
  revision: string;
  qty: number;
  surface?: number;
  priority?: string;
  cells: Record<string, ErpPlanningMatrixCell | undefined>;
};

export type ErpPlanningMatrixSelection = {
  rowId: string | number;
  operationKey: string;
};

type Props = {
  operations: ErpPlanningMatrixOperation[];
  rows: ErpPlanningMatrixRow[];
  mode?: ErpPlanningMatrixMode;
  selected?: ErpPlanningMatrixSelection | null;
  selectedBatchCells?: string[];
  onCellClick?: (row: ErpPlanningMatrixRow, operation: ErpPlanningMatrixOperation, cell: ErpPlanningMatrixCell) => void;
};

const STATUS_LABEL: Record<ErpPlanningMatrixStatus, string> = {
  READY: "READY",
  WAIT: "WAIT",
  BATCH: "BATCH",
  SCHEDULED: "SCHEDULED",
  DONE: "DONE",
  HOLD: "HOLD",
  NO_CHAIN: "NO CHAIN",
};

function cellKey(rowId: string | number, operationKey: string) {
  return `${rowId}::${operationKey}`;
}

export function ErpPlanningMatrix({
  operations,
  rows,
  mode = "compact",
  selected,
  selectedBatchCells = [],
  onCellClick,
}: Props) {
  const orderedOperations = [...operations].sort((a, b) => a.order - b.order);
  const batchSelection = new Set(selectedBatchCells);

  return (
    <div className={`erpkit-matrix erpkit-matrix-${mode}`}>
      <div className="erpkit-matrix-scroll">
        <table>
          <thead>
            <tr>
              <th className="erpkit-matrix-sticky erpkit-matrix-job-head">Job</th>
              <th className="erpkit-matrix-sticky erpkit-matrix-part-head">Part / Rev</th>
              <th className="erpkit-matrix-sticky erpkit-matrix-qty-head">Qty</th>
              <th className="erpkit-matrix-sticky erpkit-matrix-priority-head">Priority</th>
              {orderedOperations.map((operation) => (
                <th key={operation.key} className="erpkit-matrix-operation-head">
                  <span>{String(operation.order).padStart(2, "0")}</span>
                  <b>{operation.shortLabel ?? operation.label}</b>
                  <small>{operation.label}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="erpkit-matrix-sticky erpkit-matrix-job-cell">
                  <b>{row.job}</b>
                  {mode === "detail" && typeof row.surface === "number" ? <small>{row.surface.toLocaleString()} dm²</small> : null}
                </td>
                <td className="erpkit-matrix-sticky erpkit-matrix-part-cell">
                  <b>{row.part}</b>
                  <small>Rev {row.revision}</small>
                </td>
                <td className="erpkit-matrix-sticky erpkit-matrix-qty-cell">{row.qty}</td>
                <td className="erpkit-matrix-sticky erpkit-matrix-priority-cell">
                  <span className="erpkit-priority">{row.priority ?? "normal"}</span>
                </td>
                {orderedOperations.map((operation) => {
                  const cell = row.cells[operation.key];
                  if (!cell) {
                    return <td key={operation.key} className="erpkit-matrix-cell is-empty"><span>—</span></td>;
                  }

                  const isSelected = selected?.rowId === row.id && selected.operationKey === operation.key;
                  const isBatchSelected = batchSelection.has(cellKey(row.id, operation.key));
                  const className = [
                    "erpkit-matrix-cell",
                    `is-${cell.status.toLowerCase().replace("_", "-")}`,
                    isSelected ? "is-selected" : "",
                    isBatchSelected ? "is-batch-selected" : "",
                  ].filter(Boolean).join(" ");

                  return (
                    <td key={operation.key} className={className}>
                      <button type="button" onClick={() => onCellClick?.(row, operation, cell)}>
                        <span className="erpkit-matrix-status">{STATUS_LABEL[cell.status]}</span>
                        {mode === "detail" ? (
                          <span className="erpkit-matrix-cell-detail">
                            {cell.rawOperation ? <b>{cell.rawOperation}</b> : null}
                            {cell.recipe ? <small>{cell.recipe}</small> : null}
                            {cell.batchNo ? <em>{cell.batchNo}</em> : cell.previousBatch ? <em>Prev: {cell.previousBatch}</em> : null}
                          </span>
                        ) : (
                          <span className="erpkit-matrix-cell-compact">
                            {cell.batchNo ? <b>{cell.batchNo}</b> : cell.rawOperation ? <b>{cell.rawOperation}</b> : null}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="erpkit-matrix-footer">
        <span>Columns follow Main Planning Order</span>
        <span>{rows.length} jobs · {orderedOperations.length} Main Operations</span>
      </div>
    </div>
  );
}
