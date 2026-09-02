import type { ReactNode } from "react";
import type { ErpDensity } from "@/lib/erp/design-tokens";

export type ErpGridColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  width?: number | string;
  minWidth?: number | string;
  align?: "left" | "center" | "right";
  className?: string;
};

type Props<T> = {
  rows: T[];
  columns: ErpGridColumn<T>[];
  getRowKey: (row: T, index: number) => string | number;
  density?: ErpDensity;
  stickyHeader?: boolean;
  striped?: boolean;
  selectedRowKey?: string | number | null;
  emptyTitle?: string;
  emptyDescription?: string;
  footer?: ReactNode;
};

export function ErpDataGrid<T>({
  rows,
  columns,
  getRowKey,
  density = "compact",
  stickyHeader = true,
  striped = false,
  selectedRowKey,
  emptyTitle = "Không có dữ liệu",
  emptyDescription = "Thay đổi bộ lọc hoặc kiểm tra dữ liệu nguồn.",
  footer,
}: Props<T>) {
  return (
    <div className={`erpkit-grid erpkit-grid-${density} ${striped ? "is-striped" : ""}`}>
      <div className="erpkit-grid-scroll">
        <table>
          <thead className={stickyHeader ? "is-sticky" : ""}>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`${column.align ? `is-${column.align}` : ""} ${column.className ?? ""}`.trim()}
                  style={{ width: column.width, minWidth: column.minWidth }}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowKey = getRowKey(row, index);
              return (
                <tr key={rowKey} className={selectedRowKey === rowKey ? "is-selected" : ""}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`${column.align ? `is-${column.align}` : ""} ${column.className ?? ""}`.trim()}
                    >
                      {column.render(row, index)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="erpkit-grid-empty">
            <strong>{emptyTitle}</strong>
            <span>{emptyDescription}</span>
          </div>
        ) : null}
      </div>
      {footer ? <div className="erpkit-grid-footer">{footer}</div> : null}
    </div>
  );
}
