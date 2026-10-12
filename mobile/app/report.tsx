import { useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Row, Screen, Txt } from '../components/ui';
import { KeyboardAware } from '../components/KeyboardAware';
import { useTheme } from '../lib/useTheme';
import {
  REPORT_REASONS,
  hideReportedContent,
  reportContent,
  type ReportReason,
  type ReportTarget,
} from '../lib/moderation';

const NOUN: Record<ReportTarget, string> = { image: 'scene', comment: 'comment', message: 'reply' };

// Report a gallery scene, a comment, or an AI character reply.
// Params: type (ReportTarget), id, and imageId for comments.
export default function ReportScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { type, id, imageId } = useLocalSearchParams<{ type: ReportTarget; id: string; imageId?: string }>();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const noun = NOUN[type] ?? 'content';

  const submit = async () => {
    if (!reason || sending) return;
    setSending(true);
    try {
      await reportContent(type, id, reason, details.trim() || undefined);
      hideReportedContent(queryClient, type, id, imageId);
      router.back();
      Alert.alert(
        'Thanks for reporting',
        type === 'message'
          ? 'We review every report, and this one helps us improve how characters respond.'
          : `We review reports within 24 hours. You won't see this ${noun} again.`
      );
    } catch (err: any) {
      Alert.alert("Couldn't send report", err?.message || 'Please try again.');
      setSending(false);
    }
  };

  return (
    <Screen>
      <KeyboardAware>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}>
          <Txt variant="subhead">
            {type === 'message'
              ? 'Character replies are written by AI. Tell us what went wrong with this one.'
              : `Why are you reporting this ${noun}?`}
          </Txt>

          <View>
            {REPORT_REASONS.map((r, i) => {
              const selected = reason === r.key;
              return (
                <Row
                  key={r.key}
                  onPress={() => setReason(r.key)}
                  last={i === REPORT_REASONS.length - 1}
                  accessibilityLabel={`${r.label}${selected ? ', selected' : ''}`}
                >
                  <Txt variant="body" style={{ flex: 1 }}>
                    {r.label}
                  </Txt>
                  {selected && <Ionicons name="checkmark" size={18} color={theme.accent} />}
                </Row>
              );
            })}
          </View>

          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Anything else we should know? (optional)"
            placeholderTextColor={theme.textMuted}
            multiline
            maxLength={1000}
            style={{
              minHeight: 88,
              backgroundColor: theme.surface,
              color: theme.textPrimary,
              borderRadius: 12,
              padding: 14,
              fontSize: 16,
              textAlignVertical: 'top',
            }}
          />

          <Button title="Send report" onPress={submit} disabled={!reason} loading={sending} />
        </ScrollView>
      </KeyboardAware>
    </Screen>
  );
}
