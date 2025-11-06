let lastChart = null;

const investmentForm = document.getElementById("investment-form");
const investmentBody = document.getElementById("investment-body");

const symbolMap = {
  bitcoin: "BTC",
  ethereum: "ETH",
  dogecoin: "DOGE"
};

async function getCryptoHistory(fiatCurrency, coinId, startDate, endDate) {
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();

  const currencySymbol = symbolMap[coinId];
  const pair = `${currencySymbol}${fiatCurrency}`;

  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=1000`;
  const res = await fetch(url);
  const data = await res.json();

  const result = {};
  data.forEach(kline => {
    const timestamp = kline[0];
    const closePrice = parseFloat(kline[4]);
    const date = new Date(timestamp).toISOString().split("T")[0];
    result[date] = { [currencySymbol]: closePrice };
  });
  return result;
}

async function getFiatHistory(base, start, end, target = "USD") {
  const url = `https://api.frankfurter.app/${start}..${end}?base=${base}&symbols=${target}`;
  const res = await fetch(url);
  return (await res.json()).rates;
}

function downsampleRates(rates, target, maxPoints = 20) {
  const dates = Object.keys(rates).sort();

  const filteredDates = obj => obj ? obj[target] : undefined;

  const step = Math.ceil(dates.length / maxPoints);
  const labels = [];
  const values = [];

  for (let i = 0; i < dates.length; i += step) {
    labels.push(dates[i]);
    values.push(filteredDates(rates[dates[i]]));
  }
  return { labels, values };
}

async function drawChart({ base, targets, colors, start, end, container }) {
  const datasets = [];
  let labels = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    let rates;
    if (["bitcoin", "ethereum", "dogecoin"].includes(target)) {
      rates = await getCryptoHistory(base, target, start, end);
    } else {
      rates = await getFiatHistory(base, start, end, target);
    }

    const refined = downsampleRates(rates, symbolMap[target.toLowerCase()] || target.toUpperCase());
    if (labels.length === 0){
      labels = refined.labels;
    }

    datasets.push({
      name: `${base}/${target}`,
      type: "line",
      values: refined.values
    });
  }

  const chart = new frappe.Chart(container, {
    title: `${base} → ${targets.join(", ")}`,
    data: { labels, datasets },
    type: "line",
    height: container.clientHeight,
    colors: colors
  });

  container.chartInstance = chart;
  lastChart = chart;
}

document.addEventListener("DOMContentLoaded", () => {
  const chartContainer = document.getElementById("chart-container");
  const addChartBtn = document.getElementById("add-chart-btn");
  const currencyAmountSelect = document.getElementById("currency-amount");

  document.querySelectorAll(".data-drag").forEach(drag => {
    drag.addEventListener("dragstart", e => {
      e.dataTransfer.setData("symbol", drag.dataset.symbol);
    });
  });

  addChartBtn.addEventListener("click", () => {
    const box = document.createElement("div");
    box.className = "chart-box";
    box.style.minWidth = "320px";
    box.style.minHeight = "240px";
    box.textContent = "Drag the base currency here";
    box.addEventListener("dragover", e => e.preventDefault());
    box.addEventListener("drop", handleDrop);
    chartContainer.appendChild(box);
  });

  function handleDrop(e) {
    e.preventDefault();
    const box = e.currentTarget;
    const base = e.dataTransfer.getData("symbol");

    box.textContent = "Now drag target currencies...";
    box.removeEventListener("drop", handleDrop);

    const requiredCount = parseInt(currencyAmountSelect.value, 10);
    const targets = new Set();
    const colors = [];

    box.addEventListener("dragover", ev => ev.preventDefault());
    box.addEventListener("drop", async ev => {
      ev.preventDefault();
      const target = ev.dataTransfer.getData("symbol");
      if (!target){
        return;
      }

      if (target === base){
        box.textContent = "Cannot use same currency as base!";
        return;
      }

      if (targets.has(target)) {
        box.textContent = `Already added ${target.toUpperCase()} — select another currency`;
        return;
      }

      const colorPicker = document.getElementById("color-picker");
      const color = colorPicker.value;

      targets.add(target);
      colors.push(color);

      const currentCount = targets.size;
      const remaining = requiredCount - currentCount;

      if (remaining > 0) {
        box.textContent = `Selected ${currentCount} of ${requiredCount} currencies... (drag next)`;
      } else {
          box.textContent = "";
          const start = document.getElementById("start-date").value;
          const end = document.getElementById("end-date").value;

          let chartWrapper = box.querySelector(".chart-wrapper");
          if (!chartWrapper) {
            chartWrapper = document.createElement("div");
            chartWrapper.className = "chart-wrapper";
            chartWrapper.style.width = "100%";
            chartWrapper.style.height = "100%";
            box.appendChild(chartWrapper);
          }

          await drawChart({
          base,
          targets: Array.from(targets),
          colors,
          start,
          end,
          container: chartWrapper
          });
      }
    });
  }

  investmentForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const coinId = document.getElementById("coin-select").value;
    const date = document.getElementById("buy-date").value;
    const amount = parseFloat(document.getElementById("buy-amount").value);

    if (!coinId || !date || !amount) return;

    const symbol = symbolMap[coinId];

    const currentRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
    const currentData = await currentRes.json();
    const currentPrice = parseFloat(currentData.price);

    const startTime = new Date(date).getTime();
    const endTime = startTime + 24 * 60 * 60 * 1000;
    const histResults = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=1`
    );
    const histData = await histResults.json();
    const buyPrice = histData[0] ? parseFloat(histData[0][4]) : currentPrice;

    const buyValue = amount * buyPrice;
    const currentValue = amount * currentPrice;
    const profit = currentValue - buyValue;
    const profitPercent = ((profit / buyValue) * 100).toFixed(2);

    let recommendation = "Hold";
    if (profitPercent > 20) recommendation = "Sell";
    else if (profitPercent < -10) recommendation = "Buy More";

    if (investmentBody.children[0] && investmentBody.children[0].textContent.includes("No investments")) {
      investmentBody.innerHTML = "";
    }

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${coinId}</td>
      <td>${new Date(date).toISOString().split("T")[0]}</td>
      <td>${amount}</td>
      <td>$${currentPrice.toLocaleString()}</td>
      <td>$${currentValue.toLocaleString()}</td>
      <td class="${profit >= 0 ? 'text-success' : 'text-danger'}">
          ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USD (${profitPercent}%)
      </td>
      <td><span class="badge ${recommendation === 'Sell' ? 'bg-danger' : recommendation === 'Buy More' ? 'bg-success' : 'bg-secondary'}">${recommendation}</span></td>
      `;
    investmentBody.appendChild(row);

    investmentForm.reset();
  });
});

document.getElementById("download-chart-btn").addEventListener("click", () => {
  if (!lastChart) {
    alert("Please create a chart first");
    return;
  }
  lastChart.export();
});
