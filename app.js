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

  // Rita om diagrammen så de anpassar storleken när man byter till historik
  if (tabName === 'history') {
    if (priceChartInstance) priceChartInstance.resize();
    if (consumptionChartInstance) consumptionChartInstance.resize();
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

  // Sortera data kronologiskt fallande (nyast först)
  const sortedData = [...currentData].sort((a, b) => new Date(b.datum || 0) - new Date(a.datum || 0));
  const latest = sortedData[0];

  // 1. Rendera Senaste Händelsen
  const latestContainer = document.getElementById('latest-event-details');
  if (latestContainer && latest) {
    latestContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>${latest.kategori}</strong>
        <span style="font-size: 0.9em; color: #666;">${latest.datum}</span>
      </div>
      <div style="font-size: 1.3em; font-weight: bold; margin: 6px 0; color: #2563eb;">
        ${parseNum(latest.belopp).toFixed(2).replace('.', ',')} kr
      </div>
      <div style="font-size: 0.9em; color: #444;">
        Mätarställning: <strong>${parseNum(latest.matarstallning).toLocaleString('sv-SE')} km</strong>
        ${latest.liter ? `<br>Volym: <strong>${parseNum(latest.liter)} L</strong>` : ''}
        ${latest.anteckning ? `<br><em>${latest.anteckning}</em>` : ''}
      </div>
    `;
  }

  // 2. Fyll i årsväljaren
  const yearSelect = document.getElementById('year-select');
  if (yearSelect) {
    const years = [...new Set(currentData.map(item => new Date(item.datum).getFullYear()))].sort((a, b) => b - a);
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

  // Gruppera på kategori
  const totals = {};
  let yearTotal = 0;

  yearEntries.forEach(item => {
    const cat = item.kategori || 'Övrigt';
    const amount = parseNum(item.belopp);
    totals[cat] = (totals[cat] || 0) + amount;
    yearTotal += amount;
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
// HISTORIK (Diagram & Accordion)
// ----------------------------------------------------
function renderHistory() {
  if (!currentData || currentData.length === 0) return;

  // Förbered kronologisk drivmedelsdata för diagram (äldst först)
  const fuelEntries = currentData
    .map(entry => ({
      ...entry,
      beloppNum: parseNum(entry.belopp),
      literNum: parseNum(entry.liter),
      matarNum: parseNum(entry.matarstallning)
    }))
    .filter(e => e.kategori === 'Drivmedel' && e.literNum > 0 && e.matarNum > 0 && e.datum)
    .sort((a, b) => new Date(a.datum) - new Date(b.datum));

  // Beräkna L/mil mellan tankningar
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
      datum: e.datum,
      pricePerLiter: (e.beloppNum / e.literNum).toFixed(2),
      consumption: consumption
    };
  });

  renderCharts(calculatedFuelData);
  renderAccordionList(calculatedFuelData);
}

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

function renderAccordionList(calculatedFuelData) {
  const container = document.getElementById('history-accordion-list');
  if (!container) return;

  // Sortera alla händelser så att nyast hamnar överst i listan
  const sortedData = [...currentData].sort((a, b) => new Date(b.datum || 0) - new Date(a.datum || 0));

  container.innerHTML = '';

  sortedData.forEach((item, index) => {
    const belopp = parseNum(item.belopp);
    const matar = parseNum(item.matarstallning);
    const liter = parseNum(item.liter);

    // Hitta beräknad förbrukning för just denna tankning om den finns
    let consumptionText = '-';
    if (item.kategori === 'Drivmedel') {
      const fuelMatch = calculatedFuelData.find(f => f.datum === item.datum);
      if (fuelMatch && fuelMatch.consumption) {
        consumptionText = `${fuelMatch.consumption.replace('.', ',')} L/mil`;
      }
    }

    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '10px';
    card.style.cursor = 'pointer';

    card.innerHTML = `
      <div onclick="toggleAccordion(${index})" style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>${item.kategori}</strong>
          <span style="font-size: 0.85em; color: #666; margin-left: 6px;">(${item.datum})</span>
        </div>
        <strong>${belopp.toFixed(2).replace('.', ',')} kr</strong>
      </div>

      <div id="accordion-content-${index}" style="display: none; margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ddd; font-size: 0.9em; color: #333;">
        <div><strong>Mätarställning:</strong> ${matar.toLocaleString('sv-SE')} km</div>
        ${liter > 0 ? `<div><strong>Antal liter:</strong> ${liter} L</div>` : ''}
        ${liter > 0 ? `<div><strong>Drivmedelspris:</strong> ${(belopp / liter).toFixed(2).replace('.', ',')} kr/L</div>` : ''}
        ${item.kategori === 'Drivmedel' ? `<div><strong>Förbrukning:</strong> ${consumptionText}</div>` : ''}
        ${item.anteckning ? `<div style="margin-top: 4px;"><strong>Anteckning:</strong> <em>${item.anteckning}</em></div>` : ''}
      </div>
    `;

    container.appendChild(card);
  });
}

// Öppna/stäng accordion (flera kan vara öppna samtidigt)
function toggleAccordion(index) {
  const content = document.getElementById(`accordion-content-${index}`);
  if (content) {
    content.style.display = content.style.display === 'none' ? 'block' : 'none';
  }
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