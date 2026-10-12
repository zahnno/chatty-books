// Reporting and blocking (App Store 1.2 / Google Play UGC + AI content rules), and
// account deletion. Reported scenes/comments and blocked readers' content vanish
// from the caches right away; the server filters them from then on.
// @ts-ignore - shared package is plain JS without type declarations
import { authFetch } from '@talkingbook/shared';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { GALLERY_KEYS, type GalleryImage, type GalleryPage } from './gallery';

export type ReportTarget = 'image' | 'comment' | 'message';

export const REPORT_REASONS = [
  { key: 'sexual', label: 'Sexual content' },
  { key: 'hate', label: 'Hate or discrimination' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'violence', label: 'Violence or threats' },
  { key: 'self_harm', label: 'Self-harm' },
  { key: 'spam', label: 'Spam or scams' },
  { key: 'other', label: 'Something else' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['key'];

export const reportContent = (targetType: ReportTarget, targetId: string, reason: ReportReason, details?: string) =>
  authFetch({ path: '/reports', method: 'POST', body: { targetType, targetId, reason, details } });

export type BlockedUser = { _id: string; username: string; profileImage?: string | null };

export const BLOCKED_KEY = ['blockedUsers'] as const;
export const fetchBlockedUsers = (): Promise<{ users: BlockedUser[] }> => authFetch({ path: '/users/blocked' });
export const blockUser = (userId: string) => authFetch({ path: `/users/${userId}/block`, method: 'POST', body: {} });
export const unblockUser = (userId: string) => authFetch({ path: `/users/${userId}/block`, method: 'DELETE' });

// { storeProvider } names a store plan the user still has to cancel themselves.
export const deleteAccount = (): Promise<{ deleted: boolean; storeProvider: 'apple' | 'play' | null }> =>
  authFetch({ path: '/auth/account', method: 'DELETE' });

// Scenes reported this session. The viewer checks this when it regains focus so it
// can close itself once the report sheet is dismissed.
const hiddenImages = new Set<string>();
export const isImageHidden = (id: string) => hiddenImages.has(id);

const mapGallery = (qc: QueryClient, fn: (images: GalleryImage[]) => GalleryImage[]) =>
  qc.setQueryData<InfiniteData<GalleryPage>>(GALLERY_KEYS.LIST, (old) =>
    old ? { ...old, pages: old.pages.map((p) => ({ ...p, images: fn(p.images) })) } : old
  );

export function hideReportedContent(qc: QueryClient, targetType: ReportTarget, targetId: string, imageId?: string) {
  if (targetType === 'image') {
    hiddenImages.add(targetId);
    mapGallery(qc, (images) => images.filter((img) => img._id !== targetId));
  } else if (targetType === 'comment' && imageId) {
    qc.setQueryData<GalleryImage>(GALLERY_KEYS.IMAGE(imageId), (old) =>
      old
        ? {
            ...old,
            comments: old.comments?.filter((c) => c._id !== targetId),
            commentCount: Math.max(0, (old.commentCount || 0) - 1),
          }
        : old
    );
  }
}

// After blocking, drop everything cached from the gallery so it refetches filtered.
export function afterBlock(qc: QueryClient, userId: string) {
  mapGallery(qc, (images) => images.filter((img) => img.user?._id !== userId));
  qc.invalidateQueries({ queryKey: ['gallery'] });
  qc.invalidateQueries({ queryKey: ['galleryImage'] });
  qc.invalidateQueries({ queryKey: BLOCKED_KEY });
}
