import Link from "next/link";

type Item = {
  key: string;
  label: string;
  href: string;
  count?: number;
};

export function ErpTabs({ items, active }: { items: Item[]; active: string }) {
  return (
    <nav className="erpkit-tabs" aria-label="Page tabs">
      {items.map((item) => (
        <Link key={item.key} href={item.href} className={`erpkit-tab ${active === item.key ? "is-active" : ""}`}>
          <span>{item.label}</span>
          {typeof item.count === "number" ? <b>{item.count}</b> : null}
        </Link>
      ))}
    </nav>
  );
}
