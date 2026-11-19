const assert = require('node:assert/strict');
const test = require('node:test');

const markdown = () => import('../src/description-markdown.js');
const tags = tree => tree.flatMap(value => typeof value === 'string' ? [] : [value.tag, ...tags(value.children)]);

test('Markdown includes every requested format and keeps metadata values plain', async () => {
  const { parseDescriptionMarkdown, descriptionPlainText } = await markdown();
  const source = [
    '**Average Playtime:** 12 hours\n**Genres:** Action',
    '++Underlined++ *italic* ~~obsolete~~',
    '3. First\n4. Second',
    '- Bullet',
    '[Guide](https://example.com/guide?x=1&amp;y=2)',
  ].join('\n\n');
  const tree = parseDescriptionMarkdown(source);
  assert.deepEqual(tree[0].children.slice(0, 2).map(item => item.children ?? item), [['Average Playtime:'], ' 12 hours']);
  assert.deepEqual(tree[0].children.slice(3).map(item => item.children ?? item), [['Genres:'], ' Action']);
  assert.deepEqual(tags(tree), ['p', 'strong', 'br', 'strong', 'p', 'u', 'em', 'del', 'ol', 'li', 'li', 'ul', 'li', 'p', 'a']);
  assert.equal(tree[2].attributes.start, 3);
  assert.equal(tree[4].children[0].attributes.href, 'https://example.com/guide?x=1&y=2');
  assert.equal(descriptionPlainText(source, false), source);
  assert.match(descriptionPlainText(source, true), /^Average Playtime: 12 hours\nGenres: Action/);
});

test('raw HTML, unsupported media and invalid links never produce active elements', async () => {
  const { parseDescriptionMarkdown, descriptionPlainText } = await markdown();
  const source = 'An <iframe src="https://example.com/"> frame </iframe> and ![Illustration](https://example.com/media.png) [one](http://example.com) [two](https://user@example.com) [three](/local) [four](javascript:alert)';
  assert.deepEqual(tags(parseDescriptionMarkdown(source)), ['p']);
  assert.match(descriptionPlainText(source, true), /<iframe.*Illustration one two three four/);
});

test('controller registration uses the closest native owner and cleans up', async () => {
  const { updateDescriptionLinkNavigation, clearDescriptionLinkNavigation } = await markdown();
  const outer = { isConnected: true };
  const inner = { isConnected: true, parentElement: outer };
  const link = {};
  const panel = { isConnected: true, parentElement: inner, querySelectorAll: () => [link] };
  const calls = [];
  const tree = {
    CreateNode(parent) {
      calls.push(parent.Element);
      return {
        SetProperties: props => calls.push(props.focusable),
        OnMount: element => calls.push(element),
        OnUnmount: () => calls.push('removed'),
      };
    },
  };
  tree.Root = { Element: outer, Tree: tree, m_rgChildren: [{ Element: inner, Tree: tree }] };
  updateDescriptionLinkNavigation(panel, [tree]);
  updateDescriptionLinkNavigation(panel, [tree]);
  clearDescriptionLinkNavigation(panel);
  assert.deepEqual(calls, [inner, true, link, 'removed']);
});
