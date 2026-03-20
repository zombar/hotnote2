'use strict';

// =========================================================================
// URL State Management
// =========================================================================

function getRelativeFilePath() {
    return state.currentRelativePath || null;
}

function updateURL() {
    if (!state.rootHandle) return;
    let qs = '?workdir=' + encodeURIComponent(state.rootHandle.name);
    const filePath = getRelativeFilePath();
    if (filePath) qs += '&file=' + filePath.split('/').map(encodeURIComponent).join('/');
    if (state.currentLine > 1) qs += '&line=' + state.currentLine;
    if (state.currentChar > 1) qs += '&char=' + state.currentChar;
    history.replaceState(null, '', qs);
    localStorage.setItem('hotnote2-lastFolder', state.rootHandle.name);
    if (filePath) localStorage.setItem('hotnote2-lastFile', filePath);
    else localStorage.removeItem('hotnote2-lastFile');
    if (state.currentLine > 1) localStorage.setItem('hotnote2-lastLine', state.currentLine);
    else localStorage.removeItem('hotnote2-lastLine');
    if (state.currentChar > 1) localStorage.setItem('hotnote2-lastChar', state.currentChar);
    else localStorage.removeItem('hotnote2-lastChar');
}

function clearURL() {
    history.replaceState(null, '', window.location.pathname);
}

function scrollEditorToPosition(lineNum, charNum) {
    const eng = window.sourceEditors?.pane1;
    if (!eng || lineNum <= 1) return;
    const lines = eng.getValue().split('\n');
    let pos = 0;
    for (let i = 0; i < Math.min(lineNum - 1, lines.length); i++) pos += lines[i].length + 1;
    if (charNum > 1) pos += Math.min(charNum - 1, (lines[lineNum - 1] || '').length);
    eng.setSelection(pos, pos);
    const ceEl = document.getElementById('source-editor-ce');
    if (ceEl) ceEl.scrollTop = Math.max(0, (lineNum - 1) * eng.lineHeight - ceEl.clientHeight / 2);
    state.currentLine = lineNum;
    state.currentChar = charNum || 1;
}


async function openFileByPath(rootHandle, relativePath, lineNum, charNum) {
    try {
        const parts = relativePath.split('/').filter(Boolean);
        const filename = parts.pop();
        let dir = rootHandle;
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part);
        }
        const fileHandle = await dir.getFileHandle(filename);
        state.currentRelativePath = relativePath;
        await openFile(fileHandle, filename);
        if (lineNum && lineNum > 1) {
            scrollEditorToPosition(lineNum, charNum || 1);
            updateURL();
        }
    } catch (err) {
        console.warn('Could not restore file from URL:', relativePath, err);
    }
}

function showResumePrompt(folderName, filePath, lineNum, charNum) {
    const banner = document.getElementById('resume-prompt');
    if (!banner) return;
    banner.querySelector('.resume-folder-name').textContent = folderName;
    banner.dataset.file = filePath || '';
    banner.dataset.line = lineNum && lineNum > 1 ? String(lineNum) : '';
    banner.dataset.char = charNum && charNum > 1 ? String(charNum) : '';
    banner.style.display = '';
}

function dismissResumePrompt() {
    const banner = document.getElementById('resume-prompt');
    if (banner) banner.style.display = 'none';
}
