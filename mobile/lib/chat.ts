// Character chat actions (non-streaming), matching the web client's endpoints.
import { authFetch } from '@talkingbook/shared';

export type ChatMessage = {
  _id?: string;
  userMessage?: string;
  modelResponse?: string | null;
  suggestions?: string[];
  pageNumber?: number;
  // Client-only state for a voice turn in progress: the turn itself, whether
  // the reader's words are still being transcribed, and whether the reply is
  // still streaming in.
  voiceTurn?: boolean;
  voicePending?: boolean;
  streaming?: boolean;
};

export type ChatHistory = {
  messages: ChatMessage[];
  pagination?: { hasMore: boolean; page: number };
};

export const fetchChatHistory = (
  bookId: string,
  characterId: string,
  page = 1
): Promise<ChatHistory> =>
  authFetch({
    path: `/book/${bookId}/character/${characterId}/messages?page=${page}&limit=20`,
    method: 'GET',
  });

export const sendChatMessage = (
  bookId: string,
  characterId: string,
  prompt: string,
  pageNumber: number
) =>
  authFetch({
    path: `/book/${bookId}/character/${characterId}/chat`,
    method: 'POST',
    body: { prompt, pageNumber },
  });
