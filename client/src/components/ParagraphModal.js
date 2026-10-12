import React, { useState, useEffect, useRef } from 'react';
import { X, Zap, RefreshCw, Settings, Video, Image } from 'react-feather';
import './ParagraphModal.css';
import { authFetch } from '../utils';
import { thumbUrl } from '@talkingbook/shared';

const generateSafeId = (text, pageNum) => {
  try {
    const uniqueText = `${pageNum}-${text}`;
    return btoa(unescape(encodeURIComponent(uniqueText))).slice(0, 12);
  } catch (e) {
    let hash = 0;
    const uniqueText = `${pageNum}-${text}`;
    for (let i = 0; i < uniqueText.length; i++) {
      const char = uniqueText.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).slice(0, 12);
  }
};

const imageStyles = [
  { id: 'realistic', name: 'Realistic', value: 'realistic digital art, highly detailed, professional quality' },
  { id: 'anime', name: 'Anime', value: 'anime style, vibrant colors, detailed illustration, studio ghibli inspired' },
  { id: 'watercolor', name: 'Watercolor', value: 'watercolor painting style, soft colors, artistic, dreamy atmosphere' },
  { id: 'comic', name: 'Comic Book', value: 'comic book style, bold lines, dynamic composition, vibrant colors' },
  { id: 'oil', name: 'Oil Painting', value: 'oil painting style, classical art, rich textures, dramatic lighting' },
  { id: 'fantasy', name: 'Fantasy', value: 'fantasy art style, magical atmosphere, ethereal lighting, detailed fantasy elements' },
  { id: 'minimalist', name: 'Minimalist', value: 'minimalist art style, clean lines, simple shapes, elegant composition' },
  { id: 'children', name: "Children's Book", value: "children's book illustration style, whimsical, cheerful colors, friendly appearance" }
];

const aspectRatios = [
  { id: '1:1', name: 'Square (1:1)', value: '1:1' },
  { id: '3:4', name: 'Portrait (3:4)', value: '3:4' },
  { id: '4:3', name: 'Landscape (4:3)', value: '4:3' },
  { id: '9:16', name: 'Tall Portrait (9:16)', value: '9:16' },
  { id: '16:9', name: 'Wide Landscape (16:9)', value: '16:9' }
];

export default function ParagraphModal({
  paragraph,
  onClose,
  pageNumber,
  allGeneratedImages,
  generatingImage,
  handleGenerateImage,
  handleGenerateVideo,
  isDarkMode,
  onImageSelect,
}) {
  const paragraphId = generateSafeId(paragraph.text, pageNumber);
  const paragraphImages = allGeneratedImages.filter(img => img.paragraphId === paragraphId);
  const [showGenerateSection, setShowGenerateSection] = useState(false);
  const [localCustomStyle, setLocalCustomStyle] = useState('');
  const realisticStyleValue = imageStyles.find(style => style.id === 'realistic')?.value;
  const [localSelectedStyle, setLocalSelectedStyle] = useState(realisticStyleValue || 'custom');
  const [localSelectedAspectRatio, setLocalSelectedAspectRatio] = useState('1:1');
  const existingVideo = paragraphImages.find(img => img.mediaType === 'video' && img.videoUrl);
  const existingProcessing = paragraphImages.find(img => img.mediaType === 'video' && img.status === 'processing');
  const [mediaMode, setMediaMode] = useState((existingVideo || existingProcessing) ? 'video' : 'image');
  const [videoDuration, setVideoDuration] = useState(6);
  const [videoAspectRatio, setVideoAspectRatio] = useState('16:9');
  const [videoResolution, setVideoResolution] = useState('720p');
  const [videoGenerationId, setVideoGenerationId] = useState(null);
  const [videoStatus, setVideoStatus] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const pollRef = useRef(null);

  // Clear poll interval on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Resume polling for in-progress video on modal open
  useEffect(() => {
    if (existingProcessing) {
      setVideoStatus('processing');
      setVideoGenerationId(existingProcessing._id);
      let attempts = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const data = await authFetch({ path: `/video-status/${existingProcessing._id}`, method: 'GET' });
          if (data.status === 'completed' && data.videoUrl) {
            setVideoUrl(data.videoUrl);
            setVideoStatus('completed');
            clearInterval(pollRef.current);
            pollRef.current = null;
          } else if (data.status === 'failed' || attempts >= 36) {
            setVideoStatus('failed');
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } catch (e) {
          if (attempts >= 36) {
            setVideoStatus('failed');
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }, 5000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStyleChange = (e) => {
    const value = e.target.value;
    setLocalSelectedStyle(value);
    if (value !== 'custom') {
      setLocalCustomStyle('');
    }
  };

  const handleCustomStyleChange = (e) => {
    setLocalCustomStyle(e.target.value);
    setLocalSelectedStyle('custom');
  };

  const handleLocalGenerateImage = async () => {
    const defaultStyle = 'realistic digital art, highly detailed, professional quality';
    const effectiveStyle = (localSelectedStyle === 'custom' && localCustomStyle.trim())
      ? localCustomStyle
      : (localSelectedStyle !== 'custom' ? localSelectedStyle : defaultStyle);

    if (mediaMode === 'video') {
      setVideoStatus('processing');
      setVideoGenerationId(null);
      setVideoUrl(null);
      const effectiveDuration = videoResolution !== '720p' ? 8 : videoDuration;
      const genId = await handleGenerateVideo(paragraphId, paragraph.text, effectiveStyle, effectiveDuration, videoAspectRatio, videoResolution);
      if (!genId) {
        setVideoStatus('failed');
        return;
      }
      setVideoGenerationId(genId);
      // Poll every 5s until completed/failed, max 36 attempts (~3 min)
      let attempts = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const data = await authFetch({ path: `/video-status/${genId}`, method: 'GET' });
          if (data.status === 'completed' && data.videoUrl) {
            setVideoUrl(data.videoUrl);
            setVideoStatus('completed');
            clearInterval(pollRef.current);
            pollRef.current = null;
          } else if (data.status === 'failed' || attempts >= 36) {
            setVideoStatus('failed');
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } catch (e) {
          if (attempts >= 36) {
            setVideoStatus('failed');
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }, 5000);
    } else {
      await handleGenerateImage(paragraphId, paragraph.text, effectiveStyle, localSelectedAspectRatio);
    }
  };

  return (
    <div className={`paragraph-modal-overlay ${isDarkMode ? 'dark-mode' : ''}`} onClick={onClose}>
      <div className={`paragraph-modal ${isDarkMode ? 'dark-mode' : ''}`} onClick={e => e.stopPropagation()}>
        <button className={`modal-close ${isDarkMode ? 'dark-mode' : ''}`} onClick={onClose}>
          <X size={24} />
        </button>

        <div className="paragraph-modal-content">
          <div className={`paragraph-text ${isDarkMode ? 'dark-mode' : ''}`}>
            <p>{paragraph.text}</p>
          </div>

          {(paragraphImages.filter(img => !img.status || img.status === 'completed').length > 0 || (existingProcessing && videoStatus !== 'completed')) && (
            <div className={`community-images ${isDarkMode ? 'dark-mode' : ''}`}>
              <div className="community-scroll-container">
                <div className="community-scroll">
                  {paragraphImages.filter(img => !img.status || img.status === 'completed').map((image, index) => (
                    <div
                      key={index}
                      className={`community-item ${isDarkMode ? 'dark-mode' : ''}`}
                      onClick={() => onImageSelect({ imageUrl: image.imageUrl, videoUrl: image.videoUrl, text: image.paragraphText, mediaType: image.mediaType })}
                      style={{ position: 'relative' }}
                    >
                      {image.mediaType === 'video' && image.videoUrl ? (
                        <video src={image.videoUrl} muted playsInline style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
                      ) : (
                        <img src={thumbUrl(image.imageUrl, 200)} alt={`Generated scene ${index + 1}`} />
                      )}
                      <span style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
                        {image.mediaType === 'video'
                          ? <Video size={12} color="#fff" />
                          : <Image size={12} color="#fff" />
                        }
                      </span>
                    </div>
                  ))}
                  {existingProcessing && videoStatus !== 'completed' && (
                    <div className={`community-item ${isDarkMode ? 'dark-mode' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: isDarkMode ? '#2a2a2a' : '#eee', minWidth: 120 }}>
                      <RefreshCw size={20} className="spin" />
                      <span style={{ marginLeft: 0, marginTop: 8, fontSize: 12 }}>Generating…</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className={`image-generation-controls ${isDarkMode ? 'dark-mode' : ''}`}>
            <div className="generation-media-toggle">
              <button
                className={`media-toggle-btn ${mediaMode === 'image' ? 'active' : ''} ${isDarkMode ? 'dark-mode' : ''}`}
                onClick={() => setMediaMode('image')}
                title="Generate Image"
              >
                <Image size={14} />
                Image
              </button>
              <button
                className={`media-toggle-btn ${mediaMode === 'video' ? 'active' : ''} ${isDarkMode ? 'dark-mode' : ''}`}
                onClick={() => setMediaMode('video')}
                title="Generate Video"
              >
                <Video size={14} />
                Video
              </button>
            </div>

            {mediaMode === 'video' && videoStatus === 'processing' && (
              <div className={`video-status-message ${isDarkMode ? 'dark-mode' : ''}`}>
                <RefreshCw size={14} className="spin" />
                Generating video… this may take a few minutes.
              </div>
            )}

            {mediaMode === 'video' && videoStatus === 'completed' && videoUrl && (
              <div className="video-preview">
                <video src={videoUrl} controls autoPlay loop muted playsInline style={{ width: '100%', borderRadius: '8px' }} />
              </div>
            )}

            {mediaMode === 'video' && videoStatus === 'failed' && (
              <div className={`video-status-message error ${isDarkMode ? 'dark-mode' : ''}`}>
                Video generation failed. Please try again.
              </div>
            )}

            <div className="generation-primary-controls">
              <button
                className={`generate-btn primary ${(generatingImage === paragraphId || videoStatus === 'processing') ? 'generating' : ''} ${isDarkMode ? 'dark-mode' : ''}`}
                onClick={handleLocalGenerateImage}
                disabled={generatingImage === paragraphId || videoStatus === 'processing'}
              >
                {(generatingImage === paragraphId || videoStatus === 'processing') ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    {mediaMode === 'video'
                      ? (videoStatus === 'completed' ? 'Regenerate Video' : 'Generate Video')
                      : 'Generate Image'
                    }
                  </>
                )}
              </button>

              <button
                className={`settings-toggle-btn ${isDarkMode ? 'dark-mode' : ''} ${showGenerateSection ? 'active' : ''}`}
                onClick={() => setShowGenerateSection(!showGenerateSection)}
                title="Style Settings"
              >
                <Settings size={16} />
              </button>
            </div>

            <div className={`generate-section ${showGenerateSection ? 'expanded' : 'collapsed'} ${isDarkMode ? 'dark-mode' : ''}`}>
              <div className="generate-section-content">
                <div className={`style-selector ${isDarkMode ? 'dark-mode' : ''}`}>
                  <div className={`preset-styles ${isDarkMode ? 'dark-mode' : ''}`}>
                    <label htmlFor="imageStyle">Preset Styles:</label>
                    <select
                      id="imageStyle"
                      value={localSelectedStyle}
                      onChange={handleStyleChange}
                      className={isDarkMode ? 'dark-mode' : ''}
                    >
                      <option value="custom">Custom Style</option>
                      {imageStyles.map(style => (
                        <option key={style.id} value={style.value}>
                          {style.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {localSelectedStyle === 'custom' && (
                    <div className={`custom-style-input ${isDarkMode ? 'dark-mode' : ''}`}>
                      <label htmlFor="customStyle">Describe the scene:</label>
                      <input
                        id="customStyle"
                        type="text"
                        value={localCustomStyle}
                        onChange={handleCustomStyleChange}
                        placeholder="Describe the scene. It's blended with the paragraph text..."
                        className={isDarkMode ? 'dark-mode' : ''}
                      />
                    </div>
                  )}
                  {mediaMode === 'video' ? (
                    <>
                    <div className={`aspect-ratio-selector ${isDarkMode ? 'dark-mode' : ''}`}>
                      <label htmlFor="videoDuration">Duration:</label>
                      <select
                        id="videoDuration"
                        value={videoDuration}
                        onChange={(e) => setVideoDuration(Number(e.target.value))}
                        className={isDarkMode ? 'dark-mode' : ''}
                      >
                        <option value={4}>4 seconds</option>
                        <option value={6}>6 seconds</option>
                        <option value={8}>8 seconds</option>
                      </select>
                    </div>
                    <div className={`aspect-ratio-selector ${isDarkMode ? 'dark-mode' : ''}`}>
                      <label htmlFor="videoAspectRatio">Orientation:</label>
                      <select
                        id="videoAspectRatio"
                        value={videoAspectRatio}
                        onChange={(e) => setVideoAspectRatio(e.target.value)}
                        className={isDarkMode ? 'dark-mode' : ''}
                      >
                        <option value="16:9">Landscape (16:9)</option>
                        <option value="9:16">Portrait (9:16)</option>
                      </select>
                    </div>
                    <div className={`aspect-ratio-selector ${isDarkMode ? 'dark-mode' : ''}`}>
                      <label htmlFor="videoResolution">Quality:</label>
                      <select
                        id="videoResolution"
                        value={videoResolution}
                        onChange={(e) => setVideoResolution(e.target.value)}
                        className={isDarkMode ? 'dark-mode' : ''}
                      >
                        <option value="720p">720p (all durations)</option>
                        <option value="1080p">1080p (8s only)</option>
                        <option value="4k">4K (8s only)</option>
                      </select>
                    </div>
                    </>
                  ) : (
                    <div className={`aspect-ratio-selector ${isDarkMode ? 'dark-mode' : ''}`}>
                      <label htmlFor="aspectRatio">Aspect Ratio:</label>
                      <select
                        id="aspectRatio"
                        value={localSelectedAspectRatio}
                        onChange={(e) => setLocalSelectedAspectRatio(e.target.value)}
                        className={isDarkMode ? 'dark-mode' : ''}
                      >
                        {aspectRatios.map(ratio => (
                          <option key={ratio.id} value={ratio.value}>
                            {ratio.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
