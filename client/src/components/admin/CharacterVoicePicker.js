import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Play, Square, Search, RefreshCw } from 'react-feather';
import { authFetch, catchError } from '../../utils';

const toAudio = ({ mimeType, base64 }) => new Audio(`data:${mimeType};base64,${base64}`);

const GENDERS = [
  { value: '', label: 'All' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

const ENGINE_LABELS = { elevenlabs: 'ElevenLabs', deepgram: 'Deepgram', qwen: 'Qwen' };

const summary = (v) => [v.gender !== 'unknown' && v.gender, v.age, v.accent].filter(Boolean).join(' · ');

// The voice a character speaks with in voice chat, chosen from Privateer's
// voice catalogue. Voices are matched to characters automatically; admins can
// browse, preview and pick another, or hand it back to automatic matching.
// `characters` are the book's characters, to show which voices are taken.
export default function CharacterVoicePicker({ bookId, character, characters, voices, onChange }) {
  const [query, setQuery] = useState('');
  const [gender, setGender] = useState('');
  const [saving, setSaving] = useState(null); // voice id being saved, or 'auto'
  const [previewing, setPreviewing] = useState(null); // voice id loading or playing
  const audioRef = useRef(null);
  const previews = useRef(new Map()); // voice id → audio payload

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPreviewing(null);
  };

  useEffect(() => stop, []);

  const usedBy = useMemo(() => {
    const map = {};
    characters.forEach(c => {
      if (c._id !== character._id && c.voice) (map[c.voice] = map[c.voice] || []).push(c.firstName || 'Unnamed');
    });
    return map;
  }, [characters, character._id]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return voices.filter(v =>
      (!gender || v.gender === gender) &&
      (!q || [v.name, v.accent, v.age, ENGINE_LABELS[v.engine], ...v.traits, ...v.bestFor]
        .filter(Boolean).some(text => text.toLowerCase().includes(q)))
    );
  }, [voices, query, gender]);

  const current = voices.find(v => v.id === character.voice);

  const preview = async (voiceId) => {
    if (previewing === voiceId) return stop();
    stop();
    setPreviewing(voiceId);
    let payload = previews.current.get(voiceId);
    if (!payload) {
      const [error, data] = await catchError(authFetch({
        path: `/character-voices/${encodeURIComponent(voiceId)}/preview`,
        method: 'POST',
        body: {}
      }));
      if (error) {
        setPreviewing(null);
        return toast.error(error.message || 'Could not play a preview');
      }
      payload = data.audio;
      previews.current.set(voiceId, payload);
    }
    const audio = toAudio(payload);
    audio.onended = () => setPreviewing(playing => (playing === voiceId ? null : playing));
    audioRef.current = audio;
    audio.play().catch(() => setPreviewing(null));
  };

  const save = async (voiceId) => {
    setSaving(voiceId || 'auto');
    const [error, data] = await catchError(authFetch({
      path: `/book/${bookId}/character/${character._id}/voice`,
      method: 'PUT',
      body: { voice: voiceId || null }
    }));
    setSaving(null);
    if (error) return toast.error(error.message || 'Could not update the voice');
    onChange(data);
    const name = voices.find(v => v.id === data.voice)?.name || data.voice;
    toast.success(voiceId ? `Voice set to ${name}` : `Automatically matched ${name}`);
  };

  return (
    <div className="adm-field">
      <span className="adm-label">Voice</span>
      <span className="adm-hint">How this character sounds when readers talk to them out loud</span>

      <div className="adm-voice-current">
        <div>
          {current ? (
            <>
              <div>
                <strong>{current.name}</strong>
                <span className="adm-hint"> · {summary(current)} · {ENGINE_LABELS[current.engine]}</span>
              </div>
              <p className="adm-muted">
                {character.voiceSource === 'admin'
                  ? 'Chosen by an admin.'
                  : `Matched automatically${character.voiceReason ? `: ${character.voiceReason}` : '.'}`}
              </p>
            </>
          ) : (
            <p className="adm-muted" style={{ margin: 0 }}>
              No voice yet. One is matched automatically the first time a reader talks to this character, or pick one below.
            </p>
          )}
        </div>
        <button
          type="button"
          className="ui-btn ui-btn-sm ui-btn-secondary"
          onClick={() => save(null)}
          disabled={!!saving}
          title="Let the best-fitting unused voice be picked for this character"
        >
          <RefreshCw size={14} />
          {saving === 'auto' ? 'Matching…' : character.voiceSource === 'admin' || !current ? 'Match automatically' : 'Re-match'}
        </button>
      </div>

      <div className="adm-voice-filters">
        <label className="ui-search">
          <Search size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
            placeholder="Search voices: british, deep, warm, storytelling…"
            aria-label="Search voices"
          />
        </label>
        <div className="ui-chip-row" role="group" aria-label="Filter by gender">
          {GENDERS.map(g => (
            <button
              key={g.value}
              type="button"
              className={`ui-chip${gender === g.value ? ' active' : ''}`}
              aria-pressed={gender === g.value}
              onClick={() => setGender(g.value)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="adm-voice-list" aria-label="Voices">
        {shown.map(v => {
          const isCurrent = v.id === character.voice;
          return (
            <li key={v.id} className={`adm-voice-item${isCurrent ? ' is-current' : ''}`}>
              <button
                type="button"
                className="adm-icon-btn"
                onClick={() => preview(v.id)}
                aria-label={previewing === v.id ? `Stop ${v.name}` : `Preview ${v.name}`}
              >
                {previewing === v.id ? <Square size={14} /> : <Play size={14} />}
              </button>
              <div className="adm-row-body">
                <div>
                  <strong>{v.name}</strong>
                  <span className="adm-hint"> · {summary(v)} · {ENGINE_LABELS[v.engine]}</span>
                </div>
                <div>
                  {v.traits.join(', ')}
                  {usedBy[v.id] && <span className="adm-hint"> · used by {usedBy[v.id].join(', ')}</span>}
                </div>
              </div>
              {isCurrent ? (
                <span className="adm-badge adm-badge-accent">Current</span>
              ) : (
                <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary" onClick={() => save(v.id)} disabled={!!saving}>
                  {saving === v.id ? 'Saving…' : 'Use'}
                </button>
              )}
            </li>
          );
        })}
        {shown.length === 0 && <li className="adm-voice-item adm-hint">No voices match.</li>}
      </ul>
    </div>
  );
}
