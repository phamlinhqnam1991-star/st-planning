import type { ReactNode } from "react";

type Props = {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
};

export function ErpSection({ title, description, actions, children, flush = false, className = "" }: Props) {
  return (
    <section className={`erpkit-section ${flush ? "erpkit-section-flush" : ""} ${className}`.trim()}>
      {title || description || actions ? (
        <div className="erpkit-section-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="erpkit-section-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? "erpkit-section-body-flush" : "erpkit-section-body"}>{children}</div>
    </section>
  );
}
