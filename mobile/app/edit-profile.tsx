import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
// @ts-ignore - shared package is plain JS without type declarations
import { useAuth } from '@talkingbook/shared';
import { KeyboardAware } from '../components/KeyboardAware';
import { Button, Chip, Field, Initials, Row, Screen, Section, Txt } from '../components/ui';
import {
  CHARACTERISTICS_OPTIONS,
  GENDER_OPTIONS,
  MOODS_OPTIONS,
  capitalize,
  formatDay,
  parseDay,
  updateProfile,
  uploadProfilePhoto,
} from '../lib/profile';
import { space } from '../lib/theme';
import { useTheme } from '../lib/useTheme';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // same limit as the web form
const AVATAR = 96;

function toggle(list: string[], item: string) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: readonly { value: string; label: string }[];
  selected: (value: string) => boolean;
  onToggle: (value: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} active={selected(o.value)} onPress={() => onToggle(o.value)} />
      ))}
    </View>
  );
}

const asOptions = (values: string[]) => values.map((v) => ({ value: v, label: capitalize(v) }));

export default function EditProfile() {
  const router = useRouter();
  const theme = useTheme();
  const { user, setUser } = useAuth();
  const [username, setUsername] = useState<string>(user?.username || '');
  const [gender, setGender] = useState<string>(user?.gender || 'prefer not to say');
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(parseDay(user?.dateOfBirth));
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [description, setDescription] = useState<string>(user?.description || '');
  const [characteristics, setCharacteristics] = useState<string[]>(user?.characteristics || []);
  const [moods, setMoods] = useState<string[]>(user?.moods || []);
  const [saving, setSaving] = useState(false);

  // The system photo picker needs no permission prompt on iOS 14+ / Android 13+.
  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
      Alert.alert('Photo too large', 'Please choose an image under 5 MB.');
      return;
    }
    setPhoto(asset);
  };

  const today = new Date();
  const pickDate = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: dateOfBirth ?? new Date(2000, 0, 1),
        mode: 'date',
        maximumDate: today,
        onChange: (e, d) => e.type === 'set' && d && setDateOfBirth(d),
      });
    } else {
      if (!dateOfBirth) setDateOfBirth(new Date(2000, 0, 1)); // the spinner shows this, so keep it
      setShowIosPicker((v) => !v);
    }
  };

  const onSave = async () => {
    if (!username.trim()) {
      Alert.alert('Username required', 'Please enter a username.');
      return;
    }
    setSaving(true);
    try {
      if (photo) await uploadProfilePhoto(photo);
      const res = await updateProfile({
        username: username.trim(),
        gender,
        dateOfBirth: dateOfBirth ? formatDay(dateOfBirth) : null, // null clears it
        characteristics,
        description: description.trim(),
        moods,
      });
      // Merge the returned profile (it includes the new photo URL) into the cached user so
      // Settings updates at once. Not authenticate(): that flips the global loading flag.
      if (res?.user) setUser((u: any) => ({ ...u, ...res.user }));
      router.back();
    } catch (err: any) {
      Alert.alert('Could not save profile', err?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <KeyboardAware>
        <ScrollView
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, gap: 28, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <Txt variant="subhead">
            Characters use this to know who they're talking to in chat.
          </Txt>

          <Pressable
            onPress={pickPhoto}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            style={({ pressed }) => ({ alignSelf: 'center', alignItems: 'center', gap: space.sm, opacity: pressed ? 0.7 : 1 })}
          >
            {photo?.uri || user?.profileImage ? (
              <Image
                source={{ uri: photo?.uri || user.profileImage }}
                style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: theme.surfaceStrong }}
              />
            ) : (
              <Initials name={username || user?.email || '?'} size={AVATAR} />
            )}
            <Txt variant="subhead" color={theme.accent}>
              {photo || user?.profileImage ? 'Change photo' : 'Add photo'}
            </Txt>
          </Pressable>

          <View>
            <Field label="Username" value={username} onChangeText={setUsername} autoCorrect={false} />
            <View style={{ marginBottom: space.lg, gap: 6 }}>
              <Txt variant="subhead" style={{ fontWeight: '500' }}>
                Date of birth
              </Txt>
              <Row onPress={pickDate} last accessibilityLabel="Choose date of birth">
                <Txt variant="body" color={dateOfBirth ? theme.textPrimary : theme.textMuted} style={{ flex: 1 }}>
                  {dateOfBirth
                    ? dateOfBirth.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                    : 'Not set'}
                </Txt>
                {!!dateOfBirth && (
                  <Pressable
                    onPress={() => {
                      setDateOfBirth(null);
                      setShowIosPicker(false);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear date of birth"
                  >
                    <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                  </Pressable>
                )}
                <Ionicons name="calendar-outline" size={18} color={theme.textMuted} />
              </Row>
              {showIosPicker && Platform.OS === 'ios' && (
                <DateTimePicker
                  value={dateOfBirth ?? new Date(2000, 0, 1)}
                  mode="date"
                  display="spinner"
                  maximumDate={today}
                  onChange={(_, d) => d && setDateOfBirth(d)}
                />
              )}
            </View>
            <Field
              label="About you"
              value={description}
              onChangeText={setDescription}
              placeholder="Tell the characters a little about yourself…"
              autoCapitalize="sentences"
              multiline
              style={{ height: 120, paddingTop: 12, textAlignVertical: 'top' }}
            />
          </View>

          <Section title="Gender">
            <ChipGroup options={GENDER_OPTIONS} selected={(v) => v === gender} onToggle={setGender} />
          </Section>

          <Section title="Characteristics">
            <ChipGroup
              options={asOptions(CHARACTERISTICS_OPTIONS)}
              selected={(v) => characteristics.includes(v)}
              onToggle={(v) => setCharacteristics((c) => toggle(c, v))}
            />
          </Section>

          <Section title="Moods">
            <ChipGroup
              options={asOptions(MOODS_OPTIONS)}
              selected={(v) => moods.includes(v)}
              onToggle={(v) => setMoods((m) => toggle(m, v))}
            />
          </Section>

          <Button title="Save profile" onPress={onSave} loading={saving} />
        </ScrollView>
      </KeyboardAware>
    </Screen>
  );
}
