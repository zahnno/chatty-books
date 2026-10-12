import React, { useMemo, useState } from "react";
import BookListHorizontal from "./BookListHorizontal";
import FeaturedBookCarousel from "./FeaturedBookCarousel";
import HeroSection from "./HeroSection";
import CommunityImagesSection from "./CommunityImagesSection";
import AudiobookSection from "./AudiobookSection";
import ChatWithCharactersSection from "./ChatWithCharactersSection";
import SectionHeader from "./SectionHeader";
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBooks, useTopCharacters, useBookPrefetch } from '../hooks/useApi';
import { preloadBookPage } from '../utils/routePrefetch';
import HomePageSkeleton from './skeletons/HomePageSkeleton';
import '../styles/home.css';

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const prefetchBook = useBookPrefetch();
  const onBookHoverCb = (book) => {
    preloadBookPage();
    prefetchBook(book._id, book.currentPage || 1);
  };

  // Use cached API hooks
  const { data: booksData, isLoading: booksLoading } = useBooks();
  const { data: topCharactersData, isLoading: charactersLoading } = useTopCharacters();

  const [selectedCategory, setSelectedCategory] = useState(null);

  // Memoize computed values to prevent unnecessary recalculations
  const { books, categories, allBooks } = useMemo(() => {
    if (!booksData) return { books: { featured: [], popular: [], other: [] }, categories: [], allBooks: [] };

    const books = booksData;
    // Deduplicate books by ID to prevent duplicates across featured, popular, and other
    const combinedBooks = [...books.featured, ...books.popular, ...books.other];
    const allBooks = combinedBooks.filter((book, index, self) =>
      index === self.findIndex(b => b._id === book._id)
    );
    const categories = [...new Set(allBooks.flatMap(book => book.categories || []))];

    return { books, categories, allBooks };
  }, [booksData]);

  // Show content when we have cached data; only full-page load when no data at all and still loading.
  // Do not block on auth; show public content immediately.
  const hasAnyData = booksData != null || topCharactersData != null;
  const stillLoading = booksLoading || charactersLoading;
  const showFullPageLoading = !hasAnyData && stillLoading;

  const handleImageClick = (id) => {
    navigate(`/books/${id}`);
  }

  const handleContinueReading = (id, currentPage) => {
    navigate(`/books/${id}/page/${currentPage}`);
  }

  const shownCategories = categories.slice(0, 10);
  const activeCategory = selectedCategory && shownCategories.includes(selectedCategory)
    ? selectedCategory
    : (shownCategories.includes('Fantasy') ? 'Fantasy' : shownCategories[0]);
  const categoryBooks = useMemo(
    () => allBooks.filter(book => book.categories?.includes(activeCategory)),
    [allBooks, activeCategory]
  );

  if (showFullPageLoading) {
    return (
      <div className="main-container">
        <HomePageSkeleton />
      </div>
    );
  }

  return (
    <div className="home">
      <HeroSection books={allBooks} />

      {books.popular?.length > 0 && (
        <section className="home-section">
          <BookListHorizontal
            eyebrow="Trending"
            title="Popular now"
            books={books.popular}
            actionLabel={user ? 'Your library' : undefined}
            actionTo={user ? '/books' : undefined}
            handleClick={handleImageClick}
            handleAction={handleContinueReading}
            onBookHover={onBookHoverCb}
          />
        </section>
      )}

      {topCharactersData?.length > 0 && (
        <ChatWithCharactersSection characters={topCharactersData} />
      )}

      {books.featured?.length > 0 && (
        <FeaturedBookCarousel
          books={books.featured}
          handleClick={handleImageClick}
          user={user}
          onBookHover={onBookHoverCb}
        />
      )}

      <CommunityImagesSection />

      <AudiobookSection allBooks={allBooks} />

      {shownCategories.length > 0 && (
        <section className="home-section">
          <SectionHeader eyebrow="Browse" title="Explore by genre" />
          <div className="ui-chip-row home-genres" role="tablist">
            {shownCategories.map((category) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === category}
                key={category}
                className={`ui-chip ${activeCategory === category ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <BookListHorizontal
            books={categoryBooks}
            handleClick={handleImageClick}
            handleAction={handleContinueReading}
            onBookHover={onBookHoverCb}
          />
        </section>
      )}
    </div>
  );
}
