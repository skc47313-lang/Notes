/* Notes Bazar - YouTube transcript Worker (Cloudflare Workers, free plan is enough)
   Deploy: dash.cloudflare.com -> Workers & Pages -> Create -> Hello World -> Deploy -> Edit code ->
   paste this whole file -> Deploy. Copy the address (https://NAME.YOU.workers.dev) and paste it
   in yt.js at  var YT_API = '...'.
   GET /?v=VIDEO_ID&lang=hi   ->   { text, title, lang }   or   { error, code }                       */

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': '*' };
const out = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });

function decodeEnt(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/* pick the best caption track: wanted language (manual first), then English, then first one */
export function pickTrack(tracks, lang) {
  if (!tracks || !tracks.length) return null;
  const by = (l, manual) => tracks.find(t => (t.languageCode || '').toLowerCase().startsWith(l) && (manual === undefined || (t.kind === 'asr') === !manual));
  return by(lang, true) || by(lang) || by('en', true) || by('en') || tracks[0];
}

/* XML (<text start dur>..</text> or <p t d><s>..</s></p>) or json3 -> plain text */
export function captionText(body) {
  body = String(body || '');
  if (body.trim().startsWith('{')) {
    try { return (JSON.parse(body).events || []).map(e => (e.segs || []).map(s => s.utf8).join('')).join(' ').replace(/\s+/g, ' ').trim(); } catch (e) { /* fall through */ }
  }
  const parts = [];
  const re = /<(?:text|p)\b[^>]*>([\s\S]*?)<\/(?:text|p)>/g;
  let m;
  while ((m = re.exec(body))) parts.push(decodeEnt(m[1].replace(/<[^>]+>/g, '')));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

async function player(id) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip', 'X-YouTube-Client-Name': '3', 'X-YouTube-Client-Version': '19.09.37' },
    body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 34, hl: 'en', gl: 'US' } }, videoId: id, contentCheckOk: true, racyCheckOk: true })
  });
  if (!r.ok) throw Object.assign(new Error('YouTube said ' + r.status), { code: 'blocked' });
  return r.json();
}

export async function getTranscript(id, lang) {
  const j = await player(id);
  const ps = j.playabilityStatus || {};
  if (ps.status && ps.status !== 'OK') throw Object.assign(new Error(ps.reason || 'Video is not available.'), { code: 'unavailable' });
  const title = (j.videoDetails && j.videoDetails.title) || '';
  const tracks = j.captions && j.captions.playerCaptionsTracklistRenderer && j.captions.playerCaptionsTracklistRenderer.captionTracks;
  const t = pickTrack(tracks, lang);
  if (!t) throw Object.assign(new Error('This video has no captions.'), { code: 'nocaptions' });
  const r = await fetch(t.baseUrl.replace(/&fmt=[^&]*/, ''));
  const text = captionText(await r.text());
  if (!text) throw Object.assign(new Error('Captions were empty.'), { code: 'nocaptions' });
  return { text, title, lang: t.languageCode };
}

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const u = new URL(req.url);
    const id = u.searchParams.get('v') || '';
    if (!/^[\w-]{11}$/.test(id)) return out({ error: 'Bad video id.', code: 'badid' }, 400);
    try { return out(await getTranscript(id, (u.searchParams.get('lang') || 'en').toLowerCase())); }
    catch (e) { return out({ error: e.message || 'Failed', code: e.code || 'fail' }, e.code === 'nocaptions' ? 404 : 502); }
  }
};
