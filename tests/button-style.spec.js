import { test, expect } from '@playwright/test';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Parse "rgb(r, g, b)" → [r, g, b]. Returns null for non-rgb strings. */
function parseRgb(str) {
    const m = str.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
    return m ? [+m[1], +m[2], +m[3]] : null;
}

/** True if two rgb() strings are equal within ±1 per channel (sub-pixel rounding). */
function rgbNear(a, b) {
    const ca = parseRgb(a), cb = parseRgb(b);
    if (!ca || !cb) return a === b;
    return ca.every((v, i) => Math.abs(v - cb[i]) <= 1);
}

async function openFolder(page) {
    await page.evaluate(({ tree }) => window.__mockFS.setTree(tree), {
        tree: { 'notes.md': '# Hello' },
    });
    await page.locator('#open-folder').click();
    await page.locator('#file-list li').first().waitFor({ state: 'visible' });
}

// ─── Header icon buttons ─────────────────────────────────────────────────────

test.describe('Header button style consistency', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: 'tests/helpers/mock-fs.js' });
        await page.goto('/');
    });

    test('all header-right icon buttons have identical dimensions', async ({ page }) => {
        const sizes = await page.evaluate(() => {
            return [...document.querySelectorAll('.header-right .btn-icon')].map(b => {
                const r = b.getBoundingClientRect();
                return { id: b.id, width: Math.round(r.width), height: Math.round(r.height) };
            });
        });

        expect(sizes.length).toBeGreaterThan(1);
        const { width, height } = sizes[0];
        for (const btn of sizes) {
            expect(btn.width, `${btn.id} width`).toBe(width);
            expect(btn.height, `${btn.id} height`).toBe(height);
        }
    });

    test('all header-right icon buttons have identical computed padding and font-size', async ({ page }) => {
        const styles = await page.evaluate(() => {
            return [...document.querySelectorAll('.header-right .btn-icon')].map(b => {
                const s = getComputedStyle(b);
                return {
                    id:            b.id,
                    paddingTop:    s.paddingTop,
                    paddingBottom: s.paddingBottom,
                    paddingLeft:   s.paddingLeft,
                    paddingRight:  s.paddingRight,
                    fontSize:      s.fontSize,
                };
            });
        });

        const ref = styles[0];
        for (const btn of styles) {
            expect(btn.paddingTop,    `${btn.id} padding-top`).toBe(ref.paddingTop);
            expect(btn.paddingBottom, `${btn.id} padding-bottom`).toBe(ref.paddingBottom);
            expect(btn.paddingLeft,   `${btn.id} padding-left`).toBe(ref.paddingLeft);
            expect(btn.paddingRight,  `${btn.id} padding-right`).toBe(ref.paddingRight);
            expect(btn.fontSize,      `${btn.id} font-size`).toBe(ref.fontSize);
        }
    });

    test('toggle buttons share identical active-state computed styles', async ({ page }) => {
        await openFolder(page);

        const activeStyles = await page.evaluate(() => {
            return ['#search-btn', '#split-pane-btn', '#help-btn'].map(sel => {
                const btn = document.querySelector(sel);
                btn.classList.add('active');
                const s = getComputedStyle(btn);
                const result = { id: sel, background: s.backgroundColor, borderColor: s.borderColor, boxShadow: s.boxShadow };
                btn.classList.remove('active');
                return result;
            });
        });

        const ref = activeStyles[0];
        for (const btn of activeStyles) {
            expect(btn.background,  `${btn.id} active background`).toBe(ref.background);
            expect(btn.borderColor, `${btn.id} active border-color`).toBe(ref.borderColor);
            expect(btn.boxShadow,   `${btn.id} active box-shadow`).toBe(ref.boxShadow);
        }
    });
});

// ─── General styling consistency ─────────────────────────────────────────────

test.describe('General styling consistency', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ path: 'tests/helpers/mock-fs.js' });
        await page.goto('/');
    });

    test('all .btn elements share the same border-radius', async ({ page }) => {
        await openFolder(page);

        const radii = await page.evaluate(() => {
            return [...document.querySelectorAll('.btn')].map(b => ({
                id: b.id || b.textContent.trim().slice(0, 20),
                borderRadius: getComputedStyle(b).borderRadius,
            }));
        });

        const ref = radii[0].borderRadius;
        for (const btn of radii) {
            expect(btn.borderRadius, `"${btn.id}" border-radius`).toBe(ref);
        }
    });

    test('all .btn elements share the same default background and border-color', async ({ page }) => {
        await openFolder(page);

        const styles = await page.evaluate(() => {
            return [...document.querySelectorAll('.btn:not(:disabled):not(.active)')].map(b => ({
                id:         b.id || b.textContent.trim().slice(0, 20),
                background: getComputedStyle(b).backgroundColor,
                border:     getComputedStyle(b).borderColor,
            }));
        });

        expect(styles.length).toBeGreaterThan(1);
        const ref = styles[0];
        for (const btn of styles) {
            expect(rgbNear(btn.background, ref.background), `"${btn.id}" background: ${btn.background} vs ${ref.background}`).toBe(true);
            expect(rgbNear(btn.border,     ref.border),     `"${btn.id}" border-color: ${btn.border} vs ${ref.border}`).toBe(true);
        }
    });

    test('mode toolbar buttons in pane1 have consistent height', async ({ page }) => {
        await openFolder(page);
        await page.locator('#file-list li').first().click();
        await page.locator('#mode-toolbar').waitFor({ state: 'visible' });

        const heights = await page.evaluate(() => {
            return [...document.querySelectorAll('#mode-toolbar .btn')].map(b => ({
                id:     b.id,
                height: Math.round(b.getBoundingClientRect().height),
            }));
        });

        expect(heights.length).toBeGreaterThan(1);
        const ref = heights[0].height;
        for (const btn of heights) {
            expect(btn.height, `${btn.id} height`).toBe(ref);
        }
    });

    test('sidebar toolbar icon buttons have identical dimensions', async ({ page }) => {
        await openFolder(page);

        const sizes = await page.evaluate(() => {
            return [...document.querySelectorAll('#sidebar-toolbar .btn-icon')].map(b => {
                const r = b.getBoundingClientRect();
                return { id: b.id, width: Math.round(r.width), height: Math.round(r.height) };
            });
        });

        expect(sizes.length).toBeGreaterThan(1);
        const { width, height } = sizes[0];
        for (const btn of sizes) {
            expect(btn.width,  `${btn.id} width`).toBe(width);
            expect(btn.height, `${btn.id} height`).toBe(height);
        }
    });

    test('all .btn elements share the same font-family', async ({ page }) => {
        await openFolder(page);

        const fonts = await page.evaluate(() => {
            return [...document.querySelectorAll('.btn')].map(b => ({
                id:   b.id || b.textContent.trim().slice(0, 20),
                font: getComputedStyle(b).fontFamily,
            }));
        });

        expect(fonts.length).toBeGreaterThan(1);
        const ref = fonts[0].font;
        for (const btn of fonts) {
            expect(btn.font, `"${btn.id}" font-family`).toBe(ref);
        }
    });
});
