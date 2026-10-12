import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, BookOpen, RefreshCw, Mic } from 'react-feather';
import { thumbUrl } from '@talkingbook/shared';

const features = [
  {
    icon: <Mic size={18} />,
    title: 'Multiple voices',
    desc: 'Pick the narrator that suits the story. Each book offers several voices.',
  },
  {
    icon: <RefreshCw size={18} />,
    title: 'Synced with reading',
    desc: 'Switch between reading and listening and it picks up right where you left off.',
  },
  {
    icon: <BookOpen size={18} />,
    title: 'Follow along',
    desc: 'The player tracks the current page, so you always know where you are.',
  },
];

export default function AudiobookSection({ allBooks = [] }) {
  const navigate = useNavigate();

  const books = useMemo(
    () => allBooks.filter(b => b.hasAudio && b.image_url).slice(0, 5),
    [allBooks]
  );

  if (books.length === 0) return null;

  return (
    <section className="home-band">
      <div className="home-band-inner home-audio">
        <div className="home-audio-copy">
          <span className="ui-section-eyebrow">Audiobooks</span>
          <h2 className="ui-section-title">Every book, narrated</h2>
          <p className="ui-section-subtitle">
            Listen to any title as a full audiobook, paged and kept in sync with your reading.
          </p>
          <ul className="home-feature-list">
            {features.map((f) => (
              <li key={f.title}>
                <span className="home-feature-icon">{f.icon}</span>
                <span>
                  <strong>{f.title}</strong>
                  {f.desc}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="home-audio-covers">
          {books.map((book) => (
            <button
              type="button"
              key={book._id}
              className="home-audio-cover"
              onClick={() => navigate(`/books/${book._id}`)}
              aria-label={`${book.title}, audiobook`}
            >
              <img src={thumbUrl(book.image_url, 200)} alt="" loading="lazy" />
              <span className="home-audio-badge">
                <Headphones size={12} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
