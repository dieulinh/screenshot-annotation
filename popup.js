let canvas, ctx;
let currentTool = 'arrow';
let isDrawing = false;
let startX, startY;
let annotations = [];
let currentAnnotation = null;
let screenshotDataUrl = null;

// Tool buttons
const captureBtn = document.getElementById('captureBtn');
const arrowTool = document.getElementById('arrowTool');
const textTool = document.getElementById('textTool');
const highlightTool = document.getElementById('highlightTool');
const rectangleTool = document.getElementById('rectangleTool');
const colorPicker = document.getElementById('colorPicker');
const lineWidth = document.getElementById('lineWidth');
const undoBtn = document.getElementById('undoBtn');
const clearBtn = document.getElementById('clearBtn');
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
[arrowTool, textTool, highlightTool, rectangleTool].forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.id.replace('Tool', '');
  });
});

// Canvas drawing
function setupCanvasListeners() {
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
}

function startDrawing(e) {
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
    startX,
    startY
  };
}

function draw(e) {
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

function addTextAnnotation(x, y) {
  const text = prompt('Enter text:');
  if (text && text.trim()) {
    annotations.push({
      tool: 'text',
      color: colorPicker.value,
      lineWidth: parseInt(lineWidth.value),
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
  document.querySelector('.capture-section').classList.remove('hidden');
  editorSection.classList.add('hidden');
  
  if (canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

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
