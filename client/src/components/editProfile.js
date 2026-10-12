import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { SERVER_URI } from "../constants.js";
import { User, Users, Calendar, Hash, FileText, Smile, ArrowLeft, Upload } from 'react-feather';
import { authFetch, catchError } from '../utils.js';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

// Predefined options
const CHARACTERISTICS_OPTIONS = [
  'friendly', 'creative', 'analytical', 'adventurous', 'organized',
  'empathetic', 'introverted', 'extroverted', 'curious', 'determined',
  'patient', 'ambitious', 'reliable', 'adaptable', 'thoughtful',
  'energetic', 'calm', 'focused', 'innovative', 'practical'
];

const MOODS_OPTIONS = [
  'happy', 'excited', 'peaceful', 'focused', 'inspired',
  'relaxed', 'energetic', 'curious', 'reflective', 'playful',
  'determined', 'calm', 'enthusiastic', 'content', 'motivated'
];

export default function EditProfile() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const { user, authenticate } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [gender, setGender] = useState(user?.gender || 'prefer not to say');
  const [dateOfBirth, setDateOfBirth] = useState(user?.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : '');
  const [characteristics, setCharacteristics] = useState(user?.characteristics || []);
  const [description, setDescription] = useState(user?.description || '');
  const [moods, setMoods] = useState(user?.moods || []);
  const [profileImage, setProfileImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(user?.profileImage || null);

  useEffect(() => {
    if (!user?.email) {
      navigate('/login');
    }
  }, [user, navigate]);

  const handleCharacteristicsChange = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions).map(option => option.value);
    setCharacteristics(selectedOptions);
  };

  const handleMoodsChange = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions).map(option => option.value);
    setMoods(selectedOptions);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error('Image size should be less than 5MB');
        return;
      }
      setProfileImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const updateProfile = async () => {
    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('gender', gender);
      if (dateOfBirth) formData.append('dateOfBirth', dateOfBirth);
      characteristics.forEach(char => {
        formData.append('characteristics', char);
      });
      formData.append('description', description);
      moods.forEach(mood => {
        formData.append('moods', mood);
      });
      if (profileImage) {
        formData.append('profileImage', profileImage);
      }

      const [error, data] = await catchError(authFetch({
        path: '/update-profile',
        method: 'PUT',
        body: formData
      }));

      if (error) {
        toast.error(error.message || "Failed to update profile");
        return;
      }

      toast.success(data.message);
      navigate('/settings');
    } catch (error) {
      toast.error(error.message || "An error occurred while updating profile");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container auth-container-wide">
        <div className="auth-content">
          <div className="profile-header">
            <div className="profile-avatar" style={{ position: 'relative' }}>
              {imagePreview ? (
                <img 
                  src={imagePreview} 
                  alt="Profile" 
                  style={{ 
                    width: '100px', 
                    height: '100px', 
                    borderRadius: '50%',
                    objectFit: 'cover'
                  }} 
                />
              ) : (
                <User size={100} strokeWidth={1.5} />
              )}
              <div className="image-upload-overlay">
                <label htmlFor="profile-image" style={{ cursor: 'pointer' }}>
                  <Upload size={20} />
                  <input
                    type="file"
                    id="profile-image"
                    accept="image/*"
                    onChange={handleImageChange}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>
            <h1>Edit Profile</h1>
            <p className="auth-subtitle">Update your personal information to make your character chats aware of who you are.</p>
          </div>

          <div className="auth-form">
            <div className="form-field">
              <label>Username</label>
              <div className="input-group">
                <User size={18} />
                <input 
                  type="text" 
                  placeholder="Enter your username" 
                  value={username} 
                  onChange={e => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Gender</label>
                <div className="input-group">
                  <Users size={18} />
                  <select 
                    value={gender} 
                    onChange={e => setGender(e.target.value)}
                    className="select-input"
                  >
                    <option value="prefer not to say">Prefer not to say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-field">
                <label>Date of Birth</label>
                <div className="input-group">
                  <Calendar size={18} />
                  <input 
                    type="date" 
                    placeholder="Select your date of birth" 
                    value={dateOfBirth} 
                    onChange={e => setDateOfBirth(e.target.value)} 
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
            </div>

            <div className="form-field">
              <label>Characteristics (hold Ctrl/Cmd to select multiple)</label>
              <div className="input-group">
                <select 
                  multiple
                  value={characteristics}
                  onChange={handleCharacteristicsChange}
                  className="select-input multiple"
                  size="5"
                >
                  {CHARACTERISTICS_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="selected-items">
                {characteristics.map(char => (
                  <span key={char} className="selected-tag">
                    {char}
                  </span>
                ))}
              </div>
            </div>

            <div className="form-field">
              <label>Description</label>
              <div className="input-group">
                <FileText size={18} />
                <textarea 
                  placeholder="Tell us about yourself..." 
                  value={description} 
                  onChange={e => setDescription(e.target.value)}
                  className="textarea-input"
                />
              </div>
            </div>

            <div className="form-field">
              <label>Moods (hold Ctrl/Cmd to select multiple)</label>
              <div className="input-group">
                <select 
                  multiple
                  value={moods}
                  onChange={handleMoodsChange}
                  className="select-input multiple"
                  size="5"
                >
                  {MOODS_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="selected-items">
                {moods.map(mood => (
                  <span key={mood} className="selected-tag">
                    {mood}
                  </span>
                ))}
              </div>
            </div>

            <div className="auth-buttons">
              <button className="auth-button" onClick={updateProfile}>
                Update Profile
              </button>
              <button className="auth-button secondary" onClick={() => navigate('/settings')}>
                <ArrowLeft size={18} />
                <span>Back to Settings</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .profile-avatar {
          margin-bottom: 20px;
          position: relative;
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .image-upload-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(0, 0, 0, 0.5);
          padding: 5px;
          display: flex;
          justify-content: center;
          align-items: center;
          color: white;
          cursor: pointer;
          transition: opacity 0.3s;
        }

        .image-upload-overlay:hover {
          opacity: 0.8;
        }

        .select-input.multiple {
          height: auto;
          min-height: 120px;
          padding: 8px;
          width: 100%;
        }

        .select-input.multiple option {
          padding: 4px 8px;
          margin: 2px 0;
          border-radius: 4px;
          cursor: pointer;
        }

        .select-input.multiple option:hover {
          background-color: var(--hover-background);
        }

        .selected-items {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }

        .selected-tag {
          background: var(--accent-color);
          color: white;
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 500;
        }

        .input-group {
          position: relative;
        }

        .input-group svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
} 