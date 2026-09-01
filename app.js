// ERSÄTT DENNA MED DIN UTMATADE URL FRÅN GOOGLE APPS SCRIPT
const API_URL = "https://script.google.com/macros/s/AKfycbyDKCp8dmzKSPXIbFnFVwBlTL8TxQimY5K7X1tWIHGa1tFktV2F1E0jataaoEb1ELRb/exec";

let priceChartInstance = null;
let currentDashboardData = [];
let selectedItem = null;

// Sätt dagens datum som standard i formuläret när sidan laddats
document.addEventListener('DOMContentLoaded', () => {
  const datumInput = document.getElementById('datum');
  if (datumInput) datumInput.valueAsDate = new Date();
});

function switchTab(tabName, event) {
  // 1. Dölj alla flikinnehåll
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach(tab => tab.style.display = 'none');

  // 2. Ta bort active-klassen från alla knappar
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => btn.classList.remove('active'));

  // 3. Visa den valda fliken
  const activeTab = document.getElementById(`tab-${tabName}`);
  if (activeTab) {
    activeTab.style.display = 'block';
  }

  // 4. Markera den klickade knappen som aktiv
  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
  }

  // Om användaren går till Dashboard, se till att diagrammet ritas om rätt i storlek
  if (tabName === 'dashboard' && priceChartInstance) {
    priceChartInstance.resize();
  }
}

function toggleFuelInput() {
  const kategori = document.getElementById('kategori').value;
  const literGroup = document.getElementById('liter-group');
  const literInput = document.getElementById('liter');

  const isFuel = (kategori === 'Drivmedel');
  if (literGroup) literGroup.style.display = isFuel ? 'block' : 'none';

  // Töm liter-fältet om kategorin inte är Drivmedel
  if (!isFuel && literInput) {
    literInput.value = '';
  }
}

// Skicka data till Google Sheets
const carForm = document.getElementById('car-form');
if (carForm) {
  carForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerText = "Sparar...";

    const payload = {
      datum: document.getElementById('datum').value,
      matarstallning: document.getElementById('matarstallning').value,
      kategori: document.getElementById('kategori').value,
      belopp: document.getElementById('belopp').value,
      liter: document.getElementById('liter').value,
      anteckning: document.getElementById('anteckning').value
    };

    try {
      await fetch(API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      alert("Data sparades!");
      carForm.reset();
      document.getElementById('datum').valueAsDate = new Date();
      switchTab('dashboard');
      loadDashboardData(); // Ladda om datan direkt efter sparning
    } catch (error) {
      console.error("Fel vid sparning:", error);
      alert("Kunde inte spara data.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = "Spara händelse";
    }
  });
}

// Hämta data från Google Sheets
async function loadDashboardData() {
  try {
    const response = await fetch(API_URL);
    const result = await response.json();
    
    if (result.status === "success") {
      renderDashboard(result.data);
    }
  } catch (error) {
    console.error("Fel vid hämtning:", error);
  }
}

function parseNum(val) {
  if (!val) return 0;
  const str = String(val).replace(',', '.').replace(/\s/g, '');
  return parseFloat(str) || 0;
}

function renderDashboard(data) {
  if (!data || data.length === 0) return;
  
  const safeData = data || currentDashboardData || [];
  currentDashboardData = data;

  // Uppdatera summeringskorten (totalläge eller vald post)
  if (!selectedItem) {
    updateCardsOverview(data);
  } else {
    updateCardsForSingleItem(selectedItem, data);
  }

  // Generera historiklistan i Historik-fliken
  const historyList = document.getElementById('history-list');
  if (historyList) {
    historyList.innerHTML = '';

    const sortedData = [...safeData].sort((a, b) => {
      const dateA = new Date(a.datum || 0);
      const dateB = new Date(b.datum || 0);
      if (dateA - dateB !== 0) return dateB - dateA;
      return parseNum(b.matarstallning) - parseNum(a.matarstallning);
    });

    sortedData.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item';
      if (selectedItem === item) li.classList.add('selected');

      li.onclick = () => selectHistoryItem(item);
      li.innerHTML = `
        <div>
          <strong>${item.kategori}</strong> (${item.datum})<br>
          <small>${parseNum(item.matarstallning)} km ${item.anteckning ? '- ' + item.anteckning : ''}</small>
        </div>
        <div>
          <strong>${parseNum(item.belopp).toFixed(2).replace('.', ',')} kr</strong>
        </div>
      `;
      historyList.appendChild(li);
    });
  }

  // Rita drivmedelsdiagrammet på Dashboard
  renderPriceChart(safeData);
}

// Uppdatera rutorna med totalöversikt
function updateCardsOverview(data) {
  const resetBtn = document.getElementById('reset-selection-btn');
  if (resetBtn) resetBtn.style.display = 'none';

  // Totalkostnad
  const totalCost = data.reduce((sum, item) => sum + parseNum(item.belopp), 0);
  document.getElementById('total-cost').innerText = `${totalCost.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;

  // Högsta mätarställning
  const maxOdo = Math.max(...data.map(item => parseNum(item.matarstallning)));
  document.getElementById('latest-odo').innerText = `${maxOdo.toLocaleString('sv-SE')} km`;

  // Drivmedel & Förbrukning
  const fuelEntries = data
    .map(item => ({
      ...item,
      matarstallningNum: parseNum(item.matarstallning),
      literNum: parseNum(item.liter),
      beloppNum: parseNum(item.belopp)
    }))
    .filter(item => item.kategori === 'Drivmedel' && item.literNum > 0 && item.matarstallningNum > 0)
    .sort((a, b) => a.matarstallningNum - b.matarstallningNum);

  if (fuelEntries.length > 0) {
    const latestFuel = fuelEntries[fuelEntries.length - 1];
    document.getElementById('latest-fuel').innerText = `${latestFuel.literNum} L`;

    if (fuelEntries.length >= 2) {
      const current = fuelEntries[fuelEntries.length - 1];
      const previous = fuelEntries[fuelEntries.length - 2];
      const kmDriven = current.matarstallningNum - previous.matarstallningNum;

      if (kmDriven > 0) {
        const milDriven = kmDriven / 10;
        const consumption = (current.literNum / milDriven).toFixed(2);
        document.getElementById('fuel-consumption').innerText = `${consumption.replace('.', ',')} L/mil`;
      } else {
        document.getElementById('fuel-consumption').innerText = `- L/mil`;
      }
    } else {
      document.getElementById('fuel-consumption').innerText = `- L/mil`;
    }
  } else {
    document.getElementById('latest-fuel').innerText = `0 L`;
    document.getElementById('fuel-consumption').innerText = `- L/mil`;
  }
}

// Uppdatera rutorna när en specifik post klickas
function selectHistoryItem(item) {
  if (selectedItem === item) {
    clearSelection();
    return;
  }

  selectedItem = item;
  const resetBtn = document.getElementById('reset-selection-btn');
  if (resetBtn) resetBtn.style.display = 'inline-block';

  updateCardsForSingleItem(item, currentDashboardData);
  renderDashboard(currentDashboardData);
}

function updateCardsForSingleItem(item, data) {
  const safeData = data || currentDashboardData || [];

  const belopp = parseNum(item.belopp);
  const matarstallning = parseNum(item.matarstallning);
  const liter = parseNum(item.liter);

  const setTitle = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  setTitle('card-title-1', 'Kostnad');
  setTitle('card-title-2', 'Mätarställning');
  setTitle('card-title-3', 'Tankning');
  setTitle('card-title-4', 'Förbrukning');

  document.getElementById('total-cost').innerText = `${belopp.toFixed(2).replace('.', ',')} kr`;
  document.getElementById('latest-odo').innerText = `${matarstallning.toLocaleString('sv-SE')} km`;
  document.getElementById('latest-fuel').innerText = item.kategori === 'Drivmedel' && liter > 0 ? `${liter} L` : `-`;

  // Beräkna förbrukning om det är en drivmedelspost
  if (item.kategori === 'Drivmedel' && liter > 0 && matarstallning > 0) {
    const fuelEntries = safeData
      .map(entry => ({
        ...entry,
        matarstallningNum: parseNum(entry.matarstallning),
        literNum: parseNum(entry.liter)
      }))
      .filter(entry => entry.kategori === 'Drivmedel' && entry.literNum > 0 && entry.matarstallningNum > 0)
      .sort((a, b) => a.matarstallningNum - b.matarstallningNum);

    const currentIndex = fuelEntries.findIndex(e => e.matarstallningNum === matarstallning && e.datum === item.datum);

    if (currentIndex > 0) {
      const current = fuelEntries[currentIndex];
      const previous = fuelEntries[currentIndex - 1];
      const kmDriven = current.matarstallningNum - previous.matarstallningNum;

      if (kmDriven > 0) {
        const milDriven = kmDriven / 10;
        const consumption = (current.literNum / milDriven).toFixed(2);
        document.getElementById('fuel-consumption').innerText = `${consumption.replace('.', ',')} L/mil`;
      } else {
        document.getElementById('fuel-consumption').innerText = `- L/mil`;
      }
    } else {
      document.getElementById('fuel-consumption').innerText = `- L/mil`;
    }
  } else {
    document.getElementById('fuel-consumption').innerText = `-`;
  }
}

function clearSelection() {
  selectedItem = null;

  const setTitle = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  };

  setTitle('card-title-1', 'Totalkostnad');
  setTitle('card-title-2', 'Mätarställning');
  setTitle('card-title-3', 'Senaste tankning');
  setTitle('card-title-4', 'Förbrukning');

  if (currentDashboardData.length > 0) {
    renderDashboard(currentDashboardData);
  }
}

// Diagram-funktion för drivmedelspris över tid
function renderPriceChart(data) {
  const canvas = document.getElementById('priceChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const fuelEntries = data
    .map(entry => ({
      datum: entry.datum,
      belopp: parseNum(entry.belopp),
      liter: parseNum(entry.liter),
      matarstallning: parseNum(entry.matarstallning)
    }))
    .filter(e => e.liter > 0 && e.belopp > 0 && e.datum)
    .sort((a, b) => new Date(a.datum) - new Date(b.datum));

  if (fuelEntries.length === 0) return;

  const labels = fuelEntries.map(e => e.datum);
  const pricesPerLiter = fuelEntries.map(e => (e.belopp / e.liter).toFixed(2));

  if (priceChartInstance) {
    priceChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  priceChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'kr / Liter',
        data: pricesPerLiter,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#2563eb'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.raw.replace('.', ',')} kr/L`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          ticks: {
            callback: function(value) {
              return value + ' kr';
            }
          }
        }
      }
    }
  });
}

// Ladda data vid start
loadDashboardData();