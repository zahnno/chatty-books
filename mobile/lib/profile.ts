// Profile fields the user can edit (same as the web's Edit Profile page). Characters read
// these in chat, so they know who they're talking to. Option lists mirror the enums in
// server/models/userModel.js.
import { authFetch } from '@talkingbook/shared';

export const GENDER_OPTIONS = [
  { value: 'prefer not to say', label: 'Prefer not to say' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
] as const;

export const CHARACTERISTICS_OPTIONS = [
  'friendly', 'creative', 'analytical', 'adventurous', 'organized',
  'empathetic', 'introverted', 'extroverted', 'curious', 'determined',
  'patient', 'ambitious', 'reliable', 'adaptable', 'thoughtful',
  'energetic', 'calm', 'focused', 'innovative', 'practical',
];

export const MOODS_OPTIONS = [
  'happy', 'excited', 'peaceful', 'focused', 'inspired',
  'relaxed', 'energetic', 'curious', 'reflective', 'playful',
  'determined', 'calm', 'enthusiastic', 'content', 'motivated',
];

export type ProfileUpdate = {
  username: string;
  gender: string;
  dateOfBirth: string | null; // YYYY-MM-DD; null clears it
  characteristics: string[];
  description: string;
  moods: string[];
};

// Sent as JSON rather than multipart (the route's multer only handles the optional photo),
// which also lets empty tag lists clear the saved ones.
export const updateProfile = (data: ProfileUpdate) =>
  authFetch({ path: '/update-profile', method: 'PUT', body: data });

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The photo goes up on its own multipart request (the server optimises it to webp and
// stores it on S3); the other fields stay JSON so empty tag lists can still be cleared.
export function uploadProfilePhoto(photo: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  const type = photo.mimeType || 'image/jpeg';
  const form = new FormData();
  form.append('profileImage', {
    uri: photo.uri,
    type,
    name: photo.fileName || `profile.${type.split('/')[1] || 'jpg'}`,
  } as any);
  return authFetch({ path: '/update-profile', method: 'PUT', body: form });
}

// Dates of birth are calendar days. Build them in local time from the YYYY-MM-DD part so
// a UTC-midnight value from the server doesn't shift a day in western time zones.
export function parseDay(value?: string | null): Date | null {
  const m = value && /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

export function formatDay(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
