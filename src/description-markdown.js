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

// Only renderer-owned tags and attributes reach the DOM. HTML and unsupported
// markup become text, and media never creates a resource-loading element.
function describeTokens(tokens, depth = 0) {
  return tokens.flatMap(token => {
    if (depth >= 48) return [token.raw ?? ''];
    const children = () => describeTokens(token.tokens ?? [], depth + 1);
    if (Object.hasOwn(inlineTags, token.type)) return [node(inlineTags[token.type], children())];
    switch (token.type) {
      case 'space':
      case 'def': return [];
      case 'paragraph': return [node('p', children())];
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
      case 'image': return [decodeHTML(token.text ?? '')];
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
    result = text.length > 100_000 ? [text] : describeTokens(parser.lexer(text));
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
    if (item.tag === 'br') return '\n';
    const contents = item.children.map(flatten).join('');
    if (item.tag === 'li') return `• ${contents}\n`;
    return contents + (['p', 'ol', 'ul'].includes(item.tag) ? '\n' : '');
  };
  return parseDescriptionMarkdown(text).map(flatten).join('').trim();
}

function nodeStyle(tag) {
  switch (tag) {
    case 'p': return { margin: '0 0 .65em' };
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
    return h(item.tag, { ...item.attributes, key, style: nodeStyle(item.tag) }, ...children);
  };
  return parseDescriptionMarkdown(text).map(render);
}

const rendered = new WeakMap();
export function paintDescription(body, text, markdown, openLink) {
  if (!body) return;
  const previous = rendered.get(body);
  if (previous?.text === text && previous?.markdown === markdown && body.firstChild === previous.first) return;
  if (!markdown) {
    if (body.textContent !== text || previous?.markdown) body.textContent = text;
  } else {
    const doc = body.ownerDocument;
    const create = item => {
      if (typeof item === 'string') return doc.createTextNode(item);
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
    body.replaceChildren(fragment);
  }
  rendered.set(body, { text, markdown, first: body.firstChild });
}

// Steam's navigation tree knows about native focusable controls, but not DOM
// siblings inserted by TitleDeck. Register only links in the active panel.
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
  const links = [...(panel?.querySelectorAll?.('[data-titledeck-description-link]') ?? [])];
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
      child.SetProperties({ focusable: true, noFocusRing: true, onOKActionDescription: 'Open link' });
      child.OnMount(link);
    }
  } catch {
    clearDescriptionLinkNavigation(panel);
  }
}
