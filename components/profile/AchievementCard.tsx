import type { CSSProperties } from "react";

export type AchievementCardData = {
  category: string;
  iconType: string;
  icon: string;
  title: string;
  subtitle?: string | null;
  borderColor?: string | null;
  background?: string | null;
};

export default function AchievementCard({
  category,
  iconType,
  icon,
  title,
  subtitle,
  borderColor,
  background,
}: AchievementCardData) {
  const style: CSSProperties = {};
  if (background) style.background = background;
  if (borderColor) style.border = `3px solid ${borderColor}`;

  return (
    <div className="achievement-card" style={style}>
      <div className="achievement-card-category">{category}</div>
      <div className="achievement-card-icon">
        {iconType === "image" && icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icon} alt="" loading="lazy" />
        ) : (
          <span>{icon}</span>
        )}
      </div>
      <div className="achievement-card-title">{title}</div>
      {subtitle && <div className="achievement-card-subtitle">{subtitle}</div>}
    </div>
  );
}
