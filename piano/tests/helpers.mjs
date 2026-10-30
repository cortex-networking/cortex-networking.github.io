// Test helpers: the smallest browser stand-ins the app modules need under `node --test`.
// Nothing here is loaded by the app itself.

/** localStorage replacement backed by a Map. */
export class MemoryStorage {
  constructor(init = {}) { this.m = new Map(Object.entries(init)); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
}

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.nodeType = 1; this.children = []; this.attrs = {};
    this.listeners = {}; this.className = ''; this.textContent = ''; this.style = {}; this.dataset = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener() {}
  append(...kids) { this.children.push(...kids); }
  appendChild(k) { this.children.push(k); return k; }
  remove() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  click() { for (const fn of this.listeners.click || []) fn({ target: this }); }
  /** All descendant text, for assertions. */
  get text() { return this.children.map((c) => (c.nodeType === 3 ? c.data : c.text)).join(''); }
}

/** Installs a minimal `document` (createElement/createTextNode) so ui.js `h()` works. */
export function installDom() {
  if (globalThis.document?.__fake) return globalThis.document;
  const doc = {
    __fake: true,
    createElement: (tag) => new FakeNode(tag),
    createElementNS: (ns, tag) => new FakeNode(tag),
    createTextNode: (data) => ({ nodeType: 3, data: String(data) }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  };
  globalThis.document = doc;
  globalThis.window ||= globalThis;
  globalThis.window.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.window.addEventListener ||= () => {};
  globalThis.window.removeEventListener ||= () => {};
  return doc;
}

/**
 * An object that accepts any method call and records it in `calls` as [name, method, args].
 * Explicit fields in `base` win.
 */
export function recorder(name, calls, base = {}) {
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol' || k === 'then') return undefined;
      return (...args) => { calls.push([name, k, args]); };
    },
  });
}

/** A fake app with a controllable audio clock. app.clock.t is the AudioContext time in seconds. */
export function fakeApp({ store, settings = {}, latency = 0 } = {}) {
  const calls = [];
  const clock = { t: 10 };
  const app = {
    calls, clock,
    settings: { latency: 0, hints: true, band: false, openAll: false, ...settings },
    sound: recorder('sound', calls, { get latency() { return latency; }, now: () => clock.t }),
    staff: recorder('staff', calls, { score: null }),
    keyboard: recorder('keyboard', calls),
    ui: recorder('ui', calls, { kicker: { textContent: '' }, title: { textContent: '' } }),
    input: { held: new Map() },
    store: store || { data: { lessons: {}, songs: {}, games: {}, coach: null }, root: {}, save() {}, lesson() { return null; }, song() { return null; } },
  };
  app.renderList = () => {};
  return app;
}
