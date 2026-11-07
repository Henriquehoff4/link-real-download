(() => {
  const TAG = 'link-real-de-download';
  const KEY = Symbol.for(TAG);
  if (window[KEY]) return;
  window[KEY] = true;

  let active = true;

  const report = (kind, url, extra = {}) => {
    if (!active) return;
    try {
      const href = new URL(String(url), location.href).href.slice(0, 9000);
      document.dispatchEvent(new CustomEvent(TAG, { detail: JSON.stringify({ kind, url: href, ...extra }) }));
    } catch {}
  };

  const xhrProto = XMLHttpRequest.prototype;
  const original = {
    fetch: window.fetch,
    open: window.open,
    xhrOpen: xhrProto.open,
    xhrSend: xhrProto.send,
    createObjectURL: URL.createObjectURL
  };
  const xhrUrls = new WeakMap();

  const wrapped = {
    fetch: function (input, init) {
      try {
        const credentials = init?.credentials === 'include' || input?.credentials === 'include';
        report('fetch', input?.url ?? input, { credentials });
      } catch {}
      return original.fetch.apply(this, arguments);
    },
    open: function (url) {
      if (url) report('window.open', url);
      return original.open.apply(this, arguments);
    },
    xhrOpen: function (method, url) {
      xhrUrls.set(this, url);
      return original.xhrOpen.apply(this, arguments);
    },
    xhrSend: function () {
      if (xhrUrls.has(this)) report('xhr', xhrUrls.get(this), { credentials: this.withCredentials });
      return original.xhrSend.apply(this, arguments);
    },
    createObjectURL: function (object) {
      const url = original.createObjectURL.apply(this, arguments);
      report('createObjectURL', url, { mime: object?.type || '', size: object?.size || 0 });
      return url;
    }
  };

  window.fetch = wrapped.fetch;
  window.open = wrapped.open;
  xhrProto.open = wrapped.xhrOpen;
  xhrProto.send = wrapped.xhrSend;
  URL.createObjectURL = wrapped.createObjectURL;

  const restore = () => {
    active = false;
    document.removeEventListener(`${TAG}-stop`, restore);
    if (window.fetch === wrapped.fetch) window.fetch = original.fetch;
    if (window.open === wrapped.open) window.open = original.open;
    if (xhrProto.open === wrapped.xhrOpen) xhrProto.open = original.xhrOpen;
    if (xhrProto.send === wrapped.xhrSend) xhrProto.send = original.xhrSend;
    if (URL.createObjectURL === wrapped.createObjectURL) URL.createObjectURL = original.createObjectURL;
    delete window[KEY];
  };

  document.addEventListener(`${TAG}-stop`, restore);
})();
