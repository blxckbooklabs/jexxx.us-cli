import type { SupabaseClient } from "@supabase/supabase-js";

import { listTvVideos } from "../tv.js";

export interface TvPlaylistRow {
  id: string;
  name: string;
  slug: string | null;
  authorUsername: string | null;
  isPrivate: boolean;
  videoCount: number;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface TvPlaylistSummary {
  playlistCount: number;
  savedVideoCount: number;
  playlists: TvPlaylistRow[];
}

interface PlaylistItemRow {
  id: string;
  video_id: string;
  order_index: number | null;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

async function buildVideoTitleLookup(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    for (const video of await listTvVideos()) {
      if (video.slug) map.set(video.slug, video.title);
    }
  } catch {
    // Public catalog may be unavailable offline — titles fall back to video_id.
  }
  return map;
}

let cachedTitleLookup: Promise<Map<string, string>> | null = null;

function videoTitleLookup(): Promise<Map<string, string>> {
  if (!cachedTitleLookup) {
    cachedTitleLookup = buildVideoTitleLookup();
  }
  return cachedTitleLookup;
}

export async function resolveVideoTitle(videoId: string): Promise<string> {
  const lookup = await videoTitleLookup();
  return lookup.get(videoId) ?? videoId;
}

export async function fetchTvPlaylistSummary(
  client: SupabaseClient,
  userId: string,
): Promise<TvPlaylistSummary> {
  const playlists = await fetchUserPlaylists(client, userId, { limit: 50 });
  const savedVideoCount = playlists.reduce((sum, p) => sum + p.videoCount, 0);
  return {
    playlistCount: playlists.length,
    savedVideoCount,
    playlists,
  };
}

export async function fetchUserPlaylists(
  client: SupabaseClient,
  userId: string,
  opts: { limit?: number } = {},
): Promise<TvPlaylistRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 50);

  const { data, error } = await client
    .from("playlists")
    .select("id, name, slug, author_username, is_private, thumbnail_url, created_at, items:playlist_items(video_id)")
    .eq("user_id", userId)
    .order("order_index", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch TV playlists: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const items = (row.items as Array<{ video_id: string }> | null) ?? [];
    return {
      id: row.id as string,
      name: row.name as string,
      slug: (row.slug as string | null) ?? null,
      authorUsername: (row.author_username as string | null) ?? null,
      isPrivate: Boolean(row.is_private),
      videoCount: items.length,
      thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
      createdAt: (row.created_at as string) ?? "",
    };
  });
}

export async function fetchPlaylistDetail(
  client: SupabaseClient,
  userId: string,
  playlistName: string,
  limit = 25,
): Promise<{ playlist: TvPlaylistRow; videos: Array<{ order: number; videoId: string; title: string }> } | null> {
  const playlists = await fetchUserPlaylists(client, userId, { limit: 50 });
  const needle = normalizeName(playlistName);
  const playlist =
    playlists.find((p) => normalizeName(p.name) === needle) ??
    playlists.find((p) => normalizeName(p.name).includes(needle));

  if (!playlist) {
    return null;
  }

  const { data, error } = await client
    .from("playlist_items")
    .select("id, video_id, order_index")
    .eq("playlist_id", playlist.id)
    .order("order_index", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error) {
    throw new Error(`Failed to fetch playlist items: ${error.message}`);
  }

  const lookup = await videoTitleLookup();
  const videos = ((data ?? []) as PlaylistItemRow[]).map((item, index) => ({
    order: item.order_index ?? index + 1,
    videoId: item.video_id,
    title: lookup.get(item.video_id) ?? item.video_id,
  }));

  return { playlist, videos };
}