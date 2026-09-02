import type { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
};

export function ErpKpiCard({ label, value, helper, tone = "neutral" }: Props) {
  return (
    <div className={`erpkit-kpi erpkit-kpi-${tone}`}>
      <span className="erpkit-kpi-label">{label}</span>
      <strong className="erpkit-kpi-value">{value}</strong>
      {helper ? <span className="erpkit-kpi-helper">{helper}</span> : null}
    </div>
  );
}
