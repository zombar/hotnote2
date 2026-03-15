// TunnelMesh - Markdown Parser
// Lightweight regex-based markdown parser with bidirectional HTML conversion

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.TM = root.TM || {};
        root.TM.markdown = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // --- HTML Utilities ---

    /**
     * Escape HTML entities to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string}
     */
    function escapeHtml(text) {
        if (typeof document !== 'undefined') {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Unescape HTML entities
     * @param {string} text - Text to unescape
     * @returns {string}
     */
    function unescapeHtml(text) {
        if (typeof document !== 'undefined') {
            const div = document.createElement('div');
            div.innerHTML = text;
            return div.textContent;
        }
        return String(text)
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'");
    }

    /**
     * Sanitize URL to prevent XSS
     * Uses allowlist approach - only permits safe schemes
     * @param {string} url - URL to sanitize
     * @returns {string}
     */
    function sanitizeUrl(url) {
        if (!url) return '#';
        const trimmed = url.trim();
        const lower = trimmed.toLowerCase();

        // Allowlist: only permit safe schemes (case-insensitive)
        if (/^(https?|mailto|tel):/.test(lower)) {
            return trimmed; // Return original case-preserved URL
        }

        // Relative URLs are safe (no scheme)
        if (!lower.includes(':')) {
            return trimmed;
        }

        // Block everything else (javascript:, data:, vbscript:, file:, etc.)
        return '#';
    }

    // --- Inline Formatting ---

    /**
     * Process inline markdown formatting
     * @param {string} text - Text to process
     * @returns {string} HTML with inline formatting
     */
    function processInline(text) {
        if (!text) return '';

        // Escape HTML first to prevent XSS
        let result = escapeHtml(text);

        // Use placeholders to protect already-emitted HTML spans from being
        // re-processed by subsequent regex passes (e.g. italic matching `*`
        // inside a bold `data-md="**text**"` attribute).
        // Uses \uFFFE (Unicode non-character) as a sentinel that won't appear in markdown.
        const spans = [];
        function protect(html) {
            spans.push(html);
            return `\uFFFE${spans.length - 1}\uFFFE`;
        }

        // Inline code first (prevents formatting inside code)
        // After escaping, markdown backticks are still literal backticks
        result = result.replace(/`([^`]+)`/g, (match, code) => {
            return protect(`<code data-md="${escapeHtml(match)}">${code}</code>`);
        });

        // Images: ![alt](url)
        result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
            const safeUrl = sanitizeUrl(url);
            return protect(`<img src="${escapeHtml(safeUrl)}" alt="${alt}" data-md="${escapeHtml(match)}" />`);
        });

        // Links: [text](url)
        result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
            const safeUrl = sanitizeUrl(url);
            return protect(`<a href="${escapeHtml(safeUrl)}" data-md="${escapeHtml(match)}">${linkText}</a>`);
        });

        // Bold: **text** or __text__
        result = result.replace(/\*\*(.+?)\*\*/g, (match, content) => {
            return protect(`<strong data-md="${escapeHtml(match)}">${content}</strong>`);
        });
        result = result.replace(/__(.+?)__/g, (match, content) => {
            return protect(`<strong data-md="${escapeHtml(match)}">${content}</strong>`);
        });

        // Italic: *text* or _text_
        result = result.replace(/\*(.+?)\*/g, (match, content) => {
            return protect(`<em data-md="${escapeHtml(match)}">${content}</em>`);
        });
        result = result.replace(/_(.+?)_/g, (match, content) => {
            return protect(`<em data-md="${escapeHtml(match)}">${content}</em>`);
        });

        // Strikethrough: ~~text~~
        result = result.replace(/~~(.+?)~~/g, (match, content) => {
            return protect(`<del data-md="${escapeHtml(match)}">${content}</del>`);
        });

        // Restore protected spans
        result = result.replace(/\uFFFE(\d+)\uFFFE/g, (_, i) => spans[parseInt(i, 10)]);

        return result;
    }

    // --- Block-level Parsers ---

    /**
     * Parse header line
     * @param {string} line - Line to parse
     * @returns {Object|null} Block object or null
     */
    function parseHeader(line) {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (!match) return null;

        const level = match[1].length;
        const content = processInline(match[2]);
        return {
            type: 'header',
            level,
            content,
            html: `<h${level} data-md="${escapeHtml(line)}">${content}</h${level}>`,
        };
    }

    /**
     * Parse horizontal rule
     * @param {string} line - Line to parse
     * @returns {Object|null} Block object or null
     */
    function parseHorizontalRule(line) {
        if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
            return {
                type: 'hr',
                html: `<hr data-md="${escapeHtml(line)}" />`,
            };
        }
        return null;
    }

    /**
     * Parse code block (fenced with ```)
     * @param {Array<string>} lines - All lines
     * @param {number} start - Starting line index
     * @returns {Object|null} Block object or null
     */
    function parseCodeBlock(lines, start) {
        const firstLine = lines[start];
        const match = firstLine.match(/^```(\w*)$/);
        if (!match) return null;

        const language = match[1] || '';
        const codeLines = [];
        let i = start + 1;

        while (i < lines.length && !lines[i].startsWith('```')) {
            codeLines.push(lines[i]);
            i++;
        }

        if (i >= lines.length) return null; // Unclosed code block

        const code = codeLines.join('\n');
        const escaped = escapeHtml(code);
        const originalMd = `\`\`\`${language}\n${code}\n\`\`\``;

        return {
            type: 'code',
            language,
            content: code,
            endLine: i,
            html: `<pre data-md="${escapeHtml(originalMd)}"><code>${escaped}</code></pre>`,
        };
    }

    /**
     * Parse unordered or ordered list
     * @param {Array<string>} lines - All lines
     * @param {number} start - Starting line index
     * @returns {Object|null} Block object or null
     */
    function parseList(lines, start) {
        const firstLine = lines[start];
        const ulMatch = firstLine.match(/^(\s*)[*+-]\s+(.+)$/);
        const olMatch = firstLine.match(/^(\s*)\d+\.\s+(.+)$/);

        if (!ulMatch && !olMatch) return null;

        const isOrdered = !!olMatch;
        const items = [];
        const originalLines = [];
        let i = start;

        while (i < lines.length) {
            const line = lines[i];
            const itemMatch = isOrdered ? line.match(/^(\s*)\d+\.\s+(.+)$/) : line.match(/^(\s*)[*+-]\s+(.+)$/);

            if (!itemMatch) break;

            items.push(processInline(itemMatch[2]));
            originalLines.push(line);
            i++;
        }

        const tag = isOrdered ? 'ol' : 'ul';
        const itemsHtml = items.map((item) => `<li>${item}</li>`).join('');
        const originalMd = originalLines.join('\n');

        return {
            type: 'list',
            ordered: isOrdered,
            items,
            endLine: i - 1,
            html: `<${tag} data-md="${escapeHtml(originalMd)}">${itemsHtml}</${tag}>`,
        };
    }

    /**
     * Parse blockquote (including GitHub-style alerts)
     * @param {Array<string>} lines - All lines
     * @param {number} start - Starting line index
     * @returns {Object|null} Block object or null
     */
    function parseBlockquote(lines, start) {
        const firstLine = lines[start];
        if (!firstLine.startsWith('>')) return null;

        const quoteLines = [];
        const originalLines = [];
        let i = start;

        while (i < lines.length && lines[i].startsWith('>')) {
            const content = lines[i].substring(1).trim();
            quoteLines.push(content);
            originalLines.push(lines[i]);
            i++;
        }

        // Check for GitHub-style alerts: > [!NOTE], > [!WARNING], etc.
        let alertType = null;
        let alertContent = quoteLines;

        if (quoteLines.length > 0) {
            const alertMatch = quoteLines[0].match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i);
            if (alertMatch) {
                alertType = alertMatch[1].toUpperCase();
                alertContent = quoteLines.slice(1); // Remove the alert marker line
            }
        }

        const content = alertContent.map((line) => processInline(line)).join('<br>');
        const originalMd = originalLines.join('\n');

        if (alertType) {
            const alertClass = `markdown-alert markdown-alert-${alertType.toLowerCase()}`;
            const alertIcon = getAlertIcon(alertType);
            const alertTitle = alertType.charAt(0) + alertType.slice(1).toLowerCase();

            return {
                type: 'alert',
                alertType,
                content,
                endLine: i - 1,
                html: `<div class="${alertClass}" data-md="${escapeHtml(originalMd)}"><div class="markdown-alert-title">${alertIcon}${alertTitle}</div>${content}</div>`,
            };
        }

        return {
            type: 'blockquote',
            content,
            endLine: i - 1,
            html: `<blockquote data-md="${escapeHtml(originalMd)}">${content}</blockquote>`,
        };
    }

    /**
     * Get icon for GitHub-style alert
     * @param {string} type - Alert type (NOTE, WARNING, etc.)
     * @returns {string} SVG icon HTML
     */
    function getAlertIcon(type) {
        const icons = {
            NOTE: '<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>',
            TIP: '<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"/></svg>',
            IMPORTANT:
                '<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
            WARNING:
                '<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
            CAUTION:
                '<svg class="markdown-alert-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>',
        };
        return icons[type] || icons.NOTE;
    }

    /**
     * Parse table
     * @param {Array<string>} lines - All lines
     * @param {number} start - Starting line index
     * @returns {Object|null} Block object or null
     */
    function parseTable(lines, start) {
        const firstLine = lines[start];
        if (!firstLine.includes('|')) return null;

        // Check if next line is separator
        if (start + 1 >= lines.length) return null;
        const separator = lines[start + 1];
        if (!/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(separator)) return null;

        // Parse header
        const headerCells = firstLine
            .split('|')
            .map((c) => c.trim())
            .filter((c) => c);

        // Parse rows
        const rows = [];
        const originalLines = [firstLine, separator];
        let i = start + 2;

        while (i < lines.length && lines[i].includes('|')) {
            const cells = lines[i]
                .split('|')
                .map((c) => c.trim())
                .filter((c) => c);
            if (cells.length > 0) {
                rows.push(cells);
                originalLines.push(lines[i]);
            }
            i++;
        }

        // Build HTML
        const theadHtml = `<thead><tr>${headerCells.map((c) => `<th>${processInline(c)}</th>`).join('')}</tr></thead>`;
        const tbodyHtml = `<tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${processInline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
        const originalMd = originalLines.join('\n');

        return {
            type: 'table',
            header: headerCells,
            rows,
            endLine: i - 1,
            html: `<table data-md="${escapeHtml(originalMd)}">${theadHtml}${tbodyHtml}</table>`,
        };
    }

    /**
     * Parse paragraph
     * @param {Array<string>} lines - All lines
     * @param {number} start - Starting line index
     * @returns {Object|null} Block object or null
     */
    function parseParagraph(lines, start) {
        const paraLines = [];
        let i = start;

        while (i < lines.length) {
            const line = lines[i].trim();
            if (!line) break; // Empty line ends paragraph
            if (line.startsWith('#')) break; // Header
            if (line.startsWith('```')) break; // Code block
            if (line.match(/^[*+-]\s/)) break; // List
            if (line.match(/^\d+\.\s/)) break; // Ordered list
            if (line.startsWith('>')) break; // Blockquote
            if (line.includes('|')) break; // Table
            if (/^(\*{3,}|-{3,}|_{3,})$/.test(line)) break; // HR

            paraLines.push(line);
            i++;
        }

        if (paraLines.length === 0) return null;

        const content = paraLines.join(' ');
        const html = processInline(content);

        return {
            type: 'paragraph',
            content,
            endLine: i - 1,
            html: `<p data-md="${escapeHtml(content)}">${html}</p>`,
        };
    }

    /**
     * Parse all blocks in markdown text
     * @param {string} text - Markdown text
     * @returns {Array<Object>} Array of block objects
     */
    function parseBlocks(text) {
        const lines = text.split('\n');
        const blocks = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i].trim();

            // Skip empty lines
            if (!line) {
                i++;
                continue;
            }

            // Try parsers in order
            let block = null;

            block = block || parseHeader(line);
            block = block || parseHorizontalRule(line);
            block = block || parseCodeBlock(lines, i);
            block = block || parseList(lines, i);
            block = block || parseBlockquote(lines, i);
            block = block || parseTable(lines, i);
            block = block || parseParagraph(lines, i);

            if (block) {
                blocks.push(block);
                i = block.endLine !== undefined ? block.endLine + 1 : i + 1;
            } else {
                i++;
            }
        }

        return blocks;
    }

    /**
     * Parse markdown to HTML
     * @param {string} text - Markdown text
     * @returns {string} HTML string
     */
    function parseMarkdown(text) {
        if (!text) return '';
        const blocks = parseBlocks(text);
        return blocks.map((b) => b.html).join('\n');
    }

    /**
     * Render markdown to HTML (alias for parseMarkdown)
     * @param {string} text - Markdown text
     * @returns {string} HTML string
     */
    function renderMarkdown(text) {
        return parseMarkdown(text);
    }

    // --- HTML to Markdown Conversion ---

    /**
     * Convert HTML back to markdown
     * @param {string} html - HTML string or DOM element
     * @returns {string} Markdown text
     */
    function htmlToMarkdown(html) {
        if (typeof document === 'undefined') {
            // Fallback for non-browser (testing)
            return html;
        }

        // Create temporary container
        const container = document.createElement('div');
        if (typeof html === 'string') {
            container.innerHTML = html;
        } else {
            container.appendChild(html.cloneNode(true));
        }

        const result = [];

        // Process each child node
        for (const node of container.childNodes) {
            const md = nodeToMarkdown(node);
            if (md) result.push(md);
        }

        return result.join('\n\n');
    }

    /**
     * Convert single DOM node to markdown
     * @param {Node} node - DOM node
     * @returns {string} Markdown text
     */
    function nodeToMarkdown(node) {
        // Text node
        if (node.nodeType === 3) {
            return node.textContent;
        }

        // Element node
        if (node.nodeType !== 1) return '';

        const elem = node;
        const tag = elem.tagName.toLowerCase();

        // Use data-md attribute if available
        if (elem.dataset?.md) {
            return unescapeHtml(elem.dataset.md);
        }

        // Reconstruct from DOM structure
        const text = elem.textContent;

        switch (tag) {
            case 'h1':
                return `# ${text}`;
            case 'h2':
                return `## ${text}`;
            case 'h3':
                return `### ${text}`;
            case 'h4':
                return `#### ${text}`;
            case 'h5':
                return `##### ${text}`;
            case 'h6':
                return `###### ${text}`;

            case 'p':
                return processChildrenToMarkdown(elem);

            case 'strong':
            case 'b':
                return `**${text}**`;

            case 'em':
            case 'i':
                return `*${text}*`;

            case 'del':
            case 's':
                return `~~${text}~~`;

            case 'code':
                return `\`${text}\``;

            case 'pre': {
                const code = elem.querySelector('code');
                return `\`\`\`\n${code ? code.textContent : text}\n\`\`\``;
            }

            case 'blockquote': {
                const lines = text.split('\n');
                return lines.map((line) => `> ${line}`).join('\n');
            }

            case 'ul': {
                const items = Array.from(elem.querySelectorAll('li'));
                return items.map((li) => `- ${li.textContent}`).join('\n');
            }

            case 'ol': {
                const items = Array.from(elem.querySelectorAll('li'));
                return items.map((li, i) => `${i + 1}. ${li.textContent}`).join('\n');
            }

            case 'a': {
                const href = elem.getAttribute('href') || '';
                return `[${text}](${href})`;
            }

            case 'img': {
                const src = elem.getAttribute('src') || '';
                const alt = elem.getAttribute('alt') || '';
                return `![${alt}](${src})`;
            }

            case 'table': {
                const rows = Array.from(elem.querySelectorAll('tr'));
                if (rows.length === 0) return '';

                const mdRows = rows.map((tr) => {
                    const cells = Array.from(tr.querySelectorAll('th, td'));
                    return `| ${cells.map((c) => c.textContent).join(' | ')} |`;
                });

                // Add separator after header
                if (mdRows.length > 0) {
                    const headerRow = rows[0];
                    const cellCount = headerRow.querySelectorAll('th, td').length;
                    const separator = `| ${Array(cellCount).fill('---').join(' | ')} |`;
                    mdRows.splice(1, 0, separator);
                }

                return mdRows.join('\n');
            }

            case 'hr':
                return '---';

            case 'br':
                return '\n';

            case 'div': {
                // Check if this is a GitHub-style alert box
                if (elem.classList?.contains('markdown-alert')) {
                    let alertType = 'NOTE';
                    if (elem.classList.contains('markdown-alert-tip')) alertType = 'TIP';
                    else if (elem.classList.contains('markdown-alert-important')) alertType = 'IMPORTANT';
                    else if (elem.classList.contains('markdown-alert-warning')) alertType = 'WARNING';
                    else if (elem.classList.contains('markdown-alert-caution')) alertType = 'CAUTION';

                    // Get content without the title
                    const content = Array.from(elem.childNodes)
                        .filter((n) => {
                            // Skip the title div
                            if (n.nodeType === 1 && n.classList && n.classList.contains('markdown-alert-title')) {
                                return false;
                            }
                            return true;
                        })
                        .map((n) => nodeToMarkdown(n))
                        .join('')
                        .trim();

                    const lines = content.split('\n');
                    const quotedLines = [`> [!${alertType}]`, ...lines.map((line) => `> ${line}`)];
                    return quotedLines.join('\n');
                }
                return processChildrenToMarkdown(elem);
            }

            default:
                return processChildrenToMarkdown(elem);
        }
    }

    /**
     * Process element's children to markdown
     * @param {Element} elem - DOM element
     * @returns {string} Markdown text
     */
    function processChildrenToMarkdown(elem) {
        const result = [];
        for (const child of elem.childNodes) {
            const md = nodeToMarkdown(child);
            if (md) result.push(md);
        }
        return result.join('');
    }

    // Export for testing
    const _test = {
        escapeHtml,
        unescapeHtml,
        sanitizeUrl,
        processInline,
        parseHeader,
        parseHorizontalRule,
        parseCodeBlock,
        parseList,
        parseBlockquote,
        parseTable,
        parseParagraph,
        parseBlocks,
    };

    return {
        parseMarkdown,
        renderMarkdown,
        htmlToMarkdown,
        escapeHtml,
        unescapeHtml,
        processInline, // Export for WYSIWYG auto-conversion
        _test,
    };
});
