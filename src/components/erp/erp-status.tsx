import { ERP_STATUS_CONFIG, type ErpStatusKey, type ErpStatusTone } from "@/lib/erp/status-config";

type Props = {
  status?: ErpStatusKey;
  label?: string;
  tone?: ErpStatusTone;
  dot?: boolean;
};

export function ErpStatus({ status, label, tone, dot = true }: Props) {
  const preset = status ? ERP_STATUS_CONFIG[status] : undefined;
  const resolvedLabel = label ?? preset?.label ?? "—";
  const resolvedTone = tone ?? preset?.tone ?? "neutral";
  return (
    <span className={`erpkit-status erpkit-status-${resolvedTone}`}>
      {dot ? <span className="erpkit-status-dot" aria-hidden="true" /> : null}
      {resolvedLabel}
    </span>
  );
}
