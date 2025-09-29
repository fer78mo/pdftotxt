import React, { useRef, useState } from 'react';

const PDFUploader = ({ onFileUpload }) => {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = async (file) => {
    if (file && file.type === 'application/pdf') {
      setIsProcessing(true);
      
      try {
        // Crear un objeto URL para el PDF
        const fileUrl = URL.createObjectURL(file);
        
        // Simular extracción de texto (en producción usar pdf-parse)
        const text = await extractTextFromPDF(file);
        
        onFileUpload(file, text);
      } catch (error) {
        console.error('Error al procesar PDF:', error);
        alert('Error al procesar el archivo PDF');
      } finally {
        setIsProcessing(false);
      }
    } else {
      alert('Por favor selecciona un archivo PDF válido');
    }
  };

  const extractTextFromPDF = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          // Verificar que PDF.js esté disponible
          if (!window['pdfjs-dist/build/pdf']) {
            throw new Error('PDF.js no está disponible. Por favor, recarga la página.');
          }
          
          // Usar PDF.js para extraer texto y metadatos estructurales del PDF
          const pdfjsLib = window['pdfjs-dist/build/pdf'];
          
          // Configurar el worker de PDF.js
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          const typedarray = new Uint8Array(e.target.result);
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          
          let fullText = '';
          const structuralData = []; // Almacenar datos estructurales
          
          // Extraer texto y metadatos de cada página
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });
            
            // Obtener información estructural de la página
            const pageInfo = {
              pageNumber: i,
              width: viewport.width,
              height: viewport.height,
              items: []
            };
            
            // Agrupar texto por líneas con información estructural completa
            const lines = {};
            let currentLine = '';
            let lastY = null;
            let currentLineData = [];
            
            textContent.items.forEach(item => {
              // Extraer información estructural completa
              const x = item.transform[4]; // Posición X
              const y = item.transform[5]; // Posición Y
              const fontSize = Math.abs(item.transform[0]); // Tamaño de fuente
              const fontStyle = item.fontName || 'unknown';
              
              const lineKey = Math.round(y);
              
              if (lastY === null || Math.abs(y - lastY) < 5) {
                // Misma línea o línea muy cercana
                currentLine += (currentLine ? ' ' : '') + item.str;
                currentLineData.push({
                  text: item.str,
                  x: x,
                  y: y,
                  fontSize: fontSize,
                  fontStyle: fontStyle,
                  width: item.width || 0,
                  height: item.height || 0
                });
              } else {
                // Nueva línea - guardar la anterior con metadatos
                if (currentLine.trim()) {
                  fullText += currentLine.trim() + '\n';
                  
                  // Analizar si esta línea parece ser encabezado/pie basándose en múltiples factores
                  const isHeaderFooter = analyzeStructuralElements(currentLineData, pageInfo, viewport);
                  
                  if (!isHeaderFooter) {
                    pageInfo.items.push({
                      text: currentLine.trim(),
                      lineData: currentLineData,
                      isHeaderFooter: false
                    });
                  } else {
                    pageInfo.items.push({
                      text: currentLine.trim(),
                      lineData: currentLineData,
                      isHeaderFooter: true,
                      headerFooterType: isHeaderFooter.type,
                      confidence: isHeaderFooter.confidence
                    });
                  }
                }
                
                currentLine = item.str;
                currentLineData = [{
                  text: item.str,
                  x: x,
                  y: y,
                  fontSize: fontSize,
                  fontStyle: fontStyle,
                  width: item.width || 0,
                  height: item.height || 0
                }];
              }
              
              lastY = y;
            });
            
            // Procesar la última línea
            if (currentLine.trim()) {
              fullText += currentLine.trim() + '\n';
              
              const isHeaderFooter = analyzeStructuralElements(currentLineData, pageInfo, viewport);
              
              if (!isHeaderFooter) {
                pageInfo.items.push({
                  text: currentLine.trim(),
                  lineData: currentLineData,
                  isHeaderFooter: false
                });
              } else {
                pageInfo.items.push({
                  text: currentLine.trim(),
                  lineData: currentLineData,
                  isHeaderFooter: true,
                  headerFooterType: isHeaderFooter.type,
                  confidence: isHeaderFooter.confidence
                });
              }
            }
            
            structuralData.push(pageInfo);
            fullText += '\n'; // Separador entre páginas
          }
          
          // Guardar datos estructurales para análisis posterior
          window.pdfStructuralData = structuralData;
          
          // Si no se extrajo texto, intentar con un método alternativo
          if (!fullText.trim()) {
            fullText = await extractTextWithFallback(file);
          }
          
          resolve(fullText);
        } catch (error) {
          console.error('Error al extraer texto del PDF:', error);
          // Intentar método de respaldo
          const fallbackText = await extractTextWithFallback(file);
          resolve(fallbackText);
        }
      };
      
      reader.onerror = (error) => {
        reject(new Error('Error al leer el archivo: ' + error.message));
      };
      
      reader.readAsArrayBuffer(file);
    });
  };
  
  // Nueva función para analizar elementos estructurales y detectar encabezados/pies
  const analyzeStructuralElements = (lineData, pageInfo, viewport) => {
    if (!lineData || lineData.length === 0) return false;
    
    let headerFooterScore = 0;
    let evidence = [];
    
    // Análisis 1: Posición en la página
    const avgY = lineData.reduce((sum, item) => sum + item.y, 0) / lineData.length;
    const relativeY = avgY / viewport.height;
    
    if (relativeY < 0.1) {
      headerFooterScore += 3;
      evidence.push('posición superior');
    } else if (relativeY > 0.9) {
      headerFooterScore += 3;
      evidence.push('posición inferior');
    }
    
    // Análisis 2: Tamaño de fuente
    const avgFontSize = lineData.reduce((sum, item) => sum + item.fontSize, 0) / lineData.length;
    if (avgFontSize < 8 || avgFontSize > 20) {
      headerFooterScore += 2;
      evidence.push('tamaño de fuente atípico');
    }
    
    // Análisis 3: Patrones de texto
    const fullText = lineData.map(item => item.text).join(' ');
    
    const examPatterns = [
      /EXAMEN\s+(?:RE\s*)?PASO/i,
      /EXAMEN\s+COMÚN/i,
      /SAS\b/i,
      /\d{1,2}\s+DE\s+(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+\d{4}/i,
      /\d{1,2}\/\d{1,2}\/\d{2,4}/,
      /ACADEMIA\s+\w+\s+FORMACIÓN/i,
      /DOBLER\s+FORMACIÓN/i,
      /Página\s+\d+/i,
      /Pág\.\s+\d+/i
    ];
    
    const hasExamPattern = examPatterns.some(pattern => pattern.test(fullText));
    if (hasExamPattern) {
      headerFooterScore += 4;
      evidence.push('patrón de examen/fecha detectado');
    }
    
    // Análisis 4: Ancho del texto
    const totalWidth = lineData.reduce((sum, item) => sum + (item.width || 0), 0);
    const relativeWidth = totalWidth / viewport.width;
    
    if (relativeWidth > 0.8 || relativeWidth < 0.2) {
      headerFooterScore += 2;
      evidence.push('ancho de texto atípico');
    }
    
    // Análisis 5: Consistencia de estilo
    const fontStyles = [...new Set(lineData.map(item => item.fontStyle))];
    if (fontStyles.length > 2) {
      headerFooterScore += 1;
      evidence.push('múltiples estilos de fuente');
    }
    
    // Decisión final basada en puntuación acumulada
    if (headerFooterScore >= 5) {
      return {
        type: headerFooterScore >= 7 ? 'encabezado/pie_confiable' : 'posible_encabezado/pie',
        confidence: Math.min(headerFooterScore * 10, 90),
        evidence: evidence
      };
    }
    
    return false;
  };

  const extractTextWithFallback = async (file) => {
    // Método de respaldo: leer como texto plano (para PDFs simples o dañados)
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        // Intentar extraer texto legible del contenido binario
        const binary = e.target.result;
        const text = new TextDecoder('utf-8').decode(binary);
        
        // Buscar patrones de preguntas y opciones en el texto binario
        const lines = text.split('\n');
        let extractedText = '';
        let inQuestion = false;
        let questionBuffer = '';
        
        lines.forEach(line => {
          // Limpiar la línea de caracteres no imprimibles
          const cleanLine = line.replace(/[^\x20-\x7E\n\r]/g, '').trim();
          
          if (cleanLine) {
            // Detectar si es una pregunta (comienza con número)
            if (/^\d+[.\-)]/.test(cleanLine)) {
              if (questionBuffer) {
                extractedText += questionBuffer + '\n';
              }
              questionBuffer = cleanLine;
              inQuestion = true;
            }
            // Detectar si es una opción (comienza con letra)
            else if (/^[a-zA-Z][.\-)]/.test(cleanLine) && inQuestion) {
              questionBuffer += '\n' + cleanLine;
            }
            // Si es texto adicional de la pregunta
            else if (inQuestion && !/^[a-zA-Z][.\-)]/.test(cleanLine)) {
              questionBuffer += ' ' + cleanLine;
            }
            // Si es una nueva línea que no es opción, terminar la pregunta actual
            else if (inQuestion && !/^[a-zA-Z][.\-)]/.test(cleanLine)) {
              if (questionBuffer) {
                extractedText += questionBuffer + '\n\n';
              }
              questionBuffer = '';
              inQuestion = false;
            }
          }
        });
        
        // Agregar la última pregunta si existe
        if (questionBuffer) {
          extractedText += questionBuffer + '\n';
        }
        
        resolve(extractedText || 'No se pudo extraer texto legible del PDF. El archivo podría estar protegido o dañado.');
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  return (
    <div className="upload-section">
      <h2>Subir archivo PDF</h2>
      <div
        className={`upload-area ${isDragging ? 'dragover' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        {isProcessing ? (
          <div className="processing">
            <div className="spinner"></div>
            <p>Extrayendo texto del PDF...</p>
            <small>Esto puede tardar unos segundos dependiendo del tamaño del archivo</small>
          </div>
        ) : (
          <>
            <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#3498db" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <p>Arrastra y suelta tu archivo PDF aquí o haz clic para seleccionar</p>
            <small>Solo archivos PDF</small>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default PDFUploader;