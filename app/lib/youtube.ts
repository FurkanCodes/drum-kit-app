export interface ParsedYouTubeLink {
  videoId: string;
  startSeconds: number;
}

function parseTimeToSeconds(value: string): number {
  const v = value.trim();
  if (!v) return 0;

  if (/^\d+$/.test(v)) return Math.max(0, parseInt(v, 10) || 0);

  // Supports: 1h2m3s, 2m10s, 45s, 1h, 90 (handled above)
  const re = /(\d+)(h|m|s)/g;
  let match: RegExpExecArray | null;
  let seconds = 0;

  while ((match = re.exec(v)) !== null) {
    const amount = parseInt(match[1], 10) || 0;
    const unit = match[2];
    if (unit === 'h') seconds += amount * 3600;
    if (unit === 'm') seconds += amount * 60;
    if (unit === 's') seconds += amount;
  }

  return Math.max(0, seconds);
}

function getStartSeconds(url: URL): number {
  const fromSearch =
    url.searchParams.get('t') ??
    url.searchParams.get('start') ??
    url.searchParams.get('time_continue');
  if (fromSearch) return parseTimeToSeconds(fromSearch);

  const hash = url.hash.replace(/^#/, '');
  if (!hash) return 0;

  const hashParams = new URLSearchParams(hash);
  const fromHash = hashParams.get('t') ?? hashParams.get('start');
  if (fromHash) return parseTimeToSeconds(fromHash);

  // Some links use "#t=1m30s" without being a query string
  const direct = hash.match(/^t=(.+)$/i)?.[1];
  if (direct) return parseTimeToSeconds(direct);

  return 0;
}

export function parseYouTubeLink(input: string): ParsedYouTubeLink | null {
  const raw = input.trim();
  if (!raw) return null;

  // Accept direct video id
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) {
    return { videoId: raw, startSeconds: 0 };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Try adding scheme for "youtube.com/..." inputs
    try {
      url = new URL(`https://${raw}`);
    } catch {
      return null;
    }
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const startSeconds = getStartSeconds(url);

  // youtu.be/<id>
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return { videoId: id, startSeconds };
    return null;
  }

  const isYouTubeHost =
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'music.youtube.com';

  if (!isYouTubeHost) return null;

  // youtube.com/watch?v=<id>
  const v = url.searchParams.get('v');
  if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return { videoId: v, startSeconds };

  // youtube.com/shorts/<id> or /embed/<id> or /live/<id>
  const parts = url.pathname.split('/').filter(Boolean);
  const markers = new Set(['shorts', 'embed', 'live']);
  if (parts.length >= 2 && markers.has(parts[0])) {
    const id = parts[1];
    if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return { videoId: id, startSeconds };
  }

  return null;
}

export function getYouTubeEmbedUrl(videoId: string, startSeconds: number): string {
  const start = Math.max(0, Math.floor(startSeconds || 0));
  const params = new URLSearchParams({
    autoplay: '0',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  if (start > 0) params.set('start', String(start));

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}
