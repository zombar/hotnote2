# Markdown Reference

All markdown tags supported by hotnote.

---

## Headings

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

---

## Inline Formatting

**Bold text** and __also bold__

*Italic text* and _also italic_

~~Strikethrough text~~

Combine **bold and _italic_ together** freely.

Inline `code snippet` inside a sentence.

---

## Links & Images

[hotnote on GitHub](https://github.com/zombar/hotnote2)

![Sample image](https://via.placeholder.com/400x200?text=hotnote)

---

## Blockquotes

> A simple blockquote.
> It can span multiple lines.

---

## Alerts

> [!NOTE]
> Useful information that users should know, even when skimming.

> [!TIP]
> Helpful advice for doing things better or more easily.

> [!IMPORTANT]
> Key information users need to know to achieve their goal.

> [!WARNING]
> Urgent info that needs immediate attention to avoid problems.

> [!CAUTION]
> Advises about risks or negative outcomes of certain actions.

---

## Lists

### Unordered

- First item
- Second item
- Third item

* Also works with asterisks
* Another item

+ And with plus signs
+ One more

### Ordered

1. First step
2. Second step
3. Third step

---

## Code Blocks

```javascript
function greet(name) {
    return `Hello, ${name}!`;
}

console.log(greet('hotnote'));
```

```python
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b

print(list(fibonacci(10)))
```

```json
{
  "name": "hotnote",
  "version": "0.4.0",
  "local-first": true
}
```

```bash
# Open a local server
make preview
```

---

## Tables

| Language   | Paradigm      | Typed    | Year |
| ---------- | ------------- | -------- | ---- |
| JavaScript | Multi-paradigm | Dynamic | 1995 |
| Python     | Multi-paradigm | Dynamic | 1991 |
| Rust       | Systems        | Static  | 2010 |
| Go         | Concurrent     | Static  | 2009 |
| TypeScript | Multi-paradigm | Static  | 2012 |

---

## Horizontal Rules

Three ways to draw a horizontal rule:

***

---

___
