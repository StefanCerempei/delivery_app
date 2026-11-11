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
            setError(`Poți încărca maximum ${MAX_PHOTOS} fotografii.`);
            return;
        }

        const validItems = [];
        for (const file of incoming) {
            if (!file.type.startsWith('image/')) {
                setError('Sunt permise doar fișiere imagine (JPG, PNG, WebP).');
                continue;
            }
            if (file.size > MAX_SIZE_MB * 1024 * 1024) {
                setError(`Fiecare imagine trebuie să aibă sub ${MAX_SIZE_MB} MB.`);
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
                <span className="picker-section-label">FOTOGRAFII OBIECTE (OPȚIONAL)</span>
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
                    <div className="dropzone-icon">📷</div>
                    <div className="dropzone-text">
                        <strong>Trage pozele aici sau apasă pentru a alege</strong>
                        <span>Ajută echipajul Reloq să pregătească chingile și păturile de protecție</span>
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
                                title="Elimină poza"
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