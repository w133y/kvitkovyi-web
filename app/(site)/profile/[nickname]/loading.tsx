// Shown instantly while the page below fetches profile/skin/achievement
// data (several DB round trips — see page.tsx) instead of leaving the
// visitor looking at a blank/frozen page during that gap.
export default function Loading() {
  return (
    <div className="profile-layout">
      <div
        className="profile-nick-badge skeleton-pulse"
        style={{ width: 140, height: 24 }}
        aria-hidden="true"
      />
      <div
        className="profile-skin-card skeleton-pulse"
        style={{ height: 300 }}
        aria-hidden="true"
      />
      <div
        className="profile-bio skeleton-pulse"
        style={{ minHeight: 56 }}
        aria-hidden="true"
      />
      <div className="profile-stats-card skeleton-pulse" aria-hidden="true" />
    </div>
  );
}
