import type { ReactNode } from "react";

export default function StatBox({
  icon,
  label,
  value,
}: {
  icon: string | ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="stat-box" title={label} aria-label={label}>
      {typeof icon === "string" ? <i className={icon}></i> : icon}
      <div className="stat-value">{value}</div>
    </div>
  );
}
