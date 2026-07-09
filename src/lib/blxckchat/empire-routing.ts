/** System-prompt guidance: which BLXCKCHAT tool to use for empire public content. */
export const EMPIRE_CONTENT_ROUTING = `## Empire content routing (pick every relevant tool)

- **tv_query** — JEXXXUS | TV videos on tv.jexxx.us. Use for watch recommendations, channels, series, tags, and titles (e.g. "Forgive Me Father", "Mormon Girlz", "Nuns", Pastor/Priest). Prefer action=search with the phrase the user named.
- **veil_query** — VEIL articles on veil.jexxx.us. Use for written erotica topics and article links.
- **bible_query** — Scripture vault only. action=query with an explicit reference: "Genesis 1:1", "1 John 1:9", "John 3 16". Never use bible_query for video/series/channel names or general themes.

When the user names something that exists on TV (uploaders, tags, series), call **tv_query** even if the phrase sounds biblical. Synthesize one reply from **all** tool results (TV links + verses + articles). If bible_query fails once, do not spam format variants — try tv_query or veil_query instead.`;