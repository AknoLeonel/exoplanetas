// Site de exoplanetas: lê os JSON gerados por `python -m exoplanetas.pipeline`.
// Todo número exibido vem de dados/metricas.json.

const NOMES_METODO = {
  Transit: 'Trânsito',
  'Radial Velocity': 'Velocidade radial',
  Microlensing: 'Microlente',
  Imaging: 'Imagem direta',
  Outros: 'Outros',
};
const ORDEM_SERIES = ['Transit', 'Radial Velocity', 'Microlensing', 'Imaging', 'Outros'];
const NOMES_MODELO = {
  'Mediana (referência)': 'Chutar a mediana',
  'Lei de potência massa-raio': 'Lei de potência (só massa)',
  'Gradient boosting (todas as variáveis)': 'Gradient boosting (massa, órbita e estrela)',
};

const nf = (d = 0) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt = (v, d = 0) => nf(d).format(v);
const pct = (v, d = 1) => `${fmt(v, d)}%`;
const css = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- tema ----------
const raiz = document.documentElement;
const botaoTema = document.getElementById('tema');
const temaSalvo = (() => {
  try {
    return localStorage.getItem('tema');
  } catch {
    return null;
  }
})();
if (temaSalvo) raiz.dataset.theme = temaSalvo;
const redesenhar = new Set();
botaoTema.addEventListener('click', () => {
  const escuro = raiz.dataset.theme ? raiz.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  raiz.dataset.theme = escuro ? 'light' : 'dark';
  try {
    localStorage.setItem('tema', raiz.dataset.theme);
  } catch {}
  for (const f of redesenhar) f();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  for (const f of redesenhar) f();
});

// ---------- canvas utilitário ----------
function preparar(container) {
  const canvas = container.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = container.clientWidth;
  const h = container.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  container.querySelector('.skel')?.remove();
  return { canvas, ctx, w, h };
}

function posicionarDica(dica, container, x, y) {
  const largura = dica.offsetWidth || 200;
  const altura = dica.offsetHeight || 90;
  const left = x + 16 + largura > container.clientWidth ? x - largura - 16 : x + 16;
  const top = Math.max(4, Math.min(y - altura / 2, container.clientHeight - altura - 4));
  dica.style.left = `${Math.max(4, left)}px`;
  dica.style.top = `${top}px`;
  dica.classList.add('on');
}

function linhasDica(titulo, pares) {
  const b = document.createElement('b');
  b.textContent = titulo;
  const out = [b];
  for (const [k, v] of pares) {
    const row = document.createElement('div');
    row.className = 'row';
    const a = document.createElement('span');
    a.textContent = k;
    const c = document.createElement('span');
    c.textContent = v;
    row.append(a, c);
    out.push(row);
  }
  return out;
}

// ---------- dispersão período × raio ----------
function dispersao(container, planetas) {
  const dica = container.querySelector('.tip');
  const X = [0.15, 3000];
  const Y = [0.25, 40];
  const M = { l: 52, r: 12, t: 12, b: 44 };
  let modo = 'medido';
  let busca = '';
  let hover = null;
  let pontos = [];
  let geo;

  const lx = (v) => Math.log10(v);
  function escala(w, h) {
    const sx = (v) => M.l + ((lx(v) - lx(X[0])) / (lx(X[1]) - lx(X[0]))) * (w - M.l - M.r);
    const sy = (v) => h - M.b - ((lx(v) - lx(Y[0])) / (lx(Y[1]) - lx(Y[0]))) * (h - M.t - M.b);
    return { sx, sy };
  }

  function desenhar() {
    geo = preparar(container);
    const { ctx, w, h } = geo;
    const { sx, sy } = escala(w, h);
    const ink2 = css('--ink-2');
    const ink3 = css('--ink-3');
    const grade = css('--grid');
    const s1 = css('--s1');
    const s5 = css('--s5');

    // deserto de Netunos quentes: período < 3 dias, raio 2 a 6
    ctx.fillStyle = css('--desert');
    ctx.fillRect(sx(X[0]), sy(6), sx(3) - sx(X[0]), sy(2) - sy(6));

    ctx.font = '12px "IBM Plex Sans", system-ui, sans-serif';
    ctx.lineWidth = 1;
    for (const v of [0.3, 1, 3, 10, 30, 100, 300, 1000]) {
      ctx.strokeStyle = grade;
      ctx.beginPath();
      ctx.moveTo(sx(v), M.t);
      ctx.lineTo(sx(v), h - M.b);
      ctx.stroke();
      ctx.fillStyle = ink2;
      ctx.textAlign = 'center';
      ctx.fillText(fmt(v, v < 1 ? 1 : 0), sx(v), h - M.b + 18);
    }
    for (const v of [0.3, 1, 3, 10, 30]) {
      ctx.strokeStyle = grade;
      ctx.beginPath();
      ctx.moveTo(M.l, sy(v));
      ctx.lineTo(w - M.r, sy(v));
      ctx.stroke();
      ctx.fillStyle = ink2;
      ctx.textAlign = 'right';
      ctx.fillText(fmt(v, v < 1 ? 1 : 0), M.l - 8, sy(v) + 4);
    }
    ctx.textAlign = 'center';
    ctx.fillText('Período orbital (dias)', M.l + (w - M.l - M.r) / 2, h - 6);
    ctx.save();
    ctx.translate(14, M.t + (h - M.t - M.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Raio (Terra = 1)', 0, 0);
    ctx.restore();

    // referências
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = ink3;
    ctx.textAlign = 'right';
    for (const [r, nome] of [
      [1, 'Terra'],
      [3.88, 'Netuno'],
      [11.2, 'Júpiter'],
    ]) {
      ctx.beginPath();
      ctx.moveTo(M.l, sy(r));
      ctx.lineTo(w - M.r, sy(r));
      ctx.stroke();
      ctx.fillStyle = ink2;
      ctx.fillText(nome, w - M.r - 4, sy(r) - 5);
    }
    ctx.setLineDash([]);

    // pontos
    const termo = busca.trim().toLowerCase();
    pontos = [];
    const destacados = [];
    for (const p of planetas) {
      if (modo === 'medido' && !p.medido) continue;
      if (p.periodo < X[0] || p.periodo > X[1] || p.raio < Y[0] || p.raio > Y[1]) continue;
      const x = sx(p.periodo);
      const y = sy(p.raio);
      pontos.push({ x, y, p });
      if (termo && p.nome.toLowerCase().includes(termo)) destacados.push({ x, y, p });
    }
    const apagado = termo && destacados.length > 0;
    ctx.globalAlpha = apagado ? 0.18 : 0.55;
    ctx.fillStyle = s1;
    ctx.strokeStyle = ink3;
    for (const { x, y, p } of pontos) {
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      if (p.medido) ctx.fill();
      else ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const { x, y } of destacados) {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = s5;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = css('--surface');
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    if (hover) {
      ctx.beginPath();
      ctx.arc(hover.x, hover.y, 6, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = css('--ink');
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.fillStyle = ink2;
    ctx.textAlign = 'left';
    ctx.font = '12.5px "IBM Plex Sans", system-ui, sans-serif';
    ctx.fillText('deserto de Netunos quentes', sx(X[0]) + 6, sy(6) + 15);
    container.querySelector('canvas').setAttribute('aria-label', `Dispersão de período orbital contra raio com ${fmt(pontos.length)} planetas`);
    return destacados;
  }

  function maisProximo(mx, my) {
    let melhor = null;
    let d2 = 14 * 14;
    for (const pt of pontos) {
      const dx = pt.x - mx;
      const dy = pt.y - my;
      const d = dx * dx + dy * dy;
      if (d < d2) {
        d2 = d;
        melhor = pt;
      }
    }
    return melhor;
  }

  function mostrar(pt) {
    hover = pt;
    desenhar();
    if (!pt) {
      dica.classList.remove('on');
      return;
    }
    const p = pt.p;
    dica.replaceChildren(
      ...linhasDica(p.nome, [
        ['Raio', `${fmt(p.raio, 2)} × Terra${p.medido ? '' : ' (estimado)'}`],
        ['Período', `${fmt(p.periodo, p.periodo < 10 ? 2 : 0)} dias`],
        ['Massa', p.massa ? `${fmt(p.massa, p.massa < 10 ? 2 : 0)} × Terra` : '—'],
        ['Descoberta', `${p.ano} · ${NOMES_METODO[p.metodo] || p.metodo}`],
      ]),
    );
    posicionarDica(dica, container, pt.x, pt.y);
  }

  function evento(e) {
    const r = container.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    mostrar(maisProximo(t.clientX - r.left, t.clientY - r.top));
  }
  const canvas = container.querySelector('canvas');
  canvas.addEventListener('pointermove', evento);
  canvas.addEventListener('pointerdown', evento);
  canvas.addEventListener('pointerleave', () => mostrar(null));

  for (const b of document.querySelectorAll('[data-raio]')) {
    b.addEventListener('click', () => {
      modo = b.dataset.raio;
      for (const o of document.querySelectorAll('[data-raio]')) o.setAttribute('aria-pressed', String(o === b));
      hover = null;
      dica.classList.remove('on');
      desenhar();
    });
  }
  document.getElementById('busca').addEventListener('input', (e) => {
    busca = e.target.value;
    hover = null;
    const achados = desenhar();
    if (achados.length === 1) mostrar(achados[0]);
    else dica.classList.remove('on');
  });

  desenhar();
  redesenhar.add(desenhar);
  return desenhar;
}

// ---------- barras empilhadas por ano ----------
function barras(container, descobertas) {
  const dica = container.querySelector('.tip');
  const M = { l: 48, r: 8, t: 10, b: 30 };
  const anos = descobertas.anos;
  const series = ORDEM_SERIES.filter((s) => descobertas.series[s]);
  const totais = anos.map((_, i) => series.reduce((acc, s) => acc + descobertas.series[s][i], 0));
  const maximo = Math.max(...totais);
  const passo = maximo > 1000 ? 400 : 100;
  const topo = Math.ceil(maximo / passo) * passo;
  let hover = -1;
  let geo;

  function desenhar() {
    geo = preparar(container);
    const { ctx, w, h } = geo;
    const larguraBanda = (w - M.l - M.r) / anos.length;
    const sy = (v) => h - M.b - (v / topo) * (h - M.t - M.b);
    const cores = ['--s1', '--s2', '--s3', '--s4', '--s5'].map(css);
    const fundo = css('--surface');
    ctx.font = '12px "IBM Plex Sans", system-ui, sans-serif';
    for (let v = 0; v <= topo; v += passo) {
      ctx.strokeStyle = css('--grid');
      ctx.beginPath();
      ctx.moveTo(M.l, sy(v));
      ctx.lineTo(w - M.r, sy(v));
      ctx.stroke();
      ctx.fillStyle = css('--ink-2');
      ctx.textAlign = 'right';
      ctx.fillText(fmt(v), M.l - 8, sy(v) + 4);
    }
    anos.forEach((ano, i) => {
      const x = M.l + i * larguraBanda + larguraBanda * 0.12;
      const largura = Math.max(1, larguraBanda * 0.76);
      let base = 0;
      ctx.globalAlpha = hover === -1 || hover === i ? 1 : 0.45;
      series.forEach((s, k) => {
        const v = descobertas.series[s][i];
        if (!v) return;
        const y0 = sy(base);
        const y1 = sy(base + v);
        ctx.fillStyle = cores[k];
        ctx.fillRect(x, y1, largura, y0 - y1);
        ctx.fillStyle = fundo;
        ctx.fillRect(x, y1, largura, Math.min(1, y0 - y1));
        base += v;
      });
      ctx.globalAlpha = 1;
      if (ano % 5 === 0) {
        ctx.fillStyle = css('--ink-2');
        ctx.textAlign = 'center';
        ctx.fillText(String(ano), x + largura / 2, h - M.b + 18);
      }
    });
  }

  function evento(e) {
    const r = container.getBoundingClientRect();
    const larguraBanda = (geo.w - M.l - M.r) / anos.length;
    const i = Math.floor((e.clientX - r.left - M.l) / larguraBanda);
    if (i < 0 || i >= anos.length) return sair();
    hover = i;
    desenhar();
    const pares = series.filter((s) => descobertas.series[s][i] > 0).map((s) => [NOMES_METODO[s], fmt(descobertas.series[s][i])]);
    pares.push(['Total', fmt(totais[i])]);
    dica.replaceChildren(...linhasDica(String(anos[i]), pares));
    posicionarDica(dica, container, M.l + (i + 0.5) * larguraBanda, e.clientY - r.top);
  }
  function sair() {
    hover = -1;
    desenhar();
    dica.classList.remove('on');
  }
  const canvas = container.querySelector('canvas');
  canvas.addEventListener('pointermove', evento);
  canvas.addEventListener('pointerdown', evento);
  canvas.addEventListener('pointerleave', sair);

  const legenda = document.getElementById('legenda-metodos');
  legenda.replaceChildren(
    ...series.map((s, k) => {
      const span = document.createElement('span');
      const i = document.createElement('i');
      i.style.setProperty('--c', `var(--s${k + 1})`);
      span.append(i, NOMES_METODO[s]);
      return span;
    }),
  );
  desenhar();
  redesenhar.add(desenhar);
}

// ---------- tabelas e textos ----------
function tabela(el, cabecalho, linhas, numericas = []) {
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  cabecalho.forEach((c, i) => {
    const th = document.createElement('th');
    th.textContent = c;
    if (numericas.includes(i)) th.className = 'n';
    trh.append(th);
  });
  thead.append(trh);
  const tbody = document.createElement('tbody');
  for (const { celulas, classe } of linhas) {
    const tr = document.createElement('tr');
    if (classe) tr.className = classe;
    celulas.forEach((c, i) => {
      const td = document.createElement('td');
      if (numericas.includes(i)) td.className = 'n';
      if (c instanceof Node) td.append(c);
      else td.textContent = c;
      tr.append(td);
    });
    tbody.append(tr);
  }
  el.replaceChildren(thead, tbody);
}

function preencher(m) {
  const final = m.modelo.resultados['Gradient boosting (todas as variáveis)'];
  const [a, mes, d] = (m.dados.coletado_em || '').slice(0, 10).split('-');
  const valores = {
    'dados.planetas': fmt(m.dados.planetas),
    'dados.estrelas': fmt(m.dados.estrelas),
    'dados.mr': fmt(m.dados.massas_estimadas_por_relacao_mr),
    'dados.coleta': a ? `${d}/${mes}/${a}` : '—',
    'descobertas.ano_de_pico': String(m.descobertas.ano_de_pico),
    'modelo.erro': pct(final.erro_percentual_mediano),
    'deserto.geral': pct(m.deserto_netunos_quentes.fracao_netunos_geral * 100),
    'deserto.curto': pct(m.deserto_netunos_quentes.fracao_netunos_orbita_curta * 100),
  };
  for (const el of document.querySelectorAll('[data-m]')) {
    if (valores[el.dataset.m] !== undefined) el.textContent = valores[el.dataset.m];
  }
  const v = m.descobertas.virada_do_transito;
  if (v?.ano) {
    document.getElementById('sub-descobertas').textContent =
      `Até ${v.ano - 1}, ${pct(v.fracao_velocidade_radial_antes * 100, 0)} das descobertas vinham da velocidade radial. Em ${v.ano}, o trânsito passou à frente, e os picos são as validações em massa do telescópio Kepler.`;
  }

  const max = Math.max(...Object.values(m.descobertas.por_metodo));
  tabela(
    document.getElementById('tabela-metodos'),
    ['Método', 'Planetas'],
    ORDEM_SERIES.filter((s) => s in m.descobertas.por_metodo).map((s) => {
      const n = m.descobertas.por_metodo[s];
      const cel = document.createElement('div');
      cel.className = 'bar-cell';
      const i = document.createElement('i');
      i.style.width = `${(n / max) * 160}px`;
      cel.append(fmt(n), i);
      return { celulas: [NOMES_METODO[s], cel] };
    }),
    [1],
  );

  tabela(
    document.getElementById('tabela-modelo'),
    ['Modelo', 'Erro mediano', 'Dentro de 20%', 'R² (log)'],
    Object.entries(m.modelo.resultados).map(([nome, r]) => ({
      celulas: [NOMES_MODELO[nome] || nome, pct(r.erro_percentual_mediano), pct(r.dentro_de_20pct), fmt(r.r2_log, 2)],
      classe: nome.startsWith('Gradient') ? 'best' : '',
    })),
    [1, 2, 3],
  );

  tabela(
    document.getElementById('tabela-terra'),
    ['Planeta', 'Raio (Terra = 1)', 'Luz recebida (Terra = 1)', 'Temperatura estimada', 'Distância'],
    m.parecidos_com_a_terra_mais_proximos.map((p) => ({
      celulas: [
        p.pl_name,
        fmt(p.pl_rade, 2),
        fmt(p.pl_insol, 2),
        p.pl_eqt ? `${fmt(p.pl_eqt - 273.15, 0)} °C` : '—',
        `${fmt(p.sy_dist * 3.2616, 1)} anos-luz`,
      ],
    })),
    [1, 2, 3, 4],
  );
}

// ---------- carga ----------
async function json(caminho) {
  const r = await fetch(caminho);
  if (!r.ok) throw new Error(`${caminho}: ${r.status}`);
  return r.json();
}

async function iniciar() {
  try {
    const [metricas, descobertas, planetasCols] = await Promise.all([json('dados/metricas.json'), json('dados/descobertas.json'), json('dados/planetas.json')]);
    preencher(metricas);
    const idx = Object.fromEntries(planetasCols.colunas.map((c, i) => [c, i]));
    const planetas = planetasCols.linhas.map((l) => ({
      nome: l[idx.nome],
      metodo: l[idx.metodo],
      ano: l[idx.ano],
      periodo: l[idx.periodo],
      raio: l[idx.raio],
      massa: l[idx.massa],
      medido: l[idx.medido],
    }));
    const telas = [
      [document.getElementById('scatter'), () => dispersao(document.getElementById('scatter'), planetas)],
      [document.getElementById('bars'), () => barras(document.getElementById('bars'), descobertas)],
    ];
    // lazy: cada gráfico só é montado quando chega perto da tela
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          telas.find(([el]) => el === e.target)[1]();
        }
      },
      { rootMargin: '200px' },
    );
    for (const [el] of telas) io.observe(el);
    let t;
    addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        for (const f of redesenhar) f();
      }, reduz ? 0 : 120);
    });
  } catch (err) {
    for (const el of document.querySelectorAll('.chart')) {
      el.querySelector('.skel')?.remove();
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = `Não foi possível carregar os dados (${err.message}). Recarregue a página.`;
      el.replaceChildren(p);
    }
  }
}

iniciar();
