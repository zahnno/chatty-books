import React, { useEffect, useState } from "react";
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Edit2, Image, Mic, Plus, Trash2, Users } from 'react-feather';
import { catchError, authFetch } from '../utils.js';
import CharacterVoicePicker from './admin/CharacterVoicePicker';
import { AdminLayout, Badge, EmptyState, Field, FileDrop, Loading, Modal, Notice } from './admin/AdminUI';
import { thumbUrl } from '@talkingbook/shared';

const TEXT_FIELDS = ['firstName', 'lastName', 'gender', 'race', 'intro', 'description', 'events', 'appearance', 'styling'];
const LIST_FIELDS = [
  { name: 'personalityTraits', label: 'Personality traits', hint: '5 to 7 traits, comma separated', placeholder: 'Brave, curious, stubborn' },
  { name: 'strengths', label: 'Strengths', hint: '3 or 4, comma separated', placeholder: 'Leadership, swordplay' },
  { name: 'weaknesses', label: 'Weaknesses', hint: '3 or 4, comma separated', placeholder: 'Short temper, trusts too easily' },
  { name: 'goals', label: 'Goals', hint: '2 or 3, comma separated', placeholder: 'Find her brother, reclaim the throne' },
];

// Form state keeps list fields as the raw text the admin types, so commas are not
// swallowed mid-typing; they are split into arrays only when saving.
const toForm = (character = {}) => ({
  _id: character._id || null,
  image_url: character.image_url || '',
  ...Object.fromEntries(TEXT_FIELDS.map(f => [f, character[f] || ''])),
  ...Object.fromEntries(LIST_FIELDS.map(({ name }) => [name, (character[name] || []).join(', ')])),
});

const splitList = (text) => text.split(',').map(item => item.trim()).filter(Boolean);
const fullName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unnamed';

function CharacterForm({ bookId, initial, characters, voices, onVoiceChange, onSaved, onClose }) {
  const [form, setForm] = useState(() => toForm(initial));
  const [image, setImage] = useState(null); // { file, url }
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(form._id);
  const liveCharacter = characters.find(c => c._id === form._id) || initial;

  useEffect(() => () => { if (image?.url) URL.revokeObjectURL(image.url); }, [image]);

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.firstName.trim()) return toast.error('Give the character a first name');
    const body = new FormData();
    TEXT_FIELDS.forEach(f => body.append(f, form[f].trim()));
    LIST_FIELDS.forEach(({ name }) => body.append(name, JSON.stringify(splitList(form[name]))));
    if (image) body.append('image', image.file);

    setSaving(true);
    const [error, data] = await catchError(authFetch({
      path: isEdit ? `/book/${bookId}/character/${form._id}/edit` : `/book/${bookId}/character/new`,
      method: 'POST',
      body,
    }));
    setSaving(false);
    if (error || !data?._id) return toast.error(error?.message || `Could not ${isEdit ? 'update' : 'create'} the character`);
    toast.success(isEdit ? `${fullName(data)} updated` : `${fullName(data)} created`);
    onSaved(data, isEdit);
  };

  return (
    <Modal title={isEdit ? `Edit ${fullName(initial)}` : 'New character'} onClose={onClose} wide busy={saving}>
      <form className="adm-form" onSubmit={save}>
        <div className="adm-form-row">
          <Field label="First name" htmlFor="firstName">
            <input id="firstName" name="firstName" className="adm-input" value={form.firstName} onChange={handleChange} required />
          </Field>
          <Field label="Last name" htmlFor="lastName">
            <input id="lastName" name="lastName" className="adm-input" value={form.lastName} onChange={handleChange} />
          </Field>
        </div>
        <div className="adm-form-row">
          <Field label="Gender" htmlFor="gender">
            <input id="gender" name="gender" className="adm-input" value={form.gender} onChange={handleChange} />
          </Field>
          <Field label="Race" htmlFor="race">
            <input id="race" name="race" className="adm-input" value={form.race} onChange={handleChange} />
          </Field>
        </div>
        <Field label="Intro" htmlFor="intro" hint="A short, memorable line shown on the character card">
          <input id="intro" name="intro" className="adm-input" value={form.intro} onChange={handleChange} />
        </Field>
        <Field label="Description" htmlFor="description" hint="Background, personality and role in the story">
          <textarea id="description" name="description" className="adm-textarea" value={form.description} onChange={handleChange} />
        </Field>
        <Field label="Key events" htmlFor="events" hint="Important events involving this character, in order">
          <textarea id="events" name="events" className="adm-textarea" value={form.events} onChange={handleChange} />
        </Field>
        <div className="adm-form-row">
          <Field label="Appearance" htmlFor="appearance" hint="Used for portrait generation">
            <textarea id="appearance" name="appearance" className="adm-textarea" value={form.appearance} onChange={handleChange} />
          </Field>
          <Field label="Image style" htmlFor="styling" hint="e.g. watercolor, realistic, anime">
            <input id="styling" name="styling" className="adm-input" value={form.styling} onChange={handleChange} />
          </Field>
        </div>
        <div className="adm-form-row">
          {LIST_FIELDS.map(({ name, label, hint, placeholder }) => (
            <Field key={name} label={label} htmlFor={name} hint={hint}>
              <input id={name} name={name} className="adm-input" value={form[name]} onChange={handleChange} placeholder={placeholder} />
            </Field>
          ))}
        </div>
        <Field label="Portrait">
          <FileDrop
            accept="image/png, image/jpeg, image/webp"
            label={form.image_url ? 'Replace portrait' : 'Upload a portrait'}
            hint="Click to choose, or drop an image here"
            fileName={image?.file.name}
            previewUrl={image?.url || form.image_url || undefined}
            previewShape="square"
            onFile={(file) => setImage({ file, url: URL.createObjectURL(file) })}
            onClear={image ? () => setImage(null) : undefined}
          />
        </Field>

        {isEdit && voices.length > 0 && (
          <CharacterVoicePicker
            bookId={bookId}
            character={liveCharacter}
            characters={characters}
            voices={voices}
            onChange={(voiceFields) => onVoiceChange(form._id, voiceFields)}
          />
        )}

        <div className="adm-form-actions">
          <button type="submit" className="ui-btn ui-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create character'}
          </button>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminCharactersPage() {
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [voices, setVoices] = useState([]);
  const [editing, setEditing] = useState(null); // character object, {} for new, or null
  const [generating, setGenerating] = useState(() => new Set());
  const [matchingVoices, setMatchingVoices] = useState(false);

  const fetchCharacters = async () => {
    setLoading(true);
    setError(null);
    const [err, data] = await catchError(authFetch({ path: `/book/${bookId}/characters` }));
    if (err) setError(err.message || 'Could not load characters');
    if (data) setCharacters(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchCharacters();
    catchError(authFetch({ path: `/book/${bookId}` })).then(([, data]) => data && setBook(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  useEffect(() => {
    catchError(authFetch({ path: '/character-voices' })).then(([, data]) => data && setVoices(data));
  }, []);

  const voiceName = (id) => voices.find(v => v.id === id)?.name || id;

  const applyVoice = (characterId, voiceFields) => {
    setCharacters(prev => prev.map(c => (c._id === characterId ? { ...c, ...voiceFields } : c)));
  };

  const matchVoices = async () => {
    setMatchingVoices(true);
    const [err, data] = await catchError(authFetch({ path: `/book/${bookId}/characters/assign-voices`, method: 'POST' }));
    setMatchingVoices(false);
    if (err) return toast.error(err.message || 'Could not match voices');
    data.characters.forEach(({ _id, voice, voiceSource, voiceReason }) => applyVoice(_id, { voice, voiceSource, voiceReason }));
    toast.success(data.assigned ? `Matched voices for ${data.assigned} character${data.assigned !== 1 ? 's' : ''}` : 'Every character already has a voice');
  };

  const deleteCharacter = async (character) => {
    if (!window.confirm(`Delete ${fullName(character)}? Their chat history stays, but the character is removed from the book.`)) return;
    const [err] = await catchError(authFetch({ path: `/book/${bookId}/characters/${character._id}/delete`, method: 'POST' }));
    if (err) return toast.error(err.message || 'Could not delete the character');
    setCharacters(prev => prev.filter(c => c._id !== character._id));
    toast.success(`${fullName(character)} deleted`);
  };

  const generateImage = async (character) => {
    setGenerating(prev => new Set(prev).add(character._id));
    const [err, data] = await catchError(authFetch({
      path: `/book/${bookId}/character/${character._id}/generate-image`,
      method: 'POST',
    }));
    setGenerating(prev => { const next = new Set(prev); next.delete(character._id); return next; });
    if (err || !data?.success) return toast.error(err?.message || data?.message || 'Could not generate a portrait');
    setCharacters(prev => prev.map(c => (c._id === character._id ? { ...c, image_url: data.image_url } : c)));
    toast.success(`New portrait for ${fullName(character)}`);
  };

  const onSaved = (saved, isEdit) => {
    setCharacters(prev => (isEdit ? prev.map(c => (c._id === saved._id ? saved : c)) : [...prev, saved]));
    setEditing(null);
  };

  const missingVoices = voices.length > 0 && characters.some(c => !voices.some(v => v.id === c.voice));

  return (
    <AdminLayout
      title="Characters"
      eyebrow={book?.title || 'Book'}
      subtitle={characters.length ? `${characters.length} character${characters.length !== 1 ? 's' : ''}.` : undefined}
      back={{ to: `/admin/books/${bookId}`, label: 'Back to book' }}
      actions={(
        <>
          {missingVoices && (
            <button type="button" className="ui-btn ui-btn-secondary" onClick={matchVoices} disabled={matchingVoices}>
              <Mic size={16} />
              {matchingVoices ? 'Matching…' : 'Match voices'}
            </button>
          )}
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => setEditing({})}>
            <Plus size={16} />New character
          </button>
        </>
      )}
    >
      {error && <Notice onRetry={fetchCharacters}>{error}</Notice>}

      {loading ? (
        <Loading label="Loading characters…" />
      ) : characters.length === 0 && !error ? (
        <EmptyState
          icon={Users}
          title="No characters yet"
          text="Add characters by hand, or use Generate characters on the book page to find them in the text."
          action={<button type="button" className="ui-btn ui-btn-primary" onClick={() => setEditing({})}><Plus size={16} />New character</button>}
        />
      ) : (
        <div className="adm-list">
          {characters.map(character => (
            <div key={character._id} className="adm-row">
              {character.image_url
                ? <img className="adm-avatar" src={thumbUrl(character.image_url, 100)} alt="" loading="lazy" />
                : <div className="adm-avatar" />}
              <div className="adm-row-body">
                <p className="adm-row-title">{fullName(character)}</p>
                {character.intro && <p className="adm-row-sub clamp">{character.intro}</p>}
                <div className="adm-row-meta">
                  {character.voice
                    ? <Badge><Mic size={11} />{voiceName(character.voice)} · {character.voiceSource === 'admin' ? 'chosen' : 'auto'}</Badge>
                    : <Badge tone="warning">No voice</Badge>}
                  {!character.image_url && <Badge tone="warning">No portrait</Badge>}
                </div>
              </div>
              <div className="adm-row-actions">
                <button
                  type="button"
                  className="ui-btn ui-btn-sm ui-btn-ghost"
                  onClick={() => generateImage(character)}
                  disabled={generating.has(character._id)}
                >
                  {generating.has(character._id) ? <span className="adm-spinner" /> : <Image size={14} />}
                  {generating.has(character._id) ? 'Generating…' : 'Portrait'}
                </button>
                <button type="button" className="adm-icon-btn" aria-label={`Edit ${fullName(character)}`} title="Edit" onClick={() => setEditing(character)}>
                  <Edit2 size={16} />
                </button>
                <button type="button" className="adm-icon-btn danger" aria-label={`Delete ${fullName(character)}`} title="Delete" onClick={() => deleteCharacter(character)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CharacterForm
          key={editing._id || 'new'}
          bookId={bookId}
          initial={editing}
          characters={characters}
          voices={voices}
          onVoiceChange={applyVoice}
          onSaved={onSaved}
          onClose={() => setEditing(null)}
        />
      )}
    </AdminLayout>
  );
}
