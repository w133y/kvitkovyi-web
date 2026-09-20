"use server";

import { getChannelImagePosts, NEWSPAPER_CHANNEL_ID, type ChannelImagePostPage } from "@/lib/discord";

const LOAD_MORE_STEP = 10;

// The "Завантажити ще" button on /archive — the initial 15 come from the
// page's own server-side fetch, this just continues from wherever that
// (or a previous "load more") left off.
export async function loadMoreArchivePosts(before: string): Promise<ChannelImagePostPage> {
  return getChannelImagePosts(NEWSPAPER_CHANNEL_ID, LOAD_MORE_STEP, before);
}
