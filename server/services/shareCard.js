// Link-preview image for a book (Open Graph / X summary_large_image, 1200x630):
// title, author and cast on the left, the cover on the right, in the site's
// ink-on-paper style. Text is drawn as vector paths (opentype.js) so the card
// renders the same on any server, with no system fonts required.
const path = require('path');
const sharp = require('sharp');
const opentype = require('opentype.js');

const W = 1200;
const H = 630;
const ASSETS = path.join(__dirname, '..', 'assets', 'share');
const C = { paper: '#FAF8F4', ink: '#1B1A17', muted: '#5E5A52', accent: '#A33A2B', surface: '#E6E0D4' };

const fonts = {
  display: opentype.loadSync(path.join(ASSETS, 'Literata-SemiBold.ttf')),
  italic: opentype.loadSync(path.join(ASSETS, 'Literata-Italic.ttf')),
  regular: opentype.loadSync(path.join(ASSETS, 'Literata-Regular.ttf')),
};

const LEFT = 72;
const TEXT_WIDTH = 610;
const COVER = { x: 790, y: 62, w: 338, h: 506 };

// Greedy word wrap; the last allowed line is ellipsised if text remains.
function wrap(font, text, size, width, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (font.getAdvanceWidth(next, size) <= width || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[i];
    if (lines.length === maxLines) {
      line = '';
      let last = lines.pop();
      while (last && font.getAdvanceWidth(`${last}…`, size) > width) last = last.replace(/\s*\S+$/, '');
      lines.push(`${last}…`);
      return { lines, truncated: true };
    }
  }
  if (line) lines.push(line);
  return { lines, truncated: false };
}

const textPath = (font, text, x, y, size, fill) =>
  `<path d="${font.getPath(text, x, y, size).toPathData(2)}" fill="${fill}"/>`;

// Largest title size (64 → 40) that fits in three lines.
function fitTitle(title) {
  for (let size = 64; size >= 40; size -= 4) {
    const { lines, truncated } = wrap(fonts.display, title, size, TEXT_WIDTH, 3);
    if (!truncated) return { size, lines };
  }
  return { size: 40, lines: wrap(fonts.display, title, 40, TEXT_WIDTH, 3).lines };
}

const smartQuotes = (t) => String(t).replace(/(\w)'(\w)/g, '$1’$2').replace(/'/g, '’');

const star = (cx, cy, r, opacity) =>
  `<path transform="translate(${cx - r} ${cy - r}) scale(${r / 50})" d="M50 0C53 37 63 47 100 50 63 53 53 63 50 100 47 63 37 53 0 50 37 47 47 37 50 0Z" fill="${C.accent}" opacity="${opacity}"/>`;

async function fetchImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(encodeURI(decodeURI(url)), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// Image cropped to w×h with rounded corners (or a circle when r >= w/2).
async function rounded(buffer, w, h, r) {
  const mask = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`);
  return sharp(buffer)
    .resize(w, h, { fit: 'cover', position: 'attention' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/**
 * @param {{ title: string, author?: string, coverUrl?: string,
 *           characters?: { name: string, imageUrl?: string }[] }} book
 * @returns {Promise<Buffer>} JPEG
 */
async function renderBookCard({ title, author, coverUrl, characters = [] }) {
  const { size, lines } = fitTitle(smartQuotes(title || 'Untitled'));
  const lineHeight = Math.round(size * 1.1);
  const titleTop = 176;
  let y = titleTop + size * 0.8;
  const svg = [];
  lines.forEach((l) => {
    svg.push(textPath(fonts.display, l, LEFT, y, size, C.ink));
    y += lineHeight;
  });
  y += 4;
  if (author) {
    const a = wrap(fonts.italic, `by ${author}`, 28, TEXT_WIDTH, 1).lines[0];
    svg.push(textPath(fonts.italic, a, LEFT, y, 28, C.muted));
    y += 28;
  }

  // Cast row: up to five portraits, then who you can talk to.
  const cast = characters.filter((c) => c.imageUrl).slice(0, 5);
  const AV = 68;
  const OVERLAP = 18;
  const castTop = Math.round(Math.min(y + 30, 410));
  const portraits = await Promise.all(cast.map((c) => fetchImage(c.imageUrl)));
  const avatars = [];
  let ax = LEFT;
  for (const buf of portraits) {
    if (!buf) continue;
    try {
      const img = await rounded(buf, AV, AV, AV / 2);
      const ring = Buffer.from(`<svg width="${AV + 8}" height="${AV + 8}"><circle cx="${AV / 2 + 4}" cy="${AV / 2 + 4}" r="${AV / 2 + 4}" fill="${C.paper}"/></svg>`);
      avatars.push({ input: ring, left: ax - 4, top: castTop - 4 }, { input: img, left: ax, top: castTop });
      ax += AV - OVERLAP;
    } catch {
      /* unreadable image: skip it */
    }
  }
  if (characters.length) {
    // Under the portraits: "Talk with Elizabeth Bennet, Mr. Darcy and 7 more".
    const names = characters.slice(0, 2).map((c) => c.name);
    const more = characters.length - names.length;
    const label = more > 0
      ? `Talk with ${names.join(', ')} and ${more} more`
      : `Talk with ${names.join(' and ')}`;
    const ly = avatars.length ? castTop + AV + 34 : castTop + 24;
    const fitted = wrap(fonts.regular, smartQuotes(label), 23, TEXT_WIDTH, 1).lines[0];
    svg.push(textPath(fonts.regular, fitted, LEFT, ly, 23, C.ink));
  }

  svg.push(textPath(fonts.display, 'Read, listen & talk it over at chattybooks.com', LEFT, 572, 22, C.accent));
  svg.push(star(1150, 40, 14, 0.7), star(740, 594, 9, 0.55), star(LEFT + TEXT_WIDTH - 20, 92, 11, 0.6));

  const overlay = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg.join('')}</svg>`);
  const logo = await sharp(path.join(ASSETS, 'logo-name-light.png')).resize({ width: 190 }).png().toBuffer();

  const layers = [{ input: logo, left: LEFT - 6, top: 48, blend: 'multiply' }, { input: overlay, left: 0, top: 0 }, ...avatars];

  const coverBuf = await fetchImage(coverUrl);
  if (coverBuf) {
    try {
      const cover = await rounded(coverBuf, COVER.w, COVER.h, 12);
      // Soft drop shadow, blurred inside the SVG (sharp would blur before compositing).
      const shadow = Buffer.from(
        `<svg width="${COVER.w + 80}" height="${COVER.h + 80}" xmlns="http://www.w3.org/2000/svg">` +
          '<filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter>' +
          `<rect x="40" y="40" width="${COVER.w}" height="${COVER.h}" rx="12" fill="rgb(20,18,15)" fill-opacity="0.38" filter="url(#s)"/></svg>`
      );
      layers.unshift({ input: shadow, left: COVER.x - 40, top: COVER.y - 40 + 14 });
      layers.push({ input: cover, left: COVER.x, top: COVER.y });
    } catch {
      /* unreadable cover: card without it */
    }
  }

  return sharp({ create: { width: W, height: H, channels: 3, background: C.paper } })
    .composite(layers)
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

module.exports = { renderBookCard, CARD_WIDTH: W, CARD_HEIGHT: H };
