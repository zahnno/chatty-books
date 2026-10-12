// Edit a community-published book: its details, cover and cast. Open to the
// publisher until it's minted, then to whoever holds its NFT. Changes to a
// live book apply at once and are reviewed by Chatty Books afterwards.
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
// @ts-ignore - shared package is plain JS without type declarations
import { thumbUrl } from '@talkingbook/shared';
import { Button, Field, Loader, Row, Screen, Section, Txt } from '../../../components/ui';
import { Dialog } from '../../../components/Dialog';
import { KeyboardAware } from '../../../components/KeyboardAware';
import { fetchEditableBook, saveBook, saveCover } from '../../../lib/publishing';
import { useTheme } from '../../../lib/useTheme';
import { radii } from '../../../lib/theme';

const multiline = { multiline: true, style: { height: 132, paddingTop: 12, textAlignVertical: 'top' as const } };

export default function EditBook() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const { data, error, refetch } = useQuery({ queryKey: ['editableBook', bookId], queryFn: () => fetchEditableBook(bookId!) });
  const [form, setForm] = useState({ title: '', author: '', tagline: '', description: '' });
  const [saving, setSaving] = useState<'details' | 'cover' | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string; ok?: boolean } | null>(null);

  useEffect(() => {
    if (!data) return;
    const b = data.book;
    setForm({ title: b.title || '', author: b.author || '', tagline: b.tagline || '', description: b.description || '' });
  }, [data?.book.id]);

  const changed =
    !!data &&
    (form.title !== (data.book.title || '') ||
      form.author !== (data.book.author || '') ||
      form.tagline !== (data.book.tagline || '') ||
      form.description !== (data.book.description || ''));

  const afterSave = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['publishedBooks'] });
  };

  const saveDetails = async () => {
    setSaving('details');
    try {
      const fields: Record<string, string> = { title: form.title, tagline: form.tagline, description: form.description };
      if (!data!.book.authorLocked) fields.author = form.author;
      await saveBook(bookId!, fields);
      afterSave();
      setNotice({ ok: true, title: 'Saved', message: data!.book.live ? 'Your changes are live. Chatty Books reviews edits to live books.' : 'Your changes are saved.' });
    } catch (err: any) {
      setNotice({ title: "Couldn't save", message: err?.message || 'Try again in a moment.' });
    } finally {
      setSaving(null);
    }
  };

  const changeCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [2, 3], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    setSaving('cover');
    try {
      await saveCover(bookId!, result.assets[0]);
      afterSave();
    } catch (err: any) {
      setNotice({ title: "Couldn't change the cover", message: err?.message || 'Try again in a moment.' });
    } finally {
      setSaving(null);
    }
  };

  if (error) {
    return (
      <Screen style={{ padding: 16, gap: 12 }}>
        <Txt variant="title">Can't edit this book</Txt>
        <Txt variant="subhead">{(error as any)?.message}</Txt>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Loader />
      </Screen>
    );
  }

  const { book, characters } = data;
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Screen>
      <KeyboardAware>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 28, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
          {book.live && (
            <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: radii.md, backgroundColor: theme.surface }}>
              <Ionicons name="eye-outline" size={18} color={theme.accent} style={{ marginTop: 2 }} />
              <Txt variant="subhead" style={{ flex: 1 }}>
                This book is live. Changes apply right away and are reviewed by Chatty Books; anything against our rules is
                put back.
              </Txt>
            </View>
          )}

          <Section title="Cover">
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
              <Image
                source={book.image_url ? { uri: thumbUrl(book.image_url, 200) } : undefined}
                style={{ width: 80, height: 120, borderRadius: radii.sm, backgroundColor: theme.surfaceStrong }}
                contentFit="cover"
              />
              <Button title="Change cover" icon="image-outline" variant="outline" loading={saving === 'cover'} onPress={changeCover} style={{ flex: 1 }} />
            </View>
          </Section>

          <Section title="Details">
            <View>
              <Field label="Title" value={form.title} onChangeText={set('title')} autoCapitalize="words" />
              <Field
                label={book.authorLocked ? 'Author (fixed once published)' : 'Author'}
                value={form.author}
                onChangeText={set('author')}
                autoCapitalize="words"
                editable={!book.authorLocked}
                style={book.authorLocked ? { opacity: 0.5 } : undefined}
              />
              <Field label="Tagline" value={form.tagline} onChangeText={set('tagline')} autoCapitalize="sentences" />
              <Field label="Description" value={form.description} onChangeText={set('description')} autoCapitalize="sentences" {...multiline} />
              <Button title="Save details" loading={saving === 'details'} disabled={!changed || !form.title.trim()} onPress={saveDetails} />
            </View>
          </Section>

          <Section title={`Characters (${characters.length})`}>
            <View>
              {characters.map((c, i) => (
                <Row key={c.id} onPress={() => router.push(`/edit-book/${bookId}/${c.id}`)} last={i === characters.length - 1}>
                  <Image
                    source={c.image_url ? { uri: thumbUrl(c.image_url, 80) } : undefined}
                    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surfaceStrong }}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt variant="body" numberOfLines={1}>
                      {[c.firstName, c.lastName].filter(Boolean).join(' ')}
                    </Txt>
                    {!!c.description && (
                      <Txt variant="caption" numberOfLines={1}>
                        {c.description}
                      </Txt>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                </Row>
              ))}
            </View>
            <Button title="Add a character" icon="person-add-outline" variant="outline" onPress={() => router.push(`/edit-book/${bookId}/new`)} />
          </Section>
        </ScrollView>
      </KeyboardAware>

      <Dialog
        visible={!!notice}
        onClose={() => setNotice(null)}
        icon={notice?.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'}
        title={notice?.title ?? ''}
        message={notice?.message}
        actions={[{ label: 'OK', onPress: () => setNotice(null) }]}
      />
    </Screen>
  );
}
