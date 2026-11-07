(() => {
  if (window.__linkRealLoaded) return;
  window.__linkRealLoaded = true;

  const TAG = 'link-real-de-download';
  const MAX_DEPTH = 5;
  const HEARTBEAT_MS = 20000;
  const FILE_EXT_SOURCE = 'zip|rar|7z|tar|gz|tgz|bz2|xz|exe|msi|dmg|pkg|deb|rpm|apk|ipa|iso|img|bin|jar|pdf|docx?|xlsx?|pptx?|odt|ods|odp|csv|rtf|epub|mobi|mp3|wav|flac|ogg|aac|m4a|mp4|mkv|avi|mov|webm|torrent';
  const FILE_EXT = new RegExp(`\\.(?:${FILE_EXT_SOURCE})$`, 'i');
  const ABSOLUTE_URL = /(?:blob:)?https?:\/\/[^\s"'`<>\\)]+/g;
  const QUOTED_FILE = new RegExp(`["'\`]([^\\s"'\`<>]+\\.(?:${FILE_EXT_SOURCE})(?:\\?[^\\s"'\`<>]*)?)["'\`]`, 'gi');
  const URL_ATTRIBUTE = /url|href|link|download|file|src|path/i;
  const KIND_LABELS = { file: 'Arquivo', navigation: 'Navegação', api: 'API' };

  const CSS = `
    :host {
      color-scheme: light dark;
      --bg: #ffffff;
      --fg: #17181c;
      --muted: #5f6470;
      --line: #e3e5ea;
      --soft: #f4f5f7;
      --accent: #2457d6;
      --accent-fg: #ffffff;
      --warn-bg: #fff6e0;
      --warn-fg: #6e4a00;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --bg: #18191d;
        --fg: #eceef2;
        --muted: #a2a7b3;
        --line: #30323a;
        --soft: #222329;
        --accent: #8cabff;
        --accent-fg: #10131c;
        --warn-bg: #33290f;
        --warn-fg: #f2cd74;
      }
    }
    * { box-sizing: border-box; }
    .overlay {
      position: fixed;
      display: none;
      border: 2px solid #2457d6;
      border-radius: 3px;
      background: rgba(36, 87, 214, 0.16);
      pointer-events: none;
    }
    .hint {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      max-width: calc(100vw - 24px);
      padding: 7px 12px;
      border-radius: 7px;
      background: #17181c;
      color: #ffffff;
      font: 13px/1.4 system-ui, sans-serif;
      pointer-events: none;
    }
    .panel {
      position: fixed;
      top: 12px;
      right: 12px;
      width: min(420px, calc(100vw - 24px));
      max-height: calc(100vh - 24px);
      overflow-y: auto;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--bg);
      color: var(--fg);
      font: 13px/1.45 system-ui, sans-serif;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
      outline: none;
    }
    header {
      position: sticky;
      top: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 10px 10px 14px;
      border-bottom: 1px solid var(--line);
      background: var(--bg);
    }
    h2 { margin: 0; font-size: 14px; font-weight: 600; }
    .body { display: grid; gap: 10px; padding: 12px 14px 14px; }
    .muted { margin: 0; color: var(--muted); }
    .track { height: 4px; border-radius: 2px; background: var(--soft); overflow: hidden; }
    .bar { height: 100%; background: var(--accent); transform-origin: left; animation: fill linear forwards; }
    @keyframes fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    .notice, .warning {
      margin: 0;
      padding: 6px 9px;
      border-radius: 6px;
      background: var(--warn-bg);
      color: var(--warn-fg);
      font-size: 12px;
    }
    .card { display: grid; gap: 8px; padding: 11px; border: 1px solid var(--line); border-radius: 8px; }
    .title { display: flex; align-items: center; gap: 7px; min-width: 0; }
    .tag {
      flex: none;
      padding: 1px 7px;
      border-radius: 99px;
      background: var(--soft);
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
    }
    .tag.file { background: var(--accent); color: var(--accent-fg); }
    .name { min-width: 0; overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .url {
      padding: 7px 9px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: var(--soft);
      font: 12px/1.45 ui-monospace, Consolas, monospace;
      overflow-wrap: anywhere;
    }
    .url.final { border-color: var(--accent); font-weight: 600; }
    .label { display: block; margin-bottom: 3px; color: var(--muted); font: 600 11px/1.3 system-ui, sans-serif; }
    .meta { margin: 0; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .warnings { display: grid; gap: 4px; }
    details { color: var(--muted); font-size: 12px; }
    summary { cursor: pointer; }
    ol { margin: 6px 0 0; padding-left: 20px; font-family: ui-monospace, Consolas, monospace; overflow-wrap: anywhere; }
    li + li { margin-top: 3px; }
    .actions { display: flex; gap: 6px; }
    button {
      padding: 6px 11px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: transparent;
      color: var(--fg);
      font: 600 12px/1.4 system-ui, sans-serif;
      cursor: pointer;
    }
    button:hover:not(:disabled) { background: var(--soft); }
    button.primary { border-color: var(--accent); background: var(--accent); color: var(--accent-fg); }
    button.primary:hover:not(:disabled) { background: var(--accent); filter: brightness(1.08); }
    button:disabled { opacity: 0.5; cursor: default; }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .close { width: 28px; height: 28px; padding: 0; border: 0; font-size: 16px; font-weight: 400; color: var(--muted); }
    .live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    @media (prefers-reduced-motion: reduce) {
      .track { display: none; }
    }
  `;

  let ui = null;
  let panel = null;
  let previousFocus = null;
  let selecting = false;
  let hovered = null;
  let downTime = 0;
  let heartbeat = 0;

  const send = message => {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch {}
  };

  const h = (tag, props = {}, ...children) => {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key in element) element[key] = value;
      else element.setAttribute(key, value);
    }
    element.append(...children.filter(child => child != null));
    return element;
  };

  const getUi = () => {
    if (!ui) {
      const host = document.createElement('link-real-ui');
      host.style.cssText = 'all:initial!important;position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;z-index:2147483647!important;';
      const root = host.attachShadow({ mode: 'closed' });
      const overlay = h('div', { className: 'overlay' });
      root.append(h('style', { textContent: CSS }), overlay);
      ui = { host, root, overlay, hint: null };
    }
    if (!ui.host.isConnected) document.documentElement.append(ui.host);
    return ui;
  };

  const highlight = element => {
    hovered = element;
    const rect = element.getBoundingClientRect();
    const { style } = getUi().overlay;
    style.display = 'block';
    style.left = `${rect.left}px`;
    style.top = `${rect.top}px`;
    style.width = `${rect.width}px`;
    style.height = `${rect.height}px`;
  };

  const elementFrom = event => {
    const target = event.composedPath()[0];
    if (target?.nodeType === 1) return target;
    return target?.parentElement ?? null;
  };

  const onMove = event => {
    const element = elementFrom(event);
    if (element && element !== hovered) highlight(element);
  };

  const onScroll = () => {
    if (hovered?.isConnected) highlight(hovered);
  };

  const onFocus = event => {
    const element = elementFrom(event);
    if (element) highlight(element);
  };

  const onPointerDown = event => {
    if (event.isTrusted) downTime = Date.now();
  };

  const onKey = event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stopSelecting();
    send({ type: 'cancel' });
  };

  const onClick = event => {
    if (!event.isTrusted) return;
    const element = elementFrom(event);
    if (!element) return;
    const time = downTime || Date.now();
    const { candidates, direct } = inspect(element);
    if (direct) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    stopSelecting();
    send({ type: 'clicked', time, candidates, direct });
  };

  const LISTENERS = [
    ['mousemove', onMove],
    ['pointerdown', onPointerDown],
    ['click', onClick],
    ['keydown', onKey],
    ['focusin', onFocus],
    ['scroll', onScroll]
  ];

  const startSelecting = () => {
    stopSelecting();
    removePanel();
    selecting = true;
    downTime = 0;
    LISTENERS.forEach(([type, listener]) => window.addEventListener(type, listener, true));
    heartbeat = setInterval(() => send({ type: 'ping' }), HEARTBEAT_MS);
    const current = getUi();
    if (window === window.top) {
      current.hint = h('div', { className: 'hint', textContent: 'Clique no botão de download. ESC cancela.' });
      current.root.append(current.hint);
    }
  };

  function stopSelecting() {
    if (!selecting) return;
    selecting = false;
    hovered = null;
    LISTENERS.forEach(([type, listener]) => window.removeEventListener(type, listener, true));
    clearInterval(heartbeat);
    const current = getUi();
    current.overlay.style.display = 'none';
    current.hint?.remove();
    current.hint = null;
  }

  const resolveUrl = raw => {
    const value = String(raw ?? '').trim();
    if (!value || value.startsWith('#')) return null;
    try {
      const url = new URL(value, document.baseURI);
      if (!/^(?:https?|blob|data):$/.test(url.protocol)) return null;
      if (url.href.split('#')[0] === location.href.split('#')[0]) return null;
      return url;
    } catch {
      return null;
    }
  };

  const isFileUrl = url => /^https?:$/.test(url.protocol) && FILE_EXT.test(url.pathname);

  const urlsInText = text => {
    const source = String(text).slice(0, 20000).replace(/\\\//g, '/');
    return [
      ...(source.match(ABSOLUTE_URL) ?? []),
      ...[...source.matchAll(QUOTED_FILE)].map(match => match[1])
    ];
  };

  const urlsInDataAttribute = (name, value) => {
    const urls = urlsInText(value);
    const text = value.trim();
    if (text && !/\s/.test(text) && !/^(?:https?:|blob:)/.test(text)) {
      let isFile = false;
      try {
        isFile = FILE_EXT.test(new URL(text, document.baseURI).pathname);
      } catch {}
      if (isFile || (URL_ATTRIBUTE.test(name) && /^\.{0,2}\//.test(text))) urls.push(text);
    }
    return urls;
  };

  const inspect = start => {
    const found = new Map();
    let direct = false;

    const add = (raw, source, { download = false, filename = '' } = {}) => {
      const url = resolveUrl(raw);
      if (!url) return;
      const embedded = /^(?:blob|data):$/.test(url.protocol);
      if (download || embedded || isFileUrl(url)) direct = true;
      if (!found.has(url.href)) {
        found.set(url.href, {
          url: url.href.slice(0, 9000),
          source,
          filename,
          download: download || embedded
        });
      }
    };

    let node = start;
    for (let depth = 0; node && depth <= MAX_DEPTH; depth++) {
      const href = node.getAttribute('href');
      if (href !== null) {
        const hasDownload = node.hasAttribute('download');
        add(href, 'href', { download: hasDownload, filename: node.getAttribute('download') ?? '' });
      }
      add(node.getAttribute('formaction'), 'formaction');
      if (node.matches('form')) add(node.getAttribute('action'), 'form action');
      else if (node.matches('button, input') && node.form) add(node.form.getAttribute('action'), 'form action');
      for (const attribute of node.attributes) {
        if (attribute.name.startsWith('data-')) {
          urlsInDataAttribute(attribute.name, attribute.value).forEach(url => add(url, attribute.name));
        }
      }
      const onclick = node.getAttribute('onclick');
      if (onclick) urlsInText(onclick).forEach(url => add(url, 'onclick'));
      node = node.parentElement ?? node.getRootNode().host ?? null;
    }

    return { candidates: [...found.values()], direct };
  };

  const removePanel = () => {
    if (!panel) return;
    panel.remove();
    panel = null;
    previousFocus?.focus?.();
    previousFocus = null;
  };

  const mountPanel = (title, onClose, ...content) => {
    if (panel) panel.remove();
    panel = h('section', { className: 'panel', role: 'dialog', tabIndex: -1, 'aria-label': title },
      h('header', {},
        h('h2', { textContent: title }),
        h('button', { className: 'close', type: 'button', textContent: '×', 'aria-label': 'Fechar', onclick: onClose })
      ),
      h('div', { className: 'body' }, ...content)
    );
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    });
    getUi().root.append(panel);
  };

  const showMonitoring = seconds => {
    const bar = h('div', { className: 'bar' });
    bar.style.animationDuration = `${seconds}s`;
    mountPanel('Analisando o download', () => {
      removePanel();
      send({ type: 'cancel' });
    },
      h('p', { className: 'muted', role: 'status', textContent: `Monitorando esta aba por ${seconds} segundos…` }),
      h('div', { className: 'track' }, bar)
    );
  };

  const copyText = async text => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = h('textarea', { value: text });
      getUi().root.append(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      return copied;
    }
  };

  const formatSize = bytes => {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[index]}`;
  };

  const renderCard = (candidate, isFirst, live) => {
    const redirected = candidate.chain.length > 1;
    const truncated = candidate.url.endsWith('…');
    const canOpen = /^(?:https?|blob):/.test(candidate.url) && !truncated;
    const meta = [
      candidate.contentType,
      formatSize(candidate.size),
      candidate.status ? `HTTP ${candidate.status}` : '',
      candidate.sources.join(', ')
    ].filter(Boolean).join(' · ');

    const copyButton = h('button', {
      type: 'button',
      className: isFirst && candidate.kind === 'file' ? 'primary' : '',
      textContent: 'Copiar link',
      disabled: truncated
    });
    copyButton.addEventListener('click', async () => {
      const copied = await copyText(candidate.url);
      copyButton.focus();
      const text = copied ? 'Copiado' : 'Falha ao copiar';
      copyButton.textContent = text;
      live.textContent = text;
      setTimeout(() => {
        copyButton.textContent = 'Copiar link';
      }, 1500);
    });

    const openButton = h('button', { type: 'button', textContent: 'Abrir link', disabled: !canOpen });
    openButton.addEventListener('click', () => window.open(candidate.url, '_blank', 'noopener,noreferrer'));

    return h('article', { className: 'card' },
      h('div', { className: 'title' },
        h('span', { className: `tag ${candidate.kind}`, textContent: KIND_LABELS[candidate.kind] }),
        h('span', { className: 'name', title: candidate.filename, textContent: candidate.filename })
      ),
      h('div', { className: `url${redirected ? ' final' : ''}` },
        redirected ? h('span', { className: 'label', textContent: 'URL final' }) : null,
        candidate.url
      ),
      meta ? h('p', { className: 'meta', textContent: meta }) : null,
      candidate.warnings.length
        ? h('div', { className: 'warnings' }, ...candidate.warnings.map(text => h('p', { className: 'warning', textContent: text })))
        : null,
      redirected
        ? h('details', {},
            h('summary', { textContent: `${candidate.chain.length - 1} redirecionamento(s)` }),
            h('ol', {}, ...candidate.chain.map(url => h('li', { textContent: url })))
          )
        : null,
      h('div', { className: 'actions' }, copyButton, openButton)
    );
  };

  const showResults = ({ candidates, notice }) => {
    if (!panel) previousFocus = document.activeElement;
    const live = h('div', { className: 'live', 'aria-live': 'polite' });
    const count = candidates.length;
    const title = count === 1 ? '1 link encontrado' : `${count} links encontrados`;
    mountPanel(count ? title : 'Nenhum link encontrado', removePanel,
      notice ? h('p', { className: 'notice', textContent: notice }) : null,
      ...candidates.map((candidate, index) => renderCard(candidate, index === 0, live)),
      live
    );
    panel.focus();
  };

  document.addEventListener(TAG, event => {
    try {
      const { kind, url, credentials, mime, size } = JSON.parse(event.detail);
      send({ type: 'hook', kind, url, credentials, mime, size, time: Date.now() });
    } catch {}
  });

  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'start') startSelecting();
    else if (message.type === 'stop-select') stopSelecting();
    else if (message.type === 'unhook') document.dispatchEvent(new CustomEvent(`${TAG}-stop`));
    else if (message.type === 'monitoring') showMonitoring(message.seconds);
    else if (message.type === 'results') showResults(message);
  });
})();
