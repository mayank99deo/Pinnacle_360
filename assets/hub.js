/* Pinnacle 360 — hub logic.
 * Reads window.PINNACLE from registry.js plus anything added through
 * "Add a link" (kept in this browser's localStorage). No build step, no
 * network: open index.html straight from disk. */
(() => {
  'use strict';

  const REG = window.PINNACLE || { spaces: [], items: [] };
  const KINDS = {
    deck: { label: 'Deck', plural: 'Decks', icon: 'i-deck' },
    mvp: { label: 'MVP', plural: 'Product MVPs', icon: 'i-mvp' },
    doc: { label: 'Document', plural: 'Documents', icon: 'i-doc' },
  };
  const STATUS = { idea: 'Idea', proposal: 'Proposal', pilot: 'Pilot', mvp: 'MVP', live: 'Live' };
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

  const store = {
    get(k, d) { try { const v = localStorage.getItem('p360.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('p360.' + k, JSON.stringify(v)); } catch (e) {} },
  };

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls) => `<svg${cls ? ` class="${cls}"` : ''} aria-hidden="true"><use href="#${id}"/></svg>`;
  const fmtDate = s => {
    if (!s) return '—';
    const d = new Date(s + 'T00:00:00');
    return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /* ── Data ──────────────────────────────────────────────────── */

  let spaces = [], items = [], byId = new Map();

  function load() {
    const regSpaces = REG.spaces || [];
    const localSpaces = store.get('spaces', []).filter(s => !regSpaces.some(r => r.id === s.id));
    spaces = regSpaces.concat(localSpaces.map(s => Object.assign({}, s, { local: true })));
    const regItems = REG.items || [];
    const localItems = store.get('items', []).filter(i => !regItems.some(r => r.id === i.id));
    items = regItems.concat(localItems.map(i => Object.assign({}, i, { local: true }))).map(normalize);
    byId = new Map(items.map(i => [i.id, i]));
  }

  function normalize(it) {
    const kind = KINDS[it.kind] ? it.kind : 'doc';
    const href = it.path || it.url || '';
    const slides = (it.slides || []).map(s => (typeof s === 'string' ? { title: s } : s));
    const space = spaces.find(s => s.id === it.space);
    const n = Object.assign({}, it, {
      kind, href, slides,
      sheet: it.sheet || (space ? space.code + '-?' : '—'),
      status: STATUS[it.status] ? it.status : 'idea',
      tags: it.tags || [],
      highlights: it.highlights || [],
      opensIn: it.open || (kind === 'mvp' ? 'tab' : 'viewer'),
      thumbs: slides.filter(s => s.thumb).map(s => s.thumb),
    });
    n.cover = it.thumb || n.thumbs[0] || '';
    n.fields = searchFields(n, space);
    return n;
  }

  /* ── Search ────────────────────────────────────────────────── */

  const fold = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const words = s => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

  function searchFields(it, space) {
    const f = [
      { key: 'title', w: 10, text: it.title },
      { key: 'sheet', w: 9, text: it.sheet },
      { key: 'tags', w: 6, label: 'Keywords', text: it.tags.join(', ') },
      { key: 'problem', w: 5, text: it.problem },
      { key: 'space', w: 4, label: 'Problem space', text: space ? `${space.code} ${space.name}` : '' },
      { key: 'kind', w: 3, label: 'Type', text: `${KINDS[it.kind].label} ${KINDS[it.kind].plural} ${STATUS[it.status]}` },
      { key: 'summary', w: 3, label: 'Summary', text: it.summary },
      { key: 'highlights', w: 2, label: 'Key numbers', text: it.highlights.map(h => `${h.value} ${h.label}`).join(' · ') },
      { key: 'audience', w: 2, label: 'Audience', text: it.audience },
      { key: 'link', w: 1, label: 'Link', text: it.href },
    ];
    it.slides.forEach((s, i) => {
      f.push({ key: 'slide', w: 4, label: `Slide ${i + 1}`, text: s.title, slide: i });
      if (s.notes) f.push({ key: 'notes', w: 1.5, label: `Slide ${i + 1} · ${s.title} · notes`, text: s.notes, slide: i });
    });
    return f.filter(x => x.text).map(x => Object.assign(x, { folded: fold(x.text), words: words(x.text) }));
  }

  function match(it, tokens) {
    let score = 0;
    const hits = [];
    for (const t of tokens) {
      let best = null;
      for (const f of it.fields) {
        let s = 0;
        if (f.words.includes(t)) s = f.w * 1.5;
        else if (f.words.some(w => w.startsWith(t))) s = f.w;
        else if (t.length >= 3 && f.folded.includes(t)) s = f.w * 0.5;
        if (s && (!best || s > best.s)) best = { s, f };
      }
      if (!best) return null;
      score += best.s;
      hits.push(best.f);
    }
    // Explain matches that aren't already visible on the card.
    const shown = new Set(['title', 'sheet', 'problem', 'kind']);
    const why = hits.find(f => !shown.has(f.key)) || null;
    return { score, why };
  }

  function highlight(text, tokens) {
    if (!tokens.length) return esc(text);
    const re = new RegExp('(?<![a-z0-9])(' + tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    let out = '', last = 0;
    String(text).replace(re, (m, g, i) => { out += esc(text.slice(last, i)) + '<mark>' + esc(m) + '</mark>'; last = i + m.length; return m; });
    return out + esc(text.slice(last));
  }

  function snippet(f, tokens) {
    const text = f.text;
    if (text.length <= 150) return highlight(text, tokens);
    const at = tokens.map(t => f.folded.indexOf(t)).filter(i => i >= 0).sort((a, b) => a - b)[0] || 0;
    let from = Math.max(0, at - 60), to = Math.min(text.length, from + 150);
    if (from > 0) from = text.indexOf(' ', from) + 1 || from;
    return (from > 0 ? '…' : '') + highlight(text.slice(from, to), tokens) + (to < text.length ? '…' : '');
  }

  /* ── State + URL ───────────────────────────────────────────── */

  const state = {
    kind: 'all',
    space: null,
    q: '',
    view: store.get('view', 'grid'),
    sort: store.get('sort', 'updated'),
  };
  let run = [];
  let recent = [];

  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    state.kind = KINDS[p.get('kind')] ? p.get('kind') : 'all';
    state.space = spaces.some(s => s.id === p.get('space')) ? p.get('space') : null;
    state.q = p.get('q') || '';
    return { open: p.get('open'), slide: Math.max(0, (parseInt(p.get('slide'), 10) || 1) - 1) };
  }

  function writeHash() {
    const p = new URLSearchParams();
    if (state.kind !== 'all') p.set('kind', state.kind);
    if (state.space) p.set('space', state.space);
    if (state.q) p.set('q', state.q);
    if (viewer.item) {
      p.set('open', viewer.item.id);
      if (viewer.slide > 0) p.set('slide', viewer.slide + 1);
    }
    const h = p.toString();
    try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch (e) {}
  }

  /* ── Sidebar ───────────────────────────────────────────────── */

  function renderSide() {
    const count = k => items.filter(i => k === 'all' || i.kind === k).length;
    const kinds = [['all', 'All items', 'i-all']].concat(Object.entries(KINDS).map(([k, v]) => [k, v.plural, v.icon]));
    $('#kindNav').innerHTML = kinds.map(([k, label, ic]) => `
      <li><button class="nav-item" type="button" data-kind="${k}" aria-current="${state.kind === k && !state.space}">
        ${icon(ic)}<span>${label}</span><span class="n">${count(k)}</span>
      </button></li>`).join('');

    const used = spaces.filter(s => items.some(i => i.space === s.id));
    $('#spaceNav').innerHTML = used.length
      ? used.map(s => `
        <li><button class="nav-item" type="button" data-space="${esc(s.id)}" aria-current="${state.space === s.id}" title="${esc(s.blurb || '')}">
          <span class="space-code">${esc(s.code)}</span><span>${esc(s.name)}</span><span class="n">${items.filter(i => i.space === s.id).length}</span>
        </button></li>`).join('')
      : '<li class="side-empty">Spaces appear as you add items.</li>';

    const rec = recent.map(id => byId.get(id)).filter(Boolean).slice(0, 5);
    $('#recentGroup').hidden = !rec.length;
    $('#recentNav').innerHTML = rec.map(it => `
      <li><button class="nav-item" type="button" data-act="open" data-id="${esc(it.id)}" title="${esc(it.title)}">
        ${icon(KINDS[it.kind].icon)}<span class="recent-title">${esc(it.title)}</span>
      </button></li>`).join('');
  }

  /* ── Hero: next up ─────────────────────────────────────────── */

  const hero = { id: null, slide: 0, frame: null, bridged: false };

  function heroPick() {
    const first = run.map(id => byId.get(id)).find(Boolean);
    if (first) return { it: first, why: 'First on your run-sheet' };
    const decks = items.filter(i => i.kind === 'deck' && i.href).sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
    return decks[0] ? { it: decks[0], why: 'Latest deck' } : null;
  }

  function renderHero() {
    const el = $('#hero');
    const show = state.kind === 'all' && !state.space && !state.q;
    const pick = heroPick();
    if (!show || !pick) { el.hidden = true; return; }
    el.hidden = false;
    const { it, why } = pick;
    const key = it.id + '|' + why;
    if (hero.id === key) { paintHeroRun(it); return; }
    hero.id = key;
    hero.slide = 0;
    hero.bridged = false;

    const live = it.kind === 'deck' && it.opensIn === 'viewer' && it.href && !REDUCED.matches;
    const stage = live
      ? `<iframe id="heroFrame" title="Live preview of ${esc(it.title)}" tabindex="-1" src="${esc(it.href)}?_snthumb=1#1"></iframe>`
      : it.cover
        ? `<img id="heroImg" src="${esc(it.cover)}" alt="">`
        : placeholder(it);
    const strip = it.slides.length > 1 ? `
      <div class="hero-strip" role="group" aria-label="Choose a starting slide" style="--n:${Math.min(it.slides.length, 6)}">
        ${it.slides.map((s, i) => `
          <button class="strip-thumb" type="button" data-hero-slide="${i}" aria-current="${i === 0}">
            <span class="img" style="${s.thumb ? `background-image:url('${esc(s.thumb)}')` : ''}"></span>
            <span class="lbl"><b>${i + 1}</b>${esc(s.title)}</span>
          </button>`).join('')}
      </div>` : '';
    const facts = it.highlights.length ? `
      <div class="hero-facts">
        ${it.highlights.map(h => `<div class="fact"><b>${esc(h.value)}</b><span>${esc(h.label)}</span></div>`).join('')}
      </div>` : '';
    el.innerHTML = `
      <div class="hero-stage">
        <div class="hero-frame">
          ${stage}
          <button class="hero-hit" type="button" data-act="present-hero" data-id="${esc(it.id)}" aria-label="${it.opensIn === 'tab' ? 'Launch' : 'Present'} ${esc(it.title)}">
            <span class="play">${icon(it.opensIn === 'tab' ? 'i-ext' : 'i-play')}<span id="heroPlayLbl">${it.opensIn === 'tab' ? 'Launch MVP' : 'Present from slide 1'}</span></span>
          </button>
        </div>
        ${strip}
      </div>
      <div class="hero-info">
        <div class="hero-copy">
          <p class="hero-why"><span class="code">${esc(it.sheet)}</span><span>${esc(why)}</span><span class="chip st-${it.status}">${STATUS[it.status]}</span></p>
          <h2 class="hero-title">${esc(it.title)}</h2>
          ${it.problem ? `<p class="hero-problem">${esc(it.problem)}</p>` : ''}
          ${facts}
          <div class="hero-actions">
            <button class="btn btn-primary" type="button" data-act="present-hero" data-id="${esc(it.id)}">${icon(it.opensIn === 'tab' ? 'i-ext' : 'i-play')}${it.opensIn === 'tab' ? 'Launch' : 'Present'}</button>
            <button class="btn btn-line" type="button" data-act="details" data-id="${esc(it.id)}">${icon('i-info')}Details</button>
            <button class="btn btn-quiet" type="button" data-act="run" data-id="${esc(it.id)}" id="heroRun"></button>
          </div>
        </div>
      </div>`;
    paintHeroRun(it);

    hero.frame = $('#heroFrame');
    if (hero.frame) {
      hero.frame.addEventListener('load', () => {
        post(hero.frame, { __omelette_presenting: true });
        post(hero.frame, { pinnacle: 1, type: 'hello' });
      });
    }
  }

  // Updated in place so queueing an item doesn't reload the live preview.
  function paintHeroRun(it) {
    const b = $('#heroRun');
    if (!b) return;
    const on = run.includes(it.id);
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = icon(on ? 'i-queued' : 'i-queue') + (on ? 'On run-sheet' : 'Add to run-sheet');
  }

  function setHeroSlide(i, fromDeck) {
    const it = byId.get((hero.id || '').split('|')[0]);
    if (!it) return;
    hero.slide = i;
    document.querySelectorAll('[data-hero-slide]').forEach(b => b.setAttribute('aria-current', String(+b.dataset.heroSlide === i)));
    const lbl = $('#heroPlayLbl');
    if (lbl && it.opensIn !== 'tab') lbl.textContent = 'Present from slide ' + (i + 1);
    if (fromDeck) return;
    if (hero.frame && hero.bridged) post(hero.frame, { pinnacle: 1, type: 'goto', index: i });
    else if (hero.frame) hero.frame.src = `${it.href}?_snthumb=1&r=${Date.now()}#${i + 1}`;
    else if ($('#heroImg') && it.slides[i] && it.slides[i].thumb) $('#heroImg').src = it.slides[i].thumb;
  }

  /* ── Register ──────────────────────────────────────────────── */

  function visible() {
    let list = items;
    if (state.kind !== 'all') list = list.filter(i => i.kind === state.kind);
    if (state.space) list = list.filter(i => i.space === state.space);
    const tokens = words(state.q);
    if (tokens.length) {
      return {
        tokens,
        rows: list.map(it => ({ it, m: match(it, tokens) })).filter(r => r.m).sort((a, b) => b.m.score - a.m.score),
      };
    }
    const by = {
      updated: (a, b) => String(b.updated || '').localeCompare(String(a.updated || '')),
      sheet: (a, b) => a.sheet.localeCompare(b.sheet, undefined, { numeric: true }),
      title: (a, b) => a.title.localeCompare(b.title),
    }[state.sort] || (() => 0);
    return { tokens, rows: list.slice().sort(by).map(it => ({ it, m: null })) };
  }

  function renderRegister() {
    const { tokens, rows } = visible();
    const space = spaces.find(s => s.id === state.space);
    const scope = state.space ? space.name : state.kind !== 'all' ? KINDS[state.kind].plural : '';

    let title, sub;
    if (tokens.length) {
      title = `Results for “${state.q.trim()}”`;
      sub = rows.length
        ? `${plural(rows.length, 'match', 'matches')}${scope ? ' in ' + scope : ''}. Enter opens the first one.`
        : `No matches${scope ? ' in ' + scope : ''}.`;
    } else if (space) {
      title = space.name;
      sub = space.blurb || '';
    } else if (state.kind === 'deck') {
      title = 'Decks';
      sub = 'Click a sheet to present it. Hover the preview to flip through its slides.';
    } else if (state.kind === 'mvp') {
      title = 'Product MVPs';
      sub = 'Each MVP opens on its own in a new tab.';
    } else if (state.kind === 'doc') {
      title = 'Documents';
      sub = 'Reports, PDFs and other pages.';
    } else {
      title = 'All items';
      const c = k => items.filter(i => i.kind === k).length;
      const usedSpaces = spaces.filter(s => items.some(i => i.space === s.id)).length;
      sub = `${plural(c('deck'), 'deck', 'decks')}, ${plural(c('mvp'), 'MVP', 'MVPs')} and ${plural(c('doc'), 'document', 'documents')} across ${plural(usedSpaces, 'problem space', 'problem spaces')}.`;
    }
    $('#registerTitle').textContent = title;
    $('#registerSub').innerHTML = esc(sub) + (tokens.length && scope ? ` <button class="btn btn-quiet btn-sm" type="button" data-act="search-all">Search everything</button>` : '');
    $('#sort').disabled = !!tokens.length;
    $('#sort').value = state.sort;
    $('#viewGrid').setAttribute('aria-pressed', String(state.view === 'grid'));
    $('#viewList').setAttribute('aria-pressed', String(state.view === 'list'));

    const out = $('#results');
    if (!rows.length) { out.innerHTML = emptyState(tokens); return; }

    if (state.view === 'list') { out.innerHTML = tableHTML(rows, tokens); return; }

    // Group by problem space unless searching or already inside one space.
    if (tokens.length || state.space) {
      out.innerHTML = `<div class="grid">${rows.map(r => cardHTML(r.it, r.m, tokens)).join('')}</div>`;
      return;
    }
    const groups = spaces.map(s => ({ s, rows: rows.filter(r => r.it.space === s.id) })).filter(g => g.rows.length);
    const loose = rows.filter(r => !spaces.some(s => s.id === r.it.space));
    if (loose.length) groups.push({ s: { code: '—', name: 'Not in a problem space', blurb: 'Give these a `space` in registry.js.' }, rows: loose });
    out.innerHTML = groups.map(g => `
      <section class="group" aria-label="${esc(g.s.name)}">
        <header class="group-head">
          <span class="space-code">${esc(g.s.code)}</span>
          <h2>${esc(g.s.name)}</h2>
          ${g.s.blurb ? `<p>${esc(g.s.blurb)}</p>` : ''}
          <span class="n">${plural(g.rows.length, 'item', 'items')}</span>
        </header>
        <div class="grid">${g.rows.map(r => cardHTML(r.it, null, [])).join('')}</div>
      </section>`).join('');
  }

  function placeholder(it) {
    let host = it.href;
    try { host = /^https?:/i.test(it.href) ? new URL(it.href).host : it.href.split('/').slice(-2, -1)[0] || it.href; } catch (e) {}
    return `
      <span class="ph">
        <span class="ph-bar"><i></i><i></i><i></i><span>${esc(it.href || 'No link yet')}</span></span>
        <span class="ph-host">${esc(it.kind === 'mvp' ? host || it.title : it.title)}</span>
        <span class="ph-kind">${it.kind === 'mvp' ? 'Opens standalone in a new tab' : KINDS[it.kind].label}</span>
      </span>`;
  }

  function cardHTML(it, m, tokens) {
    const n = it.thumbs.length;
    const thumb = it.cover
      ? `<img src="${esc(it.cover)}" alt="" loading="lazy">${n > 1 ? `<span class="slide-name">1 · ${esc(it.slides[0].title)}</span><span class="ticks">${it.thumbs.map((_, i) => `<i${i === 0 ? ' data-on' : ''}></i>`).join('')}</span>` : ''}`
      : placeholder(it);
    const why = m && m.why ? `<span class="sheet-match"><b>${esc(m.why.label || 'Match')}:</b> ${snippet(m.why, tokens)}</span>` : '';
    const inRun = run.includes(it.id);
    const verb = it.opensIn === 'tab' ? 'Launch' : 'Present';
    const third = it.kind === 'deck'
      ? { dt: 'Slides', dd: it.slides.length || '—' }
      : { dt: 'Status', dd: STATUS[it.status] };
    return `
      <article class="sheet" data-id="${esc(it.id)}">
        <button class="sheet-open" type="button" data-act="open" data-id="${esc(it.id)}" aria-label="${verb} ${esc(it.title)}">
          <span class="thumb" data-id="${esc(it.id)}">${thumb}</span>
          <span class="sheet-body">
            <span class="sheet-title">${highlight(it.title, tokens)}</span>
            ${it.problem ? `<span class="sheet-problem">${highlight(it.problem, tokens)}</span>` : ''}
            ${why}
          </span>
        </button>
        <dl class="titleblock">
          <div><dt>Sheet</dt><dd class="code">${highlight(it.sheet, tokens)}</dd></div>
          <div><dt>Type</dt><dd>${KINDS[it.kind].label}</dd></div>
          <div><dt>${third.dt}</dt><dd>${esc(third.dd)}</dd></div>
          <div><dt>Updated</dt><dd>${fmtDate(it.updated)}</dd></div>
        </dl>
        ${it.local ? '<span class="sheet-badge">This browser only</span>' : ''}
        <div class="sheet-tools">
          <button class="icon-btn" type="button" data-act="details" data-id="${esc(it.id)}" title="Details" aria-label="Details for ${esc(it.title)}">${icon('i-info')}</button>
          <button class="icon-btn${inRun ? ' in-run' : ''}" type="button" data-act="run" data-id="${esc(it.id)}" aria-pressed="${inRun}" title="${inRun ? 'Remove from run-sheet' : 'Add to run-sheet'}" aria-label="${inRun ? 'Remove from' : 'Add to'} run-sheet">${icon(inRun ? 'i-queued' : 'i-queue')}</button>
          <button class="icon-btn" type="button" data-act="tab" data-id="${esc(it.id)}" title="Open in a new tab" aria-label="Open ${esc(it.title)} in a new tab">${icon('i-ext')}</button>
        </div>
      </article>`;
  }

  function tableHTML(rows, tokens) {
    return `
      <div class="table-wrap"><table class="reg-table">
        <thead><tr><th>Sheet</th><th>Title and problem</th><th>Type</th><th>Status</th><th>Space</th><th>Updated</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.map(({ it, m }) => {
          const sp = spaces.find(s => s.id === it.space);
          const inRun = run.includes(it.id);
          return `
          <tr data-row="${esc(it.id)}">
            <td class="code">${highlight(it.sheet, tokens)}</td>
            <td><button class="t" type="button" data-act="open" data-id="${esc(it.id)}">${highlight(it.title, tokens)}</button>
              ${it.problem ? `<div class="p">${highlight(it.problem, tokens)}</div>` : ''}
              ${m && m.why ? `<div class="p"><b>${esc(m.why.label)}:</b> ${snippet(m.why, tokens)}</div>` : ''}</td>
            <td>${KINDS[it.kind].label}${it.kind === 'deck' && it.slides.length ? ` · ${it.slides.length} slides` : ''}</td>
            <td><span class="chip st-${it.status}">${STATUS[it.status]}</span></td>
            <td>${sp ? esc(sp.code) : '—'}</td>
            <td>${fmtDate(it.updated)}</td>
            <td class="acts">
              <button class="icon-btn" type="button" data-act="details" data-id="${esc(it.id)}" aria-label="Details">${icon('i-info')}</button>
              <button class="icon-btn${inRun ? ' in-run' : ''}" type="button" data-act="run" data-id="${esc(it.id)}" aria-pressed="${inRun}" aria-label="${inRun ? 'Remove from' : 'Add to'} run-sheet">${icon(inRun ? 'i-queued' : 'i-queue')}</button>
              <button class="icon-btn" type="button" data-act="tab" data-id="${esc(it.id)}" aria-label="Open in a new tab">${icon('i-ext')}</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  }

  function emptyState(tokens) {
    if (tokens.length) {
      return `<div class="empty">
        <h3>Nothing matches “${esc(state.q.trim())}”</h3>
        <p>Try one keyword, a sheet number like HR-001, or a tool name like HROne. Search covers titles, problem statements, keywords, slide titles and speaker notes.</p>
        <button class="btn btn-line" type="button" data-act="clear-search">Clear search</button>
      </div>`;
    }
    if (state.kind === 'mvp') {
      return `<div class="empty">
        <h3>No MVPs listed yet</h3>
        <p>Add a hosted MVP with “Add a link” to see it here right away. To keep it for good, list it in <b>registry.js</b>:</p>
        <pre>{
  id: 'leave-bot', sheet: 'HR-002', kind: 'mvp', space: 'hr', status: 'mvp',
  title: 'Leave Balance Bot',
  problem: 'Employees email HR to ask how much leave they have left.',
  url: 'https://leave-bot.vercel.app',
  tags: ['leave', 'HROne', 'chatbot'],
},</pre>
        <button class="btn btn-primary" type="button" data-act="add">${icon('i-plus')}Add a link</button>
      </div>`;
    }
    if (state.kind === 'doc') {
      return `<div class="empty">
        <h3>No documents yet</h3>
        <p>Put an HTML page or PDF in <b>library/docs/</b> and list it in registry.js with <b>kind: 'doc'</b> and its <b>path</b>. It opens in the presenter like a deck.</p>
        <button class="btn btn-line" type="button" data-act="add">${icon('i-plus')}Add a link instead</button>
      </div>`;
    }
    return `<div class="empty">
      <h3>Nothing here yet</h3>
      <p>Drop a deck folder into <b>library/decks/</b> and list it in <b>registry.js</b>. README.md walks through it.</p>
      <button class="btn btn-primary" type="button" data-act="add">${icon('i-plus')}Add a link</button>
    </div>`;
  }

  function render() {
    renderSide();
    renderHero();
    renderRegister();
    renderRunCount();
    writeHash();
  }

  /* ── Opening things ────────────────────────────────────────── */

  function openTab(it, slide) {
    if (!it.href) { toast('This item has no link yet. Add a path or url in registry.js.'); return; }
    const url = it.kind === 'deck' && slide ? `${it.href}#${slide + 1}` : it.href;
    window.open(url, '_blank', 'noopener');
    remember(it.id);
  }

  function open(it, opts) {
    if (!it) return;
    if (it.opensIn === 'tab') { openTab(it); toast(`Opened ${it.title} in a new tab`); return; }
    present(it, opts);
  }

  function remember(id) {
    recent = [id].concat(recent.filter(x => x !== id)).slice(0, 8);
    store.set('recent', recent);
    renderSide();
  }

  /* ── Presenter ─────────────────────────────────────────────── */

  const viewer = { item: null, slide: 0, total: 0, labels: [], notes: [], bridged: false, runAt: null, notesOn: store.get('notes', false), probe: 0 };
  const vEl = $('#viewer'), vFrame = $('#vFrame'), vStage = $('#vStage');

  function post(frame, msg) { try { frame.contentWindow.postMessage(msg, '*'); } catch (e) {} }

  function present(it, { slide = 0, runAt = null } = {}) {
    if (!it.href) { toast('This item has no link yet. Add a path or url in registry.js.'); return; }
    const reopen = !vEl.hidden;
    Object.assign(viewer, {
      item: it, slide, runAt, bridged: false,
      total: it.slides.length,
      labels: it.slides.map(s => s.title),
      notes: it.slides.map(s => s.notes || ''),
    });
    remember(it.id);
    $('#vCode').textContent = it.sheet;
    $('#vTitle').textContent = it.title;

    const launch = $('#vLaunch');
    if (it.opensIn === 'tab') {
      // MVPs in a run-sheet: they live in their own tab, so show a launch card.
      vFrame.hidden = true;
      vFrame.src = 'about:blank';
      launch.hidden = false;
      launch.innerHTML = `
        <div class="v-launch-card">
          <span class="code">${esc(it.sheet)}</span>
          <h3>${esc(it.title)}</h3>
          ${it.problem ? `<p>${esc(it.problem)}</p>` : ''}
          <button class="btn btn-primary" type="button" data-act="tab" data-id="${esc(it.id)}">${icon('i-ext')}Launch MVP in a new tab</button>
        </div>`;
    } else {
      launch.hidden = true;
      vFrame.hidden = false;
      vFrame.title = it.title;
      // closeViewer() blanks the frame, so this is always a fresh load that
      // starts at the requested slide (the deck reads #N on load).
      vFrame.src = it.href + (it.kind === 'deck' ? '#' + (slide + 1) : '');
      clearTimeout(viewer.probe);
      viewer.probe = setTimeout(() => { if (!viewer.bridged) renderViewerState(); }, 1500);
    }

    vEl.hidden = false;
    document.body.classList.add('locked');
    if (!reopen) closeDrawer();
    renderViewerState();
    writeHash();
    if (it.opensIn === 'tab') launch.querySelector('button').focus();
  }

  function closeViewer() {
    if (vEl.hidden) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const id = viewer.item && viewer.item.id;
    vEl.hidden = true;
    vFrame.src = 'about:blank';
    viewer.item = null;
    viewer.runAt = null;
    document.body.classList.remove('locked');
    writeHash();
    const back = id && document.querySelector(`.sheet[data-id="${CSS.escape(id)}"] .sheet-open`);
    if (back) back.focus({ preventScroll: true });
  }

  function renderViewerState() {
    const it = viewer.item;
    if (!it) return;
    const isDeck = it.opensIn === 'viewer' && (viewer.total > 0);
    const canNav = isDeck && viewer.bridged;
    $('#vNav').hidden = !isDeck;
    $('#vPrev').disabled = !canNav || viewer.slide <= 0;
    $('#vNext').disabled = !canNav || viewer.slide >= viewer.total - 1;
    $('#vCount').innerHTML = isDeck
      ? `<b>${viewer.slide + 1}</b> / ${viewer.total}${viewer.labels[viewer.slide] ? ' · ' + esc(viewer.labels[viewer.slide]) : ''}`
      : '';
    $('#vFull').disabled = it.opensIn === 'tab';
    $('#vNotes').hidden = !isDeck;
    $('#vNotes').setAttribute('aria-pressed', String(viewer.notesOn));

    const panel = $('#vNotesPanel');
    panel.hidden = !(isDeck && viewer.notesOn);
    if (!panel.hidden) {
      const note = viewer.notes[viewer.slide];
      panel.innerHTML = `<h3>Speaker notes · slide ${viewer.slide + 1}</h3>
        <p class="slide-t">${esc(viewer.labels[viewer.slide] || '')}</p>
        ${note ? `<p>${esc(note)}</p>` : '<p class="none">No notes on this slide.</p>'}`;
    }

    const strip = $('#vStrip');
    strip.hidden = !isDeck || viewer.total < 2;
    if (!strip.hidden) {
      strip.innerHTML = Array.from({ length: viewer.total }, (_, i) => {
        const s = it.slides[i] || {};
        const lbl = viewer.labels[i] || 'Slide ' + (i + 1);
        return `<button class="strip-thumb" type="button" data-v-slide="${i}" aria-current="${i === viewer.slide}">
          ${s.thumb ? `<span class="img" style="background-image:url('${esc(s.thumb)}')"></span>` : `<span class="img label-only">${esc(lbl)}</span>`}
          <span class="lbl"><b>${i + 1}</b>${esc(lbl)}</span>
        </button>`;
      }).join('');
      const cur = strip.querySelector('[aria-current="true"]');
      if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    const r = $('#vRun');
    r.hidden = viewer.runAt == null;
    if (!r.hidden) {
      const nextIt = byId.get(run[viewer.runAt + 1]);
      $('#vRunPos').textContent = `Run-sheet ${viewer.runAt + 1} of ${run.length}`;
      $('#vRunPrev').disabled = viewer.runAt <= 0;
      $('#vRunNext').disabled = !nextIt;
      $('#vRunNext').title = nextIt ? 'Next: ' + nextIt.title : 'This is the last item';
    }
  }

  function gotoSlide(i) {
    if (!viewer.item) return;
    i = Math.max(0, Math.min(viewer.total - 1, i));
    if (viewer.bridged) post(vFrame, { pinnacle: 1, type: 'goto', index: i });
    else {
      // Deck without the bridge: reload it at the chosen slide.
      viewer.slide = i;
      vFrame.src = `${viewer.item.href}?r=${Date.now()}#${i + 1}`;
      renderViewerState();
      writeHash();
    }
  }
  const step = d => {
    if (!viewer.item || !viewer.bridged) return;
    post(vFrame, { pinnacle: 1, type: d > 0 ? 'next' : 'prev' });
  };

  function toggleFull() {
    if (!viewer.item || viewer.item.opensIn === 'tab') return;
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    const req = vStage.requestFullscreen ? vStage.requestFullscreen() : null;
    if (req && req.catch) req.catch(() => toast('The browser blocked full screen. Use the Full screen button.'));
  }

  function toggleNotes() {
    viewer.notesOn = !viewer.notesOn;
    store.set('notes', viewer.notesOn);
    renderViewerState();
  }

  function runStep(d) {
    if (viewer.runAt == null) return;
    const at = viewer.runAt + d;
    const it = byId.get(run[at]);
    if (it) present(it, { runAt: at });
  }

  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    if (viewer.item) post(vFrame, { __omelette_presenting: on });
    if (on) try { vFrame.contentWindow.focus(); } catch (e) {}
  });

  vFrame.addEventListener('load', () => {
    if (!viewer.item || vFrame.src === 'about:blank') return;
    post(vFrame, { __omelette_preview_mode: true });
    post(vFrame, { pinnacle: 1, type: 'hello' });
    try { vFrame.contentWindow.focus(); } catch (e) {}
  });

  window.addEventListener('message', e => {
    const d = e.data;
    if (!d || d.pinnacle !== 1) return;
    if (viewer.item && e.source === vFrame.contentWindow) {
      if (d.type === 'slide') {
        viewer.bridged = true;
        viewer.slide = d.index;
        viewer.total = d.total;
        viewer.labels = Array.from({ length: d.total }, (_, i) => (viewer.item.slides[i] && viewer.item.slides[i].title) || (d.labels && d.labels[i]) || 'Slide ' + (i + 1));
        viewer.notes = Array.from({ length: d.total }, (_, i) => (d.notes && d.notes[i]) || (viewer.item.slides[i] && viewer.item.slides[i].notes) || '');
        renderViewerState();
        writeHash();
      } else if (d.type === 'key') {
        if (d.key === 'Escape' && !document.fullscreenElement) closeViewer();
        else if (d.key === 'f' || d.key === 'F') toggleFull();
        else if (d.key === 'n' || d.key === 'N') toggleNotes();
      }
    } else if (hero.frame && e.source === hero.frame.contentWindow && d.type === 'slide') {
      hero.bridged = true;
      if (d.index !== hero.slide) setHeroSlide(d.index, true);
    }
  });

  $('#vClose').addEventListener('click', closeViewer);
  $('#vPrev').addEventListener('click', () => step(-1));
  $('#vNext').addEventListener('click', () => step(1));
  $('#vNotes').addEventListener('click', toggleNotes);
  $('#vFull').addEventListener('click', toggleFull);
  $('#vTab').addEventListener('click', () => viewer.item && openTab(viewer.item, viewer.slide));
  $('#vRunPrev').addEventListener('click', () => runStep(-1));
  $('#vRunNext').addEventListener('click', () => runStep(1));
  $('#vStrip').addEventListener('click', e => {
    const b = e.target.closest('[data-v-slide]');
    if (b) gotoSlide(+b.dataset.vSlide);
  });

  /* ── Drawer: details + run-sheet ───────────────────────────── */

  const drawer = $('#drawer'), scrim = $('#scrim');
  let drawerReturn = null;

  function openDrawer(html, from) {
    drawer.innerHTML = html;
    drawer.hidden = false;
    scrim.hidden = false;
    document.body.classList.add('locked');
    drawerReturn = from || document.activeElement;
    const f = drawer.querySelector('.drawer-head .icon-btn');
    if (f) f.focus();
  }
  function closeDrawer() {
    if (drawer.hidden) return;
    drawer.hidden = true;
    scrim.hidden = true;
    drawer.dataset.view = '';
    if (vEl.hidden) document.body.classList.remove('locked');
    if (drawerReturn && document.contains(drawerReturn)) drawerReturn.focus({ preventScroll: true });
  }
  scrim.addEventListener('click', closeDrawer);

  function details(it) {
    const sp = spaces.find(s => s.id === it.space);
    const inRun = run.includes(it.id);
    const verb = it.opensIn === 'tab' ? 'Launch' : 'Present';
    const slides = it.slides.length ? `
      <div class="d-section"><h3>${plural(it.slides.length, 'slide', 'slides')} · click one to start there</h3>
        <div class="d-slides">${it.slides.map((s, i) => `
          <button class="d-slide" type="button" data-act="present-at" data-id="${esc(it.id)}" data-slide="${i}">
            <span class="img" style="${s.thumb ? `background-image:url('${esc(s.thumb)}')` : ''}"></span>
            <span class="txt"><b>${i + 1}. ${esc(s.title)}</b>${s.notes ? `<span>${esc(s.notes)}</span>` : ''}</span>
          </button>`).join('')}
        </div></div>` : '';
    const facts = it.highlights.length ? `
      <div class="d-section"><h3>Key numbers</h3><div class="hero-facts">
        ${it.highlights.map(h => `<div class="fact"><b>${esc(h.value)}</b><span>${esc(h.label)}</span></div>`).join('')}
      </div></div>` : '';
    const tags = it.tags.length ? `
      <div class="d-section"><h3>Keywords · click to search</h3><div class="d-tags">
        ${it.tags.map(t => `<button class="tag" type="button" data-act="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
      </div></div>` : '';
    const local = it.local ? `
      <div class="d-local">
        <b>Saved on this browser only.</b> To keep it for good and show it on other machines, copy its registry entry and paste it into the <b>items</b> list in registry.js.
        <div class="d-actions">
          <button class="btn btn-line btn-sm" type="button" data-act="copy-entry" data-id="${esc(it.id)}">${icon('i-copy')}Copy registry entry</button>
          <button class="btn btn-quiet btn-sm" type="button" data-act="remove-local" data-id="${esc(it.id)}">${icon('i-trash')}Remove</button>
        </div>
      </div>` : '';

    drawer.dataset.view = 'details:' + it.id;
    openDrawer(`
      <div class="drawer-head">
        <span class="code">${esc(it.sheet)}</span>
        <span class="chip st-${it.status}">${STATUS[it.status]}</span>
        <button class="icon-btn" type="button" data-act="close-drawer" aria-label="Close details">${icon('i-x')}</button>
      </div>
      <div class="drawer-body">
        <h2 class="d-title" id="drawerTitle">${esc(it.title)}</h2>
        ${it.problem ? `<p class="d-problem">${esc(it.problem)}</p>` : ''}
        ${it.summary ? `<p class="d-summary">${esc(it.summary)}</p>` : ''}
        <div class="d-actions">
          <button class="btn btn-primary" type="button" data-act="open" data-id="${esc(it.id)}">${icon(it.opensIn === 'tab' ? 'i-ext' : 'i-play')}${verb}</button>
          ${it.opensIn === 'viewer' ? `<button class="btn btn-line" type="button" data-act="tab" data-id="${esc(it.id)}">${icon('i-ext')}New tab</button>` : ''}
          <button class="btn btn-line" type="button" data-act="run" data-id="${esc(it.id)}" aria-pressed="${inRun}">${icon(inRun ? 'i-queued' : 'i-queue')}${inRun ? 'On run-sheet' : 'Add to run-sheet'}</button>
          <button class="btn btn-quiet" type="button" data-act="copy-link" data-id="${esc(it.id)}">${icon('i-copy')}Copy link</button>
        </div>
        ${local}
        ${facts}
        ${slides}
        <div class="d-section"><h3>Title block</h3>
          <dl class="d-block">
            <div><dt>Type</dt><dd>${KINDS[it.kind].label}</dd></div>
            <div><dt>Problem space</dt><dd>${sp ? `${esc(sp.code)} · ${esc(sp.name)}` : '—'}</dd></div>
            <div><dt>Audience</dt><dd>${esc(it.audience || '—')}</dd></div>
            <div><dt>Owner</dt><dd>${esc(it.owner || REG.owner || '—')}</dd></div>
            <div><dt>Updated</dt><dd>${fmtDate(it.updated)}</dd></div>
            <div><dt>Opens in</dt><dd>${it.opensIn === 'tab' ? 'Its own tab' : 'Presenter'}</dd></div>
            <div class="wide"><dt>Location</dt><dd>${esc(it.href || 'Not set')}</dd></div>
          </dl>
        </div>
        ${tags}
      </div>`);
  }

  function runSheet() {
    const list = run.map(id => byId.get(id)).filter(Boolean);
    drawer.dataset.view = 'run';
    const body = list.length
      ? `<ol class="run-list">${list.map((it, i) => `
          <li class="run-row">
            <span class="num">${i + 1}</span>
            <div><span class="meta"><span class="code">${esc(it.sheet)}</span> · ${KINDS[it.kind].label}</span><b>${esc(it.title)}</b></div>
            <div class="ctl">
              <button class="icon-btn" type="button" data-act="run-up" data-i="${i}" aria-label="Move ${esc(it.title)} up" ${i === 0 ? 'disabled' : ''}>${icon('i-up')}</button>
              <button class="icon-btn" type="button" data-act="run-down" data-i="${i}" aria-label="Move ${esc(it.title)} down" ${i === list.length - 1 ? 'disabled' : ''}>${icon('i-down')}</button>
              <button class="icon-btn" type="button" data-act="run-remove" data-i="${i}" aria-label="Remove ${esc(it.title)}">${icon('i-x')}</button>
            </div>
          </li>`).join('')}</ol>`
      : `<div class="empty"><h3>Nothing queued</h3><p>Use the run-sheet button on any sheet to line up what you'll show in your next meeting. Then present it all in order without coming back to the library.</p></div>`;
    const html = `
      <div class="drawer-head">
        <h2 class="d-title" id="drawerTitle" style="font-size:20px">Run-sheet</h2>
        <button class="icon-btn" type="button" data-act="close-drawer" aria-label="Close run-sheet">${icon('i-x')}</button>
      </div>
      <div class="drawer-body">
        ${list.length ? '<p class="run-intro">Your meeting order. Present it start to finish; the presenter shows what’s next.</p>' : ''}
        ${body}
      </div>
      ${list.length ? `<div class="drawer-foot">
        <button class="btn btn-primary" type="button" data-act="run-start">${icon('i-play')}Present run-sheet</button>
        <button class="btn btn-quiet" type="button" data-act="run-clear">Clear</button>
      </div>` : ''}`;
    if (drawer.hidden) openDrawer(html, $('#runBtn'));
    else { drawer.innerHTML = html; }
  }

  function refreshDrawer() {
    const v = drawer.dataset.view || '';
    if (drawer.hidden) return;
    if (v === 'run') runSheet();
    else if (v.startsWith('details:')) {
      const it = byId.get(v.slice(8));
      if (it) { const keep = drawerReturn; drawer.hidden = true; details(it); drawerReturn = keep; } else closeDrawer();
    }
  }

  function renderRunCount() {
    run = run.filter(id => byId.has(id));
    const c = $('#runCount');
    c.textContent = run.length;
    if (run.length) c.removeAttribute('data-zero'); else c.setAttribute('data-zero', '');
  }

  function saveRun() {
    store.set('run', run);
    hero.id = null;
    renderRunCount();
    renderHero();
    renderRegister();
    refreshDrawer();
  }

  function toggleRun(id) {
    const it = byId.get(id);
    if (!it) return;
    const had = run.includes(id);
    run = had ? run.filter(x => x !== id) : run.concat(id);
    saveRun();
    toast(had ? `Removed from run-sheet` : `Added to run-sheet · ${run.length} queued`);
  }

  /* ── Clipboard ─────────────────────────────────────────────── */

  function copy(text, done) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove();
      toast(ok ? done : 'Copy failed. Select the text manually.');
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast(done), fallback);
    else fallback();
  }

  function registryEntry(it) {
    const o = { id: it.id, sheet: it.sheet, kind: it.kind, space: it.space, status: it.status, title: it.title, problem: it.problem, updated: it.updated };
    o[/^https?:/i.test(it.href) ? 'url' : 'path'] = it.href;
    if (it.tags.length) o.tags = it.tags;
    const body = Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n');
    let entry = `{\n${body}\n},`;
    const sp = spaces.find(s => s.id === it.space);
    if (sp && sp.local) entry = `// Also add this to "spaces":\n// ${JSON.stringify({ id: sp.id, code: sp.code, name: sp.name })},\n` + entry;
    return entry;
  }

  /* ── Add a link ────────────────────────────────────────────── */

  const dlg = $('#addDialog'), form = $('#addForm');

  function openAdd() {
    const sel = $('#fSpace');
    sel.innerHTML = spaces.map(s => `<option value="${esc(s.id)}">${esc(s.code)} · ${esc(s.name)}</option>`).join('') + '<option value="__new">New problem space…</option>';
    $('#formError').hidden = true;
    form.reset();
    form.querySelector(`input[name="kind"][value="${state.kind === 'deck' || state.kind === 'doc' ? state.kind : 'mvp'}"]`).checked = true;
    if (state.space) sel.value = state.space;
    $('#newSpaceRow').hidden = sel.value !== '__new';
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    $('#fTitle').focus();
  }
  $('#fSpace').addEventListener('change', e => { $('#newSpaceRow').hidden = e.target.value !== '__new'; });
  $('#addCancel').addEventListener('click', () => dlg.close());

  const slug = s => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'item';

  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(form);
    const title = String(f.get('title') || '').trim();
    const url = String(f.get('url') || '').trim();
    const err = msg => { const el = $('#formError'); el.textContent = msg; el.hidden = false; };
    if (!title) return err('Give it a title so you can find it later.');
    if (!url) return err('Add the link: a web address or a path inside this folder.');

    let spaceId = String(f.get('space') || '');
    const localSpaces = store.get('spaces', []);
    if (spaceId === '__new') {
      const name = String(f.get('spaceName') || '').trim();
      const code = String(f.get('spaceCode') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!name || !code) return err('A new problem space needs a name and a short code, like PD.');
      spaceId = slug(name);
      if (!spaces.some(s => s.id === spaceId)) localSpaces.push({ id: spaceId, code, name });
      store.set('spaces', localSpaces);
    }
    if (!spaceId) return err('Pick a problem space.');
    const allSpaces = spaces.concat(localSpaces);
    const sp = allSpaces.find(s => s.id === spaceId);

    let id = slug(title), n = 2;
    while (byId.has(id)) id = slug(title) + '-' + n++;
    const used = new Set(items.map(i => i.sheet));
    let k = items.filter(i => i.space === spaceId).length + 1, sheet;
    do { sheet = `${sp ? sp.code : 'X'}-${String(k++).padStart(3, '0')}`; } while (used.has(sheet));

    const kind = String(f.get('kind') || 'mvp');
    const item = {
      id, sheet, kind, space: spaceId,
      status: String(f.get('status') || 'mvp'),
      title,
      problem: String(f.get('problem') || '').trim(),
      updated: new Date().toISOString().slice(0, 10),
      tags: String(f.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean),
    };
    item[/^https?:/i.test(url) ? 'url' : 'path'] = url;
    store.set('items', store.get('items', []).concat(item));
    dlg.close();
    load();
    hero.id = null;
    render();
    toast(`Added ${title} as ${sheet}`);
  });

  /* ── Toast ─────────────────────────────────────────────────── */

  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.setAttribute('data-show', '');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.removeAttribute('data-show'), 2600);
  }

  /* ── Events ────────────────────────────────────────────────── */

  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-kind],[data-space]');
    if (nav && nav.closest('.side')) {
      if (nav.dataset.kind) { state.kind = nav.dataset.kind; state.space = null; }
      else { state.space = state.space === nav.dataset.space ? null : nav.dataset.space; state.kind = 'all'; }
      render();
      window.scrollTo({ top: 0 });
      return;
    }
    const hs = e.target.closest('[data-hero-slide]');
    if (hs) { setHeroSlide(+hs.dataset.heroSlide); return; }

    const a = e.target.closest('[data-act]');
    if (!a) {
      const row = e.target.closest('tr[data-row]');
      if (row) open(byId.get(row.dataset.row));
      return;
    }
    const it = byId.get(a.dataset.id);
    switch (a.dataset.act) {
      case 'open': open(it); break;
      case 'present-hero': open(it, { slide: hero.slide }); break;
      case 'present-at': present(it, { slide: +a.dataset.slide }); break;
      case 'tab': if (it) openTab(it); break;
      case 'details': if (it) details(it); break;
      case 'run': toggleRun(a.dataset.id); break;
      case 'close-drawer': closeDrawer(); break;
      case 'tag': closeDrawer(); setQuery(a.dataset.tag); break;
      case 'clear-search': setQuery(''); $('#q').focus(); break;
      case 'search-all': state.kind = 'all'; state.space = null; render(); break;
      case 'add': openAdd(); break;
      case 'copy-link': copy(location.href.split('#')[0] + '#open=' + encodeURIComponent(it.id), 'Link copied. Opening it goes straight to this item.'); break;
      case 'copy-entry': copy(registryEntry(it), 'Registry entry copied. Paste it into items in registry.js.'); break;
      case 'remove-local': {
        store.set('items', store.get('items', []).filter(x => x.id !== it.id));
        run = run.filter(x => x !== it.id);
        store.set('run', run);
        closeDrawer();
        load(); hero.id = null; render();
        toast(`Removed ${it.title}`);
        break;
      }
      case 'run-up': case 'run-down': {
        const i = +a.dataset.i, j = i + (a.dataset.act === 'run-up' ? -1 : 1);
        [run[i], run[j]] = [run[j], run[i]];
        saveRun();
        const again = drawer.querySelector(`[data-act="${a.dataset.act}"][data-i="${j}"]`) || drawer.querySelector('.run-row .icon-btn:not(:disabled)');
        if (again) again.focus();
        break;
      }
      case 'run-remove': run.splice(+a.dataset.i, 1); saveRun(); break;
      case 'run-clear': run = []; saveRun(); break;
      case 'run-start': {
        const first = byId.get(run[0]);
        if (first) present(first, { runAt: 0 });
        break;
      }
    }
  });

  // Hover-scrub: flip a deck's preview through its slides as the pointer moves across.
  const results = $('#results');
  results.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const th = e.target.closest('.thumb[data-id]');
    if (!th) return;
    const it = byId.get(th.dataset.id);
    if (!it || it.thumbs.length < 2) return;
    const r = th.getBoundingClientRect();
    const idx = Math.max(0, Math.min(it.thumbs.length - 1, Math.floor((e.clientX - r.left) / r.width * it.thumbs.length)));
    if (th.dataset.idx === String(idx)) return;
    setThumb(th, it, idx);
  });
  results.addEventListener('pointerout', e => {
    const th = e.target.closest('.thumb[data-id]');
    if (th && !th.contains(e.relatedTarget) && th.dataset.idx && th.dataset.idx !== '0') setThumb(th, byId.get(th.dataset.id), 0);
  });
  function setThumb(th, it, idx) {
    th.dataset.idx = idx;
    const s = it.slides.filter(x => x.thumb)[idx];
    th.querySelector('img').src = s.thumb;
    const name = th.querySelector('.slide-name');
    if (name) name.textContent = `${it.slides.indexOf(s) + 1} · ${s.title}`;
    th.querySelectorAll('.ticks i').forEach((t, i) => t.toggleAttribute('data-on', i === idx));
  }

  // Search box
  const q = $('#q');
  function setQuery(v) {
    q.value = v;
    state.q = v;
    syncSearchChrome();
    renderHero();
    renderRegister();
    writeHash();
  }
  function syncSearchChrome() {
    const has = !!q.value;
    $('#clearQ').hidden = !has;
    $('#slashKey').hidden = has;
    $('#searchHint').hidden = !(has && document.activeElement === q);
  }
  q.addEventListener('input', () => {
    state.q = q.value;
    syncSearchChrome();
    renderHero();
    renderRegister();
    writeHash();
  });
  q.addEventListener('focus', syncSearchChrome);
  q.addEventListener('blur', () => setTimeout(syncSearchChrome, 0));
  q.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = visible().rows[0];
      if (first) open(first.it);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (q.value) setQuery(''); else q.blur();
    } else if (e.key === 'ArrowDown') {
      const t = results.querySelector('.sheet-open, .reg-table .t');
      if (t) { e.preventDefault(); t.focus(); }
    }
  });
  $('#clearQ').addEventListener('click', () => { setQuery(''); q.focus(); });

  $('#home').addEventListener('click', e => {
    e.preventDefault();
    state.kind = 'all'; state.space = null;
    setQuery('');
    render();
  });
  $('#runBtn').addEventListener('click', () => (drawer.dataset.view === 'run' && !drawer.hidden ? closeDrawer() : runSheet()));
  $('#addBtn').addEventListener('click', openAdd);
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; store.set('sort', state.sort); renderRegister(); });
  $('#viewGrid').addEventListener('click', () => { state.view = 'grid'; store.set('view', 'grid'); renderRegister(); });
  $('#viewList').addEventListener('click', () => { state.view = 'list'; store.set('view', 'list'); renderRegister(); });

  const editable = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  document.addEventListener('keydown', e => {
    if (!vEl.hidden) {
      if (e.key === 'Escape') { if (!document.fullscreenElement) { e.preventDefault(); closeViewer(); } return; }
      if (editable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const onButton = e.target.tagName === 'BUTTON';
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !onButton)) { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
      else if (e.key === 'f' || e.key === 'F') toggleFull();
      else if (e.key === 'n' || e.key === 'N') toggleNotes();
      return;
    }
    if (dlg.open) return;
    if (!drawer.hidden && e.key === 'Escape') { closeDrawer(); return; }
    if ((e.key === '/' && !editable(e.target)) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      q.focus();
      q.select();
    }
  });

  window.addEventListener('hashchange', () => {
    const { open: id, slide } = readHash();
    q.value = state.q;
    syncSearchChrome();
    render();
    const it = id && byId.get(id);
    if (it && (!viewer.item || viewer.item.id !== id)) open(it, { slide });
  });

  REDUCED.addEventListener && REDUCED.addEventListener('change', () => { hero.id = null; renderHero(); });

  /* ── Boot ──────────────────────────────────────────────────── */

  load();
  run = store.get('run', []).filter(id => byId.has(id));
  recent = store.get('recent', []).filter(id => byId.has(id));
  const boot = readHash();
  q.value = state.q;
  syncSearchChrome();
  render();
  const bootItem = boot.open && byId.get(boot.open);
  // A new tab can't be opened without a click, so MVP links land on their details.
  if (bootItem) bootItem.opensIn === 'tab' ? details(bootItem) : present(bootItem, { slide: boot.slide });
})();
