# Hotnote

[https://hotnote.io](https://hotnote.io)

> [!NOTE]
> The app was recently rewritten to be pure Javascript removing external dependancies. Some advanced editing features were temporarily removed as a result (until we reintegrate them as native implementations), previous implementation is archived [here](https://github.com/zombar/hotnote.io-old)

Minimalist online code editor with local filesystem access.

We ❤️ lean software and dream of the days of MS Edit and Windows 3.11.

A pure-JS, no-build notes app that runs directly in the browser. Uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) to read and write files on your local machine.

## Features

- Browse and edit local files and folders
- Markdown preview with syntax-highlighted code blocks
- JSON tree viewer
- Image viewer
- Syntax highlighting for common languages (JS, TS, Go, Python, Rust, Shell, CSS, HTML, YAML, …)
- Autosave with configurable delay
- Resizable sidebar
- Drag-and-drop to move files and folders
- Light / dark theme

## Requirements

Chrome or Edge (desktop). The File System Access API is not supported in Firefox or Safari.

## Running locally

Open `index.html` directly in Chrome — no server or build step required.

## Hosting on GitHub Pages

1. Fork or push the repository to GitHub.

2. Go to **Settings → Pages** in your repository.

3. Under **Source**, select **Deploy from a branch**.

4. Choose the `main` branch and the `/ (root)` folder, then click **Save**.

5. GitHub will publish the site at `https://<your-username>.github.io/<repo-name>/`.

6. Open that URL in Chrome and click **Open Folder** to grant access to a local directory.

> **Note:** GitHub Pages serves over HTTPS, which is required for the File System Access API to work. The site is purely static — your files never leave your machine.

### Custom domain (optional)

1. Add a `CNAME` file to the repository root containing just your domain, e.g.:
   ```
   notes.example.com
   ```

2. In your DNS provider, add a `CNAME` record pointing your subdomain to `<your-username>.github.io`.
   For an apex domain (`example.com`) add four `A` records pointing to GitHub's IPs instead:
   ```
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153
   ```

3. Go to **Settings → Pages → Custom domain**, enter your domain, and click **Save**.

4. Wait for DNS to propagate, then tick **Enforce HTTPS** once it becomes available (required for the File System Access API).

## Project structure

```
hotnote2/
├── index.html        # App shell
├── css/
│   └── style.css     # All styles
└── js/
    ├── hotnote.js    # Main app logic
    ├── lib-markdown.js
    └── lib-format.js
```
