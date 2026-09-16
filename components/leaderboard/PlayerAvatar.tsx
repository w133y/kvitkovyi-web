import type { CSSProperties } from "react";

// Crops just the face (8x8px at 8,8) out of the player's raw skin texture via
// a scaled-up background-position — cheaper than a 3D render for a row icon,
// and avoids depending on crafatar (see lib/mojang-skin.ts for why).
//
// The actual size lives in the --avatar-size CSS var (consumed in
// globals.css via calc()) instead of a plain inline width/height, so a
// media query can still shrink it on small screens — an inline style
// can't be overridden that way, but a custom property's value can.
export default function PlayerAvatar({
  skinUrl,
  size,
}: {
  skinUrl: string;
  size?: number;
}) {
  return (
    <div
      className="leaderboard-avatar"
      style={
        {
          // Only set when explicitly requested — an inline style always
          // wins the cascade over any stylesheet rule (media queries
          // included), so leaving this unset when a caller wants the size
          // to come from CSS (e.g. to differ between breakpoints) is what
          // actually lets those stylesheet rules apply.
          ...(size !== undefined && { "--avatar-size": `${size}px` }),
          backgroundImage: `url(${skinUrl})`,
        } as CSSProperties
      }
    />
  );
}
