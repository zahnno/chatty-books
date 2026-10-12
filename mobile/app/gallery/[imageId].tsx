import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Initials, Screen, Txt } from '../../components/ui';
import { StateView } from '../../components/StateView';
import { GalleryVideoPlayer } from '../../components/GalleryVideo';
import { KeyboardAware } from '../../components/KeyboardAware';
import {
  GALLERY_KEYS,
  addImageComment,
  fetchGalleryImage,
  isVideo,
  type GalleryImage,
  type GalleryPage,
} from '../../lib/gallery';
import { useGalleryLike } from '../../lib/useGalleryLike';
import { useRequireAccount } from '../../components/SignIn';
import { afterBlock, blockUser, isImageHidden, type ReportTarget } from '../../lib/moderation';
// @ts-ignore - shared package is plain JS without type declarations
import { useAuth, thumbUrl } from '@talkingbook/shared';
import { radii } from '../../lib/theme';
import { useTheme } from '../../lib/useTheme';

// Single gallery image, mirroring the web ImageViewer: media, source book + passage,
// likes, comments, and previous/next navigation.
export default function GalleryImageViewer() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { imageId } = useLocalSearchParams<{ imageId: string }>();
  const toggleLike = useGalleryLike();
  const { user } = useAuth();
  const requireAccount = useRequireAccount();

  // Close once this scene has been reported (the report screen sits on top of us).
  useFocusEffect(
    useCallback(() => {
      if (imageId && isImageHidden(imageId)) router.back();
    }, [imageId, router])
  );

  const [aspectRatio, setAspectRatio] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);

  // Seed from the grid's cached copy so the image shows immediately; the detail
  // request adds comments and prev/next ids.
  const { data: image, isLoading, error, refetch } = useQuery({
    queryKey: GALLERY_KEYS.IMAGE(imageId),
    queryFn: () => fetchGalleryImage(imageId),
    enabled: !!imageId,
    placeholderData: () =>
      queryClient
        .getQueryData<InfiniteData<GalleryPage>>(GALLERY_KEYS.LIST)
        ?.pages.flatMap((p) => p.images)
        .find((img) => img._id === imageId),
  });

  if (isLoading && !image) return <StateView variant="loading" />;
  if (error && !image) {
    return <StateView variant="error" message="Couldn't load this image." onRetry={() => refetch()} />;
  }
  if (!image) return null;

  const liked = !!image.isLiked;
  const goTo = (id?: string | null) => {
    if (!id) return;
    setExpanded(false);
    setAspectRatio(1);
    router.setParams({ imageId: id });
  };

  const report = (type: ReportTarget, id: string) =>
    router.push({ pathname: '/report', params: { type, id, imageId: image._id } });

  const confirmBlock = (author: { _id: string; username?: string }) => {
    const name = author.username || 'this reader';
    Alert.alert(`Block ${name}?`, 'You won’t see their scenes or comments. You can unblock them in Settings.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(author._id);
            afterBlock(queryClient, author._id);
            if (image.user?._id === author._id) router.back();
          } catch (err: any) {
            Alert.alert("Couldn't block", err?.message || 'Please try again.');
          }
        },
      },
    ]);
  };

  // Report / block menu. Signed-out readers are asked to sign in; nobody is offered
  // actions on their own content.
  const openMenu = (type: ReportTarget, id: string, author?: { _id: string; username?: string } | null) => {
    if (!requireAccount('Sign in to report', 'You need an account to report content or block readers.')) return;
    const noun = type === 'image' ? 'scene' : 'comment';
    Alert.alert(`This ${noun}`, undefined, [
      { text: `Report ${noun}`, onPress: () => report(type, id) },
      ...(author ? [{ text: `Block ${author.username || 'reader'}`, style: 'destructive' as const, onPress: () => confirmBlock(author) }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };
  const isMine = (authorId?: string) => !!user && !!authorId && String(user._id) === String(authorId);

  const postComment = async () => {
    const content = comment.trim();
    if (!content || posting) return;
    if (!requireAccount('Sign in to comment', 'You need an account to comment on scenes.')) return;
    setPosting(true);
    try {
      const created = await addImageComment(image._id, content);
      setComment('');
      queryClient.setQueryData<GalleryImage>(GALLERY_KEYS.IMAGE(image._id), (old) =>
        old
          ? {
              ...old,
              comments: [created, ...(old.comments ?? [])],
              commentCount: (old.commentCount || 0) + 1,
            }
          : old
      );
      queryClient.setQueryData<InfiniteData<GalleryPage>>(GALLERY_KEYS.LIST, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((p) => ({
                ...p,
                images: p.images.map((img) =>
                  img._id === image._id
                    ? { ...img, commentCount: (img.commentCount || 0) + 1 }
                    : img
                ),
              })),
            }
          : old
      );
    } catch (err: any) {
      Alert.alert('Comment failed', err?.message || 'Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <IconBtn icon="chevron-back" label="Previous scene" disabled={!image.previousImageId} onPress={() => goTo(image.previousImageId)} />
              <IconBtn icon="chevron-forward" label="Next scene" disabled={!image.nextImageId} onPress={() => goTo(image.nextImageId)} />
              {!isMine(image.user?._id) && (
                <IconBtn icon="ellipsis-horizontal" label="Report or block" disabled={false} onPress={() => openMenu('image', image._id, image.user)} />
              )}
            </View>
          ),
        }}
      />

      <KeyboardAware>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {isVideo(image) && image.videoUrl ? (
            // Keyed by id so moving to the next/previous video starts a fresh player.
            <GalleryVideoPlayer
              key={image._id}
              uri={image.videoUrl}
              // Black letterbox is deliberate: it frames video, not a themed surface.
              style={{ width, aspectRatio: 16 / 9, backgroundColor: '#000' }}
            />
          ) : (
            <Image
              source={{ uri: image.imageUrl ?? image.book?.image_url }}
              // The gallery grid's copy is usually cached already, so show it while the full image loads.
              placeholder={{ uri: thumbUrl(image.imageUrl ?? image.book?.image_url, 200) }}
              placeholderContentFit="contain"
              style={{ width, aspectRatio, backgroundColor: theme.surfaceStrong }}
              contentFit="contain"
              transition={150}
              onLoad={(e) => {
                const { width: w, height: h } = e.source;
                if (w && h) setAspectRatio(w / h);
              }}
            />
          )}

          <View style={{ padding: 16, gap: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              <Pressable
                onPress={() => toggleLike(image)}
                accessibilityRole="button"
                accessibilityLabel={liked ? 'Unlike' : 'Like'}
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? theme.accent : theme.textPrimary} />
                <Txt variant="body">{image.likeCount || 0}</Txt>
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="chatbubble-outline" size={20} color={theme.textPrimary} />
                <Txt variant="body">{image.commentCount || 0}</Txt>
              </View>
            </View>

            {!!image.book && (
              <Pressable
                onPress={() => router.push({ pathname: '/book/[bookId]', params: { bookId: image.book!._id } })}
                accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 })}
              >
                <Image
                  source={{ uri: thumbUrl(image.book.image_url, 40) }}
                  style={{ width: 40, height: 60, borderRadius: 4, backgroundColor: theme.surfaceStrong }}
                  contentFit="cover"
                />
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>{image.book.title}</Txt>
                  <Txt variant="caption" numberOfLines={1}>
                    {[image.book.author, image.pageNumber ? `page ${image.pageNumber}` : null].filter(Boolean).join('  ·  ')}
                  </Txt>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
              </Pressable>
            )}

            {!!image.paragraphText && (
              <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" style={{ gap: 6 }}>
                <Txt variant="quote" numberOfLines={expanded ? undefined : 5}>
                  {image.paragraphText.replace(/\s+/g, ' ').trim()}
                </Txt>
                <Txt variant="subhead" color={theme.accent}>{expanded ? 'Show less' : 'Show the full passage'}</Txt>
              </Pressable>
            )}

            {(!!image.style || !!image.prompt) && (
              <Txt variant="caption" style={{ lineHeight: 18 }}>
                {[image.style ? `Style: ${image.style}` : null, image.prompt ? `Prompt: ${image.prompt}` : null]
                  .filter(Boolean)
                  .join('\n')}
              </Txt>
            )}

            <View style={{ gap: 12 }}>
              <Txt variant="heading">Comments</Txt>
              {(image.comments ?? []).length === 0 ? (
                <Txt variant="subhead">{image.comments ? 'No comments yet.' : 'Loading comments…'}</Txt>
              ) : (
                image.comments!.map((c) => (
                  <Pressable
                    key={c._id}
                    onLongPress={isMine(c.user?._id) ? undefined : () => openMenu('comment', c._id, c.user)}
                    style={{ flexDirection: 'row', gap: 12 }}
                  >
                    <Initials name={c.user?.username ?? 'User'} size={32} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="subhead" color={theme.textPrimary} style={{ fontWeight: '600' }}>
                        {c.user?.username ?? 'User'}
                        <Txt variant="caption">{'  '}{new Date(c.createdAt).toLocaleDateString()}</Txt>
                      </Txt>
                      <Txt variant="body" color={theme.textSecondary}>{c.content}</Txt>
                    </View>
                    {!isMine(c.user?._id) && (
                      <Pressable
                        onPress={() => openMenu('comment', c._id, c.user)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel="Report or block"
                        style={{ paddingTop: 2 }}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color={theme.textMuted} />
                      </Pressable>
                    )}
                  </Pressable>
                ))
              )}
            </View>
          </View>
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: insets.bottom + 10,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.separator,
          }}
        >
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder={user ? 'Add a comment' : 'Sign in to comment'}
            placeholderTextColor={theme.textMuted}
            multiline
            maxLength={500}
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 110,
              backgroundColor: theme.surface,
              color: theme.textPrimary,
              borderRadius: 22,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 12,
              fontSize: 16,
            }}
          />
          <Pressable
            onPress={postComment}
            disabled={posting || !comment.trim()}
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.ink,
              opacity: posting || !comment.trim() ? 0.3 : pressed ? 0.75 : 1,
            })}
          >
            {posting ? <ActivityIndicator color={theme.onInk} /> : <Ionicons name="arrow-up" size={20} color={theme.onInk} />}
          </Pressable>
        </View>
      </KeyboardAware>
    </Screen>
  );
}

function IconBtn({ icon, label, disabled, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{ padding: 6, opacity: disabled ? 0.3 : 1 }}
    >
      <Ionicons name={icon} size={22} color={theme.textPrimary} />
    </Pressable>
  );
}
