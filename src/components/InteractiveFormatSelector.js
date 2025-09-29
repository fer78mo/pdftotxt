import React, { useState, useRef, useEffect } from 'react';

const InteractiveFormatSelector = ({ text, type, onFormatSelect, onBack }) => {
  const [selectedFormats, setSelectedFormats] = useState([]);
  const [detectedPatterns, setDetectedPatterns] = useState([]);
  const [hasMoreFormats, setHasMoreFormats] = useState(false);
  const [editableText, setEditableText] = useState(text);
  const [isEditing, setIsEditing] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    detectPatterns();
  }, [editableText, type]);

  useEffect(() => {
    setEditableText(text);
  }, [text]);

  const detectPatterns = () => {
    // Procesar el texto para mantener mejor el formato de líneas
    const lines = editableText.split('\n').map(line => line.trim()).filter(line => line);
    const patterns = [];
    
    // Detectar patrones de preguntas
    if (type === 'question') {
      const questionPatterns = [
        { pattern: /^\d+\./, label: '1.', examples: [] },
        { pattern: /^\d+\)/, label: '1)', examples: [] },
        { pattern: /^\d+\.-/, label: '1.-', examples: [] },
        { pattern: /^Pregunta \d+:/i, label: 'Pregunta 1:', examples: [] },
        { pattern: /^PREGUNTA \d+:/, label: 'PREGUNTA 1:', examples: [] },
      ];

      questionPatterns.forEach(qPattern => {
        const matches = lines.filter(line => qPattern.pattern.test(line));
        if (matches.length > 0) {
          // Verificar si hay progresividad en los números
          const numbers = matches.map(line => {
            const match = line.match(/\d+/);
            return match ? parseInt(match[0]) : 0;
          }).filter(n => n > 0);

          const hasProgression = numbers.length > 1 &&
            numbers.every((num, index) => index === 0 || num === numbers[index - 1] + 1);

          patterns.push({
            ...qPattern,
            examples: matches.slice(0, 3),
            count: matches.length,
            hasProgression: hasProgression
          });
        }
      });
    }

    // Detectar patrones de opciones
    if (type === 'option') {
      const optionPatterns = [
        { pattern: /^[a-z]\)/, label: 'a)', examples: [] },
        { pattern: /^[A-Z]\)/, label: 'A)', examples: [] },
        { pattern: /^[a-z]\./, label: 'a.', examples: [] },
        { pattern: /^[A-Z]\./, label: 'A.', examples: [] },
        { pattern: /^\([a-z]\)/, label: '(a)', examples: [] },
        { pattern: /^\([A-Z]\)/, label: '(A)', examples: [] },
      ];

      optionPatterns.forEach(oPattern => {
        const matches = lines.filter(line => oPattern.pattern.test(line));
        if (matches.length > 0) {
          patterns.push({
            ...oPattern,
            examples: matches.slice(0, 3),
            count: matches.length
          });
        }
      });
    }

    setDetectedPatterns(patterns);
  };

  const handlePatternClick = (pattern) => {
    const patternKey = pattern.label;
    if (selectedFormats.includes(patternKey)) {
      setSelectedFormats(selectedFormats.filter(f => f !== patternKey));
    } else {
      setSelectedFormats([...selectedFormats, patternKey]);
    }
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText && selectedText.length > 0) {
      // Detectar el patrón del texto seleccionado
      const patterns = [
        { regex: /^\d+\./, label: '1.' },
        { regex: /^\d+\)/, label: '1)' },
        { regex: /^\d+\.-/, label: '1.-' },
        { regex: /^[a-z]\)/, label: 'a)' },
        { regex: /^[A-Z]\)/, label: 'A)' },
        { regex: /^[a-z]\./, label: 'a.' },
        { regex: /^[A-Z]\./, label: 'A.' },
        { regex: /^\([a-z]\)/, label: '(a)' },
        { regex: /^\([A-Z]\)/, label: '(A)' },
      ];

      for (let pattern of patterns) {
        if (pattern.regex.test(selectedText)) {
          if (!selectedFormats.includes(pattern.label)) {
            setSelectedFormats([...selectedFormats, pattern.label]);
          }
          break;
        }
      }
    }
  };

  const handleContinue = () => {
    if (selectedFormats.length > 0) {
      onFormatSelect(selectedFormats);
    } else {
      alert('Por favor selecciona al menos un formato');
    }
  };

  const handleTextEdit = () => {
    setIsEditing(!isEditing);
  };

  const handleTextChange = (e) => {
    setEditableText(e.target.value);
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
    // Volver a detectar patrones con el texto editado
    detectPatterns();
  };

  return (
    <div className="format-selector">
      <h2>
        {type === 'question' 
          ? 'Selecciona el formato de inicio de pregunta' 
          : 'Selecciona el formato de las opciones'}
      </h2>
      
      <div className="selection-instructions">
        <p><strong>Instrucciones:</strong></p>
        <p>1. Selecciona con el ratón el formato de las preguntas/opciones en el texto</p>
        <p>2. O haz clic en los formatos detectados abajo</p>
        <p>3. La app detectará automáticamente la progresividad de los números</p>
      </div>

      <div className="text-controls">
        <h3>Texto del PDF:</h3>
        <div className="edit-controls">
          <button
            className="btn-small"
            onClick={handleTextEdit}
          >
            {isEditing ? 'Ver texto' : 'Editar texto'}
          </button>
          {isEditing && (
            <button
              className="btn-small btn-save"
              onClick={handleSaveEdit}
            >
              Guardar cambios
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="text-edit-area">
          <textarea
            className="editable-textarea"
            value={editableText}
            onChange={handleTextChange}
            rows={20}
            cols={80}
          />
          <p className="edit-hint">Puedes editar el texto para corregir errores de extracción</p>
        </div>
      ) : (
        <div
          className="text-selection-area"
          onMouseUp={handleTextSelection}
          ref={textRef}
        >
          <p className="selection-hint">Selecciona con el ratón el formato de las preguntas/opciones:</p>
          <pre className="selectable-text">{editableText}</pre>
        </div>
      )}

      <div className="detected-patterns">
        <h3>Formatos detectados:</h3>
        {detectedPatterns.map((pattern, index) => (
          <div
            key={index}
            className={`pattern-option ${selectedFormats.includes(pattern.label) ? 'selected' : ''}`}
            onClick={() => handlePatternClick(pattern)}
          >
            <div className="pattern-label">{pattern.label}</div>
            <div className="pattern-info">
              <span>{pattern.count} ocurrencias</span>
              {pattern.hasProgression && <span className="progression-badge">✓ Progresivo</span>}
            </div>
            <div className="pattern-examples">
              {pattern.examples.map((example, idx) => (
                <div key={idx} className="example-line">{example}</div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {type === 'question' && (
        <div className="additional-formats">
          <label>
            <input
              type="checkbox"
              checked={hasMoreFormats}
              onChange={(e) => setHasMoreFormats(e.target.checked)}
            />
            ¿Hay más formatos de inicio de pregunta?
          </label>
        </div>
      )}

      <div className="format-actions">
        <button className="btn" onClick={onBack}>
          Atrás
        </button>
        <button className="btn" onClick={handleContinue} disabled={selectedFormats.length === 0}>
          Continuar
        </button>
      </div>
    </div>
  );
};

export default InteractiveFormatSelector;