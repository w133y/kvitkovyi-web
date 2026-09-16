// Placeholder shown while UserMenu resolves its Minecraft-DB lookups
// (getDiscordLink, skin texture) — sized close to both SignInButton and
// UserMenuDropdown's pill so swapping in the real content doesn't shift
// the header layout.
export default function UserMenuSkeleton() {
  return <div className="user-menu-skeleton skeleton-pulse" aria-hidden="true" />;
}
