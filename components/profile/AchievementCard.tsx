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

// A 3:4 collectible-style card. Everything inside is sized in cqw (relative
// to the card's own width — .achievement-card is a size container), so the
// same markup reads the same at 90px (admin list), 180px (admin preview) and
// whatever the profile grid gives it.
//
// borderColor drives the whole accent (frame, ribbon, glow) via --ac-accent;
// background, when set, replaces the card face.

// Accent per preset category, used when the card has no explicit borderColor
// (anything else falls back to the default gold in CSS).
const CATEGORY_ACCENT: Record<string, string> = {
  Мер: "#3b6cff",
  Івент: "#38bdf8",
  Спонсор: "#9b5cff",
  Старожил: "#3ecf6e",
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
  const style = {} as CSSProperties & Record<`--${string}`, string>;
  const accent = borderColor || CATEGORY_ACCENT[category];
  if (accent) style["--ac-accent"] = accent;
  if (background) style["--ac-bg"] = background;

  return (
    <div className="achievement-card" style={style}>
      <div className="achievement-card-frame">
        <div className="achievement-card-face">
          <div className="achievement-card-category">{category}</div>
          <div className="achievement-card-art">
            <div className="achievement-card-icon">
              {iconType === "image" && icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt="" loading="lazy" />
              ) : (
                <span>{icon}</span>
              )}
            </div>
          </div>
          <div className="achievement-card-title">{title}</div>
          {subtitle && <div className="achievement-card-subtitle">{subtitle}</div>}
          <div className="achievement-card-footer">Квітковий</div>
        </div>
      </div>
    </div>
  );
}
