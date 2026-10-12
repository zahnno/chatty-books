import React from 'react';
import { X, Image as ImageIcon } from 'react-feather';
import { thumbUrl } from '@talkingbook/shared';

export default function PageGalleryModal({ allGeneratedImages, pageNumber, onClose, onSelectImage, isDarkMode }) {
  return (
    <div className="image-modal-overlay" onClick={onClose}>
      <div className="reader-gallery-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={24} />
        </button>
        <h2>Images - Page {pageNumber}</h2>

        <div className="reader-gallery-scroll-container">
          {allGeneratedImages.length > 0 ? (
            <div className="reader-gallery-scroll">
              {allGeneratedImages.map((image, index) => (
                <div
                  key={index}
                  className="reader-gallery-item"
                  onClick={() => {
                    onSelectImage({ url: image.imageUrl, text: image.paragraphText });
                    onClose();
                  }}
                >
                  <img src={thumbUrl(image.imageUrl, 200)} alt={`Generated scene ${index + 1}`} />
                  <div className="reader-gallery-item-info">
                    <div>{image.paragraphText?.substring(0, 50)}...</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="reader-gallery-placeholder">
              <ImageIcon size={48} />
              <p>No images have been generated for this page yet.</p>
              <p className="reader-gallery-placeholder-subtitle">Enable AI Images mode and click on paragraphs to generate the first one!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
