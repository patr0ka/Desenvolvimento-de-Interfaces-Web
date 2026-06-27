const currencyCodes = {
  BRL: 'Real',
  USD: 'Dólar',
  EUR: 'Euro',
  BTC: 'Bitcoin',
};

const quoteElements = {
  BTC: document.getElementById('btc-value'),
  EUR: document.getElementById('eur-value'),
  USD: document.getElementById('usd-value'),
};

const variationElements = {
  BTC: document.getElementById('btc-variation'),
  EUR: document.getElementById('eur-variation'),
  USD: document.getElementById('usd-variation'),
};

const form = document.getElementById('converter-form');
const amountInput = document.getElementById('amount');
const fromCurrency = document.getElementById('from-currency');
const toCurrency = document.getElementById('to-currency');
const resultBox = document.getElementById('conversion-result');
const chartCanvas = document.getElementById('history-chart');

let quotes = {};
let chartInstance = null;
let currentFilter = 'USD';

function formatCurrency(value, currency) {
  if (currency === 'BTC') {
    return `R$ ${value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    })}`;
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatConvertedAmount(value, currency) {
  if (currency === 'BTC') {
    return `${value.toFixed(8)} BTC`;
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function updateQuoteCards() {
  Object.entries(quotes).forEach(([code, item]) => {
    const valueEl = quoteElements[code];
    const variationEl = variationElements[code];

    if (!valueEl || !variationEl) return;

    valueEl.textContent = formatCurrency(item.ask, code);

    const pctChange = Number(item.pctChange || 0);
    variationEl.textContent = `${pctChange > 0 ? '+' : ''}${pctChange.toFixed(2)}%`;
    variationEl.classList.toggle('negative', pctChange < 0);
  });
}

function getRateToBrl(code) {
  if (code === 'BRL') return 1;
  if (!quotes[code]) return null;
  return Number(quotes[code].ask);
}

function convertAmount(amount, from, to) {
  const fromRate = getRateToBrl(from);
  const toRate = getRateToBrl(to);

  if (fromRate === null || toRate === null) {
    return null;
  }

  return (amount * fromRate) / toRate;
}

function updateConverterResult() {
  const amount = Number(amountInput.value);
  const from = fromCurrency.value;
  const to = toCurrency.value;

  if (!Number.isFinite(amount) || amount < 0) {
    resultBox.textContent = 'Informe um valor válido.';
    return;
  }

  const converted = convertAmount(amount, from, to);

  if (converted === null) {
    resultBox.textContent = 'Não foi possível calcular a conversão.';
    return;
  }

  const formatted = formatConvertedAmount(converted, to);
  resultBox.textContent = `${amount.toLocaleString('pt-BR', { maximumFractionDigits: 8 })} ${currencyCodes[from]} = ${formatted}`;
}

async function loadQuotes() {
  try {
    const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL');
    if (!response.ok) throw new Error('Falha ao carregar cotações');

    const data = await response.json();
    quotes = {
      USD: data.USDBRL,
      EUR: data.EURBRL,
      BTC: data.BTCBRL,
    };

    updateQuoteCards();
    updateConverterResult();
  } catch (error) {
    console.error(error);
    Object.values(quoteElements).forEach((el) => {
      if (el) el.textContent = 'Erro ao carregar';
    });
    Object.values(variationElements).forEach((el) => {
      if (el) {
        el.textContent = '--';
        el.classList.remove('negative');
      }
    });
    resultBox.textContent = 'Não foi possível carregar as cotações.';
  }
}

function buildChart(labels, series) {
  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(chartCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: series,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#f7f8fb',
            font: { size: 12, weight: '500' },
            usePointStyle: true,
            padding: 15,
          },
          position: 'top',
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.9)',
          titleColor: '#f7f8fb',
          bodyColor: '#f7f8fb',
          padding: 10,
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: R$ ${context.parsed.y.toFixed(2)}`;
            }
          }
        },
      },
      scales: {
        x: {
          ticks: { color: '#92a4bd' },
          grid: { color: 'rgba(255,255,255,0.1)' },
        },
        y: {
          ticks: {
            color: '#92a4bd',
            callback: function(value) {
              return 'R$ ' + value.toLocaleString('pt-BR');
            },
          },
          grid: { color: 'rgba(255,255,255,0.1)' },
        },
      },
    },
  });
}

async function loadHistory() {
  try {
    const [usdResponse, eurResponse, btcResponse] = await Promise.all([
      fetch("https://economia.awesomeapi.com.br/json/daily/USD-BRL/15"),
      fetch("https://economia.awesomeapi.com.br/json/daily/EUR-BRL/15"),
      fetch("https://economia.awesomeapi.com.br/json/daily/BTC-BRL/15"),
    ]);

    if (
      !usdResponse.ok ||
      !eurResponse.ok ||
      !btcResponse.ok
    ) {
      throw new Error("Erro ao buscar histórico.");
    }

    const usd = await usdResponse.json();
    const eur = await eurResponse.json();
    const btc = await btcResponse.json();

    // A API devolve do mais recente para o mais antigo.
    // Vamos inverter para ficar do mais antigo para o mais recente.

    usd.reverse();
    eur.reverse();
    btc.reverse();

    const labels = usd.map((item) => {
      const data = new Date(item.timestamp * 1000);

      return data.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      });
    });

    const allDatasets = [
      {
        label: "Dólar",
        currency: "USD",
        data: usd.map((item) => Number(item.bid)),
        borderColor: "#31d0aa",
        backgroundColor: "#31d0aa33",
        borderWidth: 2,
        pointRadius: 4,
        tension: 0.35,
        fill: true,
      },

      {
        label: "Euro",
        currency: "EUR",
        data: eur.map((item) => Number(item.bid)),
        borderColor: "#4a7cff",
        backgroundColor: "#4a7cff33",
        borderWidth: 2,
        pointRadius: 4,
        tension: 0.35,
        fill: true,
      },

      {
        label: "Bitcoin",
        currency: "BTC",
        data: btc.map((item) => Number(item.bid)),
        borderColor: "#f7931a",
        backgroundColor: "#f7931a33",
        borderWidth: 2,
        pointRadius: 4,
        tension: 0.35,
        fill: true,
      },
    ];

    const datasets = allDatasets
      .filter((item) => item.currency === currentFilter)
      .map(({ currency, ...rest }) => rest);

    buildChart(labels, datasets);

  } catch (error) {
    console.error(error);
  }
}


form.addEventListener('submit', (event) => {
  event.preventDefault();
  updateConverterResult();
});

[amountInput, fromCurrency, toCurrency].forEach((element) => {
  element.addEventListener('input', updateConverterResult);
  element.addEventListener('change', updateConverterResult);
});

document.querySelectorAll(".filter-btn").forEach((btn) => {

    btn.addEventListener("click", () => {

        document
            .querySelectorAll(".filter-btn")
            .forEach((b) => b.classList.remove("active"));

        btn.classList.add("active");

        currentFilter = btn.dataset.currency;

        loadHistory();

    });

});

loadQuotes();
setInterval(loadQuotes, 60000);
loadHistory();
