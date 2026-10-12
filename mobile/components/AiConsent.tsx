import { useState } from 'react';
import { Alert, Linking, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// @ts-ignore - shared package is plain JS without type declarations
import { authFetch, useAuth } from '@talkingbook/shared';
import { Button, Screen, Txt } from './ui';
import { useTheme } from '../lib/useTheme';
import { PRIVACY_URL } from '../lib/subscription';

// One-time consent to AI processing of chats (App Store 5.1.2(i)). Stored on the
// account, so it's asked once per person — not per chat, device or reinstall.
export function useAiConsent() {
  const { user, setUser } = useAuth();
  const agree = async () => {
    const res = await authFetch({ path: '/auth/ai-consent', method: 'POST', body: {} });
    setUser((u: any) => (u ? { ...u, aiConsentAt: res?.aiConsentAt ?? new Date().toISOString() } : u));
  };
  return { consented: !!user?.aiConsentAt, agree };
}

const POINTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  {
    icon: 'chatbubbles-outline',
    text: 'Your messages, including what you say out loud (as text), are sent to AI providers to write each reply and speak it in the character’s voice.',
  },
  {
    icon: 'person-outline',
    text: 'So replies feel personal, your name and the profile details you choose to add (like age, moods and bio) go with them.',
  },
  {
    icon: 'business-outline',
    text: 'The providers are Anthropic, OpenAI and ElevenLabs, reached through our AI platform, Privateer. They use it only to generate replies and voices.',
  },
  {
    icon: 'trash-outline',
    text: 'You can edit your profile anytime, and deleting your account deletes your conversations.',
  },
];

export function AiConsentPrompt({ onDecline }: { onDecline: () => void }) {
  const theme = useTheme();
  const { agree } = useAiConsent();
  const [saving, setSaving] = useState(false);

  const onAgree = async () => {
    setSaving(true);
    try {
      await agree();
    } catch (err: any) {
      setSaving(false);
      Alert.alert("Couldn't save your choice", err?.message || 'Please try again.');
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        <View style={{ gap: 8 }}>
          <Txt variant="largeTitle">Before your first chat</Txt>
          <Txt variant="body" color={theme.textSecondary}>
            Characters are powered by AI. Here’s what that means for your data.
          </Txt>
        </View>

        <View style={{ gap: 16 }}>
          {POINTS.map((p) => (
            <View key={p.icon} style={{ flexDirection: 'row', gap: 14 }}>
              <Ionicons name={p.icon} size={22} color={theme.accent} style={{ marginTop: 1 }} />
              <Txt variant="body" style={{ flex: 1 }}>
                {p.text}
              </Txt>
            </View>
          ))}
        </View>

        <Txt variant="subhead">
          We only ask once. Read more in our{' '}
          <Txt variant="subhead" color={theme.accent} onPress={() => Linking.openURL(PRIVACY_URL)}>
            privacy policy
          </Txt>
          .
        </Txt>

        <View>
          <Button title="Agree and continue" onPress={onAgree} loading={saving} />
          <Button title="Not now" variant="ghost" onPress={onDecline} />
        </View>
      </ScrollView>
    </Screen>
  );
}
