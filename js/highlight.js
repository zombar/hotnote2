'use strict';

// =========================================================================
// Syntax Highlighting
// =========================================================================

function getCodeLang(pre) {
    const md = pre.getAttribute('data-md') || '';
    const match = md.match(/^```(\w+)/);
    return match ? match[1].toLowerCase() : '';
}

function getHighlightRules(lang) {
    const comment = (pattern) => ({ regex: pattern, type: 'comment' });
    const str = (pattern) => ({ regex: pattern, type: 'string' });
    const num = { regex: /\b\d+(\.\d+)?([eE][+-]?\d+)?\b/y, type: 'number' };
    const op = { regex: /[+\-*/%&|^~<>!=?:;,.()[\]{}]+/y, type: 'operator' };

    switch (lang) {
        case 'js': case 'javascript': case 'ts': case 'typescript': case 'jsx': case 'tsx':
            return [
                comment(/\/\/[^\n]*/y),
                comment(/\/\*[\s\S]*?\*\//y),
                str(/`(?:[^`\\]|\\.)*`/y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'(?:[^'\\]|\\.)*'/y),
                { regex: /\b(break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield|async|await)\b/y, type: 'keyword' },
                { regex: /\b(Array|Boolean|Date|Error|Function|Map|Number|Object|Promise|RegExp|Set|String|Symbol|WeakMap|WeakSet|JSON|Math|console|document|window|undefined|null|true|false|NaN|Infinity)\b/y, type: 'type' },
                num, op,
            ];
        case 'go':
            return [
                comment(/\/\/[^\n]*/y),
                comment(/\/\*[\s\S]*?\*\//y),
                str(/`(?:[^`])*`/y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'(?:[^'\\]|\\.)*'/y),
                { regex: /\b(break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var)\b/y, type: 'keyword' },
                { regex: /\b(bool|byte|complex64|complex128|error|float32|float64|int|int8|int16|int32|int64|rune|string|uint|uint8|uint16|uint32|uint64|uintptr|true|false|nil|iota|append|cap|close|copy|delete|len|make|new|panic|print|println|recover)\b/y, type: 'type' },
                num, op,
            ];
        case 'py': case 'python':
            return [
                comment(/#[^\n]*/y),
                str(/"""[\s\S]*?"""/y),
                str(/'''[\s\S]*?'''/y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'(?:[^'\\]|\\.)*'/y),
                { regex: /\b(and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/y, type: 'keyword' },
                { regex: /\b(True|False|None|int|float|str|list|dict|set|tuple|bool|type|object|super|print|len|range|enumerate|zip|map|filter|sorted|reversed|open|input)\b/y, type: 'builtin' },
                num, op,
            ];
        case 'rs': case 'rust':
            return [
                comment(/\/\/[^\n]*/y),
                comment(/\/\*[\s\S]*?\*\//y),
                str(/"(?:[^"\\]|\\.)*"/y),
                { regex: /\b(as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|true|type|unsafe|use|where|while)\b/y, type: 'keyword' },
                { regex: /\b(bool|char|f32|f64|i8|i16|i32|i64|i128|isize|str|u8|u16|u32|u64|u128|usize|String|Vec|Option|Result|Box|Rc|Arc|HashMap|HashSet)\b/y, type: 'type' },
                num, op,
            ];
        case 'sh': case 'bash': case 'shell': case 'zsh':
            return [
                comment(/#[^\n]*/y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'[^']*'/y),
                { regex: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|echo|export|source|local|readonly|shift|unset|set|trap)\b/y, type: 'keyword' },
                num, op,
            ];
        case 'json':
            return [
                str(/"(?:[^"\\]|\\.)*"/y),
                { regex: /\b(true|false|null)\b/y, type: 'keyword' },
                num, op,
            ];
        case 'css':
            return [
                comment(/\/\*[\s\S]*?\*\//y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'(?:[^'\\]|\\.)*'/y),
                { regex: /\b(important|auto|none|inherit|initial|unset|normal|bold|italic|solid|dashed|dotted|left|right|center|top|bottom|flex|grid|block|inline|absolute|relative|fixed|sticky|hidden|visible)\b/y, type: 'keyword' },
                { regex: /\b\d+(\.\d+)?(px|em|rem|vh|vw|%|pt|cm|mm|s|ms)?\b/y, type: 'number' },
                { regex: /#[0-9a-fA-F]{3,6}\b/y, type: 'string' },
                op,
            ];
        case 'html': case 'xml':
            return [
                comment(/<!--[\s\S]*?-->/y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'(?:[^'\\]|\\.)*'/y),
                { regex: /<\/?[a-zA-Z][a-zA-Z0-9-]*/y, type: 'keyword' },
                op,
            ];
        case 'yaml': case 'yml':
            return [
                comment(/#[^\n]*/y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'[^']*'/y),
                { regex: /\b(true|false|null|yes|no|on|off)\b/y, type: 'keyword' },
                num, op,
            ];
        case 'md': case 'markdown':
            return [
                // Fenced code blocks
                { regex: /```[\s\S]*?```/y, type: 'comment' },
                // Inline code
                str(/`[^`\n]+`/y),
                // Headers
                { regex: /^#{1,6} [^\n]*/my, type: 'keyword' },
                // Blockquotes
                { regex: /^> [^\n]*/my, type: 'comment' },
                // Bold
                { regex: /\*\*[^*\n]+\*\*/y, type: 'type' },
                { regex: /__[^_\n]+__/y, type: 'type' },
                // Italic
                { regex: /\*[^*\n]+\*/y, type: 'string' },
                { regex: /_[^_\n]+_/y, type: 'string' },
                // Links and images
                { regex: /!?\[[^\]\n]*\]\([^)\n]*\)/y, type: 'builtin' },
                // List markers
                { regex: /^[-*+] /my, type: 'operator' },
                { regex: /^\d+\. /my, type: 'number' },
                // Horizontal rules
                { regex: /^[-*]{3,}$/my, type: 'operator' },
            ];
        default:
            return [
                comment(/\/\/[^\n]*/y),
                comment(/#[^\n]*/y),
                comment(/\/\*[\s\S]*?\*\//y),
                str(/"(?:[^"\\]|\\.)*"/y),
                str(/'(?:[^'\\]|\\.)*'/y),
                num, op,
            ];
    }
}

function tokenize(code, rules) {
    const tokens = [];
    let i = 0;
    const len = code.length;

    while (i < len) {
        let matched = false;
        for (const rule of rules) {
            rule.regex.lastIndex = i;
            const m = rule.regex.exec(code);
            if (m && m.index === i) {
                tokens.push({ type: rule.type, value: m[0] });
                i += m[0].length;
                matched = true;
                break;
            }
        }
        if (!matched) {
            const last = tokens[tokens.length - 1];
            if (last && last.type === 'plain') {
                last.value += code[i];
            } else {
                tokens.push({ type: 'plain', value: code[i] });
            }
            i++;
        }
    }
    return tokens;
}

function highlightCode(text, lang) {
    const rules = getHighlightRules(lang);
    const tokens = tokenize(text, rules);
    return tokens.map(t => {
        const escaped = t.value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        if (t.type === 'plain') return escaped;
        return `<span class="tok-${t.type}">${escaped}</span>`;
    }).join('');
}

function applySyntaxHighlighting(container) {
    container.querySelectorAll('pre > code').forEach(code => {
        try {
            const pre = code.parentElement;
            const lang = getCodeLang(pre);
            const text = code.textContent;
            code.innerHTML = highlightCode(text, lang);
        } catch (e) {
            console.error('Syntax highlight error:', e);
        }
    });
}
