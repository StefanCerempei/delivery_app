import React, { useState, useRef } from 'react';

const MAX_PHOTOS = 5;
const MAX_SIZE_MB = 8;

const PhotoUploader = ({ photos = [], onChange }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    const processFiles = (fileList) => {
        setError('');
        const incoming = Array.from(fileList);

        if (photos.length + incoming.length > MAX_PHOTOS) {
            setError(`You can upload up to ${MAX_PHOTOS} photos.`);
            return;
        }

        const validItems = [];
        for (const file of incoming) {
            if (!file.type.startsWith('image/')) {
                setError('Only image files (JPG, PNG, WebP) are supported.');
                continue;
            }
            if (file.size > MAX_SIZE_MB * 1024 * 1024) {
                setError(`Each image must be smaller than ${MAX_SIZE_MB} MB.`);
                continue;
            }

            validItems.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                file,
                name: file.name,
                previewUrl: URL.createObjectURL(file)
            });
        }

        if (validItems.length > 0) {
            onChange([...photos, ...validItems]);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer?.files?.length) {
            processFiles(e.dataTransfer.files);
        }
    };

    const handleRemove = (id) => {
        const target = photos.find((p) => p.id === id);
        if (target?.previewUrl) {
            URL.revokeObjectURL(target.previewUrl);
        }
        onChange(photos.filter((p) => p.id !== id));
        setError('');
    };

    return (
        <div className="photo-uploader-block">
            <div className="uploader-label-row">
                <span className="picker-section-label">ITEM PHOTOS (OPTIONAL)</span>
                <span className="photo-counter">
          {photos.length}/{MAX_PHOTOS}
        </span>
            </div>

            {photos.length < MAX_PHOTOS && (
                <div
                    className={`dropzone-box ${isDragging ? 'dragging' : ''}`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        hidden
                        onChange={(e) => {
                            if (e.target.files?.length) {
                                processFiles(e.target.files);
                                e.target.value = '';
                            }
                        }}
                    />
                    <div className="dropzone-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></svg></div>
                    <div className="dropzone-text">
                        <strong>Drag photos here or click to browse</strong>
                        <span>Helps your Reloq crew bring the right straps & moving blankets</span>
                    </div>
                </div>
            )}

            {error && <p className="uploader-error">{error}</p>}

            {photos.length > 0 && (
                <div className="photo-previews-grid">
                    {photos.map((photo) => (
                        <div key={photo.id} className="photo-thumb-card">
                            <img src={photo.previewUrl} alt={photo.name} />
                            <button
                                type="button"
                                className="remove-photo-btn"
                                onClick={() => handleRemove(photo.id)}
                                title="Remove photo"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PhotoUploader;