let dados = [];
let graficoComparativo = null;
let graficoMetodoDiametro = null;

Chart.register(ChartDataLabels);

/* =========================================================
   CARREGAMENTO DO CSV
========================================================= */
fetch('dados.csv')
  .then(res => res.text())
  .then(csv => {
    dados = csvParaJson(csv);
    carregarFiltros();
    atualizarDashboard();
  });

/* =========================================================
   CSV → JSON
========================================================= */
function csvParaJson(csv) {
  csv = csv.replace(/^\uFEFF/, '');

  const linhas = csv.split(/\r?\n/).filter(l => l.trim() !== '');
  const cab = linhas[0].split(';');

  return linhas.slice(1).map(l => {
    const v = l.split(';');
    let o = {};
    cab.forEach((c, i) => o[c.trim()] = v[i]?.trim() || '');
    return o;
  });
}

/* =========================================================
   FILTROS
========================================================= */
function carregarFiltros() {
  const sel = document.getElementById('filtroContrato');
  sel.innerHTML = '<option value="">Todos os Contratos</option>';

  [...new Set(dados.map(d => d.Contrato).filter(Boolean))].forEach(c => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  });

  sel.addEventListener('change', atualizarDashboard);
}

function limparFiltros() {
  document.getElementById('filtroContrato').value = '';
  atualizarDashboard();
}

/* =========================================================
   DASHBOARD
========================================================= */
function atualizarDashboard() {
  const contrato = document.getElementById('filtroContrato').value;
  const base = contrato ? dados.filter(d => d.Contrato === contrato) : dados;

  atualizarKPIs(base);
  atualizarGraficoComparativo(base);
  atualizarGraficoMetodoDiametro(base);
}

/* =========================================================
   KPIs
========================================================= */
function atualizarKPIs(base) {
  const edital = soma(base, 'Extensao Edital (m)');
  const exec = soma(base, 'Extensao Executivo (m)');
  const dif = exec - edital;
  const perc = edital ? (dif / edital) * 100 : 0;

  // Contagem original: cada linha = 1 frente
  const frentes = base.length;

  document.getElementById('kpiFrentes').innerText = frentes;
  document.getElementById('kpiEdital').innerText = formatar(edital);
  document.getElementById('kpiExec').innerText = formatar(exec);
  document.getElementById('kpiDif').innerText =
    `${formatar(dif)} (${perc.toFixed(1)}%)`;
}
/* =========================================================
   GRÁFICO GERAL
========================================================= */
function atualizarGraficoComparativo(base) {
  const edital = soma(base, 'Extensao Edital (m)');
  const exec = soma(base, 'Extensao Executivo (m)');

  if (graficoComparativo) graficoComparativo.destroy();

  graficoComparativo = new Chart(
    document.getElementById('graficoComparativo'),
    {
      type: 'bar',
      data: {
        labels: ['Edital', 'Executivo'],
        datasets: [{
          data: [edital, exec],
          backgroundColor: ['#6b7280', '#1f4fd8']
        }]
      },
      options: {
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: 'end',
            align: 'end',
            formatter: v => v ? `${formatar(v)} m` : ''
          }
        }
      }
    }
  );
}

/* =========================================================
   MÉTODO × DIÂMETRO (CORRIGIDO)
========================================================= */
function atualizarGraficoMetodoDiametro(base) {

  const mapa = {};

  base.forEach(d => {
    const dnE = d['Diametro Edital (mm)'];
    const mE  = d['Metodo Edital'];
    const eE  = parseNumero(d['Extensao Edital (m)']);

    const dnX = d['Diametro Executivo (mm)'];
    const mX  = d['Metodo Executivo'];
    const eX  = parseNumero(d['Extensao Executivo (m)']);

    // --- EDITAL ---
    if (dnE && mE && !isNaN(eE)) {
      const k = `${dnE}||${mE}`;
      if (!mapa[k]) mapa[k] = { edital: 0, executivo: 0 };
      mapa[k].edital += eE;
    }

    // --- EXECUTIVO (somente se existir) ---
    if (dnX && mX && !isNaN(eX)) {
      const k = `${dnX}||${mX}`;
      if (!mapa[k]) mapa[k] = { edital: 0, executivo: 0 };
      mapa[k].executivo += eX;
    }
  });

  const chaves = Object.keys(mapa);
  if (chaves.length === 0) return;

  const labels = chaves.map(k => {
    const [dn, m] = k.split('||');
    return `DN ${dn} – ${m}`;
  });

  const dadosEdital = chaves.map(k => mapa[k].edital);
  const dadosExec   = chaves.map(k => mapa[k].executivo);

  if (graficoMetodoDiametro) graficoMetodoDiametro.destroy();

  graficoMetodoDiametro = new Chart(
    document.getElementById('graficoMetodoDiametro'),
    {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Edital (m)',
            data: dadosEdital,
            backgroundColor: '#6b7280'
          },
          {
            label: 'Executivo (m)',
            data: dadosExec,
            backgroundColor: '#1f4fd8'
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: { font: { size: 9 } }
          },
          datalabels: {
            anchor: 'end',
            align: 'end',
            font: { weight: 'bold', size: 10 },
            formatter: v => v > 0 ? `${formatar(v)} m` : ''
          }
        },
        scales: {
          x: {
            ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 45 }
          },
          y: {
            ticks: {
              font: { size: 9 },
              callback: v => formatar(v)
            }
          }
        }
      }
    }
  );
}

/* =========================================================
   AUXILIARES
========================================================= */
function soma(base, campo) {
  return base.reduce((t, d) => {
    const v = parseNumero(d[campo]);
    return t + (isNaN(v) ? 0 : v);
  }, 0);
}

function parseNumero(v) {
  if (v === null || v === undefined || v === '' || v === '-') return NaN;

  // Se já for número (Excel exporta assim às vezes)
  if (typeof v === 'number') return v;

  v = v.toString().trim();

  // pt-BR clássico: 10.204,97
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(v)) {
    return parseFloat(v.replace(/\./g, '').replace(',', '.'));
  }

  // milhar sem decimal: 19.409 / 931.580
  if (/^\d{1,3}(\.\d{3})+$/.test(v)) {
    return parseFloat(v.replace(/\./g, ''));
  }

  // decimal com ponto: 1234.56
  if (/^\d+\.\d+$/.test(v)) {
    return parseFloat(v);
  }

  // decimal com vírgula: 1234,56
  if (/^\d+,\d+$/.test(v)) {
    return parseFloat(v.replace(',', '.'));
  }

  return NaN;
}
function formatar(v) {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
