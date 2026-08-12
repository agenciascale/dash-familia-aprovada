/* =========================================================================
   Dashboard Família Aprovada — "A Próxima Carreira" (Sala Secreta, venda direta)
   Lançamento com meta de ingressos (evento 27/08). 3 abas: Visão Geral · Tráfego · Relatório.
   Dados: window.DASH (data.js) — daily[] (funil/dia) + grain[] (dia × anúncio).
   Faturamento/vendas = Tutory (planilha de checkout, cruzada por UTM ao lançamento).
   Atribuição por anúncio = PIXEL (Adveronix, coluna Purchases) — sinal de otimização.
   CPA lido contra o LTV de R$467 (não contra o ingresso de R$47). Imposto ×1,1385.
   ========================================================================= */
(function () {
  "use strict";
  var D = window.DASH || {};
  var arr = function (x) { return Array.isArray(x) ? x : (x ? [x] : []); };
  var daily = arr(D.daily).slice().sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  var grain = arr(D.grain);
  var TAX = D.tax || 1.1385;
  // config do lançamento (metas do brief)
  var LC = D.launch || {};
  var GOAL = LC.goal || 0, FLOOR = LC.floor || 0, TICKET = LC.ticket || 0, LTV = LC.ltv || 0,
      BUDGET = LC.budget || 0, DEADLINE = LC.deadline || null, START = LC.startDate || null,
      CPA_TARGET = LC.cpaTarget || 0, CPA_LIMIT = LC.cpaLimit || 0;
  // Checkout iniciado = PIXEL/Gerenciador (icPixel do Adveronix). Enquanto a coluna nao existir
  // no relatorio (icPixel todos 0), cai no fallback Tutory (vendas + abandonos de carrinho).
  var HAS_PIXEL_IC = daily.some(function (d) { return (d.icPixel || 0) > 0; });

  /* ---------------------------------------------------------------- formato */
  var nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf4 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
  function ok(v) { return v !== null && v !== undefined && isFinite(v); }
  function money(v) { return (v < 0 ? '−R$ ' : 'R$ ') + nf2.format(Math.abs(v || 0)); }
  function money0(v) { return (v < 0 ? '−R$ ' : 'R$ ') + nf0.format(Math.round(Math.abs(v || 0))); }
  function int(v) { return nf0.format(Math.round(v || 0)); }
  function pct1(v) { return nf1.format((v || 0) * 100) + '%'; }
  function x2(v) { return nf2.format(v || 0) + 'x'; }
  function taxStr(v) { return nf4.format(v || 1); }
  // versões que exibem "—" quando a métrica não é calculável (divisão por zero)
  var M = {
    money: function (v) { return ok(v) ? money(v) : '—'; },
    money0: function (v) { return ok(v) ? money0(v) : '—'; },
    int: function (v) { return ok(v) ? int(v) : '—'; },
    pct1: function (v) { return ok(v) ? pct1(v) : '—'; },
    x: function (v) { return ok(v) ? x2(v) : '—'; }
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function $(id) { return document.getElementById(id); }
  function div(a, b) { return b > 0 ? a / b : null; }

  function dayAdd(ds, n) { var p = ds.split('-'); var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); }
  function brDate(ds) { var p = ds.split('-'); return p[2] + '/' + p[1]; }
  function brFull(ds) { var p = ds.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function diffDays(a, b) { return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5); }

  /* ---------------------------------------------------------------- período */
  var minDate = daily.length ? daily[0].d : '2026-01-01';
  var maxDate = daily.length ? daily[daily.length - 1].d : '2026-01-01';
  function firstOfMonth(ds) { return ds.slice(0, 7) + '-01'; }
  function clampD(ds) { return ds < minDate ? minDate : (ds > maxDate ? maxDate : ds); }

  var STATE = {
    from: minDate, to: maxDate, preset: 'all', compare: true, tab: 'overview',
    metric: 'spend', treeSort: { key: 'spend', dir: -1 }, expanded: {}, camps: null
  };
  // lista de campanhas presentes (por gasto desc)
  var CAMP_SPEND = {}; grain.forEach(function (g) { CAMP_SPEND[g.camp] = (CAMP_SPEND[g.camp] || 0) + g.spend; });
  var ALL_CAMPS = Object.keys(CAMP_SPEND).sort(function (a, b) { return CAMP_SPEND[b] - CAMP_SPEND[a]; });
  // STATE.camps = null → todas; senão objeto {nome:true} com as selecionadas
  function campOK(c) { return !STATE.camps || STATE.camps[c] === true; }
  function campFilterActive() { return !!STATE.camps; }
  function campSelectedCount() { return STATE.camps ? Object.keys(STATE.camps).filter(function (k) { return STATE.camps[k]; }).length : ALL_CAMPS.length; }
  // fonte da venda/faturamento exibido: SEMPRE Tutory (venda aprovada da planilha)
  function revSrc() { return 'Tutory'; }

  /* ---------------------------------------------------------------- funil de campanha */
  function funnelOf(camp) {
    // Lançamento único (AGO26PC): tudo é campanha de venda/captação.
    var c = String(camp || '').toUpperCase();
    if (c.indexOf('TOPO') >= 0 || /\bTF\b/.test(c)) return 'Topo';
    return 'Venda';
  }
  function within(d, from, to) { return d >= from && d <= to; }

  /* ---------------------------------------------------------------- agregação (daily) */
  function blank() { return { spend: 0, impr: 0, clk: 0, lpv: 0, purPixel: 0, valPixel: 0, vendas: 0, fat: 0, checkouts: 0, icPixel: 0 }; }
  function spendByFunnel(from, to) {
    var o = { Topo: 0, Venda: 0, Outros: 0, total: 0 };
    for (var i = 0; i < grain.length; i++) { var g = grain[i]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue; o[funnelOf(g.camp)] += g.spend; o.total += g.spend; }
    return o;
  }
  // derive: adiciona métricas calculadas a um agregado diário.
  // Fonte de VENDA/FATURAMENTO: SEMPRE Tutory (venda aprovada da planilha de extração) —
  // fonte da verdade, inclusive com filtro de campanha ativo. O pixel (Adveronix) fica só como
  // sinal de otimização por anúncio, na aba Tráfego Pago.
  function derive(t) {
    var filtered = campFilterActive();
    var vendas = (t.vendas || 0);   // Tutory: contagem de venda aprovada
    var fat = (t.fat || 0);         // Tutory: soma do valor das aprovadas
    // denominador do ROAS/CAC: com filtro usa o gasto (filtrado) da(s) campanha(s); sem filtro, só invest. de Venda
    var spendDen = filtered ? t.spend : t.spendVenda;
    // IC = checkout iniciado do PIXEL (Gerenciador). Fallback Tutory (vendas + abandonos) enquanto a coluna nao existe.
    var ic = HAS_PIXEL_IC ? (t.icPixel || 0) : ((t.vendas || 0) + (t.checkouts || 0));
    var o = Object.assign({}, t);
    o.usePixel = false; o.filtered = filtered;
    o.vendas = vendas; o.fat = fat;
    o.ic = ic;
    o.cpm = div(t.spend * 1000, t.impr);
    o.ctr = div(t.clk, t.impr);
    o.cpc = div(t.spend, t.clk);
    o.cpl = div(t.spend, t.lpv);          // custo por landing page view
    o.cpic = div(t.spend, ic);            // custo por checkout iniciado
    o.connect = div(t.lpv, t.clk);        // connect rate (LPV ÷ cliques)
    o.cac = div(spendDen, vendas);        // custo por venda
    o.roas = div(fat, spendDen);          // retorno
    o.ticket = div(fat, vendas);
    o.convCheck = div(vendas, ic);        // conversão checkout → venda
    o.lpCheck = div(ic, t.lpv);           // LP → checkout
    o.resultado = (fat || 0) - (t.spend || 0); // caixa (fat − invest. total)
    return o;
  }
  function aggregate(from, to) {
    var t = blank();
    // mídia vem do grain (tem campanha) → respeita o filtro de campanha
    for (var i = 0; i < grain.length; i++) {
      var g = grain[i]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue;
      t.spend += g.spend; t.impr += g.impr; t.clk += g.clk; t.lpv += g.lpv;
      t.purPixel += g.pur; t.valPixel += g.val; t.icPixel += (g.icpx || 0);
    }
    // Tutory (faturamento/vendas) é da CONTA toda, por data — SCK vazio, sem atribuição por campanha
    for (var k = 0; k < daily.length; k++) {
      var x = daily[k]; if (!within(x.d, from, to)) continue;
      t.vendas += x.vendas; t.fat += x.fat; t.checkouts += x.checkouts;
    }
    var sb = spendByFunnel(from, to);
    t.spendVenda = sb.Venda; t.spendTopo = sb.Topo; t.spendOutros = sb.Outros;
    return derive(t);
  }
  function dailyRows(from, to) {
    // mídia por dia vinda do grain (respeita filtro de campanha)
    var md = {};
    for (var j = 0; j < grain.length; j++) {
      var g = grain[j]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue;
      var m = md[g.d] || (md[g.d] = { spend: 0, impr: 0, clk: 0, lpv: 0, purPixel: 0, valPixel: 0, icPixel: 0, spendVenda: 0 });
      m.spend += g.spend; m.impr += g.impr; m.clk += g.clk; m.lpv += g.lpv; m.purPixel += g.pur; m.valPixel += g.val; m.icPixel += (g.icpx || 0);
      if (funnelOf(g.camp) === 'Venda') m.spendVenda += g.spend;
    }
    var out = [];
    for (var i = 0; i < daily.length; i++) {
      var x = daily[i]; if (!within(x.d, from, to)) continue;
      var m = md[x.d] || { spend: 0, impr: 0, clk: 0, lpv: 0, purPixel: 0, valPixel: 0, icPixel: 0, spendVenda: 0 };
      var t = Object.assign(blank(), { d: x.d, spend: m.spend, impr: m.impr, clk: m.clk, lpv: m.lpv, purPixel: m.purPixel, valPixel: m.valPixel, icPixel: m.icPixel, vendas: x.vendas, fat: x.fat, checkouts: x.checkouts });
      t.spendVenda = m.spendVenda;
      out.push(derive(t));
    }
    return out;
  }

  /* ---------------------------------------------------------------- régua de benchmarks (Leandro)
     Classifica cada métrica em bom / médio / ruim. dir 'high' = maior é melhor. */
  /* Régua do NICHO (concurso/carreira pública, evento low-ticket R$47, tráfego frio em vídeo).
     Calibração de partida — reajustar após ~3 dias de dado real da conta. */
  var BANDS = {
    ctr: { label: 'CTR (link)', good: 0.018, mid: 0.01, dir: 'high', fmt: M.pct1 },  // CTR de link (Adveronix Link Clicks), não CTR total.
    cpc: { label: 'CPC (link)', good: 1.80, mid: 3.50, dir: 'low', fmt: M.money },
    cpm: { label: 'CPM', good: 28, mid: 45, dir: 'low', fmt: M.money },
    connect: { label: 'Connect rate', good: 0.88, mid: 0.75, dir: 'high', fmt: M.pct1 },
    lpCheck: { label: 'Page view → Checkout', good: 0.15, mid: 0.08, dir: 'high', fmt: M.pct1 },
    cpic: { label: 'Custo/checkout', good: 18, mid: 35, dir: 'low', fmt: M.money },
    convCheck: { label: 'Conv. checkout', good: 0.35, mid: 0.20, dir: 'high', fmt: M.pct1 },
    cac: { label: 'CPA / ingresso', good: 61, mid: 100, dir: 'low', fmt: M.money }   // meta R$61 / limite R$100 (contra LTV R$467)
  };
  function statusOf(v, b) {
    if (!ok(v)) return null;
    var lvl;
    if (b.dir === 'high') lvl = v >= b.good ? 'good' : v >= b.mid ? 'warn' : 'bad';
    else lvl = v <= b.good ? 'good' : v <= b.mid ? 'warn' : 'bad';
    var word = lvl === 'good' ? 'bom' : lvl === 'warn' ? 'médio' : 'ruim';
    var cls = lvl === 'good' ? 'g' : lvl === 'warn' ? 'y' : 'r';
    return { lvl: lvl, word: word, cls: cls };
  }
  function scoreOf(v, b) {
    if (!ok(v)) return null;
    if (b.dir === 'high') {
      if (v >= b.good) return 100;
      if (v >= b.mid) return 60 + (v - b.mid) / (b.good - b.mid) * 30;   // 60→90
      return Math.max(5, v / b.mid * 55);                               // 5→55
    } else {
      if (v <= b.good) return 100;
      if (v <= b.mid) return 60 + (b.mid - v) / (b.mid - b.good) * 30;
      return Math.max(5, 55 - (v - b.mid) / b.mid * 55);
    }
  }
  var scoreColor = function (s) { return s == null ? 'var(--ink-3)' : s >= 75 ? 'var(--good)' : s >= 50 ? 'var(--warning)' : 'var(--critical)'; };
  var bandLabel = function (s) { return s == null ? 'sem dados' : s >= 80 ? 'Saudável' : s >= 60 ? 'Bom' : s >= 40 ? 'Atenção' : 'Crítico'; };

  // métricas que compõem a nota de saúde (topo confiável + fundo)
  var HEALTH_KEYS = ['ctr', 'cpc', 'cpm', 'lpCheck', 'cpic', 'convCheck'];
  function health(a) {
    var bars = HEALTH_KEYS.map(function (k) {
      var b = BANDS[k], v = a[k], sc = scoreOf(v, b);
      return { label: b.label, valueStr: b.fmt(v), score: sc, band: b, cls: (statusOf(v, b) || {}).cls };
    });
    var valid = bars.filter(function (b) { return b.score != null; });
    var score = valid.length ? Math.round(valid.reduce(function (s, b) { return s + b.score; }, 0) / valid.length) : null;
    return { score: score, band: bandLabel(score), bars: bars };
  }

  /* ---------------------------------------------------------------- SVG helpers */
  var NS = 'http://www.w3.org/2000/svg';
  function svgEl(n, at) { var e = document.createElementNS(NS, n); for (var k in at) e.setAttribute(k, at[k]); return e; }
  function niceMax(v) { if (!(v > 0)) return 1; var e = Math.pow(10, Math.floor(Math.log10(v))); var f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
  function ticks(max, n) { n = n || 4; var out = []; for (var i = 0; i <= n; i++) out.push(max * i / n); return out; }
  function labelStep(count, width) { return Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width / 58)))); }

  var TIP = null;
  function showTip(html, ev) {
    TIP.innerHTML = html; TIP.style.opacity = 1;
    var r = TIP.getBoundingClientRect();
    var x = ev.clientX + 14, y = ev.clientY - r.height - 12;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y < 8) y = ev.clientY + 18;
    TIP.style.left = x + 'px'; TIP.style.top = y + 'px';
  }
  function hideTip() { TIP.style.opacity = 0; }

  // gráfico combinado barra(s) + linha com eixo duplo
  function comboChart(host, rows, cfg) {
    host.innerHTML = '';
    var W = Math.max(300, host.clientWidth || 520), H = 240;
    var P = { t: 22, r: 50, b: 28, l: 56 }, iw = W - P.l - P.r, ih = H - P.t - P.b, n = rows.length;
    var svg = svgEl('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, role: 'img' });
    var leftMax = niceMax(Math.max.apply(null, rows.flatMap(function (r) { return cfg.bars.map(function (b) { return r[b.key] || 0; }); }).concat([0])));
    var rightVals = rows.map(function (r) { return r[cfg.line.key]; }).filter(ok);
    var rightMax = niceMax(Math.max.apply(null, rightVals.concat([0])));
    var yL = function (v) { return P.t + ih - (leftMax > 0 ? (v / leftMax) * ih : 0); };
    var yR = function (v) { return P.t + ih - (rightMax > 0 ? (v / rightMax) * ih : 0); };
    ticks(leftMax).forEach(function (t) { svg.appendChild(svgEl('line', { class: 'gl', x1: P.l, x2: P.l + iw, y1: yL(t), y2: yL(t) })); var tx = svgEl('text', { x: P.l - 7, y: yL(t) + 4, 'text-anchor': 'end' }); tx.textContent = cfg.leftFmt(t); svg.appendChild(tx); });
    ticks(rightMax).forEach(function (t) { var tx = svgEl('text', { x: P.l + iw + 7, y: yR(t) + 4, 'text-anchor': 'start' }); tx.textContent = cfg.rightFmt(t); svg.appendChild(tx); });
    svg.appendChild(svgEl('line', { class: 'ax', x1: P.l, x2: P.l + iw, y1: P.t + ih, y2: P.t + ih }));
    var slot = iw / Math.max(1, n), nb = cfg.bars.length;
    var groupW = Math.min(slot - 3, nb > 1 ? 40 : 30), bw = Math.max(2, groupW / nb - 1), step = labelStep(n, iw);
    rows.forEach(function (r, i) {
      var cx = P.l + slot * i + slot / 2;
      cfg.bars.forEach(function (b, bi) {
        var v = r[b.key] || 0, h = Math.max(v > 0 ? 1.5 : 0, P.t + ih - yL(v));
        var x = cx - groupW / 2 + bi * (groupW / nb) + (groupW / nb - bw) / 2;
        if (h > 0) svg.appendChild(svgEl('rect', { x: x, y: P.t + ih - h, width: bw, height: h, fill: b.color, rx: Math.min(3, bw / 2) }));
      });
      if (i % step === 0 || i === n - 1) { var tx = svgEl('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }); tx.textContent = brDate(r.d); svg.appendChild(tx); }
    });
    var pts = rows.map(function (r, i) { var v = r[cfg.line.key]; return ok(v) ? [P.l + slot * i + slot / 2, yR(v), v] : null; });
    var seg = [], segs = [];
    pts.forEach(function (p) { if (p) seg.push(p); else if (seg.length) { segs.push(seg); seg = []; } }); if (seg.length) segs.push(seg);
    segs.forEach(function (s) { var d = s.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' '); svg.appendChild(svgEl('path', { d: d, fill: 'none', stroke: cfg.line.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })); });
    if (n <= 45) pts.forEach(function (p) { if (p) svg.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: 3.2, fill: cfg.line.color, stroke: 'var(--card)', 'stroke-width': 1.5 })); });
    var cross = svgEl('line', { class: 'cross', y1: P.t, y2: P.t + ih }); svg.appendChild(cross);
    var hit = svgEl('rect', { class: 'hit', x: P.l, y: P.t, width: iw, height: ih });
    hit.addEventListener('mousemove', function (ev) {
      var box = svg.getBoundingClientRect();
      var i = Math.max(0, Math.min(n - 1, Math.floor((((ev.clientX - box.left) / box.width) * W - P.l) / slot)));
      var r = rows[i], cx = P.l + slot * i + slot / 2;
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.opacity = 1;
      var html = '<b>' + brFull(r.d) + '</b>';
      cfg.bars.forEach(function (b) { html += '<div class="r"><em><i style="background:' + b.color + '"></i>' + b.name + '</em><strong>' + cfg.leftFmt(r[b.key] || 0) + '</strong></div>'; });
      html += '<div class="r"><em><i style="background:' + cfg.line.color + '"></i>' + cfg.line.name + '</em><strong>' + cfg.lineFmt(r[cfg.line.key]) + '</strong></div>';
      showTip(html, ev);
    });
    hit.addEventListener('mouseleave', function () { cross.style.opacity = 0; hideTip(); });
    svg.appendChild(hit);
    host.appendChild(svg);
  }

  // gráfico de linhas (1 ou 2 séries: atual/anterior)
  function lineChart(host, labels, series, fmt) {
    host.innerHTML = '';
    var W = Math.max(320, host.clientWidth || 900), H = 240;
    var P = { t: 16, r: 14, b: 28, l: 64 }, iw = W - P.l - P.r, ih = H - P.t - P.b;
    var svg = svgEl('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, role: 'img' });
    var all = series.flatMap(function (s) { return s.values.filter(ok); });
    var max = niceMax(Math.max.apply(null, all.concat([0])));
    var n = labels.length;
    var x = function (i) { return n === 1 ? P.l + iw / 2 : P.l + (iw * i) / (n - 1); };
    var y = function (v) { return P.t + ih - (max > 0 ? (v / max) * ih : 0); };
    ticks(max).forEach(function (t) { svg.appendChild(svgEl('line', { class: 'gl', x1: P.l, x2: P.l + iw, y1: y(t), y2: y(t) })); var tx = svgEl('text', { x: P.l - 8, y: y(t) + 4, 'text-anchor': 'end' }); tx.textContent = fmt(t); svg.appendChild(tx); });
    svg.appendChild(svgEl('line', { class: 'ax', x1: P.l, x2: P.l + iw, y1: P.t + ih, y2: P.t + ih }));
    var step = labelStep(n, iw);
    labels.forEach(function (lb, i) { if (i % step === 0 || i === n - 1) { var tx = svgEl('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' }); tx.textContent = lb; svg.appendChild(tx); } });
    series.forEach(function (s) {
      var pts = s.values.map(function (v, i) { return [x(i), y(v || 0)]; });
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      var path = svgEl('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      if (s.dashed) path.setAttribute('stroke-dasharray', '5 4');
      svg.appendChild(path);
      if (n <= 40) pts.forEach(function (p) { svg.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: 4, fill: s.color, stroke: 'var(--card)', 'stroke-width': 2 })); });
    });
    var cross = svgEl('line', { class: 'cross', y1: P.t, y2: P.t + ih }); svg.appendChild(cross);
    var hit = svgEl('rect', { class: 'hit', x: P.l - 4, y: P.t, width: iw + 8, height: ih });
    hit.addEventListener('mousemove', function (ev) {
      var box = svg.getBoundingClientRect();
      var rel = ((ev.clientX - box.left) / box.width) * W;
      var i = Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : ((rel - P.l) / iw) * (n - 1))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.opacity = 1;
      showTip('<b>' + (series[0].fullLabels ? series[0].fullLabels[i] : labels[i]) + '</b>' +
        series.map(function (s) { return '<div class="r"><em><i style="background:' + s.color + '"></i>' + s.name + '</em><strong>' + fmt(s.values[i]) + '</strong></div>'; }).join(''), ev);
    });
    hit.addEventListener('mouseleave', function () { cross.style.opacity = 0; hideTip(); });
    svg.appendChild(hit);
    host.appendChild(svg);
  }

  function gauge(score, colorVar) {
    var s = ok(score) ? score : 0, r = 54, c = 2 * Math.PI * r, off = c * (1 - s / 100);
    var disp = ok(score) ? Math.round(score) : '—';
    return '<div class="gauge"><svg viewBox="0 0 132 132" width="132" height="132">' +
      '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="var(--plane)" stroke-width="12"/>' +
      '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="' + colorVar + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
      '</svg><div class="gv"><b>' + disp + '</b><span>de 100</span></div></div>';
  }

  /* ---------------------------------------------------------------- deltas */
  function miniDelta(cur, prev, better) {
    if (!STATE.compare || !ok(prev) || prev === 0 || !ok(cur)) return '<span class="flat">—</span>';
    var ch = (cur - prev) / Math.abs(prev);
    var ar = Math.abs(ch) < 0.0005 ? '→' : (ch > 0 ? '▲' : '▼');
    var cls;
    if (better === null) cls = 'flat';
    else { var bad = better === false; cls = Math.abs(ch) < 0.0005 ? 'flat' : ((ch > 0) !== bad ? 'up' : 'down'); }
    return '<span class="' + cls + '">' + ar + ' ' + nf1.format(Math.abs(ch) * 100) + '%</span>';
  }

  /* ---------------------------------------------------------------- árvore campanha › conjunto › anúncio (pixel) */
  function tblank(label) { return { label: label, spend: 0, impr: 0, reach: 0, clk: 0, lpv: 0, pur: 0, val: 0, kids: {} }; }
  function tderive(t) {
    var o = Object.assign({}, t);
    o.cpm = div(t.spend * 1000, t.impr); o.ctr = div(t.clk, t.impr); o.cpc = div(t.spend, t.clk);
    o.cpl = div(t.spend, t.lpv); o.connect = div(t.lpv, t.clk);
    o.custoCompra = div(t.spend, t.pur); o.roas = div(t.val, t.spend);
    return o;
  }
  function buildTree(from, to) {
    var root = {};
    for (var i = 0; i < grain.length; i++) {
      var g = grain[i]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue;
      var c = root[g.camp] || (root[g.camp] = tblank(g.camp));
      var s = c.kids[g.adset] || (c.kids[g.adset] = tblank(g.adset));
      var a = s.kids[g.ad] || (s.kids[g.ad] = tblank(g.ad));
      a.spend += g.spend; a.impr += g.impr; a.reach += g.reach; a.clk += g.clk; a.lpv += g.lpv; a.pur += g.pur; a.val += g.val;
    }
    var RAW = ['spend', 'impr', 'reach', 'clk', 'lpv', 'pur', 'val'];
    function roll(node, key, level) {
      var kids = Object.keys(node.kids).map(function (k) { return roll(node.kids[k], key + ' ▸ ' + k, level + 1); });
      var agg = tblank(node.label);
      RAW.forEach(function (k) { agg[k] = node[k]; });
      kids.forEach(function (c) { RAW.forEach(function (k) { agg[k] += c[k]; }); });
      var d = tderive(agg); d.key = key; d.level = level; d.kids = kids;
      return d;
    }
    return Object.keys(root).map(function (k) { return roll(root[k], k, 0); });
  }
  function adsByName(from, to) {
    var map = {};
    for (var i = 0; i < grain.length; i++) {
      var g = grain[i]; if (!within(g.d, from, to)) continue; if (!campOK(g.camp)) continue;
      var a = map[g.ad] || (map[g.ad] = tblank(g.ad));
      a.spend += g.spend; a.impr += g.impr; a.reach += g.reach; a.clk += g.clk; a.lpv += g.lpv; a.pur += g.pur; a.val += g.val;
    }
    return Object.keys(map).map(function (k) { return tderive(map[k]); }).filter(function (a) { return a.spend > 0 || a.pur > 0; });
  }

  /* colunas padrão da árvore/tabela diária */
  var TCOLS = [
    { k: 'label', label: 'Campanha › Conjunto › Anúncio' },
    { k: 'spend', label: 'Invest.', fmt: M.money },
    { k: 'cpm', label: 'CPM', fmt: M.money, scale: 'low' },
    { k: 'ctr', label: 'CTR', fmt: M.pct1, scale: 'high' },
    { k: 'cpc', label: 'CPC', fmt: M.money, scale: 'low' },
    { k: 'lpv', label: 'LPV', fmt: M.int },
    { k: 'cpl', label: 'Custo/LPV', fmt: M.money, scale: 'low' },
    { k: 'pur', label: 'Compras (px)', fmt: M.int },
    { k: 'custoCompra', label: 'Custo/compra', fmt: M.money, scale: 'low' },
    { k: 'roas', label: 'ROAS (px)', fmt: M.x, scale: 'high' }
  ];

  /* ---------------------------------------------------------------- lançamento (metas)
     Totais do LANÇAMENTO INTEIRO (todas as campanhas, todo o período) — independem
     do período/filtro selecionado. É o topo "vs meta" do dashboard. */
  function launchTotals() {
    var spend = 0, vendas = 0, fat = 0, ic = 0, lpv = 0, clk = 0, impr = 0;
    for (var i = 0; i < grain.length; i++) { var g = grain[i]; spend += g.spend; impr += g.impr; clk += g.clk; lpv += g.lpv; ic += (g.icpx || 0); }
    for (var k = 0; k < daily.length; k++) { var x = daily[k]; vendas += x.vendas; fat += x.fat; }
    return { spend: spend, vendas: vendas, fat: fat, ic: ic, lpv: lpv, clk: clk, impr: impr, cpa: div(spend, vendas) };
  }
  function launchBanner() {
    var t = launchTotals();
    var today = new Date().toISOString().slice(0, 10);
    var daysLeft = DEADLINE ? Math.max(0, diffDays(today, DEADLINE)) : null;
    var elapsed = daily.length ? Math.max(1, diffDays(minDate, maxDate) + 1) : 1;   // dias ativos (span dos dados)
    var paceCur = div(t.vendas, elapsed);
    var paceNeed = (daysLeft && GOAL) ? Math.max(0, (GOAL - t.vendas)) / Math.max(1, daysLeft) : null;
    var pctGoal = GOAL ? Math.min(100, t.vendas / GOAL * 100) : 0;
    var pctBudget = BUDGET ? Math.min(100, t.spend / BUDGET * 100) : 0;
    var cpaSt = statusOf(t.cpa, BANDS.cac);
    var roasProj = div(t.vendas * LTV, t.spend), roasTicket = div(t.fat, t.spend);
    var budgetLeft = BUDGET - t.spend;
    var pill = cpaSt ? '<span class="rep-flag ' + cpaSt.cls + '">' + cpaSt.word + '</span>' : '';
    return '<div class="panel launch">' +
      '<div class="lb-head"><h2 style="margin:0">🎟️ Lançamento — A Próxima Carreira</h2>' +
      '<span class="lb-ev">evento 27/08' + (daysLeft != null ? ' · <b>' + daysLeft + ' dia(s) restante(s)</b>' : '') + '</span></div>' +
      '<div class="hero" style="margin-top:12px">' +
      '<div class="hcard"><div class="hk">🎟️ Ingressos <small>meta ' + int(GOAL) + '</small></div>' +
      '<div class="hv g">' + int(t.vendas) + '</div>' +
      '<div class="hd"><div class="hb-track" style="margin:5px 0 5px"><div class="hb-fill" style="width:' + pctGoal.toFixed(0) + '%;background:var(--good)"></div></div>' + int(t.vendas) + ' de ' + int(GOAL) + ' · piso ' + int(FLOOR) + '</div></div>' +
      '<div class="op">·</div>' +
      '<div class="hcard"><div class="hk">🎯 CPA <small>por ingresso</small></div>' +
      '<div class="hv">' + M.money(t.cpa) + ' ' + pill + '</div>' +
      '<div class="hd">meta ≤ ' + M.money0(CPA_TARGET) + ' · limite ' + M.money0(CPA_LIMIT) + '</div></div>' +
      '<div class="op">·</div>' +
      '<div class="hcard"><div class="hk">💸 Investido <small>de ' + M.money0(BUDGET) + '</small></div>' +
      '<div class="hv">' + M.money0(t.spend) + '</div>' +
      '<div class="hd"><div class="hb-track" style="margin:5px 0 5px"><div class="hb-fill" style="width:' + pctBudget.toFixed(0) + '%;background:var(--brand)"></div></div>restam ' + M.money0(budgetLeft) + '</div></div>' +
      '<div class="op">·</div>' +
      '<div class="hcard"><div class="hk">📈 Ritmo <small>ingressos/dia</small></div>' +
      '<div class="hv">' + (ok(paceCur) ? nf1.format(paceCur) : '—') + '</div>' +
      '<div class="hd">' + (paceNeed != null ? 'precisa <b>' + nf1.format(paceNeed) + '/dia</b> p/ meta' : '—') + '</div></div>' +
      '<div class="op">·</div>' +
      '<div class="hcard roas"><div class="hk">🚀 ROAS <small>projetado</small></div>' +
      '<div class="hv">' + M.x(roasProj) + '</div>' +
      '<div class="hd">vs LTV ' + M.money0(LTV) + ' · ingresso ' + M.x(roasTicket) + ' (R$' + int(TICKET) + ')</div></div>' +
      '</div>' +
      '<p class="hero-line" style="margin:12px 0 0">CPA lido contra o <b>LTV de ' + M.money0(LTV) + '</b> (conversão p/ mentoria), não contra o ingresso de ' + M.money0(TICKET) + ' — por isso o CPA meta de ' + M.money0(CPA_TARGET) + ' fecha com folga. Estes números são do <b>lançamento inteiro</b> (independem do período selecionado abaixo).</p>' +
      '</div>';
  }

  /* ================================================================ VISÃO GERAL */
  function renderOverview() {
    var from = STATE.from, to = STATE.to, len = diffDays(from, to) + 1;
    var pTo = dayAdd(from, -1), pFrom = dayAdd(pTo, -(len - 1));
    var cur = aggregate(from, to), prev = STATE.compare ? aggregate(pFrom, pTo) : null;

    var h = health(cur), sc = scoreColor(h.score);
    var healthHTML = gauge(h.score, sc) +
      '<div><p class="health-head">Saúde do funil' +
      '<span class="tag" style="background:color-mix(in srgb,' + sc + ' 20%,transparent);color:' + sc + '">' + h.band + '</span>' +
      '<span style="font-size:11.5px;font-weight:500;color:var(--ink-3);margin-left:6px">' + (h.score == null ? '—' : h.score + '/100') + ' · pela sua régua de benchmarks</span></p>' +
      '<div class="hbars" style="margin-top:12px">' + h.bars.map(function (b) {
        var col = b.score == null ? 'var(--ink-3)' : scoreColor(b.score);
        var w = b.score == null ? 0 : Math.max(0, Math.min(100, b.score));
        var lim = b.band.dir === 'high' ? 'bom ≥ ' + b.band.fmt(b.band.good) : 'bom ≤ ' + b.band.fmt(b.band.good);
        return '<div class="hbar"><div class="hb-top"><em>' + b.label + ' <span style="color:var(--ink-3);font-weight:500">· ' + lim + '</span></em><strong>' + b.valueStr + '</strong></div>' +
          '<div class="hb-track"><div class="hb-fill" style="width:' + w.toFixed(0) + '%;background:' + col + '"></div></div></div>';
      }).join('') + '</div></div>';

    var flt = cur.filtered;
    var invVal = flt ? cur.spend : cur.spendVenda, invPrev = prev && (flt ? prev.spend : prev.spendVenda), invLbl = flt ? 'filtrado' : 'em venda';
    var heroHTML =
      '<div class="hcard"><div class="hk">💸 Investimento <small>' + invLbl + '</small></div>' +
      '<div class="hv">' + M.money(invVal) + '</div><div class="hd">' + miniDelta(invVal, invPrev, null) + ' vs anterior</div></div>' +
      '<div class="op">→</div>' +
      '<div class="hcard"><div class="hk">💰 Faturamento <small>' + revSrc() + '</small></div>' +
      '<div class="hv g">' + M.money(cur.fat) + '</div><div class="hd">' + miniDelta(cur.fat, prev && prev.fat, true) + ' vs anterior</div></div>' +
      '<div class="op">=</div>' +
      '<div class="hcard roas"><div class="hk">📈 ROAS <small>retorno</small></div>' +
      '<div class="hv">' + M.x(cur.roas) + '</div><div class="hd">' + miniDelta(cur.roas, prev && prev.roas, true) + ' vs anterior</div></div>' +
      '<div class="op">·</div>' +
      '<div class="hcard"><div class="hk">🎯 CAC <small>custo/venda</small></div>' +
      '<div class="hv">' + M.money(cur.cac) + '</div><div class="hd">' + int(cur.vendas) + ' venda(s) · ticket ' + M.money(cur.ticket) + '</div></div>';

    var heroLine = ok(cur.roas)
      ? 'Cada <b>R$ 1,00</b> investido virou <b>' + M.money(cur.roas) + '</b> de faturamento (' + revSrc() + ') · ' + M.money(invVal) + ' → ' + M.money(cur.fat) + ' no período. Resultado de caixa (fat − invest. total): <b>' + M.money(cur.resultado) + '</b>.'
      : 'Sem venda no período — ainda sem ROAS pra medir.';

    var overview =
      launchBanner() +
      '<div class="panel"><div class="health" id="health">' + healthHTML + '</div></div>' +
      '<div class="hero" id="hero">' + heroHTML + '</div>' +
      '<p class="hero-line" style="margin-bottom:10px">' + heroLine + '</p>' +
      '<div class="scopenote"><span>' + (flt
        ? '🎯 Com <b>filtro de campanha</b>, as <b>vendas/faturamento vêm da Tutory</b> (real). ROAS/CAC usam o investimento filtrado (' + M.money(cur.spend) + '). As vendas mostradas são o <b>total do lançamento</b> no período (a planilha atribui por UTM; a dash soma o lançamento).'
        : '🎯 O <b>ROAS ingresso</b> abaixo (contra R$' + int(TICKET) + ') fica &lt;1x de propósito — o retorno de verdade é o <b>ROAS projetado</b> no topo (contra o LTV de ' + M.money0(LTV) + '). CAC e ROAS aqui usam o investimento do lançamento (' + M.money(cur.spendVenda) + ').') + '</span></div>' +
      '<div class="panel"><h2>Investimento por funil <span style="font-weight:500;color:var(--ink-3)">— com imposto ×' + taxStr(TAX) + '</span></h2><div class="funil-grid" id="funilInv"></div></div>' +
      '<div class="grid-funnel">' +
      '<div class="panel"><h2>Funil completo</h2><p class="note">Investimento → Impressões → Cliques → Page views → Checkouts → Vendas. Cada etapa mostra o <b>volume</b> e, à direita, o <b>custo</b> e a <b>taxa de passagem</b>.</p><div class="funnel" id="funnel"></div></div>' +
      '<div class="panel"><h2>Resultados por dia</h2><p class="note">Barras = <b>Investimento c/ imposto</b> (esq., R$) · linha = <b>Vendas</b> (dir., nº).</p><div class="legend" id="legA"></div><div id="chA"></div>' +
      '<h2 style="margin-top:20px">Faturamento × Investimento × ROAS</h2><p class="note">Barras = <b>Faturamento</b> e <b>Investimento</b> (esq., R$) · linha = <b>ROAS</b> (dir.).</p><div class="legend" id="legB"></div><div id="chB"></div></div>' +
      '</div>' +
      '<div class="panel"><h2 id="metricTitle">Investimento por dia</h2><p class="note">Escolha a métrica; com a comparação ligada, a linha tracejada é o período anterior alinhado dia a dia.</p><div class="tabs" id="metricTabs"></div><div class="legend" id="legend"></div><div id="chMetric"></div></div>' +
      '<div class="panel"><h2>Visão diária — principais métricas por dia</h2><p class="note">Uma linha por dia, mais recente no topo. Heatmap por coluna: <b style="color:var(--good-text)">verde = melhor</b>, <b style="color:var(--critical)">vermelho = pior</b> no período.</p><div class="tblwrap"><table id="dtbl" class="daily"></table></div></div>';

    $('overviewView').innerHTML = overview;

    renderFunilInv(from, to);
    renderFunnel(cur);
    // gráficos
    var rows = dailyRows(from, to), pRows = dailyRows(pFrom, pTo);
    comboChart($('chA'), rows, { bars: [{ key: 'spend', color: 'var(--critical)', name: 'Investimento c/ imposto' }], line: { key: 'vendas', color: 'var(--good)', name: 'Vendas' }, leftFmt: M.money0, rightFmt: M.int, lineFmt: M.int });
    comboChart($('chB'), rows, { bars: [{ key: 'fat', color: 'var(--good)', name: 'Faturamento' }, { key: 'spend', color: 'var(--critical)', name: 'Investimento c/ imposto' }], line: { key: 'roas', color: 'var(--ink-1)', name: 'ROAS' }, leftFmt: M.money0, rightFmt: M.x, lineFmt: M.x });
    var lgSq = function (c) { return '<i style="background:' + c + '"></i>'; }, lgLn = function (c) { return '<i style="width:15px;height:0;border-top:2px solid ' + c + ';border-radius:0"></i>'; };
    $('legA').innerHTML = '<span>' + lgSq('var(--critical)') + '<span style="color:var(--ink-2)">Investimento c/ imposto</span></span><span>' + lgLn('var(--good)') + '<span style="color:var(--ink-2)">Vendas (eixo dir.)</span></span>';
    $('legB').innerHTML = '<span>' + lgSq('var(--good)') + '<span style="color:var(--ink-2)">Faturamento</span></span><span>' + lgSq('var(--critical)') + '<span style="color:var(--ink-2)">Investimento</span></span><span>' + lgLn('var(--ink-1)') + '<span style="color:var(--ink-2)">ROAS (eixo dir.)</span></span>';

    // métrica selecionável
    var METRICS = [
      { k: 'spend', label: 'Investimento', fmt: M.money0 }, { k: 'vendas', label: 'Vendas', fmt: M.int },
      { k: 'fat', label: 'Faturamento', fmt: M.money0 }, { k: 'roas', label: 'ROAS', fmt: M.x },
      { k: 'cac', label: 'CAC', fmt: M.money0 }, { k: 'cpc', label: 'CPC', fmt: M.money },
      { k: 'cpm', label: 'CPM', fmt: M.money0 }, { k: 'ctr', label: 'CTR', fmt: M.pct1 },
      { k: 'impr', label: 'Impressões', fmt: M.int }, { k: 'clk', label: 'Cliques', fmt: M.int }, { k: 'lpv', label: 'Page Views', fmt: M.int }
    ];
    $('metricTabs').innerHTML = METRICS.map(function (x) { return '<button class="btn' + (x.k === STATE.metric ? ' on' : '') + '" data-metric="' + x.k + '">' + x.label + '</button>'; }).join('');
    var met = METRICS.find(function (m) { return m.k === STATE.metric; }) || METRICS[0];
    var series = [{ name: 'Período atual', color: 'var(--series-1)', values: rows.map(function (r) { return r[met.k]; }), fullLabels: rows.map(function (r) { return brFull(r.d); }) }];
    if (STATE.compare) series.push({ name: 'Período anterior', color: 'var(--series-2)', dashed: true, values: rows.map(function (_, i) { return pRows[i] ? pRows[i][met.k] : null; }) });
    $('legend').innerHTML = series.length > 1 ? series.map(function (s) { return '<span style="color:' + s.color + '"><i class="' + (s.dashed ? 'dash' : '') + '" style="background:' + (s.dashed ? 'transparent' : s.color) + '"></i><span style="color:var(--ink-2)">' + s.name + '</span></span>'; }).join('') : '';
    lineChart($('chMetric'), rows.map(function (r) { return brDate(r.d); }), series, met.fmt);
    $('metricTitle').textContent = met.label + ' por dia';
    Array.prototype.forEach.call(document.querySelectorAll('[data-metric]'), function (b) { b.onclick = function () { STATE.metric = b.dataset.metric; renderOverview(); }; });

    renderDaily(from, to);
  }

  var FUNIL_META = {
    Topo: { color: 'var(--series-2)', desc: 'topo — alcance / aquecimento' },
    Venda: { color: 'var(--brand)', desc: 'conversão / venda direta' },
    Outros: { color: 'var(--ink-3)', desc: 'demais campanhas' }
  };
  function renderFunilInv(from, to) {
    var g = {}, total = 0;
    for (var i = 0; i < grain.length; i++) { var x = grain[i]; if (!within(x.d, from, to)) continue; if (!campOK(x.camp)) continue; var f = funnelOf(x.camp); (g[f] || (g[f] = { spend: 0, clk: 0, lpv: 0, pur: 0, impr: 0 })); g[f].spend += x.spend; g[f].clk += x.clk; g[f].lpv += x.lpv; g[f].pur += x.pur; g[f].impr += x.impr; total += x.spend; }
    var cards = ['Topo', 'Venda', 'Outros'].filter(function (k) { return g[k]; }).map(function (k) {
      var o = g[k], m = FUNIL_META[k], share = total ? o.spend / total : 0;
      var detail = k === 'Venda' ? (int(o.pur) + ' compra(s) px · ' + int(o.lpv) + ' LPV') : (int(o.impr) + ' impressões · ' + int(o.clk) + ' cliques');
      return '<div class="finv"><div class="fshare">' + pct1(share) + '</div><div class="ftop"><span class="fico" style="background:' + m.color + '"></span>' + k + '</div><div class="fmain" style="color:' + m.color + '">' + money0(o.spend) + '</div><div class="fmeta">' + m.desc + '<br>' + detail + '</div></div>';
    });
    cards.push('<div class="finv total"><div class="ftop">Σ Total</div><div class="fmain">' + money0(total) + '</div><div class="fmeta">soma dos funis · com imposto ×' + taxStr(TAX) + '</div></div>');
    $('funilInv').innerHTML = cards.join('');
  }
  function renderFunnel(c) {
    // pinta o valor da métrica pela régua do nicho (verde/amarelo/vermelho)
    function paint(k, v) {
      var st = statusOf(v, BANDS[k]); if (!st) return BANDS[k].fmt(v);
      var tok = st.cls === 'g' ? '--good' : st.cls === 'y' ? '--warning' : '--critical';
      var txt = st.cls === 'g' ? '--good-text' : st.cls === 'y' ? '--warn-text' : '--critical';
      return '<span class="cell-scale" style="background:color-mix(in srgb,var(' + tok + ') 20%,transparent);color:var(' + txt + ');font-weight:600">' + BANDS[k].fmt(v) + '</span>';
    }
    var stages = [
      { n: 'Investimento', big: M.money(c.spend), bg: '#8fe01e', ink: '#0c1400', cl: 'Gasto bruto', cv: M.money(c.spend / TAX), sub: '+ imposto ×' + taxStr(TAX) + ' = <b>' + M.money(c.spend) + '</b>' },
      { n: 'Impressões', big: M.int(c.impr), bg: '#7ecb1c', ink: '#0c1400', cl: 'CPM ' + flagFor('cpm', c.cpm), cv: paint('cpm', c.cpm), sub: 'CTR (link) ' + paint('ctr', c.ctr) },
      { n: 'Cliques', big: M.int(c.clk), bg: '#63b015', ink: '#0c1400', cl: 'CPC ' + flagFor('cpc', c.cpc), cv: paint('cpc', c.cpc), sub: 'Clique → Page view ' + paint('connect', c.connect) },
      { n: 'Page views', big: M.int(c.lpv), bg: '#4a8a0a', ink: '#fff', cl: 'Custo / Page view', cv: M.money(c.cpl), sub: 'Page view → Checkout ' + paint('lpCheck', c.lpCheck) },
      { n: 'Checkouts (IC)', big: M.int(c.ic), bg: '#356606', ink: '#fff', cl: 'Custo / Checkout ' + flagFor('cpic', c.cpic), cv: paint('cpic', c.cpic), sub: 'Checkout → Venda ' + paint('convCheck', c.convCheck) },
      { n: 'Ingressos (Tutory)', big: M.int(c.vendas), bg: '#244a04', ink: '#fff', cl: 'CPA ' + flagFor('cac', c.cac), cv: paint('cac', c.cac), sub: 'ROAS proj. <b>' + M.x(div(c.vendas * LTV, c.spend)) + '</b> · ticket <b>' + M.money(c.ticket) + '</b>' }
    ];
    $('funnel').innerHTML = stages.map(function (s) {
      return '<div class="fstage"><div class="fl" style="background:' + s.bg + ';color:' + s.ink + '"><div class="fn">' + s.n + '</div><div class="fv">' + s.big + '</div></div>' +
        '<div class="fr"><div class="cl">' + s.cl + '</div><div class="cv">' + s.cv + '</div><div class="fsub">' + s.sub + '</div></div></div>';
    }).join('');
  }

  var DCOLS = [
    { k: 'd', label: 'Dia' }, { k: 'spend', label: 'Invest.', fmt: M.money }, { k: 'cpm', label: 'CPM', fmt: M.money, scale: 'low' },
    { k: 'cpc', label: 'CPC', fmt: M.money, scale: 'low' }, { k: 'ctr', label: 'CTR', fmt: M.pct1, scale: 'high' },
    { k: 'lpv', label: 'LPV', fmt: M.int }, { k: 'ic', label: 'Checkouts', fmt: M.int }, { k: 'cpic', label: 'C/Checkout', fmt: M.money, scale: 'low' },
    { k: 'vendas', label: 'Vendas', fmt: M.int }, { k: 'fat', label: 'Fat.', fmt: M.money }, { k: 'cac', label: 'CAC', fmt: M.money, scale: 'low' }, { k: 'roas', label: 'ROAS', fmt: M.x, scale: 'high' }
  ];
  function renderDaily(from, to) {
    var rows = dailyRows(from, to).reverse();
    var scales = {};
    DCOLS.filter(function (c) { return c.scale; }).forEach(function (c) {
      var vals = rows.filter(function (r) { return r.spend > 0 && ok(r[c.k]); }).map(function (r) { return r[c.k]; });
      if (vals.length > 1) scales[c.k] = { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals), dir: c.scale };
    });
    function heat(k, v) {
      var s = scales[k]; if (!s || !ok(v) || s.max === s.min) return '';
      var t = (v - s.min) / (s.max - s.min); if (s.dir === 'low') t = 1 - t;
      var hue = t >= 0.5 ? 'var(--good)' : 'var(--critical)', strength = Math.round(Math.abs(t - 0.5) * 2 * 32);
      return strength < 6 ? '' : 'background:color-mix(in srgb,' + hue + ' ' + strength + '%,transparent)';
    }
    var head = DCOLS.map(function (c) { return '<th>' + c.label + '</th>'; }).join('');
    var body = rows.map(function (r) {
      return '<tr>' + DCOLS.map(function (c) {
        if (c.k === 'd') return '<td>' + brFull(r.d) + '</td>';
        var st = c.scale ? heat(c.k, r[c.k]) : '', v = c.fmt(r[c.k]);
        return '<td>' + (st ? '<span class="cell-scale" style="' + st + '">' + v + '</span>' : v) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    $('dtbl').innerHTML = '<thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody>';
  }

  /* ================================================================ TRÁFEGO PAGO */
  function renderTraffic() {
    var from = STATE.from, to = STATE.to, len = diffDays(from, to) + 1;
    var pTo = dayAdd(from, -1), pFrom = dayAdd(pTo, -(len - 1));
    var cur = aggregate(from, to), prev = STATE.compare ? aggregate(pFrom, pTo) : null;

    function kpi(lbl, val, sub, delta) { return '<div class="kpi"><div class="k">' + lbl + '</div><div class="v sm">' + val + '</div><div class="d">' + (delta || '') + (sub ? '<span>' + sub + '</span>' : '') + '</div></div>'; }
    var kpis = [
      kpi('Investimento', M.money0(cur.spend), 'Topo + Venda', miniDelta(cur.spend, prev && prev.spend, null)),
      kpi('CPM', M.money(cur.cpm), 'bom ≤ R$28', flagFor('cpm', cur.cpm)),
      kpi('CTR (link)', M.pct1(cur.ctr), 'bom ≥ 1,8%', flagFor('ctr', cur.ctr)),
      kpi('CPC (link)', M.money(cur.cpc), 'bom ≤ R$1,80', flagFor('cpc', cur.cpc)),
      kpi('Cliques', M.int(cur.clk), int(cur.impr) + ' impressões', ''),
      kpi('Connect rate', M.pct1(cur.connect), 'LPV ÷ cliques ⚠️', flagFor('connect', cur.connect)),
      kpi('Compras (pixel)', M.int(cur.purPixel), 'Adveronix — atribuição', ''),
      kpi('Custo/checkout', M.money(cur.cpic), 'bom ≤ R$18', flagFor('cpic', cur.cpic))
    ];

    $('trafficView').innerHTML =
      '<div class="scopenote"><span>🎯 Aba operacional: tudo aqui vem do <b>pixel (Adveronix)</b> — as métricas de mídia e a atribuição de compras por anúncio. Compras do pixel são <b>sinal de otimização</b>, não faturamento (o faturamento real é a Tutory, na Visão Geral).</span></div>' +
      '<div class="kpis">' + kpis.join('') + '</div>' +
      '<div class="panel"><h2>Investimento por funil <span style="font-weight:500;color:var(--ink-3)">— com imposto ×' + taxStr(TAX) + '</span></h2><div class="funil-grid" id="funilInv"></div></div>' +
      '<div class="panel"><h2>Otimização — Campanha › Conjunto › Anúncio</h2>' +
      '<p class="note">Clique numa <b>campanha</b> pra abrir os conjuntos, e num conjunto pra abrir os anúncios. Clique nos cabeçalhos pra ordenar. Atribuição de compras por <b>pixel</b>. Heatmap: verde = melhor. (px) = pixel.</p>' +
      '<div class="tblwrap"><table id="tbl" class="tree"></table></div></div>';

    renderFunilInv(from, to);
    renderTree(from, to);
  }
  function flagFor(k, v) {
    var st = statusOf(v, BANDS[k]); if (!st) return '';
    return '<span class="rep-flag ' + st.cls + '">' + st.word + '</span>';
  }
  function sortNodes(list, key, dir) {
    return list.slice().sort(function (a, b) {
      if (key === 'label') return dir * a.label.localeCompare(b.label, 'pt-BR');
      var av = a[key], bv = b[key], an = !ok(av), bn = !ok(bv);
      if (an && bn) return 0; if (an) return 1; if (bn) return -1; return dir * (av - bv);
    });
  }
  function renderTree(from, to) {
    var camps = buildTree(from, to);
    var key = STATE.treeSort.key, dir = STATE.treeSort.dir;
    // escala de cor no nível de campanha
    var scales = {};
    TCOLS.filter(function (c) { return c.scale; }).forEach(function (c) {
      var vals = camps.filter(function (r) { return r.spend > 0 && ok(r[c.k]); }).map(function (r) { return r[c.k]; });
      if (vals.length > 1) scales[c.k] = { min: Math.min.apply(null, vals), max: Math.max.apply(null, vals), dir: c.scale };
    });
    function shade(k, v) { var s = scales[k]; if (!s || !ok(v) || s.max === s.min) return ''; var t = (v - s.min) / (s.max - s.min); if (s.dir === 'low') t = 1 - t; if (t < 0.15) return ''; return 'background:color-mix(in srgb,var(--scale-ink) ' + Math.round(t * 32) + '%,transparent)'; }
    var head = TCOLS.map(function (c) { var active = key === c.k; var arw = active ? (dir === 1 ? '▲' : '▼') : '▾'; return '<th data-k="' + c.k + '"' + (active ? ' data-active' : '') + '>' + c.label + '<span class="arw">' + arw + '</span></th>'; }).join('');
    function flatten() {
      var out = [];
      sortNodes(camps, key, dir).forEach(function (c) {
        out.push(c);
        if (STATE.expanded[c.key]) sortNodes(c.kids, key, dir).forEach(function (s) {
          out.push(s);
          if (STATE.expanded[s.key]) sortNodes(s.kids, key, dir).forEach(function (a) { out.push(a); });
        });
      });
      return out;
    }
    function rowHTML(r) {
      var exp = r.level < 2 && r.kids && r.kids.length > 0, open = STATE.expanded[r.key];
      var caret = '<span class="caret">' + (exp ? '▸' : '') + '</span>';
      return '<tr class="lv' + r.level + (exp ? ' exp' : '') + (open ? ' open' : '') + '" data-key="' + encodeURIComponent(r.key) + '">' +
        '<td><span class="nm">' + caret + esc(r.label) + '</span></td>' +
        TCOLS.slice(1).map(function (c) { var st = c.scale ? shade(c.k, r[c.k]) : ''; var v = c.fmt(r[c.k]); return '<td>' + (st ? '<span class="cell-scale" style="' + st + '">' + v + '</span>' : v) + '</td>'; }).join('') + '</tr>';
    }
    var RAW = ['spend', 'impr', 'reach', 'clk', 'lpv', 'pur', 'val'];
    var tot = tderive(camps.reduce(function (t, r) { RAW.forEach(function (k) { t[k] += r[k]; }); return t; }, tblank('')));
    var rows = flatten();
    $('tbl').innerHTML = '<thead><tr>' + head + '</tr></thead><tbody>' +
      (rows.map(rowHTML).join('') || '<tr><td colspan="' + TCOLS.length + '" style="text-align:center;color:var(--ink-3);padding:32px">Sem dados no período.</td></tr>') +
      '</tbody><tfoot><tr><td>Total — ' + camps.length + ' campanha(s)</td>' + TCOLS.slice(1).map(function (c) { return '<td>' + c.fmt(tot[c.k]) + '</td>'; }).join('') + '</tr></tfoot>';
    Array.prototype.forEach.call(document.querySelectorAll('#tbl tbody tr.exp'), function (tr) {
      tr.querySelector('td:first-child').onclick = function () { var k = decodeURIComponent(tr.dataset.key); STATE.expanded[k] = !STATE.expanded[k]; renderTree(from, to); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('#tbl thead th'), function (th) {
      th.onclick = function () { var k = th.dataset.k; STATE.treeSort = key === k ? { key: k, dir: -dir } : { key: k, dir: k === 'label' ? 1 : -1 }; renderTree(from, to); };
    });
  }

  /* ================================================================ RELATÓRIO */
  function repStat(l, v) { return '<div class="rep-stat"><div class="l">' + l + '</div><div class="v">' + v + '</div></div>'; }
  function renderReport() {
    var from = STATE.from, to = STATE.to, days = diffDays(from, to) + 1;
    var pTo = dayAdd(from, -1), pFrom = dayAdd(pTo, -(days - 1));
    var cur = aggregate(from, to), prev = aggregate(pFrom, pTo);
    var dRows = dailyRows(from, to), camps = buildTree(from, to), ads = adsByName(from, to);
    var perLabel = days === 1 ? brFull(from) : brFull(from) + ' a ' + brFull(to) + ' · ' + days + ' dias';

    /* ---- blocos visuais (print pro cliente) ---- */
    function selo(k, v) { var st = statusOf(v, BANDS[k]); return st ? '<span class="rep-flag ' + st.cls + '">' + st.word + '</span>' : ''; }
    var dTbl = '<div class="tblwrap"><table style="min-width:520px"><thead><tr><th style="text-align:left">Dia</th><th>Gasto</th><th>Cliques</th><th>Checkouts</th><th>Vendas</th><th>Fat.</th><th>ROAS</th></tr></thead><tbody>' +
      dRows.slice().reverse().map(function (r) { return '<tr><td style="text-align:left">' + brFull(r.d) + '</td><td>' + M.money(r.spend) + '</td><td>' + int(r.clk) + '</td><td>' + int(r.ic) + '</td><td>' + int(r.vendas) + '</td><td>' + M.money(r.fat) + '</td><td>' + M.x(r.roas) + '</td></tr>'; }).join('') + '</tbody></table></div>';

    var flt = cur.filtered;
    var secVisual =
      '<div class="rep-sec"><div class="step">1 · RESUMO</div><h3>📊 Números do período</h3><div class="rep-stats">' +
      repStat('Investimento total', M.money(cur.spend)) + repStat('Invest. em venda', M.money(cur.spendVenda)) +
      repStat('Faturamento (Tutory)', M.money(cur.fat)) + repStat('Vendas (Tutory)', int(cur.vendas)) +
      repStat('ROAS', M.x(cur.roas)) + repStat('CAC', M.money(cur.cac)) + '</div>' +
      '<p class="rep-p muted">Resultado de caixa no período (faturamento − investimento total): <b>' + M.money(cur.resultado) + '</b>. Vendas/faturamento = <b>venda aprovada</b> da planilha da Tutory (real da conta).' +
      (flt ? ' <b>Filtro de campanha ativo:</b> a mídia (investimento/CTR/CPC) é filtrada; as vendas mostradas são o total do lançamento no período.' : '') + '</p></div>' +

      '<div class="rep-sec"><div class="step">2 · TOPO DE FUNIL (MÍDIA)</div><h3>🚀 Eficiência da mídia</h3><div class="rep-stats">' +
      repStat('CTR ' + selo('ctr', cur.ctr), M.pct1(cur.ctr)) + repStat('CPC ' + selo('cpc', cur.cpc), M.money(cur.cpc)) +
      repStat('CPM ' + selo('cpm', cur.cpm), M.money(cur.cpm)) + repStat('Impressões', int(cur.impr)) + repStat('Cliques', int(cur.clk)) + '</div>' +
      '<p class="rep-p muted">Selos pela régua do nicho: CTR (link) bom ≥ 1,8% · CPC bom ≤ R$1,80 · CPM bom ≤ R$28.</p></div>' +

      '<div class="rep-sec"><div class="step">3 · FUNIL COMPLETO</div><h3>🔻 Do clique à venda</h3><div class="rep-stats">' +
      repStat('Page views', int(cur.lpv)) + repStat('Checkouts (IC)', int(cur.ic)) +
      repStat('Custo/checkout ' + selo('cpic', cur.cpic), M.money(cur.cpic)) +
      repStat('Conv. checkout ' + selo('convCheck', cur.convCheck), M.pct1(cur.convCheck)) + repStat('Ticket médio', M.money(cur.ticket)) + '</div>' +
      (cur.lpv < cur.clk * 0.3 ? '<p class="rep-p muted">⚠️ Page views parecem subnotificados pelo pixel (LPV ≪ cliques) — leia a connect rate com cautela.</p>' : '') + '</div>' +

      '<div class="rep-sec"><div class="step">4 · DIA A DIA</div><h3>📅 Funil por dia</h3>' + dTbl + '</div>' +

      '<div class="rep-sec"><div class="step">5 · CAMPANHAS</div><h3>🗂️ Investimento e compras (pixel)</h3>' +
      '<div class="tblwrap"><table style="min-width:520px"><thead><tr><th style="text-align:left">Campanha</th><th>Gasto</th><th>CTR</th><th>CPC</th><th>Compras (px)</th><th>Custo/compra</th></tr></thead><tbody>' +
      camps.filter(function (c) { return c.spend > 0; }).sort(function (a, b) { return b.spend - a.spend; }).map(function (c) { return '<tr><td style="text-align:left">' + esc(c.label) + '</td><td>' + M.money(c.spend) + '</td><td>' + M.pct1(c.ctr) + '</td><td>' + M.money(c.cpc) + '</td><td>' + int(c.pur) + '</td><td>' + M.money(c.custoCompra) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +

      '<div class="rep-sec"><div class="step">6 · MELHORES ANÚNCIOS</div><h3>🏆 Destaques pra produzir mais</h3>' +
      (function () {
        var b = ads.filter(function (a) { return a.pur > 0; }).sort(function (a, z) { return (z.pur - a.pur) || (a.custoCompra - z.custoCompra); }).slice(0, 6);
        return b.length ? b.map(function (a) { return '<div class="rep-ad"><div><span class="nm">' + esc(a.label) + '</span> <span class="mt">· ' + int(a.pur) + ' compra(s) px · custo/compra ' + M.money(a.custoCompra) + ' · ' + M.money(a.spend) + ' gastos</span></div><input data-adlink="' + encodeURIComponent(a.label) + '" placeholder="cole o link do anúncio (Instagram)"></div>'; }).join('')
          : '<p class="rep-p muted">Sem compras atribuídas a um anúncio específico no período (pixel).</p>';
      })() + '</div>';

    /* ---- briefing do gestor (interno) ---- */
    var brief = [];
    var xGeral = 'Investimento total ' + M.money(cur.spend) + ' (Venda ' + M.money(cur.spendVenda) + ' · Topo ' + M.money(cur.spendTopo) + '). Faturamento ' + M.money(cur.fat) + ' em ' + int(cur.vendas) + ' venda(s) → ROAS ' + M.x(cur.roas) + ', CAC ' + M.money(cur.cac) + '. Resultado de caixa ' + M.money(cur.resultado) + '.'
      + (cur.vendas > 0 && ok(cur.roas) && cur.roas < 1 ? ' O retorno ainda está abaixo de 1x — cada real investido volta ' + M.money(cur.roas) + '.' : '');
    brief.push({ t: 'Leitura geral', h: '<p>' + xGeral + '</p>', x: xGeral });

    var topStatus = [['ctr', cur.ctr], ['cpc', cur.cpc], ['cpm', cur.cpm]].map(function (p) { var st = statusOf(p[1], BANDS[p[0]]); return BANDS[p[0]].label + ' ' + BANDS[p[0]].fmt(p[1]) + ' (' + (st ? st.word : '—') + ')'; }).join(' · ');
    var allTopGood = ['ctr', 'cpc', 'cpm'].every(function (k) { var st = statusOf(cur[k], BANDS[k]); return st && st.lvl === 'good'; });
    var xTopo = 'Topo de funil: ' + topStatus + '. ' + (allTopGood ? 'A mídia está barata e atraente — o problema NÃO é gerar clique/atenção, é converter em venda.' : 'Há espaço pra melhorar a mídia (criativo/público) antes de escalar.');
    brief.push({ t: 'Topo de funil (mídia)', h: '<p>' + xTopo + '</p>', x: xTopo });

    var xFundo;
    if (cur.vendas === 0) xFundo = 'Nenhuma venda no período — sem base pra medir conversão de fundo. Foco em volume qualificado e checar rastreamento (pixel de LPV/checkout).';
    else {
      var stCheck = statusOf(cur.convCheck, BANDS.convCheck);
      xFundo = 'Checkouts iniciados ' + int(cur.ic) + ', vendas ' + int(cur.vendas) + ' → conversão de checkout ' + M.pct1(cur.convCheck) + ' (' + (stCheck ? stCheck.word : '—') + '). Custo por checkout ' + M.money(cur.cpic) + '. '
        + (cur.lpv < cur.clk * 0.3 ? 'ATENÇÃO: LPV (' + int(cur.lpv) + ') muito abaixo dos cliques (' + int(cur.clk) + ') — quase certo que é o pixel de Landing Page View não disparando; a connect rate real deve ser bem maior. Vale conferir o rastreamento antes de concluir que a página não converte.' : '')
        + ' Com CAC ' + M.money(cur.cac) + ' vs ticket ' + M.money(cur.ticket) + ', o retorno só fecha aumentando muito o volume de vendas ou o ticket (upsell/order bump).';
    }
    brief.push({ t: 'Fundo de funil (conversão)', h: '<p>' + xFundo + '</p>', x: xFundo });

    var ds = dRows.filter(function (r) { return r.vendas > 0; });
    var xDia;
    if (ds.length) {
      var best = ds.reduce(function (a, b) { return (b.cac || 1e9) < (a.cac || 1e9) ? b : a; });
      var worst = ds.reduce(function (a, b) { return (b.cac || 0) > (a.cac || 0) ? b : a; });
      xDia = ds.length + ' dia(s) com venda. Melhor: ' + brFull(best.d) + ' (CAC ' + M.money(best.cac) + ', ' + int(best.vendas) + ' vd)' + (worst !== best ? ' · pior: ' + brFull(worst.d) + ' (CAC ' + M.money(worst.cac) + ')' : '') + '.';
    } else xDia = 'Sem vendas dia a dia no período — o gráfico de vendas fica zerado, mas o investimento/cliques continuam rodando.';
    brief.push({ t: 'Dia a dia', h: '<p>' + xDia + '</p>', x: xDia });

    // campanhas / anúncios (via pixel + gasto)
    var active = camps.filter(function (c) { return c.spend > 0; });
    var burning = ads.filter(function (a) { return a.spend >= cur.ticket * 2 && a.pur === 0; }).sort(function (a, b) { return b.spend - a.spend; }).slice(0, 4);
    var winners = ads.filter(function (a) { return a.pur > 0 && ok(a.custoCompra); }).sort(function (a, b) { return a.custoCompra - b.custoCompra; }).slice(0, 4);
    var campHtml = '';
    if (winners.length) campHtml += '<p><span class="rep-flag g">CAMPEÕES</span> menor custo/compra (pixel):</p><ul>' + winners.map(function (a) { return '<li><b>' + esc(a.label) + '</b> — ' + int(a.pur) + ' compra(s) px, custo/compra ' + M.money(a.custoCompra) + ', ' + M.money(a.spend) + ' gastos.</li>'; }).join('') + '</ul>';
    if (burning.length) campHtml += '<p style="margin-top:10px"><span class="rep-flag r">QUEIMANDO VERBA</span> gasto relevante sem compra (pixel):</p><ul>' + burning.map(function (a) { return '<li><b>' + esc(a.label) + '</b> — ' + M.money(a.spend) + ' gastos, 0 compra px — candidato a pausar/revisar criativo.</li>'; }).join('') + '</ul>';
    if (!campHtml) campHtml = '<p class="rep-p muted">Ainda sem volume por anúncio pra separar campeões de perdedores com segurança.</p>';
    campHtml += '<p class="rep-p muted" style="margin-top:8px">Atribuição por pixel — sinal de otimização, não faturamento. Não sei o que você já pausou.</p>';
    var campX = 'Campeões (custo/compra px): ' + (winners.map(function (a) { return a.label + ' (' + M.money(a.custoCompra) + ')'; }).join('; ') || '—') + '.\nQueimando verba: ' + (burning.map(function (a) { return a.label + ' (' + M.money(a.spend) + ', 0 compra)'; }).join('; ') || '—') + '.';
    brief.push({ t: 'Campanhas / anúncios', h: campHtml, x: campX });

    // insights e gargalos
    var ins = [];
    var topGoods = ['ctr', 'cpc', 'cpm'].filter(function (k) { var st = statusOf(cur[k], BANDS[k]); return st && st.lvl === 'good'; });
    if (topGoods.length >= 2) ins.push(['✅', '<b>Topo forte:</b> ' + topGoods.map(function (k) { return BANDS[k].label; }).join(', ') + ' dentro da faixa boa. A mídia entrega volume barato — o ganho está em converter melhor, não em gerar mais clique.']);
    if (cur.vendas > 0 && ok(cur.roas) && cur.roas < 1) ins.push(['⛔', '<b>Maior gargalo — conversão em venda:</b> ROAS ' + M.x(cur.roas) + ' (abaixo de 1x). Com CTR/CPC ótimos, o furo está na oferta/página/checkout ou no volume ainda pequeno de vendas (' + int(cur.vendas) + ').']);
    if (cur.lpv < cur.clk * 0.3) ins.push(['🔎', '<b>Rastreamento suspeito:</b> só ' + int(cur.lpv) + ' page views pra ' + int(cur.clk) + ' cliques. Provável pixel de LPV não disparando na landing — corrigir pra enxergar a connect rate real e o funil de verdade.']);
    if (cur.vendas === 0 && cur.spend > 0) ins.push(['⏳', '<b>Sem venda ainda:</b> ' + M.money(cur.spend) + ' investidos, 0 venda no período. Se o topo está bom, priorize testar oferta/página e garantir o rastreamento antes de aumentar verba.']);
    burning.slice(0, 2).forEach(function (a) { ins.push(['🔥', '<b>Queimando verba:</b> "' + esc(a.label) + '" gastou ' + M.money(a.spend) + ' sem compra (pixel) — candidato a pausar.']); });
    winners.slice(0, 2).forEach(function (a) { ins.push(['⭐', '<b>Pode surpreender:</b> "' + esc(a.label) + '" custo/compra ' + M.money(a.custoCompra) + ' com ' + int(a.pur) + ' compra(s) px — colocar mais verba e criar variações.']); });
    ins.push(['🧭', ok(cur.roas) && cur.roas >= 1 ? '<b>Resumo:</b> retorno acima de 1x — momento de escalar com cuidado mantendo o CAC.' : '<b>Resumo:</b> topo saudável, retorno ainda baixo. A alavanca do período é conversão (oferta/página/checkout) + rastreamento, não mais tráfego.']);
    var insHtml = '<div>' + ins.map(function (i) { return '<div class="insight"><span class="ico">' + i[0] + '</span><span class="tx">' + i[1] + '</span></div>'; }).join('') + '</div>';
    brief.push({ t: 'Insights e gargalos', h: insHtml, x: ins.map(function (i) { return '• ' + i[1].replace(/<[^>]+>/g, ''); }).join('\n') });

    // próximos passos
    var sug = [];
    if (cur.lpv < cur.clk * 0.3) sug.push('Corrigir o rastreamento de Landing Page View / checkout no pixel — hoje o funil do meio está cego.');
    if (ok(cur.roas) && cur.roas < 1) sug.push('Atacar conversão: testar oferta (preço/bônus/garantia), headline da página/VSL e reduzir fricção no checkout (Pix fácil).');
    if (winners.length) sug.push('Escalar os campeões de custo/compra: ' + winners.slice(0, 3).map(function (a) { return esc(a.label); }).join(', ') + '.');
    burning.slice(0, 2).forEach(function (a) { sug.push('Pausar/revisar "' + esc(a.label) + '" (' + M.money(a.spend) + ' sem compra).'); });
    if (allTopGood) sug.push('Não mexer no topo (CTR/CPC/CPM já bons) — foco todo no fundo de funil.');
    if (!sug.length) sug.push('Manter monitoramento diário do CAC e do volume de vendas.');
    brief.push({ t: 'Próximos passos (sugestões)', h: '<ul>' + sug.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>', x: sug.map(function (s) { return '• ' + s.replace(/<[^>]+>/g, ''); }).join('\n') });

    var briefText = 'BRIEFING DO GESTOR — Família Aprovada · A Próxima Carreira\n' + perLabel + '\n\n' + brief.map(function (s) { return s.t.toUpperCase() + '\n' + s.x; }).join('\n\n') + '\n\n— gerado pela dashboard (' + (D.generatedAt || '') + ' ' + (D.tz || 'BRT') + ')';

    var briefingBlock = '<div class="briefing"><div class="bh"><h3>🔒 Briefing do gestor <span style="font-weight:500;font-size:12px;color:var(--ink-3)">— uso interno, não vai no print/cliente.</span></h3><button class="rep-copy" id="repCopy">📋 Copiar briefing</button></div>' +
      brief.map(function (s) { return '<div class="brief-sub"><div class="bt">' + s.t + '</div>' + s.h + '</div>'; }).join('') +
      '<div class="brief-scratch"><div class="bt" style="color:var(--brand)">✍️ Suas anotações (rascunho)</div><textarea data-note="scratch" rows="3" placeholder="rascunho livre pra você…"></textarea></div></div>';

    $('reportView').innerHTML = '<div class="report"><div class="rep-head"><div><h2>📄 Relatório — ' + esc(perLabel) + '</h2>' +
      '<p class="sub" style="margin-top:2px">Muda sozinho conforme o período · dados de ' + esc(D.generatedAt || '—') + '</p></div></div>' +
      '<p class="sub" style="margin:0 0 8px">⬇️ Blocos visuais limpos (é o que você manda em print pro cliente). Seu <b style="color:var(--ink-2)">briefing interno</b> fica no final.</p>' +
      secVisual + briefingBlock + '</div>';

    // persistência local (anotações e links de anúncio)
    Array.prototype.forEach.call(document.querySelectorAll('#reportView [data-note]'), function (t) {
      var k = 'fa-note-' + t.dataset.note; try { t.value = localStorage.getItem(k) || ''; } catch (e) { }
      t.oninput = function () { try { localStorage.setItem(k, t.value); } catch (e) { } };
    });
    Array.prototype.forEach.call(document.querySelectorAll('#reportView [data-adlink]'), function (inp) {
      var k = 'fa-adlink-' + decodeURIComponent(inp.dataset.adlink); try { inp.value = localStorage.getItem(k) || ''; } catch (e) { }
      inp.oninput = function () { try { localStorage.setItem(k, inp.value); } catch (e) { } };
    });
    $('repCopy').onclick = function (e) {
      var btn = e.currentTarget, scratch = ''; try { scratch = (localStorage.getItem('fa-note-scratch') || '').trim(); } catch (_) { }
      var full = briefText + (scratch ? '\n\nSUAS ANOTAÇÕES\n' + scratch : '');
      navigator.clipboard.writeText(full).then(function () { btn.textContent = '✅ Copiado!'; setTimeout(function () { btn.textContent = '📋 Copiar briefing'; }, 1800); }).catch(function () { btn.textContent = '❌ copie manualmente'; });
    };
  }

  /* ================================================================ filtro de campanha */
  function setCamps(sel) {
    // sel = array de nomes selecionados; null/vazio/todas → STATE.camps=null (todas)
    if (!sel || sel.length === 0 || sel.length >= ALL_CAMPS.length) STATE.camps = null;
    else { STATE.camps = {}; sel.forEach(function (n) { STATE.camps[n] = true; }); }
    try { localStorage.setItem('fa-camps', STATE.camps ? JSON.stringify(Object.keys(STATE.camps)) : ''); } catch (e) { }
    updateCampBtn();
  }
  function updateCampBtn() {
    var b = $('campBtn'); if (!b) return;
    b.textContent = (STATE.camps ? (campSelectedCount() + ' de ' + ALL_CAMPS.length + ' campanhas') : 'Todas as campanhas') + ' ▾';
    b.classList.toggle('on', campFilterActive());
  }
  function renderCampPanel() {
    var p = $('campPanel'); if (!p) return;
    var allChecked = !STATE.camps;
    var rows = ALL_CAMPS.map(function (c) {
      var ck = allChecked || (STATE.camps && STATE.camps[c] === true);
      return '<label class="dd-item"><input type="checkbox" data-camp="' + encodeURIComponent(c) + '"' + (ck ? ' checked' : '') + '><b class="dd-sp">' + money0(CAMP_SPEND[c]) + '</b><span class="dd-nm">' + esc(c) + '</span></label>';
    }).join('');
    p.innerHTML = '<div class="dd-head"><span>Filtrar campanhas</span><button class="dd-mini" id="campAll">Selecionar todas</button></div>' + rows;
    function current() { var a = []; Array.prototype.forEach.call(p.querySelectorAll('[data-camp]'), function (cb) { if (cb.checked) a.push(decodeURIComponent(cb.dataset.camp)); }); return a; }
    Array.prototype.forEach.call(p.querySelectorAll('[data-camp]'), function (cb) { cb.onchange = function () { setCamps(current()); refresh(); }; });
    $('campAll').onclick = function () { Array.prototype.forEach.call(p.querySelectorAll('[data-camp]'), function (cb) { cb.checked = true; }); setCamps(null); refresh(); };
  }
  function initCampSelector() {
    var b = $('campBtn'), p = $('campPanel'); if (!b || !p) return;
    // restaura seleção salva
    try { var saved = localStorage.getItem('fa-camps'); if (saved) { var arr = JSON.parse(saved).filter(function (n) { return ALL_CAMPS.indexOf(n) >= 0; }); if (arr.length && arr.length < ALL_CAMPS.length) { STATE.camps = {}; arr.forEach(function (n) { STATE.camps[n] = true; }); } } } catch (e) { }
    updateCampBtn();
    b.onclick = function (e) { e.stopPropagation(); var open = p.hidden; if (open) renderCampPanel(); p.hidden = !open; b.setAttribute('aria-expanded', String(open)); };
    p.onclick = function (e) { e.stopPropagation(); };
    document.addEventListener('click', function () { if (!p.hidden) { p.hidden = true; b.setAttribute('aria-expanded', 'false'); } });
  }
  function filterBarHTML() {
    if (!campFilterActive()) return '';
    return '<div class="filterbar">🔎 <b>Filtro de campanha ativo</b> — ' + campSelectedCount() + ' de ' + ALL_CAMPS.length + ' campanhas. ' +
      'A <b>mídia</b> (investimento, CTR, CPC, cliques, funil, árvore) é filtrada por campanha. As <b>vendas e o faturamento seguem a Tutory</b> ' +
      '(Tutory, cruzada por UTM ao lançamento): as vendas mostradas são o total do lançamento no período.</div>';
  }

  /* ================================================================ shell / roteamento */
  function refresh() {
    var len = diffDays(STATE.from, STATE.to) + 1;
    $('filterBar').innerHTML = filterBarHTML();
    $('cmpNote').textContent = STATE.compare
      ? 'comparando com ' + brFull(dayAdd(dayAdd(STATE.from, -1), -(len - 1))) + ' – ' + brFull(dayAdd(STATE.from, -1)) + ' (' + len + (len > 1 ? ' dias' : ' dia') + ')'
      : len + (len > 1 ? ' dias selecionados' : ' dia selecionado');
    $('overviewView').hidden = STATE.tab !== 'overview';
    $('trafficView').hidden = STATE.tab !== 'traffic';
    $('reportView').hidden = STATE.tab !== 'report';
    if (STATE.tab === 'overview') renderOverview();
    else if (STATE.tab === 'traffic') renderTraffic();
    else renderReport();
  }
  function setPeriod(from, to, preset) {
    STATE.from = clampD(from); STATE.to = clampD(to); STATE.preset = preset || 'custom';
    $('from').value = STATE.from; $('to').value = STATE.to;
    Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) { b.setAttribute('aria-pressed', b.dataset.preset === STATE.preset); });
    refresh();
  }

  function shell() {
    var m = D;
    $('subtitle').innerHTML = '<b>Funil de venda direta</b> · faturamento real (Tutory) · dados de ' + brFull(minDate) + ' a ' + brFull(maxDate) + ' · ' + int(daily.length) + ' dias com registro';
    $('updated').textContent = 'atualizado ' + esc(m.generatedAt || '—') + ' ' + esc(m.tz || 'BRT');
    $('taxBadge').textContent = TAX === 1 ? 'sem imposto' : 'imposto ×' + taxStr(TAX);
    $('from').min = $('to').min = minDate; $('from').max = $('to').max = maxDate;

    var totalSpend = daily.reduce(function (s, r) { return s + r.spend; }, 0);
    var keys = arr(m.launchKeys).join(', ');
    $('footer').innerHTML =
      'Gasto total do período completo: ' + money(totalSpend) + ' (já com imposto ×' + taxStr(TAX) + '). Ingressos e faturamento: <b>planilha de checkout (Tutory)</b>, cruzada por <b>UTM</b> ao lançamento — fonte da verdade. ' +
      'Atribuição por anúncio: <b>pixel</b> (Adveronix, coluna Purchases) — sinal de otimização, não faturamento. ' +
      'CPA lido contra o <b>LTV de ' + money0(LTV) + '</b> (não contra o ingresso de ' + money0(TICKET) + '). Filtro do lançamento: campanhas contendo <b>' + esc(keys) + '</b>. Somente leitura. ' +
      '<br><b>IC (iniciar checkout)</b> = ' + (HAS_PIXEL_IC
        ? 'finalizações de compra iniciadas pelo <b>pixel/Gerenciador</b> — quem chegou ao checkout vindo do anúncio'
        : 'checkouts iniciados (aguardando o pixel do checkout Tutory)') + ' · <b>Conv. checkout</b> = ingressos ÷ IC.';

    // presets
    Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
      b.onclick = function () {
        var p = b.dataset.preset;
        if (p === 'all') return setPeriod(minDate, maxDate, 'all');
        if (p === 'today') return setPeriod(maxDate, maxDate, 'today');
        if (p === 'yesterday') { var y = dayAdd(maxDate, -1); return setPeriod(y, y, 'yesterday'); }
        if (p === 'month') return setPeriod(firstOfMonth(maxDate), maxDate, 'month');
        var n = +p; return setPeriod(dayAdd(maxDate, -(n - 1)), maxDate, p);
      };
    });
    function clampDates() { var f = $('from').value, t = $('to').value; if (!f || !t) return; if (f > t) { var tmp = f; f = t; t = tmp; } setPeriod(f, t, 'custom'); }
    $('from').onchange = clampDates; $('to').onchange = clampDates;
    $('cmp').onclick = function (e) { STATE.compare = !STATE.compare; e.currentTarget.classList.toggle('on', STATE.compare); e.currentTarget.setAttribute('aria-pressed', STATE.compare); refresh(); };

    // abas
    try { var tv = localStorage.getItem('fa-tab'); if (['overview', 'traffic', 'report'].indexOf(tv) >= 0) STATE.tab = tv; } catch (e) { }
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === STATE.tab);
      b.onclick = function () {
        STATE.tab = b.dataset.tab;
        try { localStorage.setItem('fa-tab', STATE.tab); } catch (e) { }
        Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (x) { x.setAttribute('aria-selected', x.dataset.tab === STATE.tab); });
        refresh();
      };
    });

    initCampSelector();
    setPeriod(minDate, maxDate, 'all');
  }

  /* ---------------------------------------------------------------- tema */
  function applyTheme(t) { document.documentElement.dataset.theme = t; $('theme').textContent = t === 'dark' ? 'Claro' : 'Escuro'; try { localStorage.setItem('fa-theme', t); } catch (e) { } }
  $('theme').onclick = function () { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); };
  // Atualizar: recarrega buscando a última versão publicada do data.js (cache-bust já embutido no index.html)
  $('refresh').onclick = function () { var b = this; b.textContent = '⏳ Atualizando…'; b.disabled = true; setTimeout(function () { location.reload(); }, 60); };
  try { var saved = localStorage.getItem('fa-theme'); applyTheme(saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')); } catch (e) { applyTheme('dark'); }

  /* ---------------------------------------------------------------- boot */
  TIP = $('tip');
  var rt;
  addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (daily.length) refresh(); }, 180); });
  if (!daily.length) { $('overviewView').innerHTML = '<div class="panel"><div class="loading">Sem dados. Rode o build.</div></div>'; }
  else shell();
})();
