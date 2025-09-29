import React, { useState, useEffect } from 'react';

const AnswerTemplateWizard = ({ text, onConfirm, onBack }) => {
  const [hasTemplate, setHasTemplate] = useState(null);
  const [startMarker, setStartMarker] = useState('');
  const [endMarker, setEndMarker] = useState('');
  const [detectedSnippet, setDetectedSnippet] = useState('');
  const [detectedStartMarker, setDetectedStartMarker] = useState('');
  const [detectedStartIndex, setDetectedStartIndex] = useState(-1);

  useEffect(() => {
    const detection = detectAnswerTemplate(text);
    if (detection.found) {
      setHasTemplate(true);
      setDetectedStartMarker(detection.startMarker);
      setStartMarker(detection.startMarker);
      setDetectedStartIndex(detection.startIndex);
      setDetectedSnippet(detection.snippet);
    } else {
      setHasTemplate(false);
    }
  }, [text]);

  const computeCleanedText = () => {
    if (!hasTemplate) return text;
    const content = text;
    if (!startMarker || content.indexOf(startMarker) === -1) {
      // fallback a índice por líneas detectado automáticamente
      if (detectedStartIndex >= 0) {
        const lines = content.split('\n');
        const startPos = lines.slice(0, detectedStartIndex).join('\n').length + (detectedStartIndex > 0 ? 1 : 0);
        const endPos = endMarker ? content.indexOf(endMarker, startPos) : content.length;
        if (endPos >= startPos && endPos <= content.length) {
          return content.slice(0, startPos) + content.slice(endPos + (endMarker ? endMarker.length : 0));
        }
      }
      return content;
    }
    const startPos = content.indexOf(startMarker);
    const endPos = endMarker ? content.indexOf(endMarker, startPos + startMarker.length) : content.length;
    if (endPos === -1) {
      return content.slice(0, startPos);
    }
    return content.slice(0, startPos) + content.slice(endPos + endMarker.length);
  };

  const handleContinue = () => {
    if (hasTemplate === null) {
      alert('Por favor indica si el PDF incluye una plantilla de respuestas.');
      return;
    }
    const cleaned = hasTemplate ? computeCleanedText() : text;
    onConfirm({
      hasTemplate,
      delimitation: hasTemplate ? { startMarker, endMarker } : null,
      cleanedText: cleaned,
      preview: detectedSnippet
    });
  };

  return (
    <div className="format-selector">
      <h2>¿El PDF incluye una plantilla de respuestas?</h2>
      <p style={{ textAlign: 'center', color: '#6c757d' }}>
        Si existe una hoja o sección de respuestas al final del PDF, definiremos cómo delimitarla para excluirla del texto a procesar.
      </p>

      <div className="template-detection">
        <div className="detected-patterns">
          <h3>Detección automática</h3>
          {detectedSnippet ? (
            <>
              <p><strong>Posible inicio detectado:</strong> <code>{detectedStartMarker}</code></p>
              <pre className="selectable-text" style={{ maxHeight: 180, overflow: 'auto' }}>{detectedSnippet}</pre>
            </>
          ) : (
            <p>No se detectó automáticamente una plantilla de respuestas. Puedes indicar manualmente cómo delimitarla si sabes que existe.</p>
          )}
        </div>
      </div>

      <div className="template-choice" style={{ marginTop: 10 }}>
        <button
          className={`format-option ${hasTemplate === true ? 'selected' : ''}`}
          onClick={() => setHasTemplate(true)}
        >
          Sí, incluye plantilla
        </button>
        <button
          className={`format-option ${hasTemplate === false ? 'selected' : ''}`}
          onClick={() => setHasTemplate(false)}
          style={{ marginLeft: 10 }}
        >
          No, no incluye
        </button>
      </div>

      {hasTemplate && (
        <div className="delimitation-settings" style={{ marginTop: 20 }}>
          <h3>Delimitación de la plantilla</h3>
          <div className="custom-format">
            <label>Marcador de inicio:</label>
            <input
              type="text"
              className="format-input"
              value={startMarker}
              onChange={(e) => setStartMarker(e.target.value)}
              placeholder="Ej: PLANTILLA DE RESPUESTAS, Respuestas:, Hoja de respuestas"
            />
            <small className="format-help">
              Texto que marca el inicio de la plantilla. Si se deja vacío y hubo detección automática, se usará la posición detectada.
            </small>
          </div>
          <div className="custom-format" style={{ marginTop: 10 }}>
            <label>Marcador de fin (opcional):</label>
            <input
              type="text"
              className="format-input"
              value={endMarker}
              onChange={(e) => setEndMarker(e.target.value)}
              placeholder="Ej: === FIN === — Si lo dejas vacío, se tomará hasta el final del documento"
            />
            <small className="format-help">
              Si no hay un marcador claro de fin, deja vacío para eliminar desde el inicio hasta el final del documento.
            </small>
          </div>

          <div className="format-preview" style={{ marginTop: 20 }}>
            <h4>Vista previa del texto procesado (sin la plantilla):</h4>
            <div className="preview-content">
              <pre className="selectable-text" style={{ maxHeight: 180, overflow: 'auto' }}>
                {computeCleanedText().slice(0, 2000)}
              </pre>
            </div>
          </div>
        </div>
      )}

      <div className="format-actions">
        <button className="btn" onClick={onBack}>Atrás</button>
        <button className="btn" onClick={handleContinue}>Continuar</button>
      </div>
    </div>
  );
};

function detectAnswerTemplate(text) {
  const lines = text.split('\n');
  const startKeywords = [
    '=== PLANTILLA DE RESPUESTAS ===',
    'PLANTILLA DE RESPUESTAS',
    'Hoja de respuestas',
    'HOJA DE RESPUESTAS',
    'Respuestas:',
    'RESPUESTAS:',
    'Respuestas',
    'RESPUESTAS'
  ];

  // 1) Buscar cabeceras típicas
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const lc = l.toLowerCase();
    if (startKeywords.some(k => lc.includes(k.toLowerCase()))) {
      const snippet = lines.slice(i, Math.min(i + 12, lines.length)).join('\n');
      return {
        found: true,
        startIndex: i,
        startMarker: l,
        snippet
      };
    }
  }

  // 2) Heurística: muchas líneas con número + guiones bajos o "Respuesta:"
  const answerLineRegex = /^\s*\d+\s*[.)-]?\s*(Respuesta:|_{3,}|_{2,}|–+|-+|\[ ?\]|R:)/i;
  let streakStart = -1;
  let streakCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (answerLineRegex.test(lines[i])) {
      if (streakStart === -1) streakStart = i;
      streakCount++;
    } else {
      if (streakCount >= 3) {
        const snippet = lines.slice(streakStart, Math.min(streakStart + 12, lines.length)).join('\n');
        return {
          found: true,
          startIndex: streakStart,
          startMarker: lines[streakStart].trim(),
          snippet
        };
      }
      streakStart = -1;
      streakCount = 0;
    }
  }
  if (streakCount >= 3) {
    const snippet = lines.slice(streakStart, Math.min(streakStart + 12, lines.length)).join('\n');
    return {
      found: true,
      startIndex: streakStart,
      startMarker: lines[streakStart].trim(),
      snippet
    };
  }

  return { found: false };
}

export default AnswerTemplateWizard;