let canvas, ctx;
let currentTool = 'arrow';
let isDrawing = false;
let startX, startY;
let annotations = [];
let currentAnnotation = null;
let screenshotDataUrl = null;
let isCropMode = false;
let cropSelection = null;
let originalImageData = null;
let isFilterMode = false;
let filterSelection = null;
let filterSelecting = false;
let filterDragStart = { x: 0, y: 0 };
let pendingTextAnnotation = null;
let textInputOverlay = null;
let textInputField = null;
let textInputMode = null;
let textOverlayScrollHandler = null;
let isDraggingImage = false;
let draggedImageAnnotation = null;
let dragOffset = { x: 0, y: 0 };

// Tool buttons
const captureBtn = document.getElementById('captureBtn');
const arrowTool = document.getElementById('arrowTool');
const lineTool = document.getElementById('lineTool');
const headingTool = document.getElementById('headingTool');
const textTool = document.getElementById('textTool');
const textApplyBtn = document.getElementById('textApplyBtn');
const textCancelBtn = document.getElementById('textCancelBtn');
const highlightTool = document.getElementById('highlightTool');
const markerTool = document.getElementById('markerTool');
const filterTool = document.getElementById('filterTool');
const rectangleTool = document.getElementById('rectangleTool');
const ellipseTool = document.getElementById('ellipseTool');
const blurTool = document.getElementById('blurTool');
const cropTool = document.getElementById('cropTool');
const colorPicker = document.getElementById('colorPicker');
const lineWidth = document.getElementById('lineWidth');
const headingLevel = document.getElementById('headingLevel');
const fontFamily = document.getElementById('fontFamily');
const blurIntensity = document.getElementById('blurIntensity');
const filterType = document.getElementById('filterType');
const filterApplyBtn = document.getElementById('filterApplyBtn');
const filterClearBtn = document.getElementById('filterClearBtn');
const undoBtn = document.getElementById('undoBtn');
const clearBtn = document.getElementById('clearBtn');
const applyCropBtn = document.getElementById('applyCropBtn');
const cancelCropBtn = document.getElementById('cancelCropBtn');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const editorSection = document.getElementById('editorSection');
const folderNameInput = document.getElementById('folderName');
const fileNameInput = document.getElementById('fileName');

document.addEventListener('paste', handlePasteFromClipboard);

// Capture screenshot
captureBtn.addEventListener('click', () => {
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return;
    }
    
    screenshotDataUrl = dataUrl;
    loadScreenshotToCanvas(dataUrl);
    
    // Show editor, hide capture button
    document.querySelector('.capture-section').classList.add('hidden');
    editorSection.classList.remove('hidden');
    
    // Generate default filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    fileNameInput.value = `screenshot-${timestamp}`;
  });
});

// Load screenshot to canvas
function loadScreenshotToCanvas(dataUrl) {
  const img = new Image();
  img.onload = () => {
    canvas = document.getElementById('annotationCanvas');
    ctx = canvas.getContext('2d');
    
    canvas.width = img.width;
    canvas.height = img.height;
    
    ctx.drawImage(img, 0, 0);
    
    setupCanvasListeners();
  };
  img.src = dataUrl;
}

// Tool selection
[arrowTool, lineTool, headingTool, textTool, highlightTool, markerTool, filterTool, rectangleTool, ellipseTool, blurTool, cropTool].forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.id.replace('Tool', '');
    
    // Handle crop mode
    if (currentTool === 'crop') {
      enterCropMode();
    } else {
      exitCropMode();
    }

    if (currentTool === 'filter') {
      enterFilterMode();
    } else {
      exitFilterMode();
    }

    if (currentTool === 'text') {
      enterTextMode('text');
    } else if (currentTool === 'heading') {
      enterTextMode('heading');
    } else {
      exitTextMode();
    }

    const showBlurControls = currentTool === 'blur';
    blurIntensity.classList.toggle('hidden', !showBlurControls);

    const showFilterControls = currentTool === 'filter';
    filterType.classList.toggle('hidden', !showFilterControls);

    const showColorPicker = !showBlurControls && !showFilterControls && currentTool !== 'crop';
    colorPicker.classList.toggle('hidden', !showColorPicker);

    const showLineWidth = !showBlurControls && !showFilterControls && currentTool !== 'crop' && currentTool !== 'heading';
    lineWidth.classList.toggle('hidden', !showLineWidth);

    const showHeadingControls = currentTool === 'heading';
    headingLevel.classList.toggle('hidden', !showHeadingControls);
    fontFamily.classList.toggle('hidden', !showHeadingControls);
  });
});

// Canvas drawing
function setupCanvasListeners() {
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', handleMouseLeave);
}

function handleMouseLeave(e) {
  if (isCropMode && cropDragging) {
    // Finish the crop selection when mouse leaves
    onCropMouseUp(e);
  } else if (isFilterMode && filterSelecting) {
    finalizeFilterSelection(e);
  } else if (isDraggingImage && draggedImageAnnotation) {
    finalizeImageDrag();
  } else if (isDrawing) {
    // Finish the annotation when mouse leaves
    stopDrawing(e);
  }
}

function startDrawing(e) {
  if (e.button !== 0) {
    return;
  }

  if (isCropMode) {
    onCropMouseDown(e);
    return;
  }

  if (isFilterMode && currentTool === 'filter') {
    beginFilterSelection(e);
    return;
  }
  
  const rect = canvas.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;

  if (tryBeginImageDrag(startX, startY)) {
    return;
  }
  
  if (currentTool === 'text' || currentTool === 'heading') {
    showTextInputOverlay(startX, startY);
    return;
  }
  
  isDrawing = true;
  currentAnnotation = {
    tool: currentTool,
    color: colorPicker.value,
    lineWidth: parseInt(lineWidth.value),
    blurIntensity: parseInt(blurIntensity.value),
    filterType: filterType.value,
    startX,
    startY
  };

  if (currentTool === 'marker') {
    currentAnnotation.points = [{ x: startX, y: startY }];
  }
}

function draw(e) {
  if (isCropMode) {
    onCropMouseMove(e);
    return;
  }

  if (isFilterMode && currentTool === 'filter') {
    updateFilterSelection(e);
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const currentX = e.clientX - rect.left;
  const currentY = e.clientY - rect.top;

  if (isDraggingImage && draggedImageAnnotation) {
    updateDraggedImagePosition(currentX, currentY);
    return;
  }

  if (!isDrawing) return;

  if (currentAnnotation?.tool === 'marker') {
    currentAnnotation.points.push({ x: currentX, y: currentY });
    redrawCanvas();
    drawAnnotation(currentAnnotation);
    return;
  }
  
  // Redraw everything
  redrawCanvas();
  
  // Draw current annotation preview
  drawAnnotation({
    ...currentAnnotation,
    endX: currentX,
    endY: currentY
  });
}

function stopDrawing(e) {
  if (isCropMode) {
    onCropMouseUp(e);
    return;
  }

  if (isFilterMode && currentTool === 'filter') {
    finalizeFilterSelection(e);
    return;
  }

  if (isDraggingImage && draggedImageAnnotation) {
    finalizeImageDrag();
    return;
  }
  
  if (!isDrawing) return;
  
  const rect = canvas.getBoundingClientRect();
  const endX = e.clientX - rect.left;
  const endY = e.clientY - rect.top;

  if (currentAnnotation?.tool === 'marker') {
    currentAnnotation.points.push({ x: endX, y: endY });
    annotations.push(currentAnnotation);
    currentAnnotation = null;
    isDrawing = false;
    redrawCanvas();
    return;
  }
  
  currentAnnotation.endX = endX;
  currentAnnotation.endY = endY;
  
  annotations.push(currentAnnotation);
  currentAnnotation = null;
  isDrawing = false;
  
  redrawCanvas();
}

function drawAnnotation(annotation) {
  ctx.strokeStyle = annotation.color;
  ctx.fillStyle = annotation.color;
  ctx.lineWidth = annotation.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  switch (annotation.tool) {
    case 'arrow':
      drawArrow(annotation.startX, annotation.startY, annotation.endX, annotation.endY);
      break;
    case 'line':
      drawLine(annotation.startX, annotation.startY, annotation.endX, annotation.endY);
      break;
    case 'marker': {
      const prevAlpha = ctx.globalAlpha;
      const points = annotation.points || [];
      if (!points.length) {
        break;
      }

      ctx.globalAlpha = 0.85;

      if (points.length === 1) {
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, annotation.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
          const midX = (points[i].x + points[i + 1].x) / 2;
          const midY = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        const lastPoint = points[points.length - 1];
        ctx.lineTo(lastPoint.x, lastPoint.y);
        ctx.stroke();
      }

      ctx.globalAlpha = prevAlpha;
      break;
    }
    case 'filter':
      applyFilterEffect(
        annotation.startX,
        annotation.startY,
        annotation.endX,
        annotation.endY,
        annotation.filterType
      );
      break;
    case 'highlight':
      ctx.globalAlpha = 0.3;
      ctx.fillRect(
        annotation.startX,
        annotation.startY,
        annotation.endX - annotation.startX,
        annotation.endY - annotation.startY
      );
      ctx.globalAlpha = 1.0;
      break;
    case 'rectangle':
      ctx.strokeRect(
        annotation.startX,
        annotation.startY,
        annotation.endX - annotation.startX,
        annotation.endY - annotation.startY
      );
      break;
    case 'ellipse': {
      const radiusX = Math.abs(annotation.endX - annotation.startX) / 2;
      const radiusY = Math.abs(annotation.endY - annotation.startY) / 2;

      if (radiusX < 0.5 || radiusY < 0.5) {
        break;
      }

      const centerX = (annotation.startX + annotation.endX) / 2;
      const centerY = (annotation.startY + annotation.endY) / 2;

      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'blur':
      applyPixelatedBlur(
        annotation.startX,
        annotation.startY,
        annotation.endX,
        annotation.endY,
        annotation.blurIntensity
      );
      break;
    case 'image':
      drawImageAnnotation(annotation);
      break;
    case 'heading': {
      const size = annotation.fontSize || 32;
      const weight = annotation.fontWeight || '700';
      const family = annotation.fontFamily || 'Arial';
      ctx.save();
      ctx.fillStyle = annotation.color;
      ctx.textBaseline = 'top';
      ctx.font = `${weight} ${size}px ${family}`;
      ctx.fillText(annotation.text, annotation.startX, annotation.startY);
      ctx.restore();
      break;
    }
    case 'text':
      ctx.save();
      ctx.fillStyle = annotation.color;
      ctx.textBaseline = 'top';
      ctx.font = `${annotation.lineWidth * 8}px Arial`;
      ctx.fillText(annotation.text, annotation.startX, annotation.startY);
      ctx.restore();
      break;
  }
}

function drawArrow(fromX, fromY, toX, toY) {
  const headlen = 15;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  
  // Draw line
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  
  // Draw arrowhead
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headlen * Math.cos(angle - Math.PI / 6),
    toY - headlen * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headlen * Math.cos(angle + Math.PI / 6),
    toY - headlen * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

function drawLine(fromX, fromY, toX, toY) {
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
}

function drawImageAnnotation(annotation) {
  if (!annotation) {
    return;
  }

  if (!annotation.imageElement && annotation.imageSrc) {
    const image = new Image();
    image.onload = () => {
      annotation.imageElement = image;
      redrawCanvas();
    };
    image.src = annotation.imageSrc;
    annotation.imageElement = image;
  }

  const image = annotation.imageElement;
  if (!image || !image.complete) {
    return;
  }

  ctx.drawImage(image, annotation.x, annotation.y, annotation.width, annotation.height);

  if (annotation === draggedImageAnnotation && isDraggingImage) {
    drawImageOutline(annotation, '#667eea');
  }
}

function drawImageOutline(annotation, color) {
  ctx.save();
  ctx.strokeStyle = color || '#667eea';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height);
  ctx.restore();
}

function applyPixelatedBlur(x1, y1, x2, y2, pixelSize) {
  // Normalize coordinates
  const startX = Math.min(x1, x2);
  const startY = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  
  if (width < 1 || height < 1) return;
  
  // Get the image data for the selected area
  const imageData = ctx.getImageData(startX, startY, width, height);
  const data = imageData.data;
  
  // Apply pixelation effect
  for (let y = 0; y < height; y += pixelSize) {
    for (let x = 0; x < width; x += pixelSize) {
      // Calculate average color for this pixel block
      let r = 0, g = 0, b = 0, count = 0;
      
      for (let py = 0; py < pixelSize && y + py < height; py++) {
        for (let px = 0; px < pixelSize && x + px < width; px++) {
          const i = ((y + py) * width + (x + px)) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
      }
      
      // Calculate average
      r = Math.floor(r / count);
      g = Math.floor(g / count);
      b = Math.floor(b / count);
      
      // Apply average color to entire block
      for (let py = 0; py < pixelSize && y + py < height; py++) {
        for (let px = 0; px < pixelSize && x + px < width; px++) {
          const i = ((y + py) * width + (x + px)) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
      }
    }
  }
  
  // Put the blurred image data back
  ctx.putImageData(imageData, startX, startY);
}

function applyFilterEffect(x1, y1, x2, y2, effect = 'grayscale') {
  if (!canvas || typeof x1 !== 'number' || typeof y1 !== 'number' || typeof x2 !== 'number' || typeof y2 !== 'number') {
    return;
  }

  let startX = Math.min(x1, x2);
  let startY = Math.min(y1, y2);
  let endX = Math.max(x1, x2);
  let endY = Math.max(y1, y2);

  startX = Math.max(0, Math.min(startX, canvas.width));
  startY = Math.max(0, Math.min(startY, canvas.height));
  endX = Math.max(0, Math.min(endX, canvas.width));
  endY = Math.max(0, Math.min(endY, canvas.height));

  const originX = Math.floor(startX);
  const originY = Math.floor(startY);
  const rawWidth = Math.ceil(endX) - originX;
  const rawHeight = Math.ceil(endY) - originY;

  if (rawWidth < 1 || rawHeight < 1) {
    return;
  }

  const width = Math.min(rawWidth, canvas.width - originX);
  const height = Math.min(rawHeight, canvas.height - originY);

  if (width < 1 || height < 1) {
    return;
  }

  let imageData;
  try {
    imageData = ctx.getImageData(originX, originY, width, height);
  } catch (error) {
    console.error('Unable to read image data for filter:', error);
    return;
  }

  const data = imageData.data;
  const mode = effect || 'grayscale';

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    switch (mode) {
      case 'sepia': {
        const sepiaR = 0.393 * r + 0.769 * g + 0.189 * b;
        const sepiaG = 0.349 * r + 0.686 * g + 0.168 * b;
        const sepiaB = 0.272 * r + 0.534 * g + 0.131 * b;
        r = sepiaR;
        g = sepiaG;
        b = sepiaB;
        break;
      }
      case 'invert':
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
        break;
      case 'brightness':
        r += 35;
        g += 35;
        b += 35;
        break;
      case 'contrast': {
        const contrastLevel = 40;
        const factor = (259 * (contrastLevel + 255)) / (255 * (259 - contrastLevel));
        r = factor * (r - 128) + 128;
        g = factor * (g - 128) + 128;
        b = factor * (b - 128) + 128;
        break;
      }
      case 'saturation': {
        const { h, s, l } = rgbToHsl(r, g, b);
        const boosted = Math.min(1, s * 1.35);
        const saturated = hslToRgb(h, boosted, l);
        r = saturated.r;
        g = saturated.g;
        b = saturated.b;
        break;
      }
      case 'vintage': {
        const { h, s, l } = rgbToHsl(r, g, b);
        const warmHue = (h + 0.04) % 1;
        const toned = hslToRgb(
          warmHue,
          Math.min(1, s * 0.55 + 0.1),
          Math.min(1, l * 1.05 + 0.03)
        );
        r = toned.r + 12;
        g = toned.g + 5;
        b = toned.b - 12;
        break;
      }
      case 'romantic': {
        const baseHsl = rgbToHsl(r, g, b);
        const target = hslToRgb(
          0.95,
          Math.min(1, baseHsl.s * 0.5 + 0.35),
          Math.min(1, baseHsl.l * 1.12 + 0.04)
        );
        const blend = 0.4;
        r = r * (1 - blend) + target.r * blend;
        g = g * (1 - blend) + target.g * blend;
        b = b * (1 - blend) + target.b * blend;
        break;
      }
      case 'neutralEnhancement': {
        const baseHsl = rgbToHsl(r, g, b);
        const tunedS = clamp01(baseHsl.s * 1.08 + 0.015);
        const tunedL = clamp01((baseHsl.l - 0.5) * 1.05 + 0.5);
        const tuned = hslToRgb(baseHsl.h, tunedS, tunedL);
        r = tuned.r;
        g = tuned.g;
        b = tuned.b;
        break;
      }
      case 'vibrantContrast': {
        const baseHsl = rgbToHsl(r, g, b);
        const boostedS = clamp01(baseHsl.s * 1.25 + 0.05);
        const contrastL = clamp01((baseHsl.l - 0.5) * 1.18 + 0.5);
        const highlightL = clamp01(contrastL + 0.04);
        const body = hslToRgb(baseHsl.h, boostedS, contrastL);
        const highlight = hslToRgb(baseHsl.h, boostedS * 0.9, highlightL);
        const mix = 0.3;
        r = body.r * (1 - mix) + highlight.r * mix;
        g = body.g * (1 - mix) + highlight.g * mix;
        b = body.b * (1 - mix) + highlight.b * mix;
        break;
      }
      case 'moodyShadows': {
        const baseHsl = rgbToHsl(r, g, b);
        const cooledHue = (baseHsl.h + 0.95) % 1;
        const mutedSat = clamp01(baseHsl.s * 0.68 + 0.015);
        const deepLight = clamp01(baseHsl.l * 0.72 + 0.04);
        const toned = hslToRgb(cooledHue, mutedSat, deepLight);
        r = clampChannel(toned.r - 6);
        g = clampChannel(toned.g - 2);
        b = clampChannel(toned.b + 10);
        break;
      }
      case 'dramaticTones': {
        const baseHsl = rgbToHsl(r, g, b);
        const boostedSat = clamp01(baseHsl.s * 1.18 + 0.04);
        const contrastLight = clamp01((baseHsl.l - 0.5) * 1.35 + 0.48);
        const warmHighlights = hslToRgb((baseHsl.h + 0.02) % 1, boostedSat, clamp01(contrastLight + 0.05));
        const coolShadows = hslToRgb((baseHsl.h + 0.88) % 1, clamp01(baseHsl.s * 0.75 + 0.02), clamp01(contrastLight * 0.65));
        r = clampChannel(warmHighlights.r * 0.6 + coolShadows.r * 0.4 + 8);
        g = clampChannel(warmHighlights.g * 0.6 + coolShadows.g * 0.4 + 2);
        b = clampChannel(warmHighlights.b * 0.6 + coolShadows.b * 0.4 + 4);
        break;
      }
      case 'lrWarm': {
        const { h, s, l } = rgbToHsl(r, g, b);
        const warmHue = (h + 0.015) % 1;
        const liftedHighlights = clamp01(l + Math.max(0, l - 0.55) * 0.35);
        const loweredShadows = clamp01(liftedHighlights - Math.max(0, 0.45 - l) * 0.18);
        const richerSat = clamp01(s * 1.15 + 0.05);
        const toned = hslToRgb(warmHue, richerSat, loweredShadows);
        r = toned.r + 6;
        g = toned.g + 3;
        b = toned.b - 6;
        break;
      }
      case 'lrCool': {
        const { h, s, l } = rgbToHsl(r, g, b);
        const coolHue = (h + 0.97) % 1;
        const contrastBoost = clamp01((l - 0.5) * 1.25 + 0.5);
        const reducedSat = clamp01(s * 0.9 + 0.02);
        const toned = hslToRgb(coolHue, reducedSat, contrastBoost);
        r = toned.r - 4;
        g = toned.g + 5;
        b = toned.b + 8;
        break;
      }
      case 'lrMatte': {
        const { h, s, l } = rgbToHsl(r, g, b);
        const fadedShadows = clamp01(0.12 + l * 0.78);
        const softSat = clamp01(s * 0.75 + 0.03);
        const toned = hslToRgb(h, softSat, fadedShadows);
        const matteBlend = 0.2;
        r = toned.r * (1 - matteBlend) + 220 * matteBlend;
        g = toned.g * (1 - matteBlend) + 215 * matteBlend;
        b = toned.b * (1 - matteBlend) + 210 * matteBlend;
        break;
      }
      case 'warmVintage': {
        const baseHsl = rgbToHsl(r, g, b);
        const warmHue = (baseHsl.h + 0.02) % 1;
        const softenedSat = clamp01(baseHsl.s * 0.85 + 0.02);
        const fadedLight = clamp01(0.1 + baseHsl.l * 0.9);
        const warmed = hslToRgb(warmHue, softenedSat, fadedLight);
        r = clampChannel(warmed.r + 12);
        g = clampChannel(warmed.g + 4);
        b = clampChannel(warmed.b - 10);
        break;
      }
      case 'dreamyGlow': {
        const baseHsl = rgbToHsl(r, g, b);
        const softSat = clamp01(baseHsl.s * 0.7 + 0.05);
        const liftedLight = clamp01(baseHsl.l * 1.12 + 0.04);
        const glowHue = (baseHsl.h + 0.01) % 1;
        const glowBase = hslToRgb(glowHue, softSat, liftedLight);
        const haze = 235;
        const blend = 0.25;
        r = clampChannel(glowBase.r * (1 - blend) + haze * blend);
        g = clampChannel(glowBase.g * (1 - blend) + (haze - 8) * blend);
        b = clampChannel(glowBase.b * (1 - blend) + (haze + 12) * blend);
        break;
      }
      case 'clarendon': {
        const { h, s, l } = rgbToHsl(r, g, b);
        const contrastL = clamp01((l - 0.5) * 1.25 + 0.5);
        const boostedSat = clamp01(s * 1.2 + 0.05);
        const coolHighlightsHue = (h + 0.98) % 1;
        const toned = hslToRgb(coolHighlightsHue, boostedSat, contrastL);

        const highlightBoost = clamp01(l + 0.08);
        const highlightRgb = hslToRgb(coolHighlightsHue, boostedSat * 0.8, highlightBoost);

        const blend = 0.35;
        r = toned.r * (1 - blend) + highlightRgb.r * blend + 6;
        g = toned.g * (1 - blend) + highlightRgb.g * blend + 2;
        b = toned.b * (1 - blend) + highlightRgb.b * blend + 10;
        break;
      }
      case 'mono': {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const contrasted = clampChannel((gray - 128) * 1.1 + 128);
        r = contrasted;
        g = contrasted;
        b = contrasted;
        break;
      }
      case 'grayscale':
      default: {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = gray;
        g = gray;
        b = gray;
        break;
      }
    }

    data[i] = clampChannel(r);
    data[i + 1] = clampChannel(g);
    data[i + 2] = clampChannel(b);
  }

  ctx.putImageData(imageData, originX, originY);
}

function clampChannel(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function rgbToHsl(r, g, b) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / delta + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / delta + 4;
        break;
    }

    h /= 6;
  }

  return { h, s, l };
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const gray = clampChannel(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hueToRgb = (p, q, t) => {
    let temp = t;
    if (temp < 0) temp += 1;
    if (temp > 1) temp -= 1;
    if (temp < 1 / 6) return p + (q - p) * 6 * temp;
    if (temp < 1 / 2) return q;
    if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const r = hueToRgb(p, q, h + 1 / 3);
  const g = hueToRgb(p, q, h);
  const b = hueToRgb(p, q, h - 1 / 3);

  return {
    r: clampChannel(r * 255),
    g: clampChannel(g * 255),
    b: clampChannel(b * 255)
  };
}

function addTextAnnotation(x, y, text, size, color, options = {}) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value) {
    return;
  }

  const lineSize = Number.isFinite(size) ? size : parseInt(lineWidth.value, 10) || 3;
  const fillColor = color || colorPicker.value;
  const mode = options.type === 'heading' ? 'heading' : 'text';

  const annotation = {
    tool: mode,
    color: fillColor,
    lineWidth: lineSize,
    blurIntensity: parseInt(blurIntensity.value, 10),
    startX: x,
    startY: y,
    text: value
  };

  if (mode === 'heading') {
    annotation.fontFamily = options.fontFamily || fontFamily.value || 'Arial';
    annotation.fontSize = options.fontSize || headingSizeToPixels(options.headingLevel || 'h2');
    annotation.fontWeight = '700';
    annotation.headingLevel = options.headingLevel || 'h2';
  }

  annotations.push(annotation);
}

function headingSizeToPixels(level) {
  switch (level) {
    case 'h1':
      return 40;
    case 'h2':
      return 32;
    case 'h3':
      return 26;
    case 'h4':
      return 22;
    default:
      return 32;
  }
}

function handlePasteFromClipboard(event) {
  if (!canvas || !ctx) {
    return;
  }

  const clipboardData = event.clipboardData || window.clipboardData;
  if (!clipboardData || !clipboardData.items) {
    return;
  }

  for (let i = 0; i < clipboardData.items.length; i++) {
    const item = clipboardData.items[i];
    if (!item || !item.type || !item.type.startsWith('image/')) {
      continue;
    }

    const file = item.getAsFile();
    if (!file) {
      continue;
    }

    event.preventDefault();

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const dataUrl = loadEvent.target?.result;
      if (typeof dataUrl === 'string') {
        insertClipboardImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
    break;
  }
}

function insertClipboardImage(dataUrl) {
  if (!canvas || !ctx || !dataUrl) {
    return;
  }

  const image = new Image();
  image.onload = () => {
    const annotation = buildImageAnnotation(image, dataUrl);
    annotations.push(annotation);
    draggedImageAnnotation = annotation;
    isDraggingImage = false;
    redrawCanvas();
  };
  image.onerror = () => {
    console.error('Unable to load pasted image');
  };
  image.src = dataUrl;
}

function buildImageAnnotation(image, dataUrl) {
  const maxWidth = Math.max(40, canvas.width * 0.6);
  const maxHeight = Math.max(40, canvas.height * 0.6);
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
  const width = Math.max(40, Math.round(image.width * scale));
  const height = Math.max(40, Math.round(image.height * scale));

  const defaultX = Math.round((canvas.width - width) / 2);
  const defaultY = Math.round((canvas.height - height) / 2);

  return {
    tool: 'image',
    imageElement: image,
    imageSrc: dataUrl,
    width,
    height,
    x: defaultX,
    y: defaultY
  };
}

function tryBeginImageDrag(x, y) {
  if (isCropMode || (isFilterMode && currentTool === 'filter')) {
    return false;
  }

  const hitResult = findTopmostImageAt(x, y);
  if (!hitResult) {
    return false;
  }

  const { annotation, index } = hitResult;
  draggedImageAnnotation = annotation;
  dragOffset.x = x - annotation.x;
  dragOffset.y = y - annotation.y;
  isDraggingImage = true;

  if (index !== annotations.length - 1) {
    annotations.splice(index, 1);
    annotations.push(annotation);
  }

  redrawCanvas();
  return true;
}

function findTopmostImageAt(x, y) {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const annotation = annotations[i];
    if (annotation?.tool !== 'image') {
      continue;
    }

    if (pointInsideImage(annotation, x, y)) {
      return { annotation, index: i };
    }
  }
  return null;
}

function pointInsideImage(annotation, x, y) {
  const withinX = x >= annotation.x && x <= annotation.x + annotation.width;
  const withinY = y >= annotation.y && y <= annotation.y + annotation.height;
  return withinX && withinY;
}

function updateDraggedImagePosition(cursorX, cursorY) {
  if (!draggedImageAnnotation) {
    return;
  }

  const targetX = cursorX - dragOffset.x;
  const targetY = cursorY - dragOffset.y;
  const { x, y } = clampImagePosition(targetX, targetY, draggedImageAnnotation.width, draggedImageAnnotation.height);
  draggedImageAnnotation.x = x;
  draggedImageAnnotation.y = y;
  redrawCanvas();
}

function clampImagePosition(x, y, width, height) {
  if (!canvas) {
    return { x, y };
  }
  const maxX = Math.max(0, canvas.width - width);
  const maxY = Math.max(0, canvas.height - height);
  return {
    x: Math.min(Math.max(x, 0), maxX),
    y: Math.min(Math.max(y, 0), maxY)
  };
}

function finalizeImageDrag() {
  isDraggingImage = false;
  draggedImageAnnotation = null;
  dragOffset = { x: 0, y: 0 };
  redrawCanvas();
}

function redrawCanvas() {
  // Clear canvas and redraw screenshot
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    
    // Redraw all annotations
    annotations.forEach(annotation => {
      drawAnnotation(annotation);
    });
    
    // Redraw crop overlay if in crop mode
    if (isCropMode && cropSelection) {
      drawCropOverlayOnly();
    }

    if (isFilterMode && filterSelection) {
      drawFilterSelectionOverlay(filterSelection, filterSelecting);
    }
  };
  img.src = screenshotDataUrl;
}

// Undo last annotation
undoBtn.addEventListener('click', () => {
  annotations.pop();
  redrawCanvas();
});

// Clear all annotations
clearBtn.addEventListener('click', () => {
  if (confirm('Clear all annotations?')) {
    annotations = [];
    filterSelection = null;
    filterSelecting = false;
    updateFilterControlsState();
    redrawCanvas();
  }
});

filterApplyBtn.addEventListener('click', () => {
  if (!isFilterMode || !filterSelection || filterSelection.width <= 2 || filterSelection.height <= 2) {
    alert('Select an area first, then choose a filter.');
    return;
  }

  annotations.push({
    tool: 'filter',
    startX: filterSelection.x,
    startY: filterSelection.y,
    endX: filterSelection.x + filterSelection.width,
    endY: filterSelection.y + filterSelection.height,
    filterType: filterType.value
  });

  filterSelection = null;
  filterSelecting = false;
  updateFilterControlsState();
  if (canvas && screenshotDataUrl) {
    redrawCanvas();
  }
});

filterClearBtn.addEventListener('click', () => {
  filterSelection = null;
  filterSelecting = false;
  updateFilterControlsState();
  if (canvas && screenshotDataUrl) {
    redrawCanvas();
  }
});

textApplyBtn.addEventListener('click', applyPendingTextAnnotation);
textCancelBtn.addEventListener('click', cancelPendingTextAnnotation);

headingLevel.addEventListener('change', () => {
  if (textInputMode === 'heading') {
    refreshTextInputPreview();
  }
});

fontFamily.addEventListener('change', () => {
  if (textInputMode === 'heading') {
    refreshTextInputPreview();
  }
});

// Save screenshot
saveBtn.addEventListener('click', () => {
  const folderName = folderNameInput.value.trim() || 'screenshots';
  const fileName = fileNameInput.value.trim() || 'screenshot';
  
  // Get final canvas as data URL
  const finalDataUrl = canvas.toDataURL('image/png');
  
  // Create download filename with folder
  const downloadPath = `${folderName}/${fileName}.png`;
  
  chrome.downloads.download({
    url: finalDataUrl,
    filename: downloadPath,
    saveAs: true
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      alert('Error saving screenshot');
    } else {
      console.log('Screenshot saved with ID:', downloadId);
      // Reset UI
      resetEditor();
    }
  });
});

// Cancel editing
cancelBtn.addEventListener('click', () => {
  if (annotations.length > 0) {
    if (!confirm('Discard annotations?')) {
      return;
    }
  }
  resetEditor();
});

function resetEditor() {
  annotations = [];
  screenshotDataUrl = null;
  isCropMode = false;
  cropSelection = null;
  originalImageData = null;
  exitFilterMode();
  exitTextMode();
  document.querySelector('.capture-section').classList.remove('hidden');
  editorSection.classList.add('hidden');
  
  if (canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function enterFilterMode() {
  isFilterMode = true;
  filterSelection = null;
  filterSelecting = false;
  filterApplyBtn.classList.remove('hidden');
  filterClearBtn.classList.remove('hidden');
  updateFilterControlsState();
  if (canvas && screenshotDataUrl) {
    redrawCanvas();
  }
}

function exitFilterMode() {
  if (!isFilterMode && !filterSelection) {
    return;
  }
  isFilterMode = false;
  filterSelection = null;
  filterSelecting = false;
  filterApplyBtn.classList.add('hidden');
  filterClearBtn.classList.add('hidden');
  filterApplyBtn.disabled = false;
  filterClearBtn.disabled = false;
  if (canvas && screenshotDataUrl) {
    redrawCanvas();
  }
}

function enterTextMode(mode = 'text') {
  if (textInputMode === mode) {
    updateTextControlsState();
    return;
  }

  if (textInputMode && textInputMode !== mode) {
    hideTextInputOverlay();
  }

  textInputMode = mode;
  textApplyBtn.classList.remove('hidden');
  textCancelBtn.classList.remove('hidden');
  textApplyBtn.disabled = true;
  textCancelBtn.disabled = true;
  updateTextControlsState();
}

function exitTextMode() {
  if (!textInputMode && !pendingTextAnnotation && !textInputOverlay) {
    return;
  }

  textInputMode = null;
  hideTextInputOverlay();
  textApplyBtn.classList.add('hidden');
  textCancelBtn.classList.add('hidden');
  textApplyBtn.disabled = true;
  textCancelBtn.disabled = true;
  updateTextControlsState();
}

function updateTextControlsState() {
  const hasPending = Boolean(pendingTextAnnotation && textInputField && textInputOverlay);
  const hasText = hasPending && textInputField.value.trim().length > 0;

  textApplyBtn.disabled = !hasText;
  textCancelBtn.disabled = !hasPending;

  if (canvas) {
    canvas.style.cursor = textInputMode ? 'text' : '';
  }
}

function refreshTextInputPreview() {
  if (!textInputField) {
    return;
  }

  if (textInputMode === 'heading') {
    const level = headingLevel.value || 'h2';
    const font = fontFamily.value || 'Arial';
    const size = headingSizeToPixels(level);
    textInputField.style.fontFamily = font;
    textInputField.style.fontWeight = '700';
    textInputField.style.fontSize = `${size}px`;
  } else {
    textInputField.style.fontFamily = '';
    textInputField.style.fontWeight = '';
    textInputField.style.fontSize = '';
  }
}

function showTextInputOverlay(x, y) {
  if (!canvas) {
    return;
  }

  const container = canvas.parentElement;
  if (!container) {
    return;
  }

  if (!textInputMode) {
    enterTextMode('text');
  }

  hideTextInputOverlay();

  textInputOverlay = document.createElement('div');
  textInputOverlay.className = 'text-input-overlay';

  textInputField = document.createElement('textarea');
  textInputField.placeholder = textInputMode === 'heading' ? 'Enter heading text...' : 'Type your text...';
  textInputField.rows = textInputMode === 'heading' ? 2 : 3;
  textInputOverlay.appendChild(textInputField);

  container.appendChild(textInputOverlay);

  pendingTextAnnotation = {
    x,
    y,
    mode: textInputMode
  };

  textInputField.addEventListener('keydown', handleTextInputKeydown);
  textInputField.addEventListener('input', updateTextControlsState);

  refreshTextInputPreview();

  textOverlayScrollHandler = () => {
    positionTextOverlay(pendingTextAnnotation.x, pendingTextAnnotation.y);
  };
  container.addEventListener('scroll', textOverlayScrollHandler);

  updateTextControlsState();

  requestAnimationFrame(() => {
    positionTextOverlay(pendingTextAnnotation.x, pendingTextAnnotation.y);
    updateTextControlsState();
    textInputField.focus();
    textInputField.select();
  });
}

function positionTextOverlay(x, y) {
  if (!canvas || !textInputOverlay) {
    return;
  }

  const container = canvas.parentElement;
  if (!container) {
    return;
  }

  const targetLeft = canvas.offsetLeft - container.scrollLeft + x;
  const targetTop = canvas.offsetTop - container.scrollTop + y;

  const padding = 12;
  const overlayWidth = textInputOverlay.offsetWidth || 0;
  const overlayHeight = textInputOverlay.offsetHeight || 0;

  let left = targetLeft;
  let top = targetTop;

  const maxLeft = container.clientWidth - overlayWidth - padding;
  const maxTop = container.clientHeight - overlayHeight - padding;

  left = Math.max(padding, Math.min(left, Math.max(padding, maxLeft)));
  top = Math.max(padding, Math.min(top, Math.max(padding, maxTop)));

  textInputOverlay.style.left = `${left}px`;
  textInputOverlay.style.top = `${top}px`;

  const maxPointerOffset = Math.max(6, overlayWidth - 16);
  const desiredOffset = targetLeft - left - 6;
  const pointerOffset = Math.max(6, Math.min(maxPointerOffset, desiredOffset));
  textInputOverlay.style.setProperty('--pointer-offset', `${pointerOffset}px`);
}

function hideTextInputOverlay() {
  if (textInputField) {
    textInputField.removeEventListener('keydown', handleTextInputKeydown);
    textInputField.removeEventListener('input', updateTextControlsState);
  }

  if (canvas && textOverlayScrollHandler && canvas.parentElement) {
    canvas.parentElement.removeEventListener('scroll', textOverlayScrollHandler);
  }

  if (textInputOverlay && textInputOverlay.parentElement) {
    textInputOverlay.parentElement.removeChild(textInputOverlay);
  }

  textOverlayScrollHandler = null;
  textInputOverlay = null;
  textInputField = null;
  pendingTextAnnotation = null;

  textApplyBtn.disabled = true;
  textCancelBtn.disabled = true;
}

function applyPendingTextAnnotation() {
  if (!pendingTextAnnotation || !textInputField) {
    alert('Click on the screenshot to choose where the text should go.');
    return;
  }

  const value = textInputField.value.trim();
  if (!value) {
    alert('Enter text before clicking Done.');
    textInputField.focus();
    return;
  }

  const mode = pendingTextAnnotation.mode || textInputMode || 'text';

  if (mode === 'heading') {
    const level = headingLevel.value || 'h2';
    const font = fontFamily.value || 'Arial';
    const fontSize = headingSizeToPixels(level);

    addTextAnnotation(
      pendingTextAnnotation.x,
      pendingTextAnnotation.y,
      value,
      Math.round(fontSize / 6),
      colorPicker.value,
      {
        type: 'heading',
        fontFamily: font,
        fontSize,
        headingLevel: level
      }
    );
  } else {
    addTextAnnotation(
      pendingTextAnnotation.x,
      pendingTextAnnotation.y,
      value,
      parseInt(lineWidth.value, 10) || 3,
      colorPicker.value,
      { type: 'text' }
    );
  }

  hideTextInputOverlay();
  updateTextControlsState();
  redrawCanvas();
}

function cancelPendingTextAnnotation() {
  if (!pendingTextAnnotation) {
    return;
  }
  hideTextInputOverlay();
  updateTextControlsState();
}

function handleTextInputKeydown(event) {
  if ((event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
    event.preventDefault();
    applyPendingTextAnnotation();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelPendingTextAnnotation();
  }
}

function updateFilterControlsState() {
  const hasSelection = Boolean(
    filterSelection &&
    filterSelection.width > 2 &&
    filterSelection.height > 2
  );
  filterApplyBtn.disabled = !hasSelection;
  filterClearBtn.disabled = !hasSelection;
}

function beginFilterSelection(e) {
  if (!canvas) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  filterSelecting = true;
  filterDragStart = {
    x: clampToCanvas(x),
    y: clampToCanvas(y, true)
  };
  filterSelection = {
    x: filterDragStart.x,
    y: filterDragStart.y,
    width: 0,
    height: 0
  };

  updateFilterControlsState();
  redrawCanvas();
}

function updateFilterSelection(e) {
  if (!filterSelecting || !filterSelection || !canvas) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const currentX = e.clientX - rect.left;
  const currentY = e.clientY - rect.top;

  const startX = clampToCanvas(filterDragStart.x);
  const startY = clampToCanvas(filterDragStart.y, true);
  const endX = clampToCanvas(currentX);
  const endY = clampToCanvas(currentY, true);

  filterSelection = normalizeSelection(startX, startY, endX, endY);

  updateFilterControlsState();
  redrawCanvas();
}

function finalizeFilterSelection(e) {
  if (!filterSelecting || !canvas) {
    return;
  }

  let currentX = filterDragStart.x;
  let currentY = filterDragStart.y;

  if (e) {
    const rect = canvas.getBoundingClientRect();
    currentX = e.clientX - rect.left;
    currentY = e.clientY - rect.top;
  }

  const startX = clampToCanvas(filterDragStart.x);
  const startY = clampToCanvas(filterDragStart.y, true);
  const endX = clampToCanvas(currentX);
  const endY = clampToCanvas(currentY, true);

  filterSelection = normalizeSelection(startX, startY, endX, endY);
  filterSelecting = false;

  updateFilterControlsState();
  redrawCanvas();
}

function drawFilterSelectionOverlay(selection, isPreview = false) {
  if (!selection || selection.width <= 0 || selection.height <= 0) {
    return;
  }

  ctx.save();
  ctx.fillStyle = 'rgba(255, 193, 7, 0.18)';
  ctx.fillRect(selection.x, selection.y, selection.width, selection.height);

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ff9800';
  ctx.setLineDash(isPreview ? [4, 3] : [6, 4]);
  ctx.strokeRect(selection.x, selection.y, selection.width, selection.height);
  ctx.setLineDash([]);

  ctx.restore();
}

function clampToCanvas(value, isY = false) {
  if (!canvas) {
    return 0;
  }
  const limit = isY ? canvas.height : canvas.width;
  const numeric = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(numeric, limit));
}

function normalizeSelection(startX, startY, endX, endY) {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  return { x, y, width, height };
}

// Crop functionality
function enterCropMode() {
  isCropMode = true;
  cropSelection = {
    x: canvas.width * 0.2,
    y: canvas.height * 0.2,
    width: canvas.width * 0.6,
    height: canvas.height * 0.6
  };
  
  // Store original image data
  if (!originalImageData) {
    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  
  // Show crop buttons
  applyCropBtn.classList.remove('hidden');
  cancelCropBtn.classList.remove('hidden');
  
  // Hide other controls
  colorPicker.classList.add('hidden');
  lineWidth.classList.add('hidden');
  undoBtn.classList.add('hidden');
  clearBtn.classList.add('hidden');
  
  drawCropOverlay();
}

function exitCropMode() {
  isCropMode = false;
  cropSelection = null;
  
  // Hide crop buttons
  applyCropBtn.classList.add('hidden');
  cancelCropBtn.classList.add('hidden');
  
  // Show other controls
  colorPicker.classList.remove('hidden');
  lineWidth.classList.remove('hidden');
  undoBtn.classList.remove('hidden');
  clearBtn.classList.remove('hidden');
  
  redrawCanvas();
}

function drawCropOverlay() {
  redrawCanvas();
}

function drawDarkenedOverlay() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  
  // Top
  ctx.fillRect(0, 0, canvas.width, cropSelection.y);
  // Bottom
  ctx.fillRect(0, cropSelection.y + cropSelection.height, canvas.width, canvas.height - cropSelection.y - cropSelection.height);
  // Left
  ctx.fillRect(0, cropSelection.y, cropSelection.x, cropSelection.height);
  // Right
  ctx.fillRect(cropSelection.x + cropSelection.width, cropSelection.y, canvas.width - cropSelection.x - cropSelection.width, cropSelection.height);
}

function drawSelectionBorder() {
  ctx.strokeStyle = '#667eea';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
  ctx.strokeRect(cropSelection.x, cropSelection.y, cropSelection.width, cropSelection.height);
  ctx.setLineDash([]);
}

function drawCropOverlayOnly() {
  if (!cropSelection || cropSelection.width === 0 || cropSelection.height === 0) {
    return;
  }
  
  // Draw darkened area outside selection
  ctx.save();
  drawDarkenedOverlay();
  
  // Draw selection border
  drawSelectionBorder();
  
  // Draw corner handles
  const handleSize = 10;
  ctx.fillStyle = '#667eea';
  
  // Top-left
  ctx.fillRect(cropSelection.x - handleSize/2, cropSelection.y - handleSize/2, handleSize, handleSize);
  // Top-right
  ctx.fillRect(cropSelection.x + cropSelection.width - handleSize/2, cropSelection.y - handleSize/2, handleSize, handleSize);
  // Bottom-left
  ctx.fillRect(cropSelection.x - handleSize/2, cropSelection.y + cropSelection.height - handleSize/2, handleSize, handleSize);
  // Bottom-right
  ctx.fillRect(cropSelection.x + cropSelection.width - handleSize/2, cropSelection.y + cropSelection.height - handleSize/2, handleSize, handleSize);
  
  // Draw edge handles (middle of each side)
  // Top
  ctx.fillRect(cropSelection.x + cropSelection.width/2 - handleSize/2, cropSelection.y - handleSize/2, handleSize, handleSize);
  // Bottom
  ctx.fillRect(cropSelection.x + cropSelection.width/2 - handleSize/2, cropSelection.y + cropSelection.height - handleSize/2, handleSize, handleSize);
  // Left
  ctx.fillRect(cropSelection.x - handleSize/2, cropSelection.y + cropSelection.height/2 - handleSize/2, handleSize, handleSize);
  // Right
  ctx.fillRect(cropSelection.x + cropSelection.width - handleSize/2, cropSelection.y + cropSelection.height/2 - handleSize/2, handleSize, handleSize);
  
  ctx.restore();
}

let cropDragging = false;
let cropDragType = null;
let cropDragStart = { x: 0, y: 0 };

function onCropMouseDown(e) {
  if (!isCropMode) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  cropDragStart = { x, y };
  
  // Check if clicking inside selection (for move)
  if (x >= cropSelection.x && x <= cropSelection.x + cropSelection.width &&
      y >= cropSelection.y && y <= cropSelection.y + cropSelection.height) {
    
    // Check edges for resize
    const edge = 10;
    if (Math.abs(x - cropSelection.x) < edge) cropDragType = 'w';
    else if (Math.abs(x - (cropSelection.x + cropSelection.width)) < edge) cropDragType = 'e';
    else if (Math.abs(y - cropSelection.y) < edge) cropDragType = 'n';
    else if (Math.abs(y - (cropSelection.y + cropSelection.height)) < edge) cropDragType = 's';
    else cropDragType = 'move';
    
    cropDragging = true;
  } else {
    // Start new selection
    cropSelection = { x, y, width: 0, height: 0 };
    cropDragType = 'new';
    cropDragging = true;
  }
  
  e.stopPropagation();
}

function onCropMouseMove(e) {
  if (!isCropMode) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  if (cropDragging) {
    const dx = x - cropDragStart.x;
    const dy = y - cropDragStart.y;
    
    if (cropDragType === 'new') {
      cropSelection.width = dx;
      cropSelection.height = dy;
    } else if (cropDragType === 'move') {
      cropSelection.x += dx;
      cropSelection.y += dy;
      cropDragStart = { x, y };
    } else if (cropDragType === 'w') {
      cropSelection.x += dx;
      cropSelection.width -= dx;
      cropDragStart.x = x;
    } else if (cropDragType === 'e') {
      cropSelection.width += dx;
      cropDragStart.x = x;
    } else if (cropDragType === 'n') {
      cropSelection.y += dy;
      cropSelection.height -= dy;
      cropDragStart.y = y;
    } else if (cropDragType === 's') {
      cropSelection.height += dy;
      cropDragStart.y = y;
    }
    
    // Normalize selection
    if (cropSelection.width < 0) {
      cropSelection.x += cropSelection.width;
      cropSelection.width = Math.abs(cropSelection.width);
    }
    if (cropSelection.height < 0) {
      cropSelection.y += cropSelection.height;
      cropSelection.height = Math.abs(cropSelection.height);
    }
    
    // Keep within bounds
    cropSelection.x = Math.max(0, Math.min(cropSelection.x, canvas.width - cropSelection.width));
    cropSelection.y = Math.max(0, Math.min(cropSelection.y, canvas.height - cropSelection.height));
    
    drawCropOverlay();
    e.stopPropagation();
  } else {
    // Update cursor
    const edge = 10;
    let cursor = 'default';
    
    if (cropSelection && x >= cropSelection.x && x <= cropSelection.x + cropSelection.width &&
        y >= cropSelection.y && y <= cropSelection.y + cropSelection.height) {
      if (Math.abs(x - cropSelection.x) < edge) cursor = 'ew-resize';
      else if (Math.abs(x - (cropSelection.x + cropSelection.width)) < edge) cursor = 'ew-resize';
      else if (Math.abs(y - cropSelection.y) < edge) cursor = 'ns-resize';
      else if (Math.abs(y - (cropSelection.y + cropSelection.height)) < edge) cursor = 'ns-resize';
      else cursor = 'move';
    }
    
    canvas.style.cursor = cursor;
  }
}

function onCropMouseUp(e) {
  if (!isCropMode) return;
  
  if (cropDragging) {
    cropDragging = false;
    
    // Normalize the selection one final time
    if (cropSelection.width < 0) {
      cropSelection.x += cropSelection.width;
      cropSelection.width = Math.abs(cropSelection.width);
    }
    if (cropSelection.height < 0) {
      cropSelection.y += cropSelection.height;
      cropSelection.height = Math.abs(cropSelection.height);
    }
    
    // Ensure selection stays within bounds
    cropSelection.x = Math.max(0, Math.min(cropSelection.x, canvas.width));
    cropSelection.y = Math.max(0, Math.min(cropSelection.y, canvas.height));
    cropSelection.width = Math.max(0, Math.min(cropSelection.width, canvas.width - cropSelection.x));
    cropSelection.height = Math.max(0, Math.min(cropSelection.height, canvas.height - cropSelection.y));
    
    // Redraw the canvas and overlay to ensure it's visible
    redrawCanvas();
    
    cropDragType = null;
    
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
  }
}

// Apply crop
applyCropBtn.addEventListener('click', () => {
  if (!cropSelection || cropSelection.width < 10 || cropSelection.height < 10) {
    alert('Selection too small. Please select a larger area.');
    return;
  }
  
  // Restore the base image so crop data excludes the overlay guides
  if (originalImageData) {
    ctx.putImageData(originalImageData, 0, 0);
  }

  // Create new canvas with cropped area
  const selectionX = Math.round(cropSelection.x);
  const selectionY = Math.round(cropSelection.y);
  const selectionWidth = Math.round(cropSelection.width);
  const selectionHeight = Math.round(cropSelection.height);

  const croppedImageData = ctx.getImageData(
    selectionX,
    selectionY,
    selectionWidth,
    selectionHeight
  );
  
  // Resize canvas
  canvas.width = selectionWidth;
  canvas.height = selectionHeight;
  
  // Draw cropped image
  ctx.putImageData(croppedImageData, 0, 0);
  
  // Update screenshot data URL
  screenshotDataUrl = canvas.toDataURL('image/png');
  
  // Clear annotations and original image data
  annotations = [];
  originalImageData = null;
  
  // Clear crop selection BEFORE exiting crop mode
  cropSelection = null;
  
  // Exit crop mode
  exitCropMode();
  
  // Switch back to arrow tool
  arrowTool.click();
});

// Cancel crop
cancelCropBtn.addEventListener('click', () => {
  exitCropMode();
  arrowTool.click();
});

// Load saved folder name
chrome.storage.local.get(['defaultFolder'], (result) => {
  if (result.defaultFolder) {
    folderNameInput.value = result.defaultFolder;
  }
});

// Save folder name when changed
folderNameInput.addEventListener('change', () => {
  chrome.storage.local.set({ defaultFolder: folderNameInput.value });
});

// Window resize functionality
let isResizing = false;
let lastX, lastY;

// Load saved window size or use viewport dimensions
chrome.storage.local.get(['popupWidth', 'popupHeight'], (result) => {
  if (result.popupWidth && result.popupHeight) {
    document.body.style.width = result.popupWidth + 'px';
    document.body.style.height = result.popupHeight + 'px';
  } else {
    // Default to viewport height on first use
    document.body.style.height = '100vh';
  }
});

// Add resize handle functionality
const resizeHandle = document.querySelector('.resize-handle');

document.addEventListener('mousedown', (e) => {
  const rect = resizeHandle.getBoundingClientRect();
  const isNearHandle = 
    e.clientX >= rect.left - 10 && 
    e.clientX <= rect.right + 10 && 
    e.clientY >= rect.top - 10 && 
    e.clientY <= rect.bottom + 10;
  
  if (isNearHandle) {
    isResizing = true;
    lastX = e.clientX;
    lastY = e.clientY;
    document.body.style.userSelect = 'none';
    resizeHandle.style.pointerEvents = 'auto';
    e.preventDefault();
  }
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) {
    // Show cursor change near handle
    const rect = resizeHandle.getBoundingClientRect();
    const isNearHandle = 
      e.clientX >= rect.left - 10 && 
      e.clientX <= rect.right + 10 && 
      e.clientY >= rect.top - 10 && 
      e.clientY <= rect.bottom + 10;
    
    if (isNearHandle) {
      document.body.style.cursor = 'nwse-resize';
      resizeHandle.style.pointerEvents = 'auto';
    } else {
      document.body.style.cursor = 'default';
      resizeHandle.style.pointerEvents = 'none';
    }
    return;
  }
  
  const deltaX = e.clientX - lastX;
  const deltaY = e.clientY - lastY;
  
  const currentWidth = document.body.offsetWidth;
  const currentHeight = document.body.offsetHeight;
  
  const newWidth = Math.max(600, Math.min(1200, currentWidth + deltaX));
  const newHeight = Math.max(400, Math.min(900, currentHeight + deltaY));
  
  document.body.style.width = newWidth + 'px';
  document.body.style.height = newHeight + 'px';
  
  lastX = e.clientX;
  lastY = e.clientY;
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = 'default';
    resizeHandle.style.pointerEvents = 'none';
    
    // Save the new size
    chrome.storage.local.set({
      popupWidth: document.body.offsetWidth,
      popupHeight: document.body.offsetHeight
    });
  }
});
