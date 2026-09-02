import type { ReactNode } from "react";

export function ErpEmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="erpkit-empty-state">
      <div className="erpkit-empty-icon" aria-hidden="true">□</div>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
