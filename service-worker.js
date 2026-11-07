const WINDOW_MS = 5000;
const BUFFER_MS = 2000;
const CLOCK_TOLERANCE_MS = 50;
const MAX_EVENTS = 300;
const MAX_RESULTS = 20;
const REQUEST_TYPES = ['main_frame', 'sub_frame', 'xmlhttprequest', 'media', 'object', 'other'];
const FILE_EXT = /\.(?:zip|rar|7z|tar|gz|tgz|bz2|xz|exe|msi|dmg|pkg|deb|rpm|apk|ipa|iso|img|bin|jar|pdf|docx?|xlsx?|pptx?|odt|ods|odp|csv|rtf|epub|mobi|mp3|wav|flac|ogg|aac|m4a|mp4|mkv|avi|mov|webm|torrent)$/i;
const API_TYPE = /json|xml|javascript|text\/plain|x-www-form-urlencoded|event-stream|graphql/i;
const TEMPORARY_PARAM = /^(?:x-amz-.+|x-goog-(?:signature|expires)|expires?|expiry|exp|signature|sig|(?:.*[-_])?token)$/i;
const HOOK_LABELS = { fetch: 'fetch', xhr: 'XMLHttpRequest', 'window.open': 'window.open', createObjectURL: 'createObjectURL' };

const sessions = new Map();

const newSession = () => ({
  state: 'armed',
  clickTime: 0,
  timer: 0,
  children: new Set(),
  requests: new Map(),
  hooks: [],
  downloads: [],
  statics: []
});

const findSession = tabId => {
  if (sessions.has(tabId)) return sessions.get(tabId);
  for (const session of sessions.values()) {
    if (session.children.has(tabId)) return session;
  }
  return null;
};

const trim = session => {
  if (session.state !== 'armed') return;
  const min = Date.now() - BUFFER_MS;
  for (const [id, request] of session.requests) {
    if (request.time < min) session.requests.delete(id);
  }
  session.hooks = session.hooks.filter(event => event.time >= min);
  session.downloads = session.downloads.filter(event => event.time >= min);
};

const normalize = raw => {
  try {
    const url = new URL(raw);
    if (!/^(?:https?|blob|data):$/.test(url.protocol)) return null;
    const limit = url.protocol === 'data:' ? 512 : 8192;
    return url.href.length > limit ? `${url.href.slice(0, limit)}…` : url.href;
  } catch {
    return null;
  }
};

const hasFileExtension = url => {
  try {
    return FILE_EXT.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

const parseFilename = disposition => {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(disposition);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1].trim());
  } catch {
    return match[1].trim();
  }
};

chrome.webRequest.onBeforeRequest.addListener(details => {
  const session = findSession(details.tabId);
  if (!session) return;
  trim(session);
  if (session.requests.has(details.requestId) || session.requests.size >= MAX_EVENTS) return;
  session.requests.set(details.requestId, {
    chain: [details.url],
    type: details.type,
    time: details.timeStamp,
    status: 0,
    contentType: '',
    attachment: false,
    filename: '',
    size: 0,
    auth: false,
    cookies: false
  });
}, { urls: ['<all_urls>'], types: REQUEST_TYPES });

chrome.webRequest.onBeforeRedirect.addListener(details => {
  const request = findSession(details.tabId)?.requests.get(details.requestId);
  if (request) request.chain.push(details.redirectUrl);
}, { urls: ['<all_urls>'], types: REQUEST_TYPES });

chrome.webRequest.onHeadersReceived.addListener(details => {
  const request = findSession(details.tabId)?.requests.get(details.requestId);
  if (!request) return;
  const headers = details.responseHeaders ?? [];
  const value = name => headers.find(header => header.name.toLowerCase() === name)?.value ?? '';
  const disposition = value('content-disposition');
  request.status = details.statusCode;
  request.contentType = value('content-type').split(';')[0].trim().toLowerCase();
  request.attachment = /^\s*attachment/i.test(disposition);
  request.filename = parseFilename(disposition);
  request.size = Number(value('content-length')) || 0;
  if (details.statusCode === 401 || details.statusCode === 403) request.auth = true;
  const setsCookie = headers.some(header => header.name.toLowerCase() === 'set-cookie');
  if (setsCookie || /cookie/i.test(value('vary')) || /true/i.test(value('access-control-allow-credentials'))) {
    request.cookies = true;
  }
}, { urls: ['<all_urls>'], types: REQUEST_TYPES }, ['responseHeaders']);

chrome.downloads.onCreated.addListener(item => {
  if (item.byExtensionId) return;
  for (const session of sessions.values()) {
    trim(session);
    if (session.downloads.length >= MAX_EVENTS) continue;
    session.downloads.push({
      url: item.url,
      finalUrl: item.finalUrl,
      mime: item.mime || '',
      time: Date.parse(item.startTime) || Date.now()
    });
  }
});

chrome.tabs.onCreated.addListener(tab => {
  if (tab.openerTabId != null) findSession(tab.openerTabId)?.children.add(tab.id);
});

chrome.tabs.onRemoved.addListener(tabId => {
  const session = sessions.get(tabId);
  if (session) clearTimeout(session.timer);
  sessions.delete(tabId);
  for (const other of sessions.values()) other.children.delete(tabId);
});

const buildResults = session => {
  const from = session.clickTime - CLOCK_TOLERANCE_MS;
  const candidates = [];

  const locate = urls => {
    const existing = candidates.find(candidate => urls.some(url => candidate.urls.has(url)));
    if (existing) {
      urls.forEach(url => existing.urls.add(url));
      return existing;
    }
    const created = {
      urls: new Set(urls),
      chain: [...urls],
      sources: new Set(),
      time: Infinity,
      status: 0,
      contentType: '',
      filename: '',
      size: 0,
      attachment: false,
      download: false,
      marked: false,
      frame: false,
      api: false,
      auth: false,
      cookies: false
    };
    candidates.push(created);
    return created;
  };

  for (const request of session.requests.values()) {
    if (request.time < from) continue;
    const chain = request.chain.map(normalize).filter(Boolean);
    if (!chain.length) continue;
    const candidate = locate(chain);
    if (chain.length >= candidate.chain.length) candidate.chain = chain;
    candidate.sources.add('Rede');
    candidate.time = Math.min(candidate.time, request.time);
    candidate.status = request.status || candidate.status;
    candidate.contentType = request.contentType || candidate.contentType;
    candidate.filename = request.filename || candidate.filename;
    candidate.size = request.size || candidate.size;
    candidate.attachment ||= request.attachment;
    candidate.auth ||= request.auth;
    candidate.cookies ||= request.cookies;
    candidate.frame ||= request.type === 'main_frame' || request.type === 'sub_frame';
    candidate.api ||= request.type === 'xmlhttprequest';
  }

  for (const hook of session.hooks) {
    if (hook.time < from) continue;
    const candidate = locate([hook.url]);
    candidate.sources.add(HOOK_LABELS[hook.kind]);
    candidate.time = Math.min(candidate.time, hook.time);
    candidate.contentType ||= hook.mime;
    candidate.size ||= hook.size;
    candidate.cookies ||= hook.credentials;
    candidate.api ||= hook.kind === 'fetch' || hook.kind === 'xhr';
  }

  for (const download of session.downloads) {
    if (download.time < from) continue;
    const url = normalize(download.url);
    const finalUrl = normalize(download.finalUrl) || url;
    if (!url) continue;
    const urls = url === finalUrl ? [url] : [url, finalUrl];
    const candidate = locate(urls);
    if (candidate.chain.at(-1) !== finalUrl && !candidate.chain.includes(finalUrl)) candidate.chain.push(finalUrl);
    candidate.sources.add('Download');
    candidate.time = Math.min(candidate.time, download.time);
    candidate.contentType ||= download.mime.toLowerCase();
    candidate.download = true;
  }

  for (const item of session.statics) {
    const candidate = locate([item.url]);
    candidate.sources.add(`Elemento (${item.source})`);
    candidate.time = Math.min(candidate.time, session.clickTime);
    candidate.filename ||= item.filename;
    candidate.marked ||= item.download;
  }

  const results = candidates.map(toResult).sort((a, b) => b.score - a.score || a.time - b.time);
  const hasFile = results.some(result => result.kind === 'file');
  return {
    candidates: results.slice(0, MAX_RESULTS).map(({ score, time, ...result }) => result),
    notice: hasFile ? '' : 'Nenhum link direto de arquivo encontrado.'
  };
};

const toResult = candidate => {
  const url = candidate.chain.at(-1);
  const { contentType, status } = candidate;
  const isHtml = contentType.includes('html');
  const isApi = API_TYPE.test(contentType);
  const isEmbedded = /^(?:blob|data):/.test(url);
  const hasExtension = hasFileExtension(url);
  const isFileType = Boolean(contentType) && !isHtml && !isApi && status < 400;
  const isFile = candidate.download || candidate.attachment || candidate.marked || isEmbedded || isFileType || (hasExtension && !isHtml && !isApi);

  let score = 0;
  if (candidate.download) score += 100;
  if (candidate.attachment) score += 80;
  if (candidate.marked) score += 60;
  if (isFileType) score += 50;
  if (hasExtension && !isHtml) score += 40;
  if (isEmbedded) score += 30;
  if (candidate.frame) score += 10;
  if (status >= 400) score -= 40;
  if (isApi || candidate.api) score -= 20;
  if (isHtml) score -= 10;

  return {
    url,
    chain: candidate.chain,
    kind: isFile ? 'file' : candidate.api || isApi ? 'api' : 'navigation',
    filename: candidate.filename || nameFromUrl(url),
    contentType,
    size: candidate.size,
    status,
    sources: [...candidate.sources],
    warnings: warningsFor(candidate, url),
    score,
    time: candidate.time
  };
};

const nameFromUrl = url => {
  if (url.startsWith('blob:')) return 'Arquivo em memória';
  if (url.startsWith('data:')) return 'Conteúdo embutido';
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split('/').filter(Boolean).pop();
    return segment ? decodeURIComponent(segment) : parsed.hostname;
  } catch {
    return url;
  }
};

const warningsFor = (candidate, url) => {
  const warnings = [];
  if (url.startsWith('blob:')) {
    warnings.push('Link blob: só existe nesta página e enquanto ela estiver aberta.');
  } else if (url.startsWith('data:')) {
    warnings.push(url.endsWith('…') ? 'Conteúdo data: muito longo, exibido incompleto.' : 'Link data: o conteúdo está embutido na URL, não há arquivo em servidor.');
  } else {
    try {
      if ([...new URL(url).searchParams.keys()].some(key => TEMPORARY_PARAM.test(key))) {
        warnings.push('URL temporária: pode expirar ou parar de funcionar.');
      }
    } catch {}
  }
  if (candidate.auth) warnings.push('Pode depender de sessão/login: houve resposta 401/403.');
  else if (candidate.cookies) warnings.push('Pode depender de sessão/login: cookies envolvidos.');
  return warnings;
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const sendToTopFrame = async (tabId, message) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
      return;
    } catch {
      try {
        await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['content.js'] });
        await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
        return;
      } catch {
        await wait(500);
      }
    }
  }
};

const broadcast = (tabId, message) => chrome.tabs.sendMessage(tabId, message).catch(() => {});

const finalize = async tabId => {
  const session = sessions.get(tabId);
  if (!session) return;
  clearTimeout(session.timer);
  sessions.delete(tabId);
  await sendToTopFrame(tabId, { type: 'results', ...buildResults(session) });
  broadcast(tabId, { type: 'unhook' });
};

const arm = async tabId => {
  clearTimeout(sessions.get(tabId)?.timer);
  sessions.set(tabId, newSession());
  try {
    const target = { tabId, allFrames: true };
    await chrome.scripting.executeScript({ target, files: ['hook.js'], world: 'MAIN' });
    await chrome.scripting.executeScript({ target, files: ['content.js'] });
    await chrome.tabs.sendMessage(tabId, { type: 'start' });
    return { ok: true };
  } catch {
    sessions.delete(tabId);
    return { ok: false };
  }
};

const handleClick = (tabId, message) => {
  if (!sessions.has(tabId)) sessions.set(tabId, newSession());
  const session = sessions.get(tabId);
  if (session.state !== 'armed') return;
  session.state = 'monitoring';
  session.clickTime = Number(message.time) || Date.now();
  session.statics = (Array.isArray(message.candidates) ? message.candidates : []).slice(0, 50).flatMap(item => {
    const url = normalize(item.url);
    return url ? [{ url, source: String(item.source).slice(0, 40), filename: String(item.filename ?? '').slice(0, 200), download: Boolean(item.download) }] : [];
  });
  broadcast(tabId, { type: 'stop-select' });
  if (message.direct) {
    finalize(tabId);
    return;
  }
  chrome.tabs.sendMessage(tabId, { type: 'monitoring', seconds: WINDOW_MS / 1000 }, { frameId: 0 }).catch(() => {});
  session.timer = setTimeout(() => finalize(tabId), WINDOW_MS);
};

const handleHook = (tabId, message) => {
  const session = findSession(tabId);
  if (!session || !HOOK_LABELS[message.kind]) return;
  trim(session);
  const url = normalize(message.url);
  if (!url || session.hooks.length >= MAX_EVENTS) return;
  session.hooks.push({
    kind: message.kind,
    url,
    credentials: message.credentials === true,
    mime: String(message.mime ?? '').slice(0, 100).toLowerCase(),
    size: Number(message.size) || 0,
    time: Number(message.time) || Date.now()
  });
};

const handleCancel = tabId => {
  const session = sessions.get(tabId);
  if (session) clearTimeout(session.timer);
  sessions.delete(tabId);
  broadcast(tabId, { type: 'stop-select' });
  broadcast(tabId, { type: 'unhook' });
};

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === 'arm') {
    if (!sender.url?.startsWith(chrome.runtime.getURL(''))) return;
    arm(message.tabId).then(respond);
    return true;
  }
  const tabId = sender.tab?.id;
  if (tabId == null) return;
  if (message.type === 'clicked') handleClick(tabId, message);
  else if (message.type === 'hook') handleHook(tabId, message);
  else if (message.type === 'cancel') handleCancel(tabId);
});
