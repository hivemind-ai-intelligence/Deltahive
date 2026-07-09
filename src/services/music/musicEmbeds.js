import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { createEmbed } from "../../utils/embeds.js";
import { getPaginationRow } from "../../utils/components.js";

const QUEUE_PAGE_SIZE = 10;

export const MUSIC_BUTTON_IDS = {
  PAUSE: "music_pause",
  RESUME: "music_resume",
  SKIP: "music_skip",
  STOP: "music_stop",
  SHUFFLE: "music_shuffle",
  LOOP: "music_loop",
  VOL_DOWN: "music_vol_down",
  VOL_UP: "music_vol_up",
  QUEUE: "music_queue",
  QUEUE_FIRST: "music_queue_first",
  QUEUE_PREV: "music_queue_prev",
  QUEUE_NEXT: "music_queue_next",
  QUEUE_LAST: "music_queue_last",
};

export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) {
    return "Live";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getTrackArtwork(track) {
  return track?.info?.artworkUrl || track?.info?.thumbnail || null;
}

function getLoopLabel(loop) {
  switch (loop) {
    case "track":
      return "Track";
    case "queue":
      return "Queue";
    default:
      return "Off";
  }
}

// Lamba artist name chota karo
function truncateArtist(artist, max = 38) {
  if (!artist) return "Unknown";
  return artist.length > max ? artist.slice(0, max - 1) + "..." : artist;
}

// Naya progress bar: knob-style playhead, filled/empty blocks
function buildProgressBar(positionMs, durationMs, barLength = 18) {
  if (!durationMs || durationMs <= 0) {
    return "\u25B0".repeat(barLength);
  }
  const progress = Math.min(positionMs / durationMs, 1);
  const knobIndex = Math.min(
    barLength - 1,
    Math.round(barLength * progress),
  );
  let bar = "";
  for (let i = 0; i < barLength; i++) {
    if (i === knobIndex) {
      bar += "\u25C9"; // knob (fisheye)
    } else if (i < knobIndex) {
      bar += "\u25B0"; // filled block
    } else {
      bar += "\u2500"; // thin empty line
    }
  }
  return bar;
}

// LRCLIB se synced lyrics try karo, nahi mila toh lyrics.ovh se plain lyrics lo
export async function fetchLyrics(title, artist, durationMs) {
  // Step 1: LRCLIB (synced + plain, timestamps ke saath)
  try {
    const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}&duration=${Math.floor(durationMs / 1000)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.syncedLyrics) {
        const lines = data.syncedLyrics
          .split("\n")
          .map((line) => {
            const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
            if (!m) return null;
            return {
              time: (parseInt(m[1]) * 60 + parseFloat(m[2])) * 1000,
              text: m[3].trim(),
            };
          })
          .filter((l) => l && l.text);
        if (lines.length) return { type: "synced", lines };
      }
      // Plain lyrics bhi try karo LRCLIB se (synced nahi mila to)
      if (data.plainLyrics) {
        const lines = data.plainLyrics.split("\n").filter((l) => l.trim());
        if (lines.length) return { type: "plain", lines };
      }
    }
  } catch {
    /* timeout ya error */
  }

  // Step 2: lyrics.ovh fallback (Hindi/Bollywood ke liye)
  try {
    const cleanArtist = artist.split(/[,&]/)[0].trim();
    const url = `https://lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(title)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.lyrics) {
        const lines = data.lyrics.split("\n").filter((l) => l.trim());
        if (lines.length) return { type: "plain", lines };
      }
    }
  } catch {
    /* nahi mila */
  }

  return null;
}

export function getCurrentLyricLine(lyrics, positionMs, durationMs) {
  if (!lyrics) return null;

  if (lyrics.type === "synced") {
    let current = null;
    for (const line of lyrics.lines) {
      if (line.time <= positionMs) current = line.text;
      else break;
    }
    return current;
  }

  if (lyrics.type === "plain" && lyrics.lines.length) {
    const ratio = durationMs > 0 ? Math.min(positionMs / durationMs, 0.99) : 0;
    const idx = Math.floor(ratio * lyrics.lines.length);
    return lyrics.lines[idx] || null;
  }

  return null;
}

export function buildNowPlayingEmbed(track, player, guildData) {
  const requester = track?.info?.requester;
  const requesterLabel = requester
    ? requester.username || requester.tag || "Unknown"
    : "Unknown";

  const positionMs = player?.position || 0;
  const durationMs = track?.info?.length || 0;
  const position = formatDuration(positionMs);
  const duration = formatDuration(durationMs);
  const progressBar = buildProgressBar(positionMs, durationMs);
  const paused = Boolean(player?.paused);
  const statusLabel = paused ? "Paused" : "Playing";
  const loopLabel = getLoopLabel(guildData?.loop);
  const volume = guildData?.volume ?? 75;
  const queueCount = player?.queue?.length || 0;

  const artistDisplay = truncateArtist(track?.info?.author);
  const currentLyric = getCurrentLyricLine(
    guildData?.lyrics,
    positionMs,
    durationMs,
  );

  const description = [
    `\u25BA  **${track?.info?.title || "Unknown track"}**`,
    `\u25C7  *${artistDisplay}*`,
    "",
    ...(currentLyric ? [`\u2756 *${currentLyric}*`, ""] : []),
    `${progressBar}`,
    `\`${position}\`  /  \`${duration}\``,
  ].join("\n");

  return createEmbed({
    title: "\u2756 Now Playing \u2756",
    description,
    color: "primary",
    thumbnail: getTrackArtwork(track),
    image: getTrackArtwork(track),
    fields: [
      { name: "Status", value: statusLabel, inline: true },
      { name: "Volume", value: `${volume}%`, inline: true },
      { name: "Loop", value: loopLabel, inline: true },
      { name: "Queue", value: `${queueCount} track${queueCount === 1 ? "" : "s"}`, inline: true },
      { name: "Requested by", value: requesterLabel, inline: true },
    ],
    footer: "Deltahive Music",
  });
}

export function buildQueueEmbed(queue, currentTrack, page = 0) {
  const totalTracks = queue?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalTracks / QUEUE_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * QUEUE_PAGE_SIZE;
  const slice = queue?.slice(start, start + QUEUE_PAGE_SIZE) || [];

  let description = "";
  if (currentTrack) {
    description += `**Now Playing**\n> ${currentTrack.info?.title || "Unknown"} \u2014 ${currentTrack.info?.author || "Unknown"}\n\n`;
  }

  if (slice.length === 0) {
    description += "The queue is empty.";
  } else {
    description += slice
      .map((track, index) => {
        const num = start + index + 1;
        return `\`${String(num).padStart(2, "0")}\` ${track.info?.title || "Unknown"} \u2014 *${track.info?.author || "Unknown"}*`;
      })
      .join("\n");
  }

  return createEmbed({
    title: "Music Queue",
    description: description.substring(0, 4096),
    color: "info",
    footer: `Page ${safePage + 1} of ${totalPages} \u2014 ${totalTracks} queued`,
  });
}

export function buildPlayerButtonRows(player, guildData) {
  const paused = player?.paused;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(paused ? MUSIC_BUTTON_IDS.RESUME : MUSIC_BUTTON_IDS.PAUSE)
      .setLabel(paused ? "Resume" : "Pause")
      .setStyle(ButtonStyle.Primary)
      .setEmoji(paused ? "\u25B6\uFE0F" : "\u23F8\uFE0F"),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.SKIP)
      .setLabel("Skip")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("\u23ED\uFE0F"),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.STOP)
      .setLabel("Stop")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("\u23F9\uFE0F"),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.SHUFFLE)
      .setLabel("Shuffle")
      .setStyle(guildData?.shuffle ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji("\uD83D\uDD00"),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.LOOP)
      .setLabel(`Loop: ${getLoopLabel(guildData?.loop)}`)
      .setStyle(
        guildData?.loop && guildData.loop !== "none"
          ? ButtonStyle.Success
          : ButtonStyle.Secondary,
      )
      .setEmoji("\uD83D\uDD01"),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.QUEUE)
      .setLabel("Queue")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("\uD83D\uDCC3"),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.VOL_DOWN)
      .setLabel("Volume Down")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("\uD83D\uDD09"),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.VOL_UP)
      .setLabel("Volume Up")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("\uD83D\uDD0A"),
  );

  return [row1, row2, row3];
}

export function buildQueuePaginationRow(page, totalPages) {
  return getPaginationRow("music_queue", page + 1, totalPages);
}

export function getQueuePageSize() {
  return QUEUE_PAGE_SIZE;
}

// ═══════════════════════════════════════════════════════════════
//  LYRICS EMBEDS — Naye functions, existing code untouched
// ═══════════════════════════════════════════════════════════════

/**
 * buildLyricsLoadingEmbed — song shuru hone pe turant dikhta hai
 * ("Dhoondh rahi hoon..." wala placeholder)
 */
export function buildLyricsLoadingEmbed(track) {
  const rawTitle  = track?.info?.title  || "Unknown Track";
  const rawArtist = track?.info?.author || "Unknown Artist";
  const title  = rawTitle.length  > 55 ? rawTitle.slice(0, 54)  + "\u2026" : rawTitle;
  const artist = rawArtist.length > 45 ? rawArtist.slice(0, 44) + "\u2026" : rawArtist;
  const divider = "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500";

  const description = [
    `\uD83C\uDFB5  **${title}**`,
    `\uD83D\uDC64  *${artist}*`,
    "",
    divider,
    "",
    "\u23F3  *Lyrics dhoondh rahi hoon...*",
    "",
    divider,
    "\uD83C\uDF99\uFE0F  `-- : --`  \u00B7  \uD83D\uDD0D Searching",
  ].join("\n");

  return new EmbedBuilder()
    .setDescription(description)
    .setColor(0x9B59B6)
    .setFooter({ text: "Deltahive Music \u00B7 Lyrics" });
}

/**
 * buildLyricsEmbed — real-time lyrics card
 * Synced: prev line (struck) → current (bold + mic emoji) → next 2 lines
 * Plain:  estimated window of 5 lines around current position
 * None:   "not found" message
 */
export function buildLyricsEmbed(lyrics, positionMs, durationMs, track) {
  const rawTitle  = track?.info?.title  || "Unknown Track";
  const rawArtist = track?.info?.author || "Unknown Artist";
  const title  = rawTitle.length  > 55 ? rawTitle.slice(0, 54)  + "\u2026" : rawTitle;
  const artist = rawArtist.length > 45 ? rawArtist.slice(0, 44) + "\u2026" : rawArtist;

  const posStr  = formatDuration(positionMs);
  const durStr  = formatDuration(durationMs);
  const divider = "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500";

  let lyricsBlock = "";
  let typeTag     = "";
  let color       = 0x7F8C8D;

  if (!lyrics) {
    lyricsBlock = [
      "```",
      "  No lyrics found for this track.",
      "  Try searching by song name!",
      "```",
    ].join("\n");
    typeTag = "\uD83D\uDD07 Not Found";
    color   = 0x7F8C8D;

  } else if (lyrics.type === "synced") {
    color   = 0x9B59B6;
    typeTag = "\u2728 Synced";

    let currentIdx = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].time <= positionMs) currentIdx = i;
      else break;
    }

    const parts = [];
    if (currentIdx === -1) {
      parts.push("*\u266A  Intro...*");
      parts.push("");
      lyrics.lines.slice(0, 3).forEach((l) => parts.push(`> ${l.text}`));
    } else {
      const prev  = lyrics.lines[currentIdx - 1]?.text ?? null;
      const cur   = lyrics.lines[currentIdx].text         || "\u266A";
      const next1 = lyrics.lines[currentIdx + 1]?.text   ?? null;
      const next2 = lyrics.lines[currentIdx + 2]?.text   ?? null;

      if (prev)  { parts.push(`> ~~${prev}~~`); parts.push(""); }
      parts.push(`\uD83C\uDF99\uFE0F  **${cur}**`);
      if (next1) { parts.push(""); parts.push(`> ${next1}`); }
      if (next2) { parts.push(`> ${next2}`); }
    }
    lyricsBlock = parts.join("\n");

  } else if (lyrics.type === "plain") {
    color   = 0x3498DB;
    typeTag = "\uD83D\uDCDD Estimated";

    const total  = lyrics.lines.length;
    const ratio  = durationMs > 0 ? Math.min(positionMs / durationMs, 0.99) : 0;
    const center = Math.floor(ratio * total);
    const start  = Math.max(0, center - 2);
    const end    = Math.min(total - 1, center + 3);

    const parts = [];
    for (let i = start; i <= end; i++) {
      const line = lyrics.lines[i] || "";
      if      (i < center)  parts.push(`> ~~${line}~~`);
      else if (i === center) parts.push(`\uD83C\uDF99\uFE0F  **${line}**`);
      else                   parts.push(`> ${line}`);
    }
    lyricsBlock = parts.join("\n");
  }

  const description = [
    `\uD83C\uDFB5  **${title}**`,
    `\uD83D\uDC64  *${artist}*`,
    "",
    divider,
    "",
    lyricsBlock,
    "",
    divider,
    `\uD83C\uDF99\uFE0F  \`${posStr} / ${durStr}\`  \u00B7  ${typeTag}`,
  ].join("\n");

  return new EmbedBuilder()
    .setDescription(description.slice(0, 4096))
    .setColor(color)
    .setFooter({ text: "Deltahive Music \u00B7 Lyrics" });
}