// Community gallery (AI-generated book scenes), matching the web Gallery/ImageViewer.
import { authFetch } from '@talkingbook/shared';

export type GalleryComment = {
  _id: string;
  content: string;
  createdAt: string;
  user: { _id: string; username: string; profileImage?: string | null } | null;
};

export type GalleryImage = {
  _id: string;
  imageUrl: string | null;
  videoUrl: string | null;
  mediaType: 'image' | 'video';
  prompt?: string;
  paragraphText?: string;
  pageNumber?: number;
  style?: string;
  createdAt: string;
  book?: { _id: string; title: string; author?: string; image_url?: string } | null;
  user?: { _id: string; username?: string; profileImage?: string | null } | null;
  likeCount: number;
  commentCount: number;
  // The server sends the like record (or null/false), not a boolean.
  isLiked: unknown;
  // Only on the single-image endpoint:
  comments?: GalleryComment[];
  previousImageId?: string | null;
  nextImageId?: string | null;
};

export type GalleryPage = {
  images: GalleryImage[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
};

// The server marks videos with mediaType 'video', and older records only by videoUrl.
export const isVideo = (img: Pick<GalleryImage, 'mediaType' | 'videoUrl'>) =>
  img.mediaType === 'video' || !!img.videoUrl;

export const GALLERY_KEYS = {
  LIST: ['gallery', 'infinite'] as const,
  IMAGE: (id: string) => ['galleryImage', id] as const,
};

export const fetchGalleryPage = (page: number): Promise<GalleryPage> =>
  authFetch({ path: `/gallery/images?page=${page}&limit=20`, requireAuth: false });

export const fetchGalleryImage = (id: string): Promise<GalleryImage> =>
  authFetch({ path: `/gallery/images/${id}`, requireAuth: false });

// Toggles server-side; responds { action: 'liked' | 'unliked', liked }.
export const toggleImageLike = (id: string): Promise<{ liked: boolean }> =>
  authFetch({ path: `/gallery/images/${id}/like`, method: 'POST', body: {} });

export const addImageComment = (id: string, content: string): Promise<GalleryComment> =>
  authFetch({ path: `/gallery/images/${id}/comments`, method: 'POST', body: { content } });
