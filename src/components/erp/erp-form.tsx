import type { ReactNode } from "react";

export function ErpFormGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 | 4 }) {
  return <div className={`erpkit-form-grid erpkit-form-grid-${columns}`}>{children}</div>;
}

export function ErpField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className={`erpkit-field ${error ? "has-error" : ""}`}>
      <span className="erpkit-field-label">
        {label}{required ? <b aria-label="Bắt buộc">*</b> : null}
      </span>
      {children}
      {error ? <span className="erpkit-field-error">{error}</span> : hint ? <span className="erpkit-field-hint">{hint}</span> : null}
    </label>
  );
}
