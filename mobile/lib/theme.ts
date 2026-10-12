// Design tokens: "ink on paper". The brand is a black quill-and-book mark on white, so
// the app is typography-first like a well-set book — warm paper, near-black ink, and one
// accent: rubric red, the scribe's ink for headings. No gradients or glows; hierarchy
// comes from the type ramp and spacing. Light/dark pairs follow the OS setting.

const light = {
  background: '#FAF8F4', // paper
  surface: '#F1EDE5', // tinted fill for inputs, chips, bubbles
  surfaceStrong: '#E6E0D4', // pressed rows, placeholders
  separator: 'rgba(27,26,23,0.12)',
  textPrimary: '#1B1A17', // ink
  textSecondary: '#5E5A52',
  textMuted: '#8C877C',
  accent: '#A33A2B', // rubric red
  onAccent: '#FFFFFF',
  ink: '#1B1A17', // primary buttons, user chat bubbles
  onInk: '#FAF8F4',
  danger: '#B42318',
  success: '#2F6B4F',
  overlay: 'rgba(27,26,23,0.55)',
};

const dark: typeof light = {
  background: '#141311', // warm charcoal, not blue-black
  surface: '#1F1D1A',
  surfaceStrong: '#2B2824',
  separator: 'rgba(237,230,216,0.12)',
  textPrimary: '#EDE6D8', // parchment
  textSecondary: '#B3AA9A',
  textMuted: '#7F786C',
  accent: '#E07A62',
  onAccent: '#141311',
  ink: '#EDE6D8',
  onInk: '#141311',
  danger: '#F07B6E',
  success: '#7BC4A0',
  overlay: 'rgba(0,0,0,0.6)',
};

export const palettes = { light, dark };
export type Theme = typeof light;

// Literata (a typeface designed for e-reading) carries titles and book text; everything
// else uses the platform's system font, so the UI stays native.
export const fonts = {
  display: 'Literata_600SemiBold',
  reading: 'Literata_400Regular',
  readingItalic: 'Literata_400Regular_Italic',
};

export const radii = { sm: 8, md: 12, lg: 16, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Bottom padding for scrolling screens so the docked mini player never covers content.
export const BOTTOM_CLEARANCE = 96;

// One restrained elevation, for things that genuinely float (covers, the player).
export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
};

// Reader themes (the reading surface only).
export const readingThemes = {
  paper: { name: 'Paper', background: '#FAF8F4', text: '#1B1A17', muted: '#8C877C', separator: 'rgba(27,26,23,0.14)' },
  sepia: { name: 'Sepia', background: '#F3E9D7', text: '#3B2F22', muted: '#8C7A63', separator: 'rgba(59,47,34,0.16)' },
  night: { name: 'Night', background: '#141311', text: '#E3DCCD', muted: '#7F786C', separator: 'rgba(227,220,205,0.16)' },
} as const;

export type ReadingThemeKey = keyof typeof readingThemes;
