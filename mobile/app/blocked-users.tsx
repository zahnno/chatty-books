import { Alert, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { thumbUrl } from '@talkingbook/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Initials, Row, Screen, Txt } from '../components/ui';
import { StateView } from '../components/StateView';
import { useTheme } from '../lib/useTheme';
import { BLOCKED_KEY, afterBlock, fetchBlockedUsers, unblockUser, type BlockedUser } from '../lib/moderation';

// Readers the user has blocked, with unblock.
export default function BlockedUsers() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: BLOCKED_KEY, queryFn: fetchBlockedUsers });

  const unblock = (u: BlockedUser) =>
    Alert.alert(`Unblock ${u.username}?`, 'Their scenes and comments will show in the gallery again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          try {
            await unblockUser(u._id);
            afterBlock(queryClient, u._id);
          } catch (err: any) {
            Alert.alert("Couldn't unblock", err?.message || 'Please try again.');
          }
        },
      },
    ]);

  if (isLoading) return <StateView variant="loading" />;
  if (error) return <StateView variant="error" message="Couldn't load blocked readers." onRetry={() => refetch()} />;

  const users = data?.users ?? [];
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Txt variant="subhead">
          You won’t see scenes or comments from readers you block. They aren’t told that you blocked them.
        </Txt>
        {users.length === 0 ? (
          <Txt variant="subhead" style={{ textAlign: 'center', marginTop: 24 }}>
            You haven’t blocked anyone.
          </Txt>
        ) : (
          <View>
            {users.map((u, i) => (
              <Row key={u._id} last={i === users.length - 1}>
                {u.profileImage ? (
                  <Image
                    source={{ uri: thumbUrl(u.profileImage, 36) }}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.surfaceStrong }}
                  />
                ) : (
                  <Initials name={u.username} size={36} />
                )}
                <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
                  {u.username}
                </Txt>
                <Button title="Unblock" variant="outline" onPress={() => unblock(u)} style={{ height: 36, marginTop: 0 }} />
              </Row>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
