import { decodeHTML } from 'entities';
import { Marked } from 'marked';

const parser = new Marked({
  gfm: true,
  breaks: true,
  extensions: [{
    name: 'underline',
    level: 'inline',
    start: text => text.indexOf('++'),
    tokenizer(source) {
      const match = /^\+\+(?!\s)((?:\\[^\n]|\+(?!\+)|[^+\\\n])+?)(?<!\s)\+\+(?!\+)/.exec(source);
      if (!match) return;
      return { type: 'underline', raw: match[0], tokens: this.lexer.inlineTokens(match[1]) };
    },
  }],
});

const inlineTags = { strong: 'strong', em: 'em', underline: 'u', del: 'del' };
const node = (tag, children = [], attributes = {}) => ({ tag, children, attributes });

// Keep the media policy deliberately small. Media URLs are checked before
// they reach an element that can fetch them, and custom ports are not allowed.
const mediaHosts = {
  image: new Set(['img.itch.zone', 'cdn.imgchest.com', 'cdn.akamai.steamstatic.com', 'shared.akamai.steamstatic.com', 'shared.cloudflare.steamstatic.com', 'steamcdn-a.akamaihd.net', 'steamcommunity-a.akamaihd.net', 'steamstore-a.akamaihd.net']),
  video: new Set(['cdn.akamai.steamstatic.com', 'shared.akamai.steamstatic.com', 'video.akamai.steamstatic.com', 'cdn.steamusercontent.com', 'steamusercontent-a.akamaihd.net', 'steamcdn-a.akamaihd.net', 'steamcommunity-a.akamaihd.net', 'steamstore-a.akamaihd.net']),
};

export function descriptionLink(raw) {
  const href = decodeHTML(String(raw ?? ''));
  if (!/^https:\/\//i.test(href) || /[\s\\]/u.test(href)) return null;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function descriptionMedia(raw, kind) {
  const href = descriptionLink(raw);
  if (!href || !mediaHosts[kind]) return null;
  try {
    const url = new URL(href);
    if (url.port || !mediaHosts[kind].has(url.hostname.toLowerCase())) return null;
    if (kind === 'video' && !/\.(?:webm|mp4)$/i.test(url.pathname)) return null;
    if (kind === 'image' && !/\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

// Only renderer-owned tags and attributes reach the DOM. HTML and unsupported
// markup become text; validated media is inserted as native media elements.
function describeTokens(tokens, depth = 0) {
  return tokens.flatMap(token => {
    if (depth >= 48) return [token.raw ?? ''];
    const children = () => describeTokens(token.tokens ?? [], depth + 1);
    if (Object.hasOwn(inlineTags, token.type)) return [node(inlineTags[token.type], children())];
    switch (token.type) {
      case 'space':
      case 'def': return [];
      case 'paragraph': return [node('p', children())];
      case 'heading': return [node(`h${token.depth}`, children())];
      case 'br': return [node('br')];
      case 'text': return token.tokens ? children() : [decodeHTML(token.text)];
      case 'escape': return [token.text];
      case 'list': {
        const items = token.items.map(item => node('li', describeTokens(item.tokens, depth + 1)));
        return [token.ordered ? node('ol', items, { start: token.start }) : node('ul', items)];
      }
      case 'link': {
        const href = descriptionLink(token.href);
        return href ? [node('a', children(), { href, rel: 'noopener noreferrer', target: '_blank' })] : children();
      }
      case 'image': {
        const label = decodeHTML(token.text ?? '');
        const videoLabel = /^video:\s*(.+)$/i.exec(label);
        const kind = videoLabel ? 'video' : 'image';
        const src = descriptionMedia(token.href, kind);
        return src ? [node('media', [], { kind, src, label: videoLabel?.[1] || label || 'Image' })] : [label];
      }
      case 'html': return [token.raw];
      default: return [token.raw ?? token.text ?? ''];
    }
  });
}

// Steam runs its observers frequently. Cache only recent, reasonably sized
// results so changing routes or typing a preview cannot retain whole libraries.
const cache = new Map();
export function parseDescriptionMarkdown(text) {
  if (cache.has(text)) return cache.get(text);
  let result;
  try {
    result = text.length > 100_000
      ? [text]
      : describeTokens(parser.lexer(text.replace(/\*\*(?=\S)([^*\n]*\S)[ \t]+\*\*(?=\S)/g, '**$1** ')));
  } catch {
    result = [text];
  }
  if (text.length <= 32_000) {
    if (cache.size >= 16) cache.delete(cache.keys().next().value);
    cache.set(text, result);
  }
  return result;
}

export function descriptionPlainText(text, markdown) {
  if (!markdown) return text;
  const flatten = item => {
    if (typeof item === 'string') return item;
    if (item.tag === 'media') return item.attributes.label;
    if (item.tag === 'br') return '\n';
    const contents = item.children.map(flatten).join('');
    if (item.tag === 'li') return `• ${contents}\n`;
    return contents + (['p', 'ol', 'ul', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(item.tag) ? '\n' : '');
  };
  return parseDescriptionMarkdown(text).map(flatten).join('').trim();
}

function nodeStyle(tag) {
  switch (tag) {
    case 'p': return { margin: '0 0 .65em' };
    case 'h1': return { margin: '.7em 0 .4em', fontSize: '1.55em', fontWeight: 750, lineHeight: 1.2 };
    case 'h2': return { margin: '.7em 0 .4em', fontSize: '1.4em', fontWeight: 750, lineHeight: 1.25 };
    case 'h3': return { margin: '.65em 0 .35em', fontSize: '1.25em', fontWeight: 700, lineHeight: 1.3 };
    case 'h4': return { margin: '.6em 0 .3em', fontSize: '1.12em', fontWeight: 700 };
    case 'h5': return { margin: '.55em 0 .3em', fontSize: '1.05em', fontWeight: 700 };
    case 'h6': return { margin: '.5em 0 .25em', fontSize: '1em', fontWeight: 700 };
    case 'ul': return { margin: '0 0 .65em', paddingInlineStart: '1.5em', listStyleType: 'disc' };
    case 'ol': return { margin: '0 0 .65em', paddingInlineStart: '1.5em', listStyleType: 'decimal' };
    case 'li': return { display: 'list-item' };
    case 'a': return { color: 'inherit', textDecoration: 'underline' };
    default: return {};
  }
}

export function markdownPreview(text, h, link) {
  const render = (item, key) => {
    if (typeof item === 'string') return item;
    const children = item.children.map(render);
    if (item.tag === 'a') return link(item.attributes.href, children, key);
    if (item.tag === 'media') {
      const { kind, src, label } = item.attributes;
      const props = { key, 'data-titledeck-description-media': '', style: { display: 'block', maxWidth: '100%', maxHeight: '60vh', margin: '.7em 0' } };
      if (kind === 'image') return h('img', { ...props, src, alt: label, loading: 'lazy', decoding: 'async' });
      return h('video', { ...props, src, controls: true, preload: 'metadata', playsInline: true, 'aria-label': label });
    }
    return h(item.tag, { ...item.attributes, key, style: nodeStyle(item.tag) }, ...children);
  };
  return parseDescriptionMarkdown(text).map(render);
}

const rendered = new WeakMap();
export function cleanupDescriptionMedia(root) {
  if (!root?.querySelectorAll) return;
  for (const media of root.querySelectorAll('img[data-titledeck-description-media],video[data-titledeck-description-media]')) {
    try { media.pause?.(); } catch { /* It may never have started. */ }
    media.removeAttribute('src');
    try { media.load?.(); } catch { /* Detached media elements may reject load. */ }
  }
}

export function paintDescription(body, text, markdown, openLink, scope = '') {
  if (!body) return;
  const previous = rendered.get(body);
  if (previous?.text === text && previous?.markdown === markdown && previous?.scope === scope && body.firstChild === previous.first) return;
  if (!markdown) {
    cleanupDescriptionMedia(body);
    if (body.textContent !== text || previous?.markdown) body.textContent = text;
  } else {
    const doc = body.ownerDocument;
    const create = item => {
      if (typeof item === 'string') return doc.createTextNode(item);
      if (item.tag === 'media') {
        const { kind, src, label } = item.attributes;
        const box = doc.createElement('div');
        box.setAttribute('data-titledeck-description-media', kind);
        box.style.cssText = 'margin:.7em 0;max-width:100%;';
        if (kind === 'image') {
          const img = doc.createElement('img');
          img.alt = label;
          img.loading = 'lazy';
          img.decoding = 'async';
          img.style.cssText = 'display:block;max-width:100%;max-height:60vh;object-fit:contain;';
          img.setAttribute('data-titledeck-description-media', '');
          img.addEventListener('error', () => {
            img.remove();
            failureLink(box, src, label, doc, openLink);
          }, { once: true });
          img.src = src;
          box.appendChild(img);
          return box;
        }
        const video = doc.createElement('video');
        video.controls = true;
        video.preload = 'metadata';
        video.playsInline = true;
        video.tabIndex = 0;
        video.setAttribute('aria-label', label);
        video.setAttribute('data-titledeck-description-focus', '');
        video.setAttribute('data-titledeck-description-focus-label', 'Play or pause video');
        video.style.cssText = 'display:block;width:100%;max-width:720px;max-height:60vh;';
        video.setAttribute('data-titledeck-description-media', '');
        video.addEventListener('error', () => failureLink(box, src, label, doc, openLink), { once: true });
        video.addEventListener('vgp_onbuttondown', event => {
          if (event.detail?.button !== 1 || event.detail?.is_repeat) return;
          event.preventDefault();
          event.stopPropagation();
          if (video.paused) video.play().catch(() => failureLink(box, src, label, doc, openLink));
          else video.pause();
        });
        video.src = src;
        box.appendChild(video);
        return box;
      }
      const element = doc.createElement(item.tag);
      for (const [name, value] of Object.entries(item.attributes)) element.setAttribute(name, value);
      Object.assign(element.style, nodeStyle(item.tag));
      if (item.tag === 'a') {
        element.setAttribute('data-titledeck-description-link', '');
        element.addEventListener('vgp_onbuttondown', event => {
          if (event.detail?.button !== 1 || event.detail?.is_repeat) return;
          event.preventDefault();
          event.stopPropagation();
          element.click();
        });
        element.addEventListener('click', event => {
          if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          if (openLink(item.attributes.href)) event.preventDefault();
        });
      }
      for (const child of item.children) element.appendChild(create(child));
      return element;
    };
    const fragment = doc.createDocumentFragment();
    for (const item of parseDescriptionMarkdown(text)) fragment.appendChild(create(item));
    cleanupDescriptionMedia(body);
    body.replaceChildren(fragment);
  }
  rendered.set(body, { text, markdown, scope, first: body.firstChild });
}

function failureLink(box, src, label, doc, openLink) {
  if (box.querySelector('[data-titledeck-description-media-fallback]')) return;
  const fallback = doc.createElement('button');
  fallback.type = 'button';
  fallback.textContent = `Media unavailable · Open ${label}`;
  fallback.setAttribute('data-titledeck-description-media-fallback', '');
  fallback.setAttribute('data-titledeck-description-focus', '');
  fallback.setAttribute('data-titledeck-description-focus-label', 'Open media externally');
  fallback.addEventListener('click', () => openLink(src));
  fallback.addEventListener('vgp_onbuttondown', event => {
    if (event.detail?.button !== 1 || event.detail?.is_repeat) return;
    event.preventDefault(); event.stopPropagation(); fallback.click();
  });
  box.appendChild(fallback);
}

// Steam's navigation tree knows about native focusable controls, but not DOM
// siblings inserted by TitleDeck. Register only links and media actions.
const navigation = new WeakMap();
export function clearDescriptionLinkNavigation(panel) {
  const entry = navigation.get(panel);
  if (!entry) return;
  navigation.delete(panel);
  for (const child of entry.nodes) {
    try { child.OnUnmount(); } catch { /* Steam may already have discarded the tree. */ }
  }
}

export function updateDescriptionLinkNavigation(panel, trees) {
  const links = [...(panel?.querySelectorAll?.('[data-titledeck-description-link],[data-titledeck-description-focus]') ?? [])];
  const current = navigation.get(panel);
  if (current?.nodes.length === links.length &&
      links.every((link, i) => link === current.links[i]) && current.parent.Element?.isConnected) return;
  clearDescriptionLinkNavigation(panel);
  if (!panel?.isConnected || !links.length) return;

  const ancestors = new Map();
  for (let el = panel.parentElement; el; el = el.parentElement) ancestors.set(el, ancestors.size);
  const pending = [...(trees ?? [])];
  const seen = new Set();
  let parent, distance = Infinity;
  const nodes = pending.flatMap(tree => [tree?.Root]);
  while (nodes.length && seen.size < 3500) {
    const candidate = nodes.pop();
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const depth = ancestors.get(candidate.Element);
    if (depth !== undefined && depth < distance && typeof candidate.Tree?.CreateNode === 'function') {
      parent = candidate;
      distance = depth;
      if (!depth) break;
    }
    for (const child of candidate.m_rgChildren ?? []) nodes.push(child);
  }
  if (!parent) return;

  const entry = { parent, nodes: [], links };
  navigation.set(panel, entry);
  try {
    for (const link of links) {
      const child = parent.Tree.CreateNode(parent, undefined);
      entry.nodes.push(child);
      child.SetProperties({ focusable: true, noFocusRing: true,
        onOKActionDescription: link.hasAttribute?.('data-titledeck-description-link')
          ? 'Open link'
          : (link.getAttribute?.('data-titledeck-description-focus-label') || 'Open media externally') });
      child.OnMount(link);
    }
  } catch {
    clearDescriptionLinkNavigation(panel);
  }
}
