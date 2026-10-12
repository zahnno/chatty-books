// Seeker build: publish a book on Solana and earn from readers' chats with its
// characters. Submit → admin review → mint (a Metaplex Core asset, fee in
// SKR) → the asset's holder claims earnings in USDC or SKR.
import { useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
// @ts-ignore - shared package is plain JS without type declarations
import { useAuth, thumbUrl } from '@talkingbook/shared';
import { Button, Chip, Row, Screen, Section, Txt } from '../components/ui';
import { Dialog } from '../components/Dialog';
import { useWalletStatus } from '../components/SeekerWallet';
import { isUserDeclined, linkWallet, shortAddress, walletErrorMessage, formatAmount } from '../lib/solana';
import {
  claimEarnings,
  explorerUrl,
  fetchMyPublishedBooks,
  fetchPublishingSettings,
  fetchSubmissions,
  formatUsd,
  mintBook,
  reviewBook,
  submitBook,
  type PayoutCurrency,
  type PublishedBook,
  type PublishingSettings,
} from '../lib/publishing';
import { useTheme } from '../lib/useTheme';
import { radii, space } from '../lib/theme';

const BOOK_TYPES = ['application/pdf', 'application/epub+zip', 'text/plain'];
const STATUS_LABEL: Record<PublishedBook['status'], string> = {
  pending_review: 'In review',
  approved: 'Approved · ready to mint',
  rejected: 'Not approved',
  minted: 'Live on Solana',
};

export default function Publish() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: wallet } = useWalletStatus();
  const { data: settings } = useQuery({ queryKey: ['publishingSettings'], queryFn: fetchPublishingSettings });
  const books = useQuery({ queryKey: ['publishedBooks'], queryFn: fetchMyPublishedBooks, enabled: !!user });
  const isAdmin = user?.role === 'admin';
  const submissions = useQuery({ queryKey: ['publishingSubmissions'], queryFn: fetchSubmissions, enabled: isAdmin });
  const [submitting, setSubmitting] = useState(false);
  // The picked file waiting on the rights confirmation, then the submitted notice.
  const [pendingFile, setPendingFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [submittedTitle, setSubmittedTitle] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['publishedBooks'] });
    queryClient.invalidateQueries({ queryKey: ['publishingSubmissions'] });
    queryClient.invalidateQueries({ queryKey: ['publishingSettings'] });
  };

  const connect = async () => {
    try {
      await linkWallet();
    } catch (err: any) {
      if (!isUserDeclined(err)) Alert.alert('Could not connect wallet', walletErrorMessage(err));
    } finally {
      queryClient.invalidateQueries({ queryKey: ['walletStatus'] });
    }
  };

  const upload = async (file: DocumentPicker.DocumentPickerAsset) => {
    setSubmitting(true);
    try {
      const book = await submitBook({ uri: file.uri, name: file.name, mimeType: file.mimeType || 'application/pdf' });
      setSubmittedTitle(book.title);
    } catch (err: any) {
      setSubmitError(err?.message || 'Try again in a moment.');
    } finally {
      setSubmitting(false);
      refresh();
    }
  };

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: BOOK_TYPES, copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    setPendingFile(result.assets[0]);
  };

  const share = settings ? settings.revenueShareBps / 100 : null;

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 32, paddingBottom: 64 }}
        refreshControl={<RefreshControl refreshing={books.isRefetching} onRefresh={refresh} />}
      >
        <View style={{ gap: 8 }}>
          <Txt variant="title">Publish on Solana</Txt>
          <Txt variant="subhead">
            Turn your book into characters readers can talk to. It's minted as an NFT on Solana, and whoever holds that
            NFT earns {share != null ? `${share}%` : 'a share'} of what readers spend chatting with its characters, paid
            out in USDC or SKR.
          </Txt>
        </View>

        <Section title="How it works">
          <View style={{ gap: 10 }}>
            <Step n={1} text="Upload a PDF, EPUB or TXT. We read it and create its characters." />
            <Step n={2} text="We review it for rights and safety." />
            <Step
              n={3}
              text={`Mint it with your wallet${settings?.publishFee ? ` (${formatAmount(settings.publishFee.amount, settings.publishFee.decimals, 'SKR')}, about $${settings.publishFee.usd})` : ''}. The book goes live.`}
            />
            <Step n={4} text="Every chat and voice reply with its characters earns you a cut. Claim it any time." />
          </View>
          {!user ? (
            <Txt variant="subhead">Sign in to publish.</Txt>
          ) : !wallet?.walletAddress ? (
            <Button title="Connect wallet to publish" icon="wallet-outline" onPress={connect} />
          ) : (
            <Button title="Submit a book" icon="cloud-upload-outline" loading={submitting} onPress={pick} />
          )}
          {submitting && (
            <Txt variant="caption">Reading your book. This takes a minute or two; keep the app open.</Txt>
          )}
        </Section>

        {!!books.data?.length && (
          <Section title="Your books">
            <View style={{ gap: 24 }}>
              {books.data.map((book) => (
                <BookCard key={book.id} book={book} settings={settings} wallet={wallet?.walletAddress} onChange={refresh} />
              ))}
            </View>
          </Section>
        )}

        {isAdmin && (
          <Section title="Review queue">
            {!submissions.data?.length ? (
              <Txt variant="subhead">Nothing waiting for review.</Txt>
            ) : (
              <View>
                {submissions.data.map((book, i) => (
                  <ReviewRow key={book.id} book={book} last={i === submissions.data.length - 1} onChange={refresh} />
                ))}
              </View>
            )}
          </Section>
        )}
      </ScrollView>

      <Dialog
        visible={!!pendingFile}
        onClose={() => setPendingFile(null)}
        icon="document-text-outline"
        eyebrow="Publish on Solana"
        title="Do you hold the rights?"
        message={`Only publish "${pendingFile?.name ?? ''}" if you wrote it or have permission to publish it. It stays private until we've reviewed it. Once it's minted, the right to manage and earn from it moves with its NFT.`}
        actions={[
          {
            label: 'Yes, I hold the rights',
            icon: 'checkmark',
            onPress: () => {
              const file = pendingFile!;
              setPendingFile(null);
              upload(file);
            },
          },
          { label: 'Cancel', variant: 'quiet', onPress: () => setPendingFile(null) },
        ]}
      />

      <Dialog
        visible={!!submittedTitle}
        onClose={() => setSubmittedTitle(null)}
        icon="sparkles"
        eyebrow="Submitted for review"
        title={submittedTitle ?? ''}
        message="We're creating its characters now. Once it's approved, you can mint it and start earning from every chat."
        actions={[{ label: 'Got it', onPress: () => setSubmittedTitle(null) }]}
      />

      <Dialog
        visible={!!submitError}
        onClose={() => setSubmitError(null)}
        icon="alert-circle-outline"
        title="Couldn't submit"
        message={submitError ?? undefined}
        actions={[{ label: 'OK', onPress: () => setSubmitError(null) }]}
      />
    </Screen>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: theme.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt variant="caption" color={theme.textPrimary}>
          {n}
        </Txt>
      </View>
      <Txt variant="body" style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}

function Cover({ uri, size }: { uri?: string; size: number }) {
  const theme = useTheme();
  return (
    <Image
      source={uri ? { uri: thumbUrl(uri, size * 2) } : undefined}
      style={{ width: size, height: size * 1.5, borderRadius: radii.sm, backgroundColor: theme.surfaceStrong }}
      contentFit="cover"
    />
  );
}

function BookCard({
  book,
  settings,
  wallet,
  onChange,
}: {
  book: PublishedBook;
  settings?: PublishingSettings;
  wallet?: string | null;
  onChange: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ icon: 'sparkles' | 'alert-circle-outline' | 'time-outline' | 'cash-outline'; title: string; message: string } | null>(null);
  const isHolder = !!wallet && book.holder === wallet;
  const canClaim = book.status === 'minted' && isHolder && book.availableUsd >= (settings?.minClaimUsd ?? 0.01);

  const mint = async () => {
    setBusy('mint');
    try {
      const status = await mintBook(book.id);
      setNotice(
        status === 'minted'
          ? { icon: 'sparkles', title: 'Published on Solana', message: `"${book.title}" is live, and its NFT is in your wallet. Every chat with its characters now earns you a share.` }
          : { icon: 'time-outline', title: 'Almost there', message: 'Your transaction was sent. The book goes live as soon as it lands on Solana.' },
      );
    } catch (err: any) {
      if (!isUserDeclined(err)) setNotice({ icon: 'alert-circle-outline', title: "Couldn't publish", message: walletErrorMessage(err) });
    } finally {
      setBusy(null);
      onChange();
    }
  };

  const claim = async (currency: PayoutCurrency) => {
    setBusy(currency);
    try {
      const result = await claimEarnings(book.id, currency);
      setNotice({
        icon: 'cash-outline',
        title: result.status === 'confirmed' ? 'Earnings sent' : 'Payout on its way',
        message: `${formatAmount(result.amount, result.decimals, currency)} (${formatUsd(result.usd)}) to ${shortAddress(wallet!)}.`,
      });
    } catch (err: any) {
      setNotice({ icon: 'alert-circle-outline', title: "Couldn't claim", message: err?.message || 'Try again in a moment.' });
    } finally {
      setBusy(null);
      onChange();
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <Cover uri={book.image_url} size={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="bodyStrong" numberOfLines={2}>
            {book.title}
          </Txt>
          {!!book.author && <Txt variant="subhead">{book.author}</Txt>}
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <Chip
              label={STATUS_LABEL[book.status]}
              icon={book.status === 'minted' ? 'checkmark-circle' : book.status === 'rejected' ? 'close-circle' : 'time-outline'}
              active={book.status === 'minted'}
            />
          </View>
        </View>
      </View>

      {book.status === 'rejected' && !!book.reviewNote && <Txt variant="subhead">{book.reviewNote}</Txt>}

      {book.canEdit && (
        <Button title="Edit book & characters" icon="create-outline" variant="outline" onPress={() => router.push(`/edit-book/${book.id}`)} />
      )}

      {book.status === 'approved' && (
        <Button
          title={
            settings?.publishFee
              ? `Mint & publish · ${formatAmount(settings.publishFee.amount, settings.publishFee.decimals, 'SKR')}`
              : 'Mint & publish'
          }
          icon="sparkles-outline"
          loading={busy === 'mint'}
          onPress={mint}
        />
      )}

      {book.status === 'minted' && (
        <>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Stat label="Chats" value={book.interactions.toLocaleString()} />
            <Stat label="Earned" value={formatUsd(book.earnedUsd)} />
            <Stat label="To claim" value={formatUsd(book.availableUsd)} highlight />
          </View>

          {!!book.asset && (
            <Pressable onPress={() => Linking.openURL(explorerUrl(book.asset!))} accessibilityRole="link">
              <Txt variant="caption" color={theme.accent}>
                NFT {shortAddress(book.asset)} · {book.revenueShareBps / 100}% revenue share ·{' '}
                {isHolder ? 'held by you' : `held by ${shortAddress(book.holder || '')}`}
              </Txt>
            </Pressable>
          )}

          {isHolder &&
            (settings?.payoutCurrencies.length ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {settings.payoutCurrencies.map((c) => (
                  <Button
                    key={c}
                    title={`Claim in ${c}`}
                    variant={c === 'USDC' ? 'primary' : 'outline'}
                    disabled={!canClaim || !!busy}
                    loading={busy === c}
                    onPress={() => claim(c)}
                    style={{ flex: 1 }}
                  />
                ))}
              </View>
            ) : (
              <Txt variant="caption">Payouts are paused right now. Your earnings keep adding up.</Txt>
            ))}
          {isHolder && !canClaim && book.availableUsd > 0 && (
            <Txt variant="caption">You can claim once this book has earned {formatUsd(settings?.minClaimUsd ?? 0.01)}.</Txt>
          )}

          {book.characters.length > 0 && (
            <View>
              {book.characters.slice(0, 5).map((c, i, list) => (
                <Row key={c.id} last={i === list.length - 1}>
                  <Image
                    source={c.image_url ? { uri: thumbUrl(c.image_url, 64) } : undefined}
                    style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.surfaceStrong }}
                  />
                  <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
                    {c.name}
                  </Txt>
                  <Txt variant="subhead">
                    {c.interactions.toLocaleString()} chats · {formatUsd(c.earnedUsd)}
                  </Txt>
                </Row>
              ))}
            </View>
          )}
        </>
      )}

      <Dialog
        visible={!!notice}
        onClose={() => setNotice(null)}
        icon={notice?.icon}
        title={notice?.title ?? ''}
        message={notice?.message}
        actions={[{ label: 'OK', onPress: () => setNotice(null) }]}
      />
    </View>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, padding: space.md, borderRadius: radii.md, backgroundColor: theme.surface, gap: 2 }}>
      <Txt variant="caption">{label}</Txt>
      <Txt variant="bodyStrong" color={highlight ? theme.accent : theme.textPrimary}>
        {value}
      </Txt>
    </View>
  );
}

function ReviewRow({ book, last, onChange }: { book: PublishedBook; last: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      await reviewBook(book.id, approve, approve ? undefined : "We couldn't confirm the rights to this book.");
    } catch (err: any) {
      Alert.alert('Could not save review', err?.message || 'Try again.');
    } finally {
      setBusy(false);
      onChange();
    }
  };
  return (
    <Row last={last}>
      <Cover uri={book.image_url} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="body" numberOfLines={1}>
          {book.title}
        </Txt>
        <Txt variant="caption">
          {book.author || 'Unknown author'} · {book.characters.length} characters
        </Txt>
      </View>
      <Chip label="Reject" icon="close" onPress={busy ? undefined : () => decide(false)} />
      <Chip label="Approve" icon="checkmark" active onPress={busy ? undefined : () => decide(true)} />
    </Row>
  );
}
