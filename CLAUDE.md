# ReadNote Plus - Project Configuration

## Project Overview

ReadNote Plus is a web-based document reader and note-taking application. It allows users to upload, read, and annotate documents directly in the browser.

## Tech Stack

- **Frontend**: Single HTML file with embedded CSS and JavaScript
- **Storage**: Browser localStorage for persistence
- **No backend**: Client-side only application

## Project Structure

```
readNote Plus/
├── ReadNote Plus.html    # Main application (single-file app)
├── CLAUDE.md             # Project configuration
└── .claude/              # Claude Code settings
    └── settings.json     # Local settings
```

## Development Guidelines

### Code Style
- Use semantic HTML5 elements
- CSS custom properties (variables) for theming
- Vanilla JavaScript (no frameworks)
- Keep the single-file architecture unless complexity requires separation

### File Organization
- `/src` - Source files (if project expands)
- `/docs` - Documentation
- `/tests` - Test files

### Features
- Document upload and viewing
- Note-taking with text selection
- Local storage persistence
- Responsive design

## Commands

### Development
- Open `ReadNote Plus.html` in browser to run
- Use browser DevTools for debugging

### Testing
- Manual testing in browser
- Test across different browsers for compatibility

## Notes

- No build process required
- All functionality in single HTML file
- Uses CSS variables for easy theming
