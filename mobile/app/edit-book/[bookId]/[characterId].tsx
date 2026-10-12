// Edit (or, with characterId "new", add) a character in a community-published
// book: who they are, how they talk, and their portrait.
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
// @ts-ignore - shared package is plain JS without type declarations
import { thumbUrl } from '@talkingbook/shared';
import { Button, Field, Loader, Screen, Section, Txt } from '../../../components/ui';
import { Dialog } from '../../../components/Dialog';
import { KeyboardAware } from '../../../components/KeyboardAware';
import {
  createCharacter,
  deleteCharacter,
  fetchEditableBook,
  paintPortrait,
  saveCharacter,
  savePortrait,
  type CharacterInput,
  type EditableCharacter,
} from '../../../lib/publishing';
import { useTheme } from '../../../lib/useTheme';

const TEXT = ['firstName', 'lastName', 'gender', 'intro', 'description', 'appearance', 'events'] as const;
const LISTS = ['personalityTraits', 'strengths', 'weaknesses', 'goals'] as const;
type FormState = Record<(typeof TEXT)[number] | (typeof LISTS)[number], string>;

const toForm = (c?: EditableCharacter): FormState => ({
  ...(Object.fromEntries(TEXT.map((k) => [k, (c?.[k] as string) || ''])) as any),
  ...(Object.fromEntries(LISTS.map((k) => [k, (c?.[k] || []).join(', ')])) as any),
});

const multiline = (height = 120) => ({ multiline: true, style: { height, paddingTop: 12, textAlignVertical: 'top' as const } });

type Notice = { title: string; message: string; icon?: 'alert-circle-outline' | 'checkmark-circle-outline' | 'trash-outline'; confirmDelete?: boolean };

export default function EditCharacter() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { bookId, characterId } = useLocalSearchParams<{ bookId: string; characterId: string }>();
  const isNew = characterId === 'new';
  const { data } = useQuery({ queryKey: ['editableBook', bookId], queryFn: () => fetchEditableBook(bookId!) });
  const existing = data?.characters.find((c) => c.id === characterId);
  const [form, setForm] = useState<FormState>(toForm());
  const [portrait, setPortrait] = useState<string | undefined>();
  const [busy, setBusy] = useState<'save' | 'upload' | 'paint' | 'delete' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (existing) {
      setForm(toForm(existing));
      setPortrait(existing.image_url);
    }
  }, [existing?.id]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['editableBook', bookId] });
    queryClient.invalidateQueries({ queryKey: ['publishedBooks'] });
  };
  const fail = (title: string, err: any) => setNotice({ title, message: err?.message || 'Try again in a moment.', icon: 'alert-circle-outline' });

  const input = (): CharacterInput => {
    const out: any = {};
    for (const k of TEXT) out[k] = form[k];
    for (const k of LISTS) out[k] = form[k].split(',').map((s) => s.trim()).filter(Boolean);
    return out;
  };

  const save = async () => {
    setBusy('save');
    try {
      if (isNew) {
        const created = await createCharacter(bookId!, input());
        refresh();
        router.replace(`/edit-book/${bookId}/${created.id}`);
      } else {
        await saveCharacter(bookId!, characterId!, input());
        refresh();
        setNotice({
          title: 'Saved',
          message: data?.book.live ? 'Readers will meet the updated character in their next chat.' : 'Your changes are saved.',
          icon: 'checkmark-circle-outline',
        });
      }
    } catch (err) {
      fail("Couldn't save", err);
    } finally {
      setBusy(null);
    }
  };

  const upload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    setBusy('upload');
    try {
      setPortrait((await savePortrait(bookId!, characterId!, result.assets[0])).image_url);
      refresh();
    } catch (err) {
      fail("Couldn't change the portrait", err);
    } finally {
      setBusy(null);
    }
  };

  const paint = async () => {
    setBusy('paint');
    try {
      setPortrait((await paintPortrait(bookId!, characterId!)).image_url);
      refresh();
    } catch (err) {
      fail("Couldn't paint a portrait", err);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setNotice(null);
    setBusy('delete');
    try {
      await deleteCharacter(bookId!, characterId!);
      refresh();
      router.back();
    } catch (err) {
      fail("Couldn't remove the character", err);
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Loader />
      </Screen>
    );
  }

  const set = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const name = [form.firstName, form.lastName].filter(Boolean).join(' ');

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? 'New character' : name || 'Character' }} />
      <KeyboardAware>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 28, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
          {!isNew && (
            <Section title="Portrait">
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                <Image
                  source={portrait ? { uri: thumbUrl(portrait, 240) } : undefined}
                  style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: theme.surfaceStrong }}
                />
                <View style={{ flex: 1 }}>
                  <Button title="Upload a photo" icon="image-outline" variant="outline" loading={busy === 'upload'} disabled={!!busy} onPress={upload} />
                  <Button title="Paint from appearance" icon="color-palette-outline" variant="ghost" loading={busy === 'paint'} disabled={!!busy || !form.appearance.trim()} onPress={paint} />
                </View>
              </View>
              <Txt variant="caption">Painting uses your tokens, like other images. Save the appearance first.</Txt>
            </Section>
          )}

          <Section title="Who they are">
            <View>
              <Field label="First name" value={form.firstName} onChangeText={set('firstName')} autoCapitalize="words" />
              <Field label="Last name" value={form.lastName} onChangeText={set('lastName')} autoCapitalize="words" />
              <Field label="Gender" value={form.gender} onChangeText={set('gender')} />
              <Field label="Description" value={form.description} onChangeText={set('description')} autoCapitalize="sentences" {...multiline()} />
              <Field label="Appearance" value={form.appearance} onChangeText={set('appearance')} autoCapitalize="sentences" {...multiline(96)} />
              <Field label="Key events in the book" value={form.events} onChangeText={set('events')} autoCapitalize="sentences" {...multiline()} />
            </View>
          </Section>

          <Section title="How they talk">
            <View>
              <Field label="Opening line" value={form.intro} onChangeText={set('intro')} autoCapitalize="sentences" {...multiline(96)} />
              <Field label="Personality (comma separated)" value={form.personalityTraits} onChangeText={set('personalityTraits')} />
              <Field label="Strengths" value={form.strengths} onChangeText={set('strengths')} />
              <Field label="Weaknesses" value={form.weaknesses} onChangeText={set('weaknesses')} />
              <Field label="Goals" value={form.goals} onChangeText={set('goals')} />
            </View>
          </Section>

          <View>
            <Button title={isNew ? 'Add character' : 'Save character'} loading={busy === 'save'} disabled={!!busy || !form.firstName.trim()} onPress={save} />
            {!isNew && (
              <Button
                title="Remove character"
                icon="trash-outline"
                variant="ghost"
                disabled={!!busy}
                onPress={() =>
                  setNotice({
                    title: `Remove ${name || 'this character'}?`,
                    message: 'Readers will no longer be able to chat with them.',
                    icon: 'trash-outline',
                    confirmDelete: true,
                  })
                }
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAware>

      <Dialog
        visible={!!notice}
        onClose={() => setNotice(null)}
        icon={notice?.icon}
        title={notice?.title ?? ''}
        message={notice?.message}
        actions={
          notice?.confirmDelete
            ? [
                { label: 'Remove', icon: 'trash-outline', onPress: remove },
                { label: 'Cancel', variant: 'quiet', onPress: () => setNotice(null) },
              ]
            : [{ label: 'OK', onPress: () => setNotice(null) }]
        }
      />
    </Screen>
  );
}
