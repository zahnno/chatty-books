import { Alert } from 'react-native';
import { InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useRequireAccount } from '../components/SignIn';
import {
  GALLERY_KEYS,
  toggleImageLike,
  type GalleryImage,
  type GalleryPage,
} from './gallery';

type LikeState = { isLiked: boolean; likeCount: number };

// Optimistically toggles a like in both the gallery grid and the image viewer caches,
// rolling back if the request fails.
export function useGalleryLike() {
  const queryClient = useQueryClient();
  const requireAccount = useRequireAccount();

  const apply = (id: string, { isLiked, likeCount }: LikeState) => {
    const patch = (img: GalleryImage) => (img._id === id ? { ...img, isLiked, likeCount } : img);
    queryClient.setQueryData<InfiniteData<GalleryPage>>(GALLERY_KEYS.LIST, (old) =>
      old
        ? { ...old, pages: old.pages.map((p) => ({ ...p, images: p.images.map(patch) })) }
        : old
    );
    queryClient.setQueryData<GalleryImage>(GALLERY_KEYS.IMAGE(id), (old) =>
      old ? patch(old) : old
    );
  };

  return async (image: GalleryImage) => {
    if (!requireAccount('Sign in to like scenes', 'You need an account to like and comment on scenes.')) return;
    const before: LikeState = { isLiked: !!image.isLiked, likeCount: image.likeCount || 0 };
    apply(image._id, {
      isLiked: !before.isLiked,
      likeCount: before.likeCount + (before.isLiked ? -1 : 1),
    });
    try {
      await toggleImageLike(image._id);
    } catch (err: any) {
      apply(image._id, before);
      Alert.alert('Could not update like', err?.message || 'Please try again.');
    }
  };
}
