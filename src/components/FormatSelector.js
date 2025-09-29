import React, { useState } from 'react';

const FormatSelector = ({ type, text, optionCount, onFormatSelect, onBack }) => {
  const [selectedFormats, setSelectedFormats] = useState([]);
  const [showMoreFormats, setShowMoreFormats] = useState(false);

  const questionFormats = [
    { id: '1', label: '1. Pregunta', pattern: /^\d+\./ },
    { id: '2', label: '1) Pregunta', pattern: /^\d+\)/ },
    { id: '3', label: '1.- Pregunta', pattern: /^\d+\.-/ },
    { id: '4', label: '1) Pregunta', pattern: /^\d+\)/ },
    { id: '5', label: 'Pregunta 1:', pattern: /^Pregunta \d+:/ },
    { id: '6', label: 'PREGUNTA 1:', pattern: /^PREGUNTA \d+:/ },
  ];

  const optionFormats = [
    { id: 'a', label: 'a) Opción', pattern: /^[a-z]\)/ },
    { id: 'b', label: 'A) Opción', pattern: /^[A-Z]\)/ },
    { id: 'c', label: 'a. Opción', pattern: /^[a-z]\./ },
    { id: 'd', label: 'A. Opción', pattern: /^[A-Z]\./ },
    { id: 'e', label: '(a) Opción', pattern: /^\([a-z]\)/ },
    { id: 'f', label: '(A) Opción', pattern: /^\([A-Z]\)/ },
  ];

  const formats = type === 'question' ? questionFormats : optionFormats;

  const handleFormatClick = (format) => {
    if (selectedFormats.includes(format.id)) {
      setSelectedFormats(selectedFormats.filter(f => f !== format.id));
    } else {
      setSelectedFormats([...selectedFormats, format.id]);
    }
  };

  const handleContinue = () => {
    if (selectedFormats.length > 0) {
      onFormatSelect(selectedFormats);
    } else {
      alert('Por favor selecciona al menos un formato');
    }
  };

  const previewText = () => {
    const lines = text.split('\n').filter(line => line.trim());
    const relevantLines = type === 'question' 
      ? lines.filter(line => line.match(/\d+[.\-)]/))
      : lines.filter(line => line.match(/^[a-zA-Z][.)]/));
    
    return relevantLines.slice(0, 5).join('\n') || 'No se encontraron formatos similares';
  };

  return (
    <div className="format-selector">
      <h2>
        {type === 'question' 
          ? 'Selecciona el formato de inicio de pregunta' 
          : 'Selecciona el formato de las opciones'}
      </h2>
      
      <div className="format-preview">
        <h3>Texto del PDF:</h3>
        <pre className="preview-text">{previewText()}</pre>
      </div>

      <div className="format-options">
        {formats.map(format => (
          <div
            key={format.id}
            className={`format-option ${selectedFormats.includes(format.id) ? 'selected' : ''}`}
            onClick={() => handleFormatClick(format)}
          >
            {format.label}
          </div>
        ))}
      </div>

      <div className="format-actions">
        <button className="btn" onClick={onBack}>
          Atrás
        </button>
        <button className="btn" onClick={handleContinue} disabled={selectedFormats.length === 0}>
          Continuar
        </button>
      </div>

      {type === 'question' && (
        <div className="additional-formats">
          <label>
            <input
              type="checkbox"
              checked={showMoreFormats}
              onChange={(e) => setShowMoreFormats(e.target.checked)}
            />
            ¿Hay más formatos de inicio de pregunta?
          </label>
        </div>
      )}
    </div>
  );
};

export default FormatSelector;