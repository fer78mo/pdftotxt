import React, { useState } from 'react';
import PDFUploader from './components/PDFUploader';
import InteractiveFormatSelector from './components/InteractiveFormatSelector';
import FormatSelector from './components/FormatSelector';
import ResultsDisplay from './components/ResultsDisplay';
import AnswerTemplateWizard from './components/AnswerTemplateWizard';
import './App.css';

function App() {
  const [step, setStep] = useState(1);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfText, setPdfText] = useState('');
  const [questionFormats, setQuestionFormats] = useState([]);
  const [optionCount, setOptionCount] = useState(4);
  const [optionFormats, setOptionFormats] = useState([]);
  const [extractedQuestions, setExtractedQuestions] = useState([]);
  const [answerTemplate, setAnswerTemplate] = useState(null);
  const [outputQuestionFormat, setOutputQuestionFormat] = useState('Pregunta {number}:');
  const [outputOptionFormat, setOutputOptionFormat] = useState('{letter})');
  const [outputOptionLetterType, setOutputOptionLetterType] = useState('uppercase'); // uppercase, lowercase, numbers, custom
  const [customOptionPrefix, setCustomOptionPrefix] = useState(''); // Para combinaciones como "ax", "bx"

  // Nuevo: información de la plantilla de respuestas embebida en el PDF
  const [hasEmbeddedAnswerTemplate, setHasEmbeddedAnswerTemplate] = useState(false);
  const [embeddedAnswerDelimitation, setEmbeddedAnswerDelimitation] = useState(null);

  const handleFileUpload = (file, text) => {
    setPdfFile(file);
    setPdfText(text);
    // Paso 2: Selección de formatos de preguntas (sin paso de plantilla)
    setStep(2);
  };

  const handleQuestionFormatsSelect = (formats) => {
    setQuestionFormats(formats);
    setStep(3);
  };

  const handleOptionCountSelect = (count) => {
    setOptionCount(count);
    setStep(4);
  };

  const handleOptionFormatsSelect = (formats) => {
    setOptionFormats(formats);
    setStep(5);
  };

  const handleExtractQuestions = (questions) => {
    setExtractedQuestions(questions);
    setStep(6);
  };

  const handleAnswerTemplateSelect = (template) => {
    setAnswerTemplate(template);
    setStep(8); // Ir al paso 8 para mostrar resultados finales
  };

  const generateTemplatePreview = () => {
    if (!answerTemplate || answerTemplate === 'none') return '';
    
    let preview = '';
    const questionCount = Math.min(extractedQuestions.length, 3); // Mostrar max 3 preguntas como ejemplo
    
    for (let i = 0; i < questionCount; i++) {
      const questionNumber = i + 1;
      let questionPrefix = outputQuestionFormat.replace('{number}', questionNumber.toString());
      
      if (answerTemplate === 'simple') {
        preview += `${questionPrefix} _______\n`;
      } else if (answerTemplate === 'detailed') {
        preview += `${questionPrefix} Pregunta: [Texto de la pregunta]\n`;
        preview += `   Respuesta: _______\n\n`;
      }
    }
    
    if (answerTemplate === 'simple' && extractedQuestions.length > 3) {
      preview += `... (${extractedQuestions.length - 3} preguntas más)\n`;
    }
    
    return preview;
  };

  const getOptionLetter = (index, type, customPrefix = '') => {
    switch (type) {
      case 'numbers':
        return (index + 1).toString();
      case 'lowercase':
        return String.fromCharCode(97 + index); // a, b, c, d
      case 'custom':
        return customPrefix + String.fromCharCode(97 + index); // ax, bx, cx, dx
      case 'uppercase':
      default:
        return String.fromCharCode(65 + index); // A, B, C, D
    }
  };

  const resetProcess = () => {
    setStep(1);
    setPdfFile(null);
    setPdfText('');
    setQuestionFormats([]);
    setOptionCount(4);
    setOptionFormats([]);
    setExtractedQuestions([]);
    setAnswerTemplate(null);
    setOutputQuestionFormat('Pregunta {number}:');
    setOutputOptionFormat('{letter})');
    setOutputOptionLetterType('uppercase');
    setCustomOptionPrefix('');
    setHasEmbeddedAnswerTemplate(false);
    setEmbeddedAnswerDelimitation(null);
  };

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <h1>Extractor de Preguntas desde PDF</h1>
          <p>Sube tu PDF y extrae preguntas con opciones fácilmente</p>
        </header>

        {step === 1 && (
          <PDFUploader onFileUpload={handleFileUpload} />
        )}

        {/* Paso 2: Selección de formatos de preguntas */}
        {step === 2 && (
          <InteractiveFormatSelector
            type="question"
            text={pdfText}
            onFormatSelect={handleQuestionFormatsSelect}
            onBack={() => setStep(1)}
          />
        )}

        {/* Paso 3: Número de opciones */}
        {step === 3 && (
          <div className="format-selector">
            <h2>¿Cuántas opciones tiene cada pregunta?</h2>
            <div className="option-count-selector">
              {[2, 3, 4, 5, 6, 7, 8].map(count => (
                <button
                  key={count}
                  className="format-option"
                  onClick={() => handleOptionCountSelect(count)}
                >
                  {count} opciones
                </button>
              ))}
            </div>
            <button className="btn" onClick={() => setStep(2)}>
              Atrás
            </button>
          </div>
        )}

        {/* Paso 4: Formatos de opciones */}
        {step === 4 && (
          <InteractiveFormatSelector
            type="option"
            text={pdfText}
            optionCount={optionCount}
            onFormatSelect={handleOptionFormatsSelect}
            onBack={() => setStep(3)}
          />
        )}

        {/* Paso 5: Extracción de preguntas */}
        {step === 5 && (
          <ResultsDisplay
            text={pdfText}
            questionFormats={questionFormats}
            optionCount={optionCount}
            optionFormats={optionFormats}
            onExtractComplete={handleExtractQuestions}
            onBack={() => setStep(4)}
            outputQuestionFormat={outputQuestionFormat}
            outputOptionFormat={outputOptionFormat}
            outputOptionLetterType={outputOptionLetterType}
            customOptionPrefix={customOptionPrefix}
            onAnswerTemplateSelect={handleAnswerTemplateSelect}
          />
        )}

        {/* Paso 6: Formato de salida */}
        {step === 6 && (
          <div className="format-selector">
            <h2>¿Cómo quieres el formato de salida?</h2>
            <div className="output-format-selector">
              <div className="format-section">
                <h3>Formato de preguntas:</h3>
                <div className="format-presets">
                  <button
                    className={`format-option ${outputQuestionFormat === '{number}.' ? 'selected' : ''}`}
                    onClick={() => setOutputQuestionFormat('{number}.')}
                  >
                    1. ¿Pregunta?
                  </button>
                  <button
                    className={`format-option ${outputQuestionFormat === 'Pregunta {number}:' ? 'selected' : ''}`}
                    onClick={() => setOutputQuestionFormat('Pregunta {number}:')}
                  >
                    Pregunta 1:
                  </button>
                  <button
                    className={`format-option ${outputQuestionFormat === '{number})' ? 'selected' : ''}`}
                    onClick={() => setOutputQuestionFormat('{number})')}
                  >
                    1) ¿Pregunta?
                  </button>
                </div>
                <div className="custom-format">
                  <label>Formato personalizado:</label>
                  <input
                    type="text"
                    className="format-input"
                    value={outputQuestionFormat}
                    onChange={(e) => setOutputQuestionFormat(e.target.value)}
                    placeholder="Ej: {number}. ó Pregunta {number}:"
                  />
                  <small className="format-help">
                    Usa {'{number}'} para el número de pregunta
                  </small>
                </div>
              </div>
              
              <div className="format-section">
                <h3>Formato de opciones:</h3>
                
                <div className="letter-type-selector">
                  <h4>Tipo de letra/número:</h4>
                  <div className="format-presets">
                    <button
                      className={`format-option ${outputOptionLetterType === 'uppercase' ? 'selected' : ''}`}
                      onClick={() => setOutputOptionLetterType('uppercase')}
                    >
                      A, B, C, D
                    </button>
                    <button
                      className={`format-option ${outputOptionLetterType === 'lowercase' ? 'selected' : ''}`}
                      onClick={() => setOutputOptionLetterType('lowercase')}
                    >
                      a, b, c, d
                    </button>
                    <button
                      className={`format-option ${outputOptionLetterType === 'numbers' ? 'selected' : ''}`}
                      onClick={() => setOutputOptionLetterType('numbers')}
                    >
                      1, 2, 3, 4
                    </button>
                    <button
                      className={`format-option ${outputOptionLetterType === 'custom' ? 'selected' : ''}`}
                      onClick={() => setOutputOptionLetterType('custom')}
                    >
                      Personalizado
                    </button>
                  </div>
                  
                  {outputOptionLetterType === 'custom' && (
                    <div className="custom-prefix-input">
                      <label>Prefijo personalizado:</label>
                      <input
                        type="text"
                        className="format-input"
                        value={customOptionPrefix}
                        onChange={(e) => setCustomOptionPrefix(e.target.value)}
                        placeholder="Ej: ax, bx, cx, dx"
                      />
                      <small className="format-help">
                        Ingresa el prefijo que quieres usar (se combinará con a, b, c, d)
                      </small>
                    </div>
                  )}
                </div>

                <div className="format-presets">
                  <button
                    className={`format-option ${outputOptionFormat === '{letter})' ? 'selected' : ''}`}
                    onClick={() => setOutputOptionFormat('{letter})')}
                  >
                    A) Opción
                  </button>
                  <button
                    className={`format-option ${outputOptionFormat === '{letter}.' ? 'selected' : ''}`}
                    onClick={() => setOutputOptionFormat('{letter}.')}
                  >
                    A. Opción
                  </button>
                  <button
                    className={`format-option ${outputOptionFormat === '({letter})' ? 'selected' : ''}`}
                    onClick={() => setOutputOptionFormat('({letter})')}
                  >
                    (A) Opción
                  </button>
                </div>
                <div className="custom-format">
                  <label>Formato personalizado:</label>
                  <input
                    type="text"
                    className="format-input"
                    value={outputOptionFormat}
                    onChange={(e) => setOutputOptionFormat(e.target.value)}
                    placeholder="Ej: {letter}. ó {letter})"
                  />
                  <small className="format-help">
                    Usa {'{letter}'} para la letra de la opción
                  </small>
                </div>
              </div>
            </div>
            <div className="format-preview">
              <h4>Vista previa:</h4>
              <div className="preview-content">
                <div className="preview-question">
                  {outputQuestionFormat.replace('{number}', '1')} ¿Cuál es la capital de España?
                </div>
                <div className="preview-option">
                  {outputOptionFormat.replace('{letter}', getOptionLetter(0, outputOptionLetterType, customOptionPrefix))} Madrid
                </div>
                <div className="preview-option">
                  {outputOptionFormat.replace('{letter}', getOptionLetter(1, outputOptionLetterType, customOptionPrefix))} Barcelona
                </div>
              </div>
            </div>
            <button className="btn" onClick={() => setStep(5)}>
              Atrás
            </button>
            <button className="btn" onClick={() => setStep(8)}>
              Continuar
            </button>
          </div>
        )}

        {/* Paso 7: Resultados finales (sin plantilla de respuestas) */}
        {step === 8 && (
          <div className="results-section">
            <h2>Proceso completado</h2>
            <ResultsDisplay
              text={pdfText}
              questionFormats={questionFormats}
              optionCount={optionCount}
              optionFormats={optionFormats}
              answerTemplate={answerTemplate}
              extractedQuestions={extractedQuestions}
              showFinalResults={true}
              outputQuestionFormat={outputQuestionFormat}
              outputOptionFormat={outputOptionFormat}
              outputOptionLetterType={outputOptionLetterType}
              customOptionPrefix={customOptionPrefix}
            />
            <button className="btn" onClick={resetProcess}>
              Procesar otro PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;