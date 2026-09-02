import type { ReactNode } from "react";

type Props = {
  search?: ReactNode;
  filters?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  selection?: ReactNode;
};

export function ErpToolbar({ search, filters, left, right, selection }: Props) {
  return (
    <div className="erpkit-toolbar">
      <div className="erpkit-toolbar-left">
        {search}
        {filters}
        {left}
      </div>
      <div className="erpkit-toolbar-right">{selection}{right}</div>
    </div>
  );
}
