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
  const selContrato = document.getElementById('filtroContrato');
  const selFrente   = document.getElementById('filtroFrente');

  selContrato.innerHTML = '<option value="">Todos os Contratos</option>';
  selFrente.innerHTML   = '<option value="">Todas as Frentes</option>';

  [...new Set(dados.map(d => d.Contrato).filter(Boolean))].forEach(c => {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    selContrato.appendChild(o);
  });

  [...new Set(dados.map(d => d['Frente de Servico']).filter(Boolean))].forEach(f => {
    const o = document.createElement('option');
    o.value = f;
    o.textContent = f;
    selFrente.appendChild(o);
  });

  selContrato.addEventListener('change', atualizarDashboard);
  selFrente.addEventListener('change', atualizarDashboard);
}

function limparFiltros() {
  document.getElementById('filtroContrato').value = '';
  document.getElementById('filtroFrente').value = '';
  atualizarDashboard();
}
function atualizarFiltroFrente(base) {
  const selFrente = document.getElementById('filtroFrente');
  const frenteSelecionada = selFrente.value;

  selFrente.innerHTML = '<option value="">Todas as Frentes</option>';

  [...new Set(base.map(d => d['Frente de Servico']).filter(Boolean))].forEach(f => {
    const o = document.createElement('option');
    o.value = f;
    o.textContent = f;
    selFrente.appendChild(o);
  });

  // mantém a frente selecionada, se ainda existir
  if ([...selFrente.options].some(o => o.value === frenteSelecionada)) {
    selFrente.value = frenteSelecionada;
  }
}

/* =========================================================
   DASHBOARD
========================================================= */
function atualizarDashboard() {
  const contrato = document.getElementById('filtroContrato').value;
  const frente   = document.getElementById('filtroFrente').value;

  // Base filtrada SOMENTE por contrato
  let baseContrato = dados;

  if (contrato) {
    baseContrato = baseContrato.filter(d => d.Contrato === contrato);
  }

  // Atualiza o combo de frentes com base no contrato
  atualizarFiltroFrente(baseContrato);

  // Agora sim aplica o filtro de frente
  let baseFinal = baseContrato;

  if (frente) {
    baseFinal = baseFinal.filter(d => d['Frente de Servico'] === frente);
  }

  atualizarKPIs(baseFinal);
  atualizarGraficoComparativo(baseFinal);
  atualizarGraficoMetodoDiametro(baseFinal);
}

/* =========================================================
   KPIs
========================================================= */
function atualizarKPIs(base) {
  const edital = soma(base, 'Extensao Edital (m)');
  const exec   = soma(base, 'Extensao Executivo (m)');
  const dif    = exec - edital;
  const perc   = edital ? (dif / edital) * 100 : 0;

  const frentes = base.length;

  document.getElementById('kpiFrentes').innerText = frentes;
  document.getElementById('kpiEdital').innerText  = formatar(edital);
  document.getElementById('kpiExec').innerText    = formatar(exec);
  document.getElementById('kpiDif').innerText     =
    `${formatar(dif)} (${perc.toFixed(1)}%)`;
}

/* =========================================================
   GRÁFICO EDITAL × EXECUTIVO
========================================================= */
function atualizarGraficoComparativo(base) {
  const edital = soma(base, 'Extensao Edital (m)');
  const exec   = soma(base, 'Extensao Executivo (m)');

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
   MÉTODO × DIÂMETRO
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

    if (dnE && mE && !isNaN(eE)) {
      const k = `${dnE}||${mE}`;
      if (!mapa[k]) mapa[k] = { edital: 0, executivo: 0 };
      mapa[k].edital += eE;
    }

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

  if (graficoMetodoDiametro) graficoMetodoDiametro.destroy();

  graficoMetodoDiametro = new Chart(
    document.getElementById('graficoMetodoDiametro'),
    {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Edital (m)', data: chaves.map(k => mapa[k].edital), backgroundColor: '#6b7280' },
          { label: 'Executivo (m)', data: chaves.map(k => mapa[k].executivo), backgroundColor: '#1f4fd8' }
        ]
      },
      options: {
        plugins: {
          datalabels: {
            anchor: 'end',
            align: 'end',
            formatter: v => v > 0 ? `${formatar(v)} m` : ''
          }
        }
      }
    }
  );
}

/* =========================================================
   EXPORTAÇÃO CSV
========================================================= */
function exportarCSV() {
  const contrato = document.getElementById('filtroContrato').value;
  const frente   = document.getElementById('filtroFrente').value;

  let base = dados;
  if (contrato) base = base.filter(d => d.Contrato === contrato);
  if (frente)   base = base.filter(d => d['Frente de Servico'] === frente);

  if (base.length === 0) {
    alert('Nenhum dado para exportar.');
    return;
  }

  const cabecalho = Object.keys(base[0]).join(';');
  const linhas = base.map(l =>
    Object.values(l).map(v => `"${v ?? ''}"`).join(';')
  );

  const csv = [cabecalho, ...linhas].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'dados_filtrados.csv';
  link.click();
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
  if (typeof v === 'number') return v;

  v = v.toString().trim();

  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(v)) {
    return parseFloat(v.replace(/\./g, '').replace(',', '.'));
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(v)) {
    return parseFloat(v.replace(/\./g, ''));
  }
  if (/^\d+\.\d+$/.test(v)) {
    return parseFloat(v);
  }
  if (/^\d+,\d+$/.test(v)) {
    return parseFloat(v.replace(',', '.'));
  }

  return NaN;
}

function formatar(v) {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
