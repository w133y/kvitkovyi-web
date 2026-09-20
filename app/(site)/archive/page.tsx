import type { Metadata } from "next";
import Link from "next/link";
import { getChannelImagePosts, NEWSPAPER_CHANNEL_ID } from "@/lib/discord";
import ArchiveGrid from "@/components/archive/ArchiveGrid";

const INITIAL_COUNT = 15;

export const metadata: Metadata = {
  title: "Архів - Квітковий",
};

export default async function ArchivePage() {
  const { posts, nextBefore } = await getChannelImagePosts(NEWSPAPER_CHANNEL_ID, INITIAL_COUNT);

  return (
    <div className="gallery-page">
      <Link href="/" className="back-link back-link-floating">
        <i className="fa-solid fa-arrow-left"></i>
        Назад
      </Link>

      <div className="gallery-page-header">
        <h2>
          <b>Архів</b>
        </h2>
        <p>Випуски газети з Discord — {posts.length} шт.</p>
      </div>

      {posts.length === 0 ? (
        <p className="gallery-page-empty">Поки що немає випусків.</p>
      ) : (
        <ArchiveGrid initialPosts={posts} initialNextBefore={nextBefore} />
      )}
    </div>
  );
}
