import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
};

export function ErpPageHeader({ eyebrow, title, description, status, actions }: Props) {
  return (
    <header className="erpkit-page-header">
      <div className="erpkit-page-title-wrap">
        {eyebrow ? <div className="erpkit-eyebrow">{eyebrow}</div> : null}
        <div className="erpkit-page-title-line">
          <h1>{title}</h1>
          {status}
        </div>
        {description ? <div className="erpkit-page-description">{description}</div> : null}
      </div>
      {actions ? <div className="erpkit-page-actions">{actions}</div> : null}
    </header>
  );
}
