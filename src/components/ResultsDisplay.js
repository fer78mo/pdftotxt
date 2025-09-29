import React, { useState, useEffect } from 'react';

const ResultsDisplay = ({
  text,
  questionFormats,
  optionCount,
  optionFormats,
  answerTemplate,
  extractedQuestions,
  onExtractComplete,
  onBack,
  showFinalResults = false,
  outputQuestionFormat,
  outputOptionFormat,
  outputOptionLetterType = 'uppercase',
  customOptionPrefix = '',
  onAnswerTemplateSelect = null
}) => {
  const [processedQuestions, setProcessedQuestions] = useState([]);
  const [txtOutput, setTxtOutput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [irregularOptions, setIrregularOptions] = useState([]);
  const [showIrregularDialog, setShowIrregularDialog] = useState(false);
  const [acceptedIrregularFormats, setAcceptedIrregularFormats] = useState([]);
  const [showAnswerTemplateDialog, setShowAnswerTemplateDialog] = useState(false);
  const [detectedAnswerTemplate, setDetectedAnswerTemplate] = useState(null);

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

  useEffect(() => {
    if (showFinalResults && extractedQuestions.length > 0) {
      // Generar resultado final directamente sin preguntar por plantilla
      generateFinalOutput();
    }
  }, [showFinalResults, extractedQuestions, answerTemplate, outputOptionLetterType, customOptionPrefix]);

  const detectAnswerTemplateInText = (text) => {
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
  };

  const handleAnswerTemplateDialogResponse = (includeTemplate) => {
    setShowAnswerTemplateDialog(false);
    if (includeTemplate && onAnswerTemplateSelect) {
      onAnswerTemplateSelect('simple'); // Usar plantilla simple por defecto
    }
    generateFinalOutput();
  };

  const extractQuestions = () => {
    setIsProcessing(true);
    
    // Primero detectar opciones irregulares
    const irregulars = detectIrregularOptions(text, optionFormats, optionCount);
    if (irregulars.length > 0) {
      setIrregularOptions(irregulars);
      setShowIrregularDialog(true);
      setIsProcessing(false);
    } else {
      // Procesar normalmente si no hay opciones irregulares
      setTimeout(() => {
        const questions = processTextToQuestions(text, questionFormats, optionCount, optionFormats, acceptedIrregularFormats);
        setProcessedQuestions(questions);
        onExtractComplete(questions);
        setIsProcessing(false);
      }, 1000);
    }
  };

  const detectIrregularOptions = (text, optionFormats, optionCount) => {
    const lines = text.split('\n').filter(line => line.trim());
    const irregularOptions = [];
    
    // Patrones regulares de opciones
    const regularPatterns = optionFormats.map(format => {
      if (format === 'a)') return /^[a-z]\)/;
      if (format === 'A)') return /^[A-Z]\)/;
      if (format === 'a.') return /^[a-z]\./;
      if (format === 'A.') return /^[A-Z]\./;
      if (format === '(a)') return /^\([a-z]\)/;
      if (format === '(A)') return /^\([A-Z]\)/;
      return /^[a-z]\)/;
    });

    // Patrones irregulares comunes
    const irregularPatterns = [
      { regex: /^[a-zA-Z] \)/, label: 'Letra con espacio antes del paréntesis' }, // C )
      { regex: /^[a-zA-Z]  \)/, label: 'Letra con doble espacio antes del paréntesis' }, // C  )
      { regex: /^[a-zA-Z]\s+\)/, label: 'Letra con múltiples espacios antes del paréntesis' },
      { regex: /^[a-zA-Z] \./, label: 'Letra con espacio antes del punto' }, // C .
      { regex: /^[a-zA-Z]\s+\./, label: 'Letra con múltiples espacios antes del punto' },
    ];

    let currentQuestionOptions = [];
    
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      // Verificar si es una opción regular
      const isRegularOption = regularPatterns.some(pattern => pattern.test(trimmedLine));
      
      if (!isRegularOption) {
        // Verificar si coincide con algún patrón irregular
        irregularPatterns.forEach(irregularPattern => {
          if (irregularPattern.regex.test(trimmedLine)) {
            // Extraer la letra de la opción
            const letterMatch = trimmedLine.match(/^([a-zA-Z])/);
            if (letterMatch) {
              const letter = letterMatch[1];
              
              // Verificar si hay correlación con otras opciones en la misma pregunta
              const hasCorrelation = checkOptionCorrelation(lines, index, letter, regularPatterns);
              
              if (hasCorrelation) {
                irregularOptions.push({
                  line: trimmedLine,
                  lineNumber: index + 1,
                  letter: letter,
                  pattern: irregularPattern.label,
                  suggestedFormat: suggestRegularFormat(letter, optionFormats)
                });
              }
            }
          }
        });
      }
    });

    return irregularOptions;
  };

  const checkOptionCorrelation = (lines, currentIndex, letter, regularPatterns) => {
    // Buscar opciones cercanas que sí tengan formato regular
    const searchRange = 10; // Buscar 10 líneas hacia arriba y abajo
    let regularOptionsFound = 0;
    let sameLetterFound = 0;
    
    for (let i = Math.max(0, currentIndex - searchRange); i < Math.min(lines.length, currentIndex + searchRange); i++) {
      if (i === currentIndex) continue;
      
      const line = lines[i].trim();
      
      // Verificar si es una opción regular
      if (regularPatterns.some(pattern => pattern.test(line))) {
        regularOptionsFound++;
        
        // Extraer la letra de la opción regular
        const letterMatch = line.match(/^([a-zA-Z])/);
        if (letterMatch && letterMatch[1].toLowerCase() === letter.toLowerCase()) {
          sameLetterFound++;
        }
      }
    }
    
    // Si hay varias opciones regulares cerca, probablemente esta también sea una opción
    return regularOptionsFound >= 2;
  };

  const suggestRegularFormat = (letter, optionFormats) => {
    // Sugerir el formato más común basado en los formatos seleccionados
    if (optionFormats.includes('a)')) return `${letter})`;
    if (optionFormats.includes('A)')) return `${letter.toUpperCase()})`;
    if (optionFormats.includes('a.')) return `${letter}.`;
    if (optionFormats.includes('A.')) return `${letter.toUpperCase()}.`;
    return `${letter})`; // formato por defecto
  };

  const handleIrregularOptionsConfirm = (accept) => {
    if (accept) {
      // Aceptar todas las opciones irregulares
      const irregularFormats = irregularOptions.map(opt => ({
        letter: opt.letter,
        pattern: opt.suggestedFormat
      }));
      setAcceptedIrregularFormats(irregularFormats);
      
      // Procesar con las opciones irregulares aceptadas
      setShowIrregularDialog(false);
      setIsProcessing(true);
      setTimeout(() => {
        const questions = processTextToQuestions(text, questionFormats, optionCount, optionFormats, irregularFormats);
        setProcessedQuestions(questions);
        onExtractComplete(questions);
        setIsProcessing(false);
      }, 1000);
    } else {
      // Rechazar opciones irregulares
      setShowIrregularDialog(false);
      setIsProcessing(true);
      setTimeout(() => {
        const questions = processTextToQuestions(text, questionFormats, optionCount, optionFormats, []);
        setProcessedQuestions(questions);
        onExtractComplete(questions);
        setIsProcessing(false);
      }, 1000);
    }
  };

  const detectAndFilterHeadersFooters = (text) => {
    const lines = text.split('\n');
    const totalLines = lines.length;

    // Sistema avanzado de detección de encabezados/pies
    const detectedHeadersFooters = new Set();

    // 1. Detección por similitud entre páginas (95% de coincidencia)
    const crossPageSimilarity = detectCrossPageSimilarities(lines);
    crossPageSimilarity.forEach(line => detectedHeadersFooters.add(line));

    // 2. Detección por patrones específicos
    const patternBasedHeaders = detectPatternBasedHeaders(lines);
    patternBasedHeaders.forEach(line => detectedHeadersFooters.add(line));

    // 3. Detección por análisis de frecuencia y posición
    const frequencyBasedHeaders = detectFrequencyBasedHeaders(lines);
    frequencyBasedHeaders.forEach(line => detectedHeadersFooters.add(line));

    // 4. Detección por análisis estadístico (machine learning-like)
    const statisticalHeaders = detectStatisticalHeaders(lines);
    statisticalHeaders.forEach(line => detectedHeadersFooters.add(line));

    // 4. Sistema de detección basado en estructura del PDF si está disponible
    if (window.pdfStructuralData && window.pdfStructuralData.length > 0) {
      const structuralHeaders = filterUsingStructuralData(window.pdfStructuralData);
      structuralHeaders.removedLines.forEach(item => detectedHeadersFooters.add(item.text));
      return structuralHeaders;
    }

    // Sistema de respaldo basado en análisis de texto
    const result = filterUsingTextAnalysis(lines, detectedHeadersFooters);

    // Logging detallado para depuración
    if (result.totalRemoved > 0) {
      console.log(`=== DETECCIÓN DE ENCABEZADOS/PIES DE PÁGINA ===`);
      console.log(`Total de líneas analizadas: ${lines.length}`);
      console.log(`Líneas filtradas: ${result.totalRemoved}`);
      console.log(`Líneas detectadas:`);
      result.removedLines.forEach((line, index) => {
        console.log(`  ${index + 1}. "${line}"`);
      });
      console.log(`==========================================`);
    }

    return result;
  };

  const detectStatisticalHeaders = (lines) => {
    const statisticalHeaders = new Set();
    const pageSize = 40;
    const lineStats = new Map();

    // Recopilar estadísticas de cada línea
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 5) return;

      const pageNumber = Math.floor(index / pageSize);
      const positionInPage = index % pageSize;

      // Características estadísticas
      const features = {
        length: trimmedLine.length,
        wordCount: trimmedLine.split(/\s+/).length,
        uppercaseRatio: (trimmedLine.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length / trimmedLine.length,
        numberCount: (trimmedLine.match(/\d/g) || []).length,
        hasColon: trimmedLine.includes(':'),
        hasPeriod: trimmedLine.includes('.'),
        positionInPage: positionInPage,
        pageNumber: pageNumber,
        isNearBoundary: positionInPage < 3 || positionInPage > pageSize - 3
      };

      lineStats.set(index, {
        text: trimmedLine,
        features: features,
        score: 0
      });
    });

    // Calcular puntuaciones basadas en características
    lineStats.forEach((data, index) => {
      let score = 0;
      const features = data.features;

      // Puntuación por posición (encabezados/pies tienen posiciones extremas)
      if (features.isNearBoundary) score += 2;

      // Puntuación por longitud (encabezados suelen ser más cortos que preguntas)
      if (features.length < 100) score += 1;
      if (features.length < 50) score += 1;

      // Puntuación por mayúsculas (encabezados suelen tener más mayúsculas)
      if (features.uppercaseRatio > 0.3) score += 1;

      // Puntuación por números (fechas, páginas, unidades)
      if (features.numberCount > 0) score += 1;

      // Puntuación por palabras clave académicas
      const academicWords = ['EXAMEN', 'UNIDAD', 'TEMA', 'ACADEMIA', 'FORMACIÓN', 'DOBLER', 'SAS'];
      const upperText = data.text.toUpperCase();
      const academicMatches = academicWords.filter(word => upperText.includes(word)).length;
      score += academicMatches;

      // Puntuación por puntuación (encabezados suelen terminar con puntos)
      if (features.hasPeriod && !features.hasColon) score += 0.5;

      data.score = score;
    });

    // Identificar líneas con puntuaciones altas que aparecen en múltiples páginas
    const highScoreLines = new Map();

    lineStats.forEach((data, index) => {
      if (data.score >= 3) { // Umbral de puntuación
        const key = data.text.toLowerCase().replace(/\s+/g, ' ').trim();

        if (!highScoreLines.has(key)) {
          highScoreLines.set(key, {
            text: data.text,
            pages: new Set(),
            totalScore: 0,
            occurrences: 0
          });
        }

        const lineData = highScoreLines.get(key);
        lineData.pages.add(data.features.pageNumber);
        lineData.totalScore += data.score;
        lineData.occurrences++;
      }
    });

    // Filtrar líneas que aparecen en múltiples páginas con alta puntuación
    highScoreLines.forEach((data, key) => {
      if (data.pages.size >= 2 && data.totalScore / data.occurrences >= 3) {
        statisticalHeaders.add(data.text);
        console.log(`Detectado por análisis estadístico: "${data.text}" (puntuación promedio: ${(data.totalScore / data.occurrences).toFixed(1)})`);
      }
    });

    return statisticalHeaders;
  };
  
  const detectCrossPageSimilarities = (lines) => {
    const pageSize = 40; // Asumir aproximadamente 40 líneas por página
    const similarLines = new Map();
    const pageBoundaries = [];
    
    // Identificar líneas que aparecen en múltiples páginas
    for (let i = 0; i < lines.length; i++) {
      const pageNumber = Math.floor(i / pageSize);
      const line = lines[i].trim();
      
      if (line.length < 10) continue; // Ignorar líneas muy cortas
      
      // Normalizar la línea para comparación
      const normalizedLine = line.toLowerCase().replace(/\s+/g, ' ').trim();
      
      if (!similarLines.has(normalizedLine)) {
        similarLines.set(normalizedLine, {
          occurrences: [],
          originalText: line
        });
      }
      
      similarLines.get(normalizedLine).occurrences.push({
        lineIndex: i,
        pageNumber: pageNumber,
        positionInPage: i % pageSize
      });
    }
    
    // Detectar líneas que aparecen en cambios de página con alta similitud
    const crossPageCandidates = new Set();
    
    similarLines.forEach((data, normalizedLine) => {
      if (data.occurrences.length < 2) return;
      
      // Verificar si aparece en diferentes páginas
      const uniquePages = [...new Set(data.occurrences.map(occ => occ.pageNumber))];
      if (uniquePages.length < 2) return;
      
      // Verificar si aparece cerca de los límites de página (cambios de página)
      const nearPageBoundaries = data.occurrences.filter(occ =>
        occ.positionInPage < 5 || occ.positionInPage > pageSize - 5
      );
      
      if (nearPageBoundaries.length >= 2) {
        // Calcular similitud entre las ocurrencias
        const texts = data.occurrences.map(occ => lines[occ.lineIndex].trim());
        const similarity = calculateSimilarity(texts);
        
        if (similarity >= 0.95) { // 95% de similitud
          crossPageCandidates.add(data.originalText);
          console.log(`Línea detectada como encabezado/pie por similitud 95%: "${data.originalText}"`);
        }
      }
    });
    
    return crossPageCandidates;
  };
  
  const calculateSimilarity = (texts) => {
    if (texts.length < 2) return 0;
    
    let totalSimilarity = 0;
    let comparisons = 0;
    
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const similarity = compareStrings(texts[i], texts[j]);
        totalSimilarity += similarity;
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  };
  
  const compareStrings = (str1, str2) => {
    // Normalizar strings
    const norm1 = str1.toLowerCase().replace(/\s+/g, ' ').trim();
    const norm2 = str2.toLowerCase().replace(/\s+/g, ' ').trim();
    
    // Usar algoritmo de distancia de Levenshtein adaptado
    const longer = norm1.length > norm2.length ? norm1 : norm2;
    const shorter = norm1.length > norm2.length ? norm2 : norm1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };
  
  const levenshteinDistance = (str1, str2) => {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  };

  const detectPatternBasedHeaders = (lines) => {
    const headerPatterns = new Set();

    // Patrones específicos para encabezados/pies de página académicos
    const academicPatterns = [
      /EXAMEN\s+(?:RE\s*)?PASO/i,
      /EXAMEN\s+COMÚN/i,
      /UNIDAD\s+\d+/i,
      /TEMA\s+\d+/i,
      /CAPÍTULO\s+\d+/i,
      /SECCIÓN\s+\d+/i,
      /ACADEMIA\s+\w+\s+FORMACIÓN/i,
      /DOBLER\s+FORMACIÓN/i,
      /CENTRO\s+DE\s+FORMACIÓN/i,
      /INSTITUTO\s+\w+/i,
      /COLEGIO\s+\w+/i,
      /SAS\b/i,
      /\d{1,2}\s+DE\s+(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+\d{4}/i,
      /\d{1,2}\/\d{1,2}\/\d{2,4}/,
      /PÁGINA\s+\d+/i,
      /PÁG\.\s+\d+/i,
      /PÁG\s+\d+/i,
      /HOJA\s+\d+/i,
      /FOLIO\s+\d+/i
    ];

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 5) return;

      // Verificar si coincide con patrones académicos
      const matchesPattern = academicPatterns.some(pattern => pattern.test(trimmedLine));
      if (matchesPattern) {
        headerPatterns.add(trimmedLine);
        console.log(`Detectado por patrón académico: "${trimmedLine}"`);
      }

      // Detectar líneas que contienen múltiples elementos académicos
      const academicElements = [
        'EXAMEN', 'UNIDAD', 'TEMA', 'CAPÍTULO', 'SECCIÓN',
        'ACADEMIA', 'FORMACIÓN', 'DOBLER', 'SAS',
        'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
        'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
        'PÁGINA', 'PÁG', 'HOJA', 'FOLIO'
      ];

      const upperLine = trimmedLine.toUpperCase();
      const academicCount = academicElements.filter(element => upperLine.includes(element)).length;

      if (academicCount >= 2) {
        headerPatterns.add(trimmedLine);
        console.log(`Detectado por múltiples elementos académicos (${academicCount}): "${trimmedLine}"`);
      }
    });

    return headerPatterns;
  };

  const detectFrequencyBasedHeaders = (lines) => {
    const frequencyMap = new Map();
    const pageSize = 40; // Asumir aproximadamente 40 líneas por página
    const headerCandidates = new Set();

    // Analizar frecuencia de líneas por posición en página
    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 10) return; // Solo analizar líneas significativas

      const pageNumber = Math.floor(index / pageSize);
      const positionInPage = index % pageSize;

      // Solo considerar posiciones típicas de encabezados/pies (top 10% o bottom 10%)
      if (positionInPage > 4 && positionInPage < pageSize - 4) return;

      const key = trimmedLine.toLowerCase().replace(/\s+/g, ' ').trim();

      if (!frequencyMap.has(key)) {
        frequencyMap.set(key, {
          originalText: trimmedLine,
          occurrences: [],
          positions: []
        });
      }

      frequencyMap.get(key).occurrences.push(index);
      frequencyMap.get(key).positions.push(positionInPage);
    });

    // Identificar líneas que aparecen en múltiples páginas en posiciones similares
    frequencyMap.forEach((data, key) => {
      const uniquePages = [...new Set(data.occurrences.map(idx => Math.floor(idx / pageSize)))];
      const uniquePositions = [...new Set(data.positions)];

      // Si aparece en al menos 2 páginas diferentes
      if (uniquePages.length >= 2) {
        // Verificar si las posiciones son consistentes (máximo 2 posiciones diferentes)
        if (uniquePositions.length <= 2) {
          headerCandidates.add(data.originalText);
          console.log(`Detectado por frecuencia multi-página: "${data.originalText}" (páginas: ${uniquePages.join(', ')})`);
        }
      }

      // Si aparece en más del 50% de las páginas (muy frecuente)
      const totalPages = Math.ceil(lines.length / pageSize);
      if (uniquePages.length > totalPages * 0.5) {
        headerCandidates.add(data.originalText);
        console.log(`Detectado por alta frecuencia: "${data.originalText}" (${uniquePages.length}/${totalPages} páginas)`);
      }
    });

    return headerCandidates;
  };
  
  const filterUsingStructuralData = (structuralData) => {
    let filteredText = '';
    const removedLines = [];
    let totalRemoved = 0;
    
    structuralData.forEach(pageInfo => {
      pageInfo.items.forEach(item => {
        if (item.isHeaderFooter && item.confidence > 70) {
          removedLines.push({
            text: item.text,
            type: item.headerFooterType,
            confidence: item.confidence,
            page: pageInfo.pageNumber
          });
          totalRemoved++;
        } else {
          filteredText += item.text + '\n';
        }
      });
      
      filteredText += '\n';
    });
    
    return {
      filteredText: filteredText.trim(),
      removedLines: removedLines,
      totalRemoved: totalRemoved
    };
  };
  
  const filterUsingTextAnalysis = (lines, detectedHeadersFooters) => {
    // Usar el conjunto de encabezados/pies ya detectados por múltiples métodos
    const headerFooterCandidates = new Set(detectedHeadersFooters);

    // Filtrar líneas adicionales que podrían ser encabezados/pies
    const additionalPatterns = [
      /^\d{1,2}$/,  // Números solos (posibles números de página)
      /^\s*\d+\s*$/, // Números con espacios
      /^[A-Z\s]{5,}$/, // Texto en mayúsculas (posibles títulos)
    ];

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 2) return;

      // Si ya fue detectado por otros métodos, continuar
      if (headerFooterCandidates.has(trimmedLine)) return;

      // Verificar patrones adicionales
      const matchesAdditionalPattern = additionalPatterns.some(pattern => pattern.test(trimmedLine));
      if (matchesAdditionalPattern) {
        // Verificar contexto: si está cerca de otros encabezados detectados
        const contextWindow = 5;
        let nearDetectedHeader = false;

        for (let i = Math.max(0, index - contextWindow); i < Math.min(lines.length, index + contextWindow); i++) {
          if (i === index) continue;
          if (headerFooterCandidates.has(lines[i].trim())) {
            nearDetectedHeader = true;
            break;
          }
        }

        if (nearDetectedHeader) {
          headerFooterCandidates.add(trimmedLine);
          console.log(`Detectado por contexto cercano: "${trimmedLine}"`);
        }
      }
    });

    // Filtrar el texto
    const filteredLines = lines.filter(line => {
      const trimmedLine = line.trim();
      return !headerFooterCandidates.has(trimmedLine);
    });

    return {
      filteredText: filteredLines.join('\n'),
      removedLines: Array.from(headerFooterCandidates),
      totalRemoved: lines.length - filteredLines.length
    };
  };

  const splitLinesWithMixedContent = (lines) => {
    const processedLines = [];

    lines.forEach(line => {
      const trimmedLine = line.trim();

      // Detectar si la línea contiene tanto opción como encabezado
      // Patrón más específico que busca opciones seguidas de elementos de encabezado
      const mixedContentPattern = /^([A-D]\))\s*(.+?)(?:\s+(?:\d+\s+)?(?:EXAMEN\s+(?:RE\s*)?PASO|ACADEMIA\s+\w+\s+FORMACIÓN|DOBLER\s+FORMACIÓN|\d+\s+DE\s+(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+\d{4}|UNIDAD\s+\d+|TEMA\s+\d+|CAPÍTULO\s+\d+|SECCIÓN\s+\d+))/i;

      const optionMatch = trimmedLine.match(mixedContentPattern);

      if (optionMatch) {
        // Separar la opción del encabezado
        const optionLetter = optionMatch[1];
        const optionText = optionMatch[2].trim();

        // Limpiar el texto de la opción de posibles residuos
        const cleanOptionText = optionText.replace(/\s*\d+\s*$/, '').trim(); // Remover números al final

        // Agregar la opción limpia
        processedLines.push(`${optionLetter} ${cleanOptionText}`);

        console.log(`Línea separada: "${trimmedLine}" → Opción limpia: "${optionLetter} ${cleanOptionText}"`);
      } else {
        // Verificar si es una línea que contiene encabezado pero podría tener opción antes
        const headerOnlyPattern = /(?:\d+\s+)?(?:EXAMEN\s+(?:RE\s*)?PASO|ACADEMIA\s+\w+\s+FORMACIÓN|DOBLER\s+FORMACIÓN|\d+\s+DE\s+(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+\d{4})/i;

        if (headerOnlyPattern.test(trimmedLine) && trimmedLine.length < 50) {
          // Es una línea de encabezado puro, filtrarla
          console.log(`Línea de encabezado filtrada: "${trimmedLine}"`);
        } else {
          // Línea normal, agregar tal cual
          processedLines.push(trimmedLine);
        }
      }
    });

    return processedLines;
  };

  const processTextToQuestions = (text, questionFormats, optionCount, optionFormats, irregularFormats = []) => {
    // Usar el nuevo sistema de filtrado basado en datos estructurales si están disponibles
    if (window.pdfStructuralData && window.pdfStructuralData.length > 0) {
      const { filteredText, removedLines, totalRemoved } = filterUsingStructuralData(window.pdfStructuralData);

      if (totalRemoved > 0) {
        console.log(`Filtrados ${totalRemoved} elementos de encabezados/pies usando datos estructurales:`, removedLines);
      }

      let lines = filteredText.split('\n');
      // Separar líneas con contenido mixto antes del procesamiento
      lines = splitLinesWithMixedContent(lines);
      // Procesar con el texto filtrado
      return processFilteredLines(lines, questionFormats, optionCount, optionFormats, irregularFormats);
    } else {
      // Fallback al método anterior si no hay datos estructurales
      const { filteredText, removedLines, totalRemoved } = detectAndFilterHeadersFooters(text);

      if (totalRemoved > 0) {
        console.log(`Filtrados ${totalRemoved} líneas de encabezados/pies de página:`, removedLines);
      }

      let lines = filteredText.split('\n');
      // Separar líneas con contenido mixto antes del procesamiento
      lines = splitLinesWithMixedContent(lines);
      return processFilteredLines(lines, questionFormats, optionCount, optionFormats, irregularFormats);
    }
  };

  const cleanLineFromHeaders = (line) => {
    let cleanedLine = line;

    // Primero, detectar si la línea contiene una opción válida (A), B), C), D), etc.)
    const optionPattern = /^[A-D]\)\s*.+/;
    const hasValidOption = optionPattern.test(cleanedLine.trim());

    if (hasValidOption) {
      // Si contiene una opción válida, ser más conservador con la limpieza
      // Solo remover fragmentos que claramente no pertenecen a opciones

      // Remover fechas al final de opciones
      cleanedLine = cleanedLine.replace(/\s+\d+\s+DE\s+(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+\d{4}\s*$/gi, '');

      // Remover "EXAMEN..." al final de opciones
      cleanedLine = cleanedLine.replace(/\s+EXAMEN\s+(?:RE\s*)?PASO(?:\s+COMÚN)?(?:\s+SAS)?\s*$/gi, '');

      // Remover números sueltos al final que no sean parte de la opción
      cleanedLine = cleanedLine.replace(/\s+\d+\s*$/, '');

      // Remover "ACADEMIA DOBLER FORMACIÓN" al final
      cleanedLine = cleanedLine.replace(/\s+ACADEMIA\s+\w+\s+FORMACIÓN\s*$/gi, '');
      cleanedLine = cleanedLine.replace(/\s+DOBLER\s+FORMACIÓN\s*$/gi, '');

    } else {
      // Si no contiene opción válida, ser más agresivo con la limpieza
      const headerFragments = [
        /\s*\d+\s*EXAMEN\s+(?:RE\s*)?PASO(?:\s+COMÚN)?(?:\s+SAS)?(?:\s*\d+\s*DE\s+(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+\d{4})?/gi,
        /\s*EXAMEN\s+(?:RE\s*)?PASO(?:\s+COMÚN)?(?:\s+SAS)?(?:\s*\d+\s*DE\s+(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+\d{4})?/gi,
        /\s*\d+\s*ACADEMIA\s+\w+\s+FORMACIÓN/gi,
        /\s*ACADEMIA\s+\w+\s+FORMACIÓN/gi,
        /\s*DOBLER\s+FORMACIÓN/gi,
        /\s*\d+\s*DE\s+(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+\d{4}/gi,
        /\s*UNIDAD\s+\d+/gi,
        /\s*TEMA\s+\d+/gi,
        /\s*CAPÍTULO\s+\d+/gi,
        /\s*SECCIÓN\s+\d+/gi,
        /\s*PÁGINA\s+\d+/gi,
        /\s*PÁG\.\s*\d+/gi,
        /\s*PÁG\s+\d+/gi,
        /\s*SAS\b/gi
      ];

      // Aplicar cada patrón de limpieza
      headerFragments.forEach(pattern => {
        cleanedLine = cleanedLine.replace(pattern, '').trim();
      });
    }

    // Limpiar espacios múltiples resultantes
    cleanedLine = cleanedLine.replace(/\s+/g, ' ').trim();

    // Si la línea cambió significativamente, loguear el cambio
    if (cleanedLine !== line && Math.abs(cleanedLine.length - line.length) > 3) {
      console.log(`Línea limpiada: "${line}" → "${cleanedLine}"`);
    }

    return cleanedLine;
  };

  const processFilteredLines = (lines, questionFormats, optionCount, optionFormats, irregularFormats) => {
    const questions = [];

    // Convertir formatos seleccionados a patrones de regex
    const questionPatterns = questionFormats.map(format => {
      // Los formatos vienen como etiquetas como "1.", "1)", etc.
      if (format === '1.') return /^\d+\./;
      if (format === '1)') return /^\d+\)/;
      if (format === '1.-') return /^\d+\.-/;
      if (format === 'Pregunta 1:') return /^Pregunta \d+:/i;
      if (format === 'PREGUNTA 1:') return /^PREGUNTA \d+:/;
      return /^\d+\./; // formato por defecto
    });

    // Patrones para detectar opciones
    const optionPatterns = optionFormats.map(format => {
      if (format === 'a)') return /^[a-z]\)/;
      if (format === 'A)') return /^[A-Z]\)/;
      if (format === 'a.') return /^[a-z]\./;
      if (format === 'A.') return /^[A-Z]\./;
      if (format === '(a)') return /^\([a-z]\)/;
      if (format === '(A)') return /^\([A-Z]\)/;
      return /^[a-z]\)/; // formato por defecto
    });

    // Agregar patrones irregulares aceptados
    irregularFormats.forEach(irregular => {
      const letter = irregular.letter;
      const pattern = irregular.pattern;
      
      if (pattern.includes(')')) {
        optionPatterns.push(new RegExp(`^${letter}\\s*\\)`)); // C ), C  ), etc.
      } else if (pattern.includes('.')) {
        optionPatterns.push(new RegExp(`^${letter}\\s*\\.`)); // C ., C  ., etc.
      }
    });

    let currentQuestion = null;
    let currentOption = null;
    let optionIndex = 0;
    let questionNumbers = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = cleanLineFromHeaders(line.trim());
      
      // Saltar líneas vacías
      if (!trimmedLine) continue;
      
      // Detectar inicio de pregunta
      const questionMatch = questionPatterns.find(pattern => pattern.test(trimmedLine));
      if (questionMatch) {
        // Extraer número de la pregunta para verificar progresividad
        const numberMatch = trimmedLine.match(/\d+/);
        const questionNumber = numberMatch ? parseInt(numberMatch[0]) : 0;
        
        // Validar que sea una pregunta válida (con progresividad o primera pregunta)
        const isValidQuestion = questionNumbers.length === 0 ||
          questionNumbers.includes(questionNumber - 1) ||
          questionNumber === Math.max(...questionNumbers) + 1;

        if (isValidQuestion) {
          // Guardar pregunta anterior si existe
          if (currentQuestion) {
            // Agregar opción actual si existe
            if (currentOption) {
              currentQuestion.options.push(currentOption);
              currentOption = null;
            }
            questions.push(currentQuestion);
          }
          
          // Limpiar el texto de la pregunta (quitar el número inicial)
          const cleanQuestionText = trimmedLine.replace(/^[\d\.\-\)]+\s*/, '');
          
          currentQuestion = {
            question: cleanQuestionText,
            options: [],
            correctAnswer: null,
            questionNumber: questionNumber
          };
          questionNumbers.push(questionNumber);
          optionIndex = 0;
          currentOption = null;
        }
      }
      // Detectar opciones
      else if (currentQuestion) {
        const optionMatch = optionPatterns.find(pattern => pattern.test(trimmedLine));
        if (optionMatch && optionIndex < optionCount) {
          // Si hay una opción anterior, guardarla antes de crear la nueva
          if (currentOption) {
            currentQuestion.options.push(currentOption);
          }
          
          // Extraer la letra de la opción
          const letterMatch = trimmedLine.match(/^([a-zA-Z])/);
          const letter = letterMatch ? letterMatch[1].toLowerCase() : String.fromCharCode(97 + optionIndex);
          
          // Limpiar el texto de la opción (quitar la letra y el formato inicial)
          const cleanOptionText = trimmedLine.replace(/^[a-zA-Z][\.\)\s]*/, '');
          
          currentOption = {
            letter: letter,
            text: cleanOptionText,
            isCorrect: false
          };
          optionIndex++;
        }
        // Si no es una opción pero tenemos una opción en progreso, el texto puede ser continuación de la opción
        else if (currentOption && trimmedLine && !questionPatterns.some(pattern => pattern.test(trimmedLine))) {
          // Verificar si esta línea debería ir con la opción actual o es algo diferente
          const looksLikeNewOption = trimmedLine.match(/^[a-zA-Z][\.\)]/);
          const looksLikeQuestionContinuation = trimmedLine.match(/^\d+[.\)]/) || trimmedLine.length > 150;
          
          if (!looksLikeNewOption && !looksLikeQuestionContinuation) {
            // Es continuación de la opción actual
            currentOption.text += ' ' + trimmedLine;
          }
          // Si parece una nueva opción o continuación de pregunta, no agregar aquí
        }
        // Si no es una opción y no tenemos opción en progreso, verificar si es continuación de pregunta
        else if (currentQuestion && trimmedLine && !questionPatterns.some(pattern => pattern.test(trimmedLine))) {
          // Verificar si esta línea pertenece a la pregunta actual
          const looksLikeOption = optionPatterns.some(pattern => pattern.test(trimmedLine));
          const looksLikeQuestionContinuation = !trimmedLine.match(/^[a-zA-Z][\.\)]/);
          
          if (!looksLikeOption && looksLikeQuestionContinuation) {
            // Es texto adicional de la pregunta (continuación)
            currentQuestion.question += ' ' + trimmedLine;
          }
        }
      }
    }

    // Guardar la última opción si existe
    if (currentOption && currentQuestion) {
      currentQuestion.options.push(currentOption);
    }

    // Guardar la última pregunta si existe
    if (currentQuestion) {
      questions.push(currentQuestion);
    }

    return questions;
  };

  const generateFinalOutput = () => {
    let output = '';
    
    // Generar preguntas y opciones
    output += '=== PREGUNTAS EXTRAÍDAS ===\n\n';
    
    extractedQuestions.forEach((q, index) => {
      // Formatear la pregunta según el formato personalizado
      const questionNumber = index + 1;
      let formattedQuestion = outputQuestionFormat.replace('{number}', questionNumber.toString());
      formattedQuestion = formattedQuestion + ' ' + q.question;
      
      output += formattedQuestion + '\n';
      
      // Formatear las opciones según el formato personalizado y el tipo de letra seleccionado
      q.options.forEach((opt, optIndex) => {
        // Generar la letra/número según el tipo seleccionado
        const letter = getOptionLetter(optIndex, outputOptionLetterType, customOptionPrefix);
        let formattedOption = outputOptionFormat.replace('{letter}', letter);
        formattedOption = formattedOption + ' ' + opt.text;
        
        output += formattedOption + '\n';
      });
      output += '\n';
    });

    // Generar plantilla de respuestas si se seleccionó
    if (answerTemplate && answerTemplate !== 'none') {
      output += '\n=== PLANTILLA DE RESPUESTAS ===\n\n';
      
      if (answerTemplate === 'simple') {
        extractedQuestions.forEach((q, index) => {
          const questionNumber = index + 1;
          let questionPrefix = outputQuestionFormat.replace('{number}', questionNumber.toString());
          
          output += `${questionPrefix} _______\n`;
        });
      } else if (answerTemplate === 'detailed') {
        extractedQuestions.forEach((q, index) => {
          const questionNumber = index + 1;
          let questionPrefix = outputQuestionFormat.replace('{number}', questionNumber.toString());
          
          output += `${questionPrefix} Pregunta: ${q.question}\n`;
          output += `   Respuesta: _______\n\n`;
        });
      }
    }

    setTxtOutput(output);
  };

  const downloadTXT = () => {
    const blob = new Blob([txtOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'preguntas_extraidas.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isProcessing) {
    return (
      <div className="results-section">
        <h2>Procesando preguntas...</h2>
        <div className="processing">
          <div className="spinner"></div>
          <p>Extrayendo preguntas y opciones del texto...</p>
        </div>
      </div>
    );
  }

  if (showFinalResults) {
    return (
      <div className="results-section">
        <h2>Resultados del Procesamiento</h2>
        
        <div className="results-summary">
          <p><strong>Preguntas extraídas:</strong> {extractedQuestions.length}</p>
          <p><strong>Formato de preguntas:</strong> {questionFormats.join(', ')}</p>
          <p><strong>Opciones por pregunta:</strong> {optionCount}</p>
          <p><strong>Formato de opciones:</strong> {optionFormats.join(', ')}</p>
        </div>

        <div className="text-output-container">
          <h3>Archivo TXT generado:</h3>
          <div className="text-output">{txtOutput}</div>
          <button className="btn" onClick={downloadTXT}>
            Descargar TXT
          </button>
        </div>
      </div>
    );
  }

  // Diálogo para plantilla de respuestas detectada
  const renderAnswerTemplateDialog = () => {
    if (!showAnswerTemplateDialog) return null;

    return (
      <div className="irregular-options-dialog">
        <div className="dialog-content">
          <h3>📋 Se detectó una posible plantilla de respuestas</h3>
          <p>Se encontró lo que podría ser una plantilla de respuestas en el documento:</p>
          
          {detectedAnswerTemplate && (
            <div className="irregular-options-list">
              <div className="irregular-option-item">
                <div className="option-line">
                  <strong>Texto detectado:</strong> "{detectedAnswerTemplate.startMarker}"
                </div>
                <div className="pattern-examples">
                  <pre className="selectable-text" style={{ maxHeight: '100px', overflow: 'auto' }}>
                    {detectedAnswerTemplate.snippet}
                  </pre>
                </div>
              </div>
            </div>
          )}
          
          <p className="explanation">
            <strong>¿Qué deseas hacer?</strong> Puedes incluir una plantilla de respuestas al final de tu archivo
            o continuar solo con las preguntas y opciones.
          </p>
          
          <div className="dialog-actions">
            <button
              className="btn btn-accept"
              onClick={() => handleAnswerTemplateDialogResponse(true)}
            >
              Sí, incluir plantilla de respuestas
            </button>
            <button
              className="btn btn-reject"
              onClick={() => handleAnswerTemplateDialogResponse(false)}
            >
              No, solo preguntas y opciones
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Diálogo para opciones irregulares
  const renderIrregularOptionsDialog = () => {
    if (!showIrregularDialog) return null;

    return (
      <div className="irregular-options-dialog">
        <div className="dialog-content">
          <h3>⚠️ Se detectaron opciones con formato irregular</h3>
          <p>Se encontraron las siguientes líneas que podrían ser opciones pero tienen un formato diferente:</p>
          
          <div className="irregular-options-list">
            {irregularOptions.map((option, index) => (
              <div key={index} className="irregular-option-item">
                <div className="option-line">
                  <strong>Línea {option.lineNumber}:</strong> "{option.line}"
                </div>
                <div className="option-analysis">
                  <span className="pattern-detected">Formato detectado: {option.pattern}</span>
                  <span className="suggested-format">Sugerencia: {option.suggestedFormat}</span>
                </div>
              </div>
            ))}
          </div>
          
          <p className="explanation">
            <strong>¿Qué hacer?</strong> El sistema detectó que estas líneas podrían ser opciones
            basándose en la correlación con otras opciones en el mismo contexto.
            ¿Deseas incluirlas como opciones válidas?
          </p>
          
          <div className="dialog-actions">
            <button
              className="btn btn-accept"
              onClick={() => handleIrregularOptionsConfirm(true)}
            >
              Sí, incluir opciones irregulares
            </button>
            <button
              className="btn btn-reject"
              onClick={() => handleIrregularOptionsConfirm(false)}
            >
              No, procesar solo formato estándar
            </button>
          </div>
        </div>
      </div>
    );
  };

  const mainContent = () => {
    if (isProcessing) {
      return (
        <div className="results-section">
          <h2>Procesando preguntas...</h2>
          <div className="processing">
            <div className="spinner"></div>
            <p>Extrayendo preguntas y opciones del texto...</p>
          </div>
        </div>
      );
    }

    if (showFinalResults) {
      return (
        <div className="results-section">
          <h2>Resultados del Procesamiento</h2>
          
          <div className="results-summary">
            <p><strong>Preguntas extraídas:</strong> {extractedQuestions.length}</p>
            <p><strong>Formato de preguntas:</strong> {questionFormats.join(', ')}</p>
            <p><strong>Opciones por pregunta:</strong> {optionCount}</p>
            <p><strong>Formato de opciones:</strong> {optionFormats.join(', ')}</p>
          </div>

          <div className="text-output-container">
            <h3>Archivo TXT generado:</h3>
            <div className="text-output">{txtOutput}</div>
            <button className="btn" onClick={downloadTXT}>
              Descargar TXT
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="results-section">
        <h2>Extracción de Preguntas</h2>
        
        <div className="extraction-summary">
          <p><strong>Formatos de preguntas seleccionados:</strong> {questionFormats.length}</p>
          <p><strong>Número de opciones:</strong> {optionCount}</p>
          <p><strong>Formatos de opciones:</strong> {optionFormats.length}</p>
        </div>

        <div className="extraction-actions">
          <button className="btn" onClick={onBack}>
            Atrás
          </button>
          <button className="btn" onClick={extractQuestions}>
            Extraer Preguntas
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {mainContent()}
      {renderIrregularOptionsDialog()}
    </div>
  );
};

export default ResultsDisplay;