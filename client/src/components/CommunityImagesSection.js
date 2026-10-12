import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch, catchError } from '../utils';
import SectionHeader from './SectionHeader';
import { thumbUrl } from '@talkingbook/shared';

const CommunityImagesSection = () => {
  const navigate = useNavigate();
  const [images, setImages] = useState([]);

  // Fetch the latest images from the gallery
  useEffect(() => {
    const fetchFeaturedImages = async () => {
      const [error, data] = await catchError(authFetch({
        path: '/gallery/images?page=1&limit=5',
        method: 'GET',
        requireAuth: false
      }));

      if (error) {
        console.error('Error fetching gallery images:', error);
        return;
      }
      setImages((data.images || []).slice(0, 5));
    };

    fetchFeaturedImages();
  }, []);

  // The mosaic is laid out for exactly five tiles
  if (images.length < 5) return null;

  return (
    <section className="home-section">
      <SectionHeader
        eyebrow="Community"
        title="Scenes imagined by readers"
        subtitle="Turn any paragraph into an illustration or a short film while you read, and see what everyone else has made."
        actionLabel="Explore the gallery"
        actionTo="/gallery"
      />
      <div className="home-gallery">
        {images.map((image, index) => (
          <button
            type="button"
            key={image._id || index}
            className="home-gallery-item"
            onClick={() => navigate(image._id ? `/gallery/image/${image._id}` : '/gallery')}
          >
            {image.mediaType === 'video' ? (
              <video src={image.videoUrl} autoPlay loop muted playsInline />
            ) : (
              <img src={thumbUrl(image.imageUrl, 200)} alt="" loading="lazy" />
            )}
            {image.book && (
              <span className="home-gallery-caption">
                <span className="home-gallery-title">{image.book.title}</span>
                {image.book.author && <span className="home-gallery-author">{image.book.author}</span>}
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
};

export default CommunityImagesSection;
