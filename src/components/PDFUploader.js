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
        
        // Extraer texto con detección mejorada de encabezados/pies
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
          
          const pdfjsLib = window['pdfjs-dist/build/pdf'];
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          const typedarray = new Uint8Array(e.target.result);
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          
          // Primera pasada: analizar todo el documento para detectar patrones globales
          const globalAnalysis = await analyzeGlobalPatterns(pdf);
          
          let cleanText = '';
          const structuralData = [];
          
          // Segunda pasada: extraer texto limpio basado en el análisis global
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });
            
            const pageInfo = {
              pageNumber: i,
              width: viewport.width,
              height: viewport.height,
              items: []
            };
            
            // Procesar líneas con detección mejorada
            const processedLines = processPageLines(textContent.items, viewport, globalAnalysis);
            
            processedLines.forEach(line => {
              pageInfo.items.push(line);
              
              // Solo agregar al texto final si NO es encabezado/pie de página
              if (!line.isHeaderFooter) {
                cleanText += line.text + '\n';
              }
            });
            
            structuralData.push(pageInfo);
          }
          
          // Guardar datos estructurales para análisis posterior
          window.pdfStructuralData = structuralData;
          window.pdfGlobalAnalysis = globalAnalysis;
          
          // Post-procesamiento: limpiar texto extraído
          const finalText = postProcessExtractedText(cleanText, globalAnalysis);
          
          resolve(finalText || 'No se pudo extraer texto del PDF');
          
        } catch (error) {
          console.error('Error al extraer texto del PDF:', error);
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

  // NUEVA FUNCIÓN: Análisis global de patrones en todo el documento
  const analyzeGlobalPatterns = async (pdf) => {
    const analysis = {
      headerPatterns: new Set(),
      footerPatterns: new Set(),
      repeatingElements: new Map(),
      commonPositions: {
        headers: [],
        footers: []
      },
      documentInfo: {
        totalPages: pdf.numPages,
        avgFontSize: 0,
        commonFonts: new Map()
      }
    };

    const allPageElements = [];
    let totalFontSize = 0;
    let fontCount = 0;

    // Analizar todas las páginas para encontrar patrones
    for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) { // Analizar max 10 páginas para velocidad
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });
      
      const lines = groupTextIntoLines(textContent.items, viewport);
      
      lines.forEach(line => {
        // Recopilar información de fuentes
        line.items.forEach(item => {
          totalFontSize += item.fontSize;
          fontCount++;
          
          const font = analysis.documentInfo.commonFonts.get(item.fontStyle) || 0;
          analysis.documentInfo.commonFonts.set(item.fontStyle, font + 1);
        });

        // Detectar elementos que se repiten en múltiples páginas
        const lineKey = `${Math.round(line.relativeY * 100)}_${line.text.slice(0, 20)}`;
        const existing = analysis.repeatingElements.get(lineKey) || { count: 0, text: line.text, positions: [] };
        existing.count++;
        existing.positions.push({ page: i, y: line.relativeY });
        analysis.repeatingElements.set(lineKey, existing);

        // Clasificar posiciones comunes de headers/footers
        if (line.relativeY < 0.15) {
          analysis.commonPositions.headers.push({ page: i, y: line.relativeY, text: line.text });
        } else if (line.relativeY > 0.85) {
          analysis.commonPositions.footers.push({ page: i, y: line.relativeY, text: line.text });
        }

        allPageElements.push({
          page: i,
          ...line
        });
      });
    }

    // Calcular estadísticas
    analysis.documentInfo.avgFontSize = totalFontSize / fontCount;

    // Identificar patrones de elementos repetitivos
    analysis.repeatingElements.forEach((element, key) => {
      if (element.count >= Math.min(3, Math.ceil(pdf.numPages * 0.3))) { // Se repite en al menos 30% de páginas
        const avgY = element.positions.reduce((sum, pos) => sum + pos.y, 0) / element.positions.length;
        
        if (avgY < 0.15) {
          analysis.headerPatterns.add(element.text);
        } else if (avgY > 0.85) {
          analysis.footerPatterns.add(element.text);
        }
      }
    });

    return analysis;
  };

  // FUNCIÓN MEJORADA: Agrupar texto en líneas con mejor precisión
  const groupTextIntoLines = (items, viewport) => {
    const lines = [];
    const lineThreshold = 5; // Píxeles de tolerancia para considerar misma línea
    
    // Agrupar items por posición Y
    const grouped = {};
    
    items.forEach(item => {
      const x = item.transform[4];
      const y = item.transform[5];
      const fontSize = Math.abs(item.transform[0]);
      const fontStyle = item.fontName || 'unknown';
      
      const yKey = Math.round(y / lineThreshold) * lineThreshold;
      
      if (!grouped[yKey]) {
        grouped[yKey] = [];
      }
      
      grouped[yKey].push({
        text: item.str,
        x: x,
        y: y,
        fontSize: fontSize,
        fontStyle: fontStyle,
        width: item.width || 0,
        height: item.height || 0
      });
    });
    
    // Convertir grupos en líneas ordenadas
    Object.keys(grouped)
      .sort((a, b) => parseFloat(b) - parseFloat(a)) // Orden descendente (top to bottom)
      .forEach(yKey => {
        const lineItems = grouped[yKey].sort((a, b) => a.x - b.x); // Orden por X
        const text = lineItems.map(item => item.text).join(' ').trim();
        
        if (text) {
          const avgY = lineItems.reduce((sum, item) => sum + item.y, 0) / lineItems.length;
          
          lines.push({
            text: text,
            items: lineItems,
            y: avgY,
            relativeY: avgY / viewport.height,
            avgFontSize: lineItems.reduce((sum, item) => sum + item.fontSize, 0) / lineItems.length,
            totalWidth: lineItems.reduce((sum, item) => sum + item.width, 0)
          });
        }
      });
    
    return lines;
  };

  // FUNCIÓN MEJORADA: Procesar líneas de página con detección avanzada
  const processPageLines = (items, viewport, globalAnalysis) => {
    const lines = groupTextIntoLines(items, viewport);
    const processedLines = [];
    
    lines.forEach(line => {
      const headerFooterAnalysis = advancedHeaderFooterDetection(line, viewport, globalAnalysis);
      
      processedLines.push({
        text: line.text,
        lineData: line.items,
        isHeaderFooter: headerFooterAnalysis.isHeaderFooter,
        headerFooterType: headerFooterAnalysis.type,
        confidence: headerFooterAnalysis.confidence,
        evidence: headerFooterAnalysis.evidence,
        y: line.y,
        relativeY: line.relativeY
      });
    });
    
    return processedLines;
  };

  // FUNCIÓN MEJORADA: Detección avanzada de encabezados y pies de página
  const advancedHeaderFooterDetection = (line, viewport, globalAnalysis) => {
    let score = 0;
    const evidence = [];
    let type = 'content';

    // 1. ANÁLISIS DE POSICIÓN (peso alto)
    if (line.relativeY < 0.08) {
      score += 5;
      evidence.push('posición muy superior');
      type = 'header';
    } else if (line.relativeY < 0.15) {
      score += 3;
      evidence.push('posición superior');
      type = 'header';
    } else if (line.relativeY > 0.92) {
      score += 5;
      evidence.push('posición muy inferior');
      type = 'footer';
    } else if (line.relativeY > 0.85) {
      score += 3;
      evidence.push('posición inferior');
      type = 'footer';
    }

    // 2. ANÁLISIS DE PATRONES REPETITIVOS (peso alto)
    const isRepeatingHeader = globalAnalysis.headerPatterns.has(line.text);
    const isRepeatingFooter = globalAnalysis.footerPatterns.has(line.text);
    
    if (isRepeatingHeader) {
      score += 6;
      evidence.push('patrón repetitivo de encabezado');
      type = 'header';
    } else if (isRepeatingFooter) {
      score += 6;
      evidence.push('patrón repetitivo de pie de página');
      type = 'footer';
    }

    // 3. ANÁLISIS DE PATRONES ESPECÍFICOS (peso alto)
    const specificPatterns = [
      // Patrones de examen y fechas
      { regex: /EXAMEN\s+(?:RE\s*)?PASO/i, weight: 4, desc: 'patrón de examen PASO' },
      { regex: /EXAMEN\s+COMÚN/i, weight: 4, desc: 'patrón de examen común' },
      { regex: /\b\d{1,2}\s+DE\s+(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+DE\s+\d{4}\b/i, weight: 5, desc: 'fecha completa' },
      { regex: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, weight: 3, desc: 'fecha numérica' },
      
      // Patrones de academia/institución
      { regex: /ACADEMIA\s+\w+\s+FORMACIÓN/i, weight: 4, desc: 'nombre de academia' },
      { regex: /DOBLER\s+FORMACIÓN/i, weight: 4, desc: 'institución específica' },
      { regex: /\bSAS\b|\bSERGAS\b|\bSESPA\b/i, weight: 3, desc: 'servicio de salud' },
      
      // Patrones de numeración de páginas
      { regex: /Página\s+\d+\s*(?:de\s+\d+)?/i, weight: 5, desc: 'numeración de página' },
      { regex: /Pág\.\s*\d+/i, weight: 5, desc: 'numeración abreviada' },
      { regex: /\b\d+\s*\/\s*\d+\b/, weight: 2, desc: 'numeración tipo fracción' },
      
      // Patrones de identificación de documento
      { regex: /CÓDIGO\s*:?.*\w+/i, weight: 3, desc: 'código de documento' },
      { regex: /ID\s*:?.*\d+/i, weight: 2, desc: 'identificador' },
      { regex: /www\.\w+\.\w+/i, weight: 4, desc: 'URL web' },
      { regex: /@\w+\.\w+/i, weight: 3, desc: 'email' },
      
      // Patrones de copyright y derechos
      { regex: /©|\bcopyright\b|todos\s+los\s+derechos\s+reservados/i, weight: 4, desc: 'copyright' },
      { regex: /prohibida\s+(?:la\s+)?reproducción/i, weight: 4, desc: 'aviso de reproducción' }
    ];

    specificPatterns.forEach(pattern => {
      if (pattern.regex.test(line.text)) {
        score += pattern.weight;
        evidence.push(pattern.desc);
      }
    });

    // 4. ANÁLISIS DE TAMAÑO DE FUENTE
    if (line.avgFontSize < globalAnalysis.documentInfo.avgFontSize * 0.7) {
      score += 2;
      evidence.push('fuente más pequeña que promedio');
    } else if (line.avgFontSize > globalAnalysis.documentInfo.avgFontSize * 1.5) {
      score += 1;
      evidence.push('fuente más grande que promedio');
    }

    // 5. ANÁLISIS DE ANCHO DEL TEXTO
    const relativeWidth = line.totalWidth / viewport.width;
    if (relativeWidth < 0.3) {
      score += 2;
      evidence.push('texto muy estrecho');
    } else if (relativeWidth > 0.9) {
      score += 1;
      evidence.push('texto muy ancho');
    }

    // 6. ANÁLISIS DE CONTENIDO CORTO
    if (line.text.length < 50 && (line.relativeY < 0.15 || line.relativeY > 0.85)) {
      score += 2;
      evidence.push('texto corto en posición extrema');
    }

    // 7. ANÁLISIS DE TEXTO EN MAYÚSCULAS
    if (line.text === line.text.toUpperCase() && line.text.length > 5) {
      score += 1;
      evidence.push('texto en mayúsculas');
    }

    // DECISIÓN FINAL
    const isHeaderFooter = score >= 4; // Umbral reducido para mayor sensibilidad
    const confidence = Math.min((score / 10) * 100, 95);

    return {
      isHeaderFooter,
      type: isHeaderFooter ? type : 'content',
      confidence,
      evidence,
      score
    };
  };

  // FUNCIÓN NUEVA: Post-procesamiento del texto extraído
  const postProcessExtractedText = (text, globalAnalysis) => {
    let cleanedText = text;

    // Eliminar líneas vacías múltiples
    cleanedText = cleanedText.replace(/\n\s*\n\s*\n/g, '\n\n');

    // Eliminar espacios extra al inicio y final de líneas
    cleanedText = cleanedText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    // Mejorar formato de preguntas y opciones
    cleanedText = cleanedText.replace(/(\d+)[.\-\\)](\s*)([A-Z])/g, '$1.$2$3');
    cleanedText = cleanedText.replace(/([a-zA-Z])[.\-\\)](\s*)([A-Z])/g, '$1) $3');

    return cleanedText;
  };

  const extractTextWithFallback = async (file) => {
    // Método de respaldo mejorado
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const binary = e.target.result;
          const text = new TextDecoder('utf-8', { fatal: false }).decode(binary);
          
          // Buscar patrones de preguntas y opciones más robustamente
          const lines = text.split(/[\n\r]+/);
          let extractedText = '';
          let currentQuestion = '';
          let inQuestion = false;
          
          lines.forEach(line => {
            const cleanLine = line.replace(/[^
\x20-\x7E\u00C0-\u017F]/g, '').trim();
            
            if (cleanLine.length < 3) return;
            
            // Patrón de pregunta mejorado
            if (/^\d+[.\-\\)]\s*.{10,}/i.test(cleanLine)) {
              if (currentQuestion) {
                extractedText += currentQuestion + '\n\n';
              }
              currentQuestion = cleanLine;
              inQuestion = true;
            }
            // Patrón de opción mejorado
            else if (/^[a-zA-Z][.\-\\)]\s*.{2,}/i.test(cleanLine) && inQuestion) {
              currentQuestion += '\n' + cleanLine;
            }
            // Continuación de pregunta
            else if (inQuestion && cleanLine && !/^\d+[.\-\\)]/.test(cleanLine)) {
              if (currentQuestion && !currentQuestion.endsWith('.') && !currentQuestion.endsWith('?')) {
                currentQuestion += ' ' + cleanLine;
              }
            }
          });
          
          if (currentQuestion) {
            extractedText += currentQuestion + '\n';
          }
          
          resolve(extractedText || 'No se pudo extraer texto legible del PDF. Intenta con un PDF diferente.');
        } catch (error) {
          resolve('Error en el método de respaldo. El PDF podría estar dañado o protegido.');
        }
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
            <p>Analizando estructura del PDF...</p>
            <small>Detectando encabezados, pies de página y extrayendo contenido limpio</small>
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
            <small>Detección avanzada de encabezados y pies de página mejorada</small>
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