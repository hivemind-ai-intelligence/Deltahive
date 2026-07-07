import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPaginationRow } from '../../utils/components.js';

const QUEUE_PAGE_SIZE = 10;

export const MUSIC_BUTTON_IDS = {
    PAUSE: 'music_pause',
    RESUME: 'music_resume',
    SKIP: 'music_skip',
    STOP: 'music_stop',
    SHUFFLE: 'music_shuffle',
    LOOP: 'music_loop',
    VOL_DOWN: 'music_vol_down',
    VOL_UP: 'music_vol_up',
    QUEUE: 'music_queue',
    QUEUE_FIRST: 'music_queue_first',
    QUEUE_PREV: 'music_queue_prev',
    QUEUE_NEXT: 'music_queue_next',
    QUEUE_LAST: 'music_queue_last',
};

export function formatDuration(ms) {
    if (ms == null || Number.isNaN(ms)) {
        return 'Live';
    }
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getTrackArtwork(track) {
    return track?.info?.artworkUrl || track?.info?.thumbnail || null;
}

function getLoopLabel(loop) {
    switch (loop) {
        case 'track':
            return 'Track';
        case 'queue':
            return 'Queue';
        default:
            return 'Off';
    }
}

function buildProgressBar(positionMs, durationMs, barLength = 20) {
    if (!durationMs || durationMs <= 0) return '─'.repeat(barLength);
    const progress = Math.min(positionMs / durationMs, 1);
    const filled = Math.round(barLength * progress);
    const empty = barLength - filled;
    return '━'.repeat(filled) + '─'.repeat(empty);
}

// LRCLIB se synced lyrics try karo, nahi mila toh lyrics.ovh se plain lyrics lo
export async function fetchLyrics(title, artist, durationMs) {
    // Step 1: LRCLIB (synced, timestamps ke saath)
    try {
        const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}&duration=${Math.floor(durationMs / 1000)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
            const data = await res.json();
            if (data.syncedLyrics) {
                const lines = data.syncedLyrics.split('\n')
                    .map(line => {
                        const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
                        if (!m) return null;
                        return { time: (parseInt(m[1]) * 60 + parseFloat(m[2])) * 1000, text: m[3].trim() };
                    })
                    .filter(l => l && l.text);
                if (lines.length) return { type: 'synced', lines };
            }
        }
    } catch { /* timeout ya error, agla try karo */ }

    // Step 2: lyrics.ovh fallback (Hindi/Bollywood ke liye)
    try {
        const cleanArtist = artist.split(/[,&]/)[0].trim(); // pehla artist lo
        const url = `https://lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(title)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
            const data = await res.json();
            if (data.lyrics) {
                const lines = data.lyrics.split('\n').filter(l => l.trim());
                if (lines.length) return { type: 'plain', lines };
            }
        }
    } catch { /* nahi mila */ }

    return null;
}

export function getCurrentLyricLine(lyrics, positionMs, durationMs) {
    if (!lyrics) return null;

    // Synced: exact timestamp se line dhundho
    if (lyrics.type === 'synced') {
        let current = null;
        for (const line of lyrics.lines) {
            if (line.time <= positionMs) current = line.text;
            else break;
        }
        return current;
    }

    // Plain: song ka ratio use karke approximate line dikhao
    if (lyrics.type === 'plain' && lyrics.lines.length) {
        const ratio = durationMs > 0 ? Math.min(positionMs / durationMs, 0.99) : 0;
        const idx = Math.floor(ratio * lyrics.lines.length);
        return lyrics.lines[idx] || null;
    }

    return null;
}

export function buildNowPlayingEmbed(track, player, guildData) {
    const requester = track?.info?.requester;
    const requesterLabel = requester
        ? (requester.username || requester.tag || 'Unknown')
        : 'Unknown';

    const positionMs = player?.position || 0;
    const durationMs = track?.info?.length || 0;
    const position = formatDuration(positionMs);
    const duration = formatDuration(durationMs);
    const progressBar = buildProgressBar(positionMs, durationMs);
    const status = player?.paused ? 'PAUSED' : 'PLAYING';
    const loopLabel = getLoopLabel(guildData?.loop);
    const volume = guildData?.volume ?? 75;
    const queueCount = player?.queue?.length || 0;

    const currentLyric = getCurrentLyricLine(guildData?.lyrics, positionMs, durationMs);

    const description = [
        `**${track?.info?.title || 'Unknown track'}**`,
        `> *${track?.info?.author || 'Unknown'}*`,
        ``,
        ...(currentLyric ? [`*${currentLyric}*`, ``] : []),
        `${progressBar}`,
        `\`${position}\` ─────────────── \`${duration}\``,
        ``,
        `**Requester** : ${requesterLabel}`,
        `**Status**    : ${status}  |  **Loop** : ${loopLabel}`,
        `**Volume**    : ${volume}%  |  **Queue** : ${queueCount} track(s)`,
    ].join('\n');

    return createEmbed({
        title: 'Now Playing',
        description,
        color: 'primary',
        thumbnail: getTrackArtwork(track),
    });
}

export function buildQueueEmbed(queue, currentTrack, page = 0) {
    const totalTracks = queue?.length || 0;
    const totalPages = Math.max(1, Math.ceil(totalTracks / QUEUE_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = safePage * QUEUE_PAGE_SIZE;
    const slice = queue?.slice(start, start + QUEUE_PAGE_SIZE) || [];

    let description = '';
    if (currentTrack) {
        description += `**Now Playing**\n> ${currentTrack.info?.title || 'Unknown'} — ${currentTrack.info?.author || 'Unknown'}\n\n`;
    }

    if (slice.length === 0) {
        description += 'The queue is empty.';
    } else {
        description += slice
            .map((track, index) => {
                const num = start + index + 1;
                return `\`${String(num).padStart(2, '0')}\` ${track.info?.title || 'Unknown'} — *${track.info?.author || 'Unknown'}*`;
            })
            .join('\n');
    }

    return createEmbed({
        title: 'Music Queue',
        description: description.substring(0, 4096),
        color: 'info',
        footer: `Page ${safePage + 1} of ${totalPages} — ${totalTracks} queued`,
    });
}

export function buildPlayerButtonRows(player, guildData) {
    const paused = player?.paused;
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.PAUSE)
            .setLabel('Pause')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⏸️')
            .setDisabled(Boolean(paused)),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.RESUME)
            .setLabel('Resume')
            .setStyle(ButtonStyle.Success)
            .setEmoji('▶️')
            .setDisabled(!paused),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SKIP)
            .setLabel('Skip')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏭️'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.STOP)
            .setLabel('Stop')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⏹️'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SHUFFLE)
            .setLabel('Shuffle')
            .setStyle(guildData?.shuffle ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji('🔀'),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.LOOP)
            .setLabel(`Loop: ${getLoopLabel(guildData?.loop)}`)
            .setStyle(guildData?.loop && guildData.loop !== 'none' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji('🔁'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.VOL_DOWN)
            .setLabel('Vol -')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔉'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.VOL_UP)
            .setLabel('Vol +')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔊'),
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.QUEUE)
            .setLabel('Queue')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋'),
    );

    return [row1, row2];
}

export function buildQueuePaginationRow(page, totalPages) {
    return getPaginationRow('music_queue', page + 1, totalPages);
}

export function getQueuePageSize() {
    return QUEUE_PAGE_SIZE;
}
