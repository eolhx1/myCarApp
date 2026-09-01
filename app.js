const API_URL = "https://script.google.com/macros/s/AKfycbyDKCp8dmzKSPXIbFnFVwBlTL8TxQimY5K7X1tWIHGa1tFktV2F1E0jataaoEb1ELRb/exec";

let currentData = [];
let priceChartInstance = null;
let consumptionChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  const datumInput = document.getElementById('datum');
  if (datumInput) datumInput.valueAsDate = new Date();
  loadData();
});

function switchTab(tabName, event) {
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach(tab => tab.style.display = 'none');

  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => btn.classList.remove('active'));

  const activeTab = document.getElementById(`tab-${tabName}`);
  if (activeTab) activeTab.style.display = 'block';

  if (event && event.currentTarget) event.currentTarget.classList.add('active');

  // Rita om diagrammen så de anpassar sin storlek när man byter till historikfliken
  if (tabName === 'history') {
    setTimeout(() => {
      if (priceChartInstance) priceChartInstance.resize();
      if (consumptionChartInstance) consumptionChartInstance.resize();
    }, 50);
  }
}

function toggleFuelInput() {
  const kategori = document.getElementById('kategori').value;
  const literGroup = document.getElementById('liter-group');
  const literInput = document.getElementById('liter');

  const isFuel = (kategori === 'Drivmedel');
  if (literGroup) literGroup.style.display = isFuel ? 'block' : 'none';
  if (!isFuel && literInput) literInput.value = '';
}

function parseNum(val) {
  if (!val) return 0;
  const str = String(val).replace(',', '.').replace(/\s/g, '');
  return parseFloat(str) || 0;
}

// Formatera datum snyggt (t.ex. "2026-08-18")
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toISOString().split('T')[0];
}

// Hämta data från Google Sheets
async function loadData() {
  try {
    const response = await fetch(API_URL);
    const result = await response.json();
    
    if (result.status === "success") {
      currentData = result.data || [];
      renderDashboard();
      renderHistory();
    }
  } catch (error) {
    console.error("Fel vid hämtning:", error);
  }
}

// ----------------------------------------------------
// DASHBOARD
// ----------------------------------------------------
function renderDashboard() {
  if (!currentData || currentData.length === 0) return;

  const sortedData = [...currentData].sort((a, b) => new Date(b.datum || 0) - new Date(a.datum || 0));
  const latest = sortedData[0];

  // 1. Rendera Senaste Händelsen
  const latestContainer = document.getElementById('latest-event-details');
  if (latestContainer && latest) {
    const isFuel = latest.kategori === 'Drivmedel';
    const unitPrice = parseNum(latest.belopp);
    const liter = parseNum(latest.liter);
    
    // Om det är drivmedel är beloppet kr/L, annars totalkostnad
    const totalCost = isFuel ? (unitPrice * liter) : unitPrice;

    latestContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>${latest.kategori}</strong>
        <span style="font-size: 0.9em; color: #666;">${formatDate(latest.datum)}</span>
      </div>
      <div style="font-size: 1.3em; font-weight: bold; margin: 6px 0; color: #2563eb;">
        ${totalCost.toFixed(2).replace('.', ',')} kr ${isFuel ? `<small style="font-size: 0.7em; font-weight: normal; color: #555;">(${unitPrice.toFixed(2).replace('.', ',')} kr/L)</small>` : ''}
      </div>
      <div style="font-size: 0.9em; color: #444;">
        Mätarställning: <strong>${parseNum(latest.matarstallning).toLocaleString('sv-SE')} km</strong>
        ${liter > 0 ? `<br>Volym: <strong>${liter} L</strong>` : ''}
        ${latest.anteckning ? `<br><em>${latest.anteckning}</em>` : ''}
      </div>
    `;
  }

  // 2. Fyll i årsväljaren
  const yearSelect = document.getElementById('year-select');
  if (yearSelect) {
    const years = [...new Set(currentData.map(item => new Date(item.datum).getFullYear()))]
      .filter(y => !isNaN(y))
      .sort((a, b) => b - a);
    
    yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    renderYearSummary();
  }
}

function renderYearSummary() {
  const yearSelect = document.getElementById('year-select');
  const summaryContainer = document.getElementById('year-summary-list');
  if (!yearSelect || !summaryContainer) return;

  const selectedYear = parseInt(yearSelect.value);
  const yearEntries = currentData.filter(item => new Date(item.datum).getFullYear() === selectedYear);

  const totals = {};
  let yearTotal = 0;

  yearEntries.forEach(item => {
    const cat = item.kategori || 'Övrigt';
    const isFuel = cat === 'Drivmedel';
    const amount = parseNum(item.belopp);
    const liter = parseNum(item.liter);

    const totalAmount = isFuel ? (amount * liter) : amount;

    totals[cat] = (totals[cat] || 0) + totalAmount;
    yearTotal += totalAmount;
  });

  if (Object.keys(totals).length === 0) {
    summaryContainer.innerHTML = '<em>Inga händelser registrerade detta år.</em>';
    return;
  }

  let html = `<ul style="list-style: none; padding: 0; margin: 0;">`;
  for (const [cat, sum] of Object.entries(totals)) {
    html += `
      <li style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
        <span>${cat}</span>
        <strong>${sum.toFixed(2).replace('.', ',')} kr</strong>
      </li>
    `;
  }
  html += `
    <li style="display: flex; justify-content: space-between; padding: 10px 0 0 0; font-weight: bold; font-size: 1.05em; border-top: 2px solid #ccc; margin-top: 5px;">
      <span>Totalt ${selectedYear}</span>
      <span>${yearTotal.toFixed(2).replace('.', ',')} kr</span>
    </li>
  </ul>`;

  summaryContainer.innerHTML = html;
}

// ----------------------------------------------------
// HISTORIK & DIAGRAM
// ----------------------------------------------------
function renderHistory() {
  if (!currentData || currentData.length === 0) return;

  const fuelEntries = currentData
    .map(entry => ({
      ...entry,
      pricePerLiter: parseNum(entry.belopp),
      literNum: parseNum(entry.liter),
      matarNum: parseNum(entry.matarstallning)
    }))
    .filter(e => e.kategori === 'Drivmedel' && e.literNum > 0 && e.matarNum > 0 && e.datum)
    .sort((a, b) => new Date(a.datum) - new Date(b.datum));

  const calculatedFuelData = fuelEntries.map((e, index) => {
    let consumption = null;
    if (index > 0) {
      const prev = fuelEntries[index - 1];
      const kmDriven = e.matarNum - prev.matarNum;
      if (kmDriven > 0) {
        consumption = (e.literNum / (kmDriven / 10)).toFixed(2);
      }
    }
    return {
      datum: formatDate(e.datum),
      pricePerLiter: e.pricePerLiter.toFixed(2),
      consumption: consumption
    };
  });

  renderCharts(calculatedFuelData);
  renderAccordionList(calculatedFuelData);
}

// RITA UPP DIAGRAMMEN
function renderCharts(fuelData) {
  const labels = fuelData.map(d => d.datum);

  // 1. Diagram kr/liter
  const priceCanvas = document.getElementById('priceChart');
  if (priceCanvas && typeof Chart !== 'undefined') {
    if (priceChartInstance) priceChartInstance.destroy();
    priceChartInstance = new Chart(priceCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'kr / Liter',
          data: fuelData.map(d => d.pricePerLiter),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }

  // 2. Diagram L/mil
  const consumptionCanvas = document.getElementById('consumptionChart');
  if (consumptionCanvas && typeof Chart !== 'undefined') {
    const validConsumptionData = fuelData.filter(d => d.consumption !== null);
    
    if (consumptionChartInstance) consumptionChartInstance.destroy();
    consumptionChartInstance = new Chart(consumptionCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: validConsumptionData.map(d => d.datum),
        datasets: [{
          label: 'L / mil',
          data: validConsumptionData.map(d => d.consumption),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }
}

function toggleAccordion(index) {
  const content = document.getElementById(`accordion-content-${index}`);
  if (content) {
    const isHidden = content.style.display === 'none' || content.style.display === '';
    content.style.display = isHidden ? 'block' : 'none';
  }
}

function renderAccordionList(calculatedFuelData) {
  const container = document.getElementById('history-accordion-list');
  if (!container) return;

  const sortedData = [...currentData].sort((a, b) => new Date(b.datum || 0) - new Date(a.datum || 0));

  container.innerHTML = '';

  sortedData.forEach((item, index) => {
    const isFuel = item.kategori === 'Drivmedel';
    const amountInput = parseNum(item.belopp);
    const matar = parseNum(item.matarstallning);
    const liter = parseNum(item.liter);
    const formattedDate = formatDate(item.datum);

    // Totalkostnad för raden
    const totalCost = isFuel ? (amountInput * liter) : amountInput;

    let consumptionText = '-';
    if (isFuel) {
      const fuelMatch = calculatedFuelData.find(f => f.datum === formattedDate);
      if (fuelMatch && fuelMatch.consumption) {
        consumptionText = `${fuelMatch.consumption.replace('.', ',')} L/mil`;
      }
    }

    const card = document.createElement('div');
    card.className = 'history-card';
    // Klickhändelse på hela kortet
    card.onclick = () => toggleAccordion(index);

    card.innerHTML = `
      <div class="history-card-header">
        <div>
          <strong style="font-size: 1rem; color: var(--text-color);">${item.kategori}</strong>
          <span style="font-size: 0.85em; color: #64748b; margin-left: 6px;">(${formattedDate})</span>
        </div>
        <strong style="font-size: 1.05rem; color: var(--primary-color);">${totalCost.toFixed(2).replace('.', ',')} kr</strong>
      </div>

      <div id="accordion-content-${index}" class="history-card-details" style="display: none;">
        <div><strong>Mätarställning:</strong> ${matar.toLocaleString('sv-SE')} km</div>
        ${liter > 0 ? `<div><strong>Antal liter:</strong> ${liter} L</div>` : ''}
        ${isFuel ? `<div><strong>Drivmedelspris:</strong> ${amountInput.toFixed(2).replace('.', ',')} kr/L</div>` : ''}
        ${isFuel ? `<div><strong>Förbrukning:</strong> ${consumptionText}</div>` : ''}
        ${item.anteckning ? `<div style="margin-top: 4px; color: #64748b;"><strong>Anteckning:</strong> <em>${item.anteckning}</em></div>` : ''}
      </div>
    `;

    container.appendChild(card);
  });
}

// Formulärhantering för inmatning
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
      loadData();
    } catch (error) {
      console.error("Fel vid sparning:", error);
      alert("Kunde inte spara data.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = "Spara händelse";
    }
  });
}