# Screenshot Annotator Chrome Extension

A powerful Chrome extension for taking screenshots and annotating them with arrows, text, highlights, and shapes. Save your annotated screenshots to organized folders.

## Features

✨ **Screenshot Capture**
- Capture visible tab with one click
- High-quality PNG screenshots

🎨 **Annotation Tools**
- **Arrows** - Point out important details
- **Text** - Add custom text labels
- **Highlights** - Highlight areas with transparent color
- **Rectangles** - Draw boxes around content
- **Blur/Pixelate** - Hide sensitive information (passwords, emails, personal data)

⚙️ **Customization**
- Choose annotation colors
- Adjust line width (1-10px)
- Blur intensity selector (Light, Medium, Strong, Maximum)
- Undo last annotation
- Clear all annotations

📁 **Organization**
- Save to custom folders
- Auto-generated timestamps in filenames
- Remembers your default folder

## Installation

1. Open `generate-icons.html` in your browser
2. Download all three icon sizes (16x16, 48x48, 128x128)
3. Create an `icons` folder in the extension directory
4. Move the downloaded icons to the `icons` folder
5. Open Chrome and go to `chrome://extensions/`
6. Enable "Developer mode" (top right)
7. Click "Load unpacked"
8. Select the extension folder

## Usage

1. **Take Screenshot**
   - Click the extension icon
   - Click "Take Screenshot" button
   - Current visible tab will be captured

2. **Annotate**
   - Select a tool (Arrow, Text, Highlight, Rectangle, or Blur)
   - Choose color and line width (or blur intensity for blur tool)
   - Draw on the screenshot
   - For text: click where you want text, enter in prompt
   - For blur: drag to select area containing sensitive data

3. **Save**
   - Enter folder name (e.g., "bug-reports", "tutorials")
   - Filename is auto-generated with timestamp
   - Click "Save" - browser will prompt for save location
   - Your screenshot will be saved to `Downloads/[folder-name]/[filename].png`

## Tips

- **Hide sensitive data**: Use the blur tool to pixelate passwords, emails, credit cards, or personal information
- **Blur intensity**: Light blur for slight obfuscation, Maximum blur for complete privacy
- **Undo mistakes**: Use the Undo button (↶)
- **Start over**: Use Clear All button (🗑️)
- **Default folder**: Your last used folder name is remembered
- **Timestamps**: Filenames include date/time to avoid overwrites

## Keyboard Shortcuts (Coming Soon)

- `Ctrl+Shift+S` - Quick screenshot
- `Z` - Undo
- `A` - Arrow tool
- `T` - Text tool
- `H` - Highlight tool
- `B` - Blur tool

## Permissions

- `activeTab` - To capture the current tab
- `tabs` - To access tab information
- `downloads` - To save screenshots
- `storage` - To remember your folder preferences

## Folder Structure

```
screenshot-annotator/
├── manifest.json
├── popup.html
├── popup.css
├── popup.js
├── generate-icons.html
├── README.md
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Future Enhancements

- Keyboard shortcuts
- Circle/ellipse tool
- Free-hand drawing
- Copy to clipboard
- Multiple pages/area selection
- Export as PDF
- Black bar censoring option

## License

MIT License - Feel free to modify and use!
