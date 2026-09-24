import { assertPageAvailable } from "@/lib/page-access";

// Switchable from /admin ("Вкладки сайту") — 404 for regular visitors when off.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await assertPageAvailable("archive");
  return children;
}
