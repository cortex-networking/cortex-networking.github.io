// Small DOM helpers.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Radio-style segmented control. */
export function segmented(label, options, value, onChange) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  for (const o of options) {
    const b = h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(o.value === value), disabled: !!o.disabled,
      onclick: () => {
        wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', 'false'));
        b.setAttribute('aria-checked', 'true');
        onChange(o.value);
      },
    }, o.label);
    wrap.append(b);
  }
  return wrap;
}

export function toggle(label, on, onChange) {
  const input = h('input', { type: 'checkbox', onchange: (e) => onChange(e.target.checked) });
  input.checked = !!on;
  return h('label', { class: 'toggle' }, input, h('span', { class: 'track', 'aria-hidden': 'true' }), label);
}

export function stars(n, of = 3) {
  const s = h('span', { class: 'stars', role: 'img', 'aria-label': `${n} of ${of} stars` });
  for (let i = 0; i < of; i++) s.append(h('span', { class: i < n ? 'on' : 'off' }, '★'));
  return s;
}
