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

// Tool buttons
const captureBtn = document.getElementById('captureBtn');
const arrowTool = document.getElementById('arrowTool');
const textTool = document.getElementById('textTool');
const highlightTool = document.getElementById('highlightTool');
const rectangleTool = document.getElementById('rectangleTool');
const blurTool = document.getElementById('blurTool');
const cropTool = document.getElementById('cropTool');
const colorPicker = document.getElementById('colorPicker');
const lineWidth = document.getElementById('lineWidth');
const blurIntensity = document.getElementById('blurIntensity');
const undoBtn = document.getElementById('undoBtn');
const clearBtn = document.getElementById('clearBtn');
const applyCropBtn = document.getElementById('applyCropBtn');
const cancelCropBtn = document.getElementById('cancelCropBtn');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const editorSection = document.getElementById('editorSection');
const folderNameInput = document.getElementById('folderName');
const fileNameInput = document.getElementById('fileName');

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
[arrowTool, textTool, highlightTool, rectangleTool, blurTool, cropTool].forEach(btn => {
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
    
    // Show/hide blur intensity selector
    if (currentTool === 'blur') {
      blurIntensity.classList.remove('hidden');
      colorPicker.classList.add('hidden');
      lineWidth.classList.add('hidden');
    } else {
      blurIntensity.classList.add('hidden');
      colorPicker.classList.remove('hidden');
      lineWidth.classList.remove('hidden');
    }
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
  } else if (isDrawing) {
    // Finish the annotation when mouse leaves
    stopDrawing(e);
  }
}

function startDrawing(e) {
  if (isCropMode) {
    onCropMouseDown(e);
    return;
  }
  
  const rect = canvas.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;
  
  if (currentTool === 'text') {
    addTextAnnotation(startX, startY);
    return;
  }
  
  isDrawing = true;
  currentAnnotation = {
    tool: currentTool,
    color: colorPicker.value,
    lineWidth: parseInt(lineWidth.value),
    blurIntensity: parseInt(blurIntensity.value),
    startX,
    startY
  };
}

function draw(e) {
  if (isCropMode) {
    onCropMouseMove(e);
    return;
  }
  
  if (!isDrawing) return;
  
  const rect = canvas.getBoundingClientRect();
  const currentX = e.clientX - rect.left;
  const currentY = e.clientY - rect.top;
  
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
  
  if (!isDrawing) return;
  
  const rect = canvas.getBoundingClientRect();
  const endX = e.clientX - rect.left;
  const endY = e.clientY - rect.top;
  
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
    case 'blur':
      applyPixelatedBlur(
        annotation.startX,
        annotation.startY,
        annotation.endX,
        annotation.endY,
        annotation.blurIntensity
      );
      break;
    case 'text':
      ctx.font = `${annotation.lineWidth * 8}px Arial`;
      ctx.fillText(annotation.text, annotation.startX, annotation.startY);
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

function addTextAnnotation(x, y) {
  const text = prompt('Enter text:');
  if (text && text.trim()) {
    annotations.push({
      tool: 'text',
      color: colorPicker.value,
      lineWidth: parseInt(lineWidth.value),
      blurIntensity: parseInt(blurIntensity.value),
      startX: x,
      startY: y,
      text: text
    });
    redrawCanvas();
  }
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
    redrawCanvas();
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
  document.querySelector('.capture-section').classList.remove('hidden');
  editorSection.classList.add('hidden');
  
  if (canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
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
  
  // Create new canvas with cropped area
  const croppedImageData = ctx.getImageData(
    Math.round(cropSelection.x),
    Math.round(cropSelection.y),
    Math.round(cropSelection.width),
    Math.round(cropSelection.height)
  );
  
  // Resize canvas
  canvas.width = Math.round(cropSelection.width);
  canvas.height = Math.round(cropSelection.height);
  
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
