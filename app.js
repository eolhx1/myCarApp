// ERSÄTT DENNA MED DIN UTMATADE URL FRÅN GOOGLE APPS SCRIPT
const API_URL = "https://script.google.com/macros/s/AKfycbyDKCp8dmzKSPXIbFnFVwBlTL8TxQimY5K7X1tWIHGa1tFktV2F1E0jataaoEb1ELRb/exec";

// Sätt dagens datum som standard i formuläret
document.getElementById('datum').valueAsDate = new Date();

function switchTab(tabId, evt) {
  // Dölj alla flikar och ta bort active-klass från alla knappar
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

  // Visa den valda fliken
  document.getElementById(tabId).classList.add('active');
  
  // Sätt active-klass på knappen om funktionen anropades via klick
  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('active');
  } else {
    // Om anropad programmatiskt (t.ex. efter sparning), markera rätt knapp
    const btnIndex = tabId === 'dashboard' ? 0 : 1;
    const buttons = document.querySelectorAll('.tab-btn');
    if (buttons[btnIndex]) buttons[btnIndex].classList.add('active');
  }

  if (tabId === 'dashboard') {
    loadDashboardData();
  }
}

function toggleFuelInput() {
  const kategori = document.getElementById('kategori').value;
  const literGroup = document.getElementById('liter-group');
  literGroup.style.display = (kategori === 'Drivmedel') ? 'block' : 'none';
}

// Skicka data till Google Sheets
document.getElementById('car-form').addEventListener('submit', async (e) => {
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
    // google apps script post kräver text/plain eller no-cors bypass ibland via fetch
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    alert("Data sparades!");
    document.getElementById('car-form').reset();
    document.getElementById('datum').valueAsDate = new Date();
    switchTab('dashboard');
  } catch (error) {
    console.error("Fel vid sparning:", error);
    alert("Kunde inte spara data.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "Spara händelse";
  }
});

// Hämta data till Dashboard
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

let currentDashboardData = [];
let selectedItem = null;

function parseNum(val) {
  if (!val) return 0;
  const str = String(val).replace(',', '.').replace(/\s/g, '');
  return parseFloat(str) || 0;
}

function renderDashboard(data) {
  if (!data || data.length === 0) return;

  currentDashboardData = data;

  // Om användaren inte har valt en specifik post, visa totalläget
  if (!selectedItem) {
    updateCardsOverview(data);
  } else {
    updateCardsForSingleItem(selectedItem);
  }

  // Senaste händelser i listan
  const historyList = document.getElementById('history-list');
  historyList.innerHTML = '';

  const reversedData = data.slice().reverse();

  reversedData.slice(0, 10).forEach(item => {
    const li = document.createElement('li');
    li.className = 'history-item';
    
    // Markera om denna är den valda posten
    if (selectedItem === item) {
      li.classList.add('selected');
    }

    li.onclick = () => selectHistoryItem(item, data);
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

// Uppdatera rutorna med totalöversikt
function updateCardsOverview(data) {
  document.getElementById('reset-selection-btn').style.display = 'none';

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
function selectHistoryItem(item, data) {
  if (selectedItem === item) {
    clearSelection();
    return;
  }

  selectedItem = item;
  document.getElementById('reset-selection-btn').style.display = 'inline-block';

  updateCardsForSingleItem(item, data);
  renderDashboard(data); // Rita om listan för att uppdatera markeringen
}

function updateCardsForSingleItem(item, data) {
  const belopp = parseNum(item.belopp);
  const matarstallning = parseNum(item.matarstallning);
  const liter = parseNum(item.liter);

  // Ändra rubrikerna tillfälligt för tydlighet
  document.querySelector('.card:nth-child(1) h3').innerText = 'Kostnad';
  document.querySelector('.card:nth-child(2) h3').innerText = 'Mätarställning';
  document.querySelector('.card:nth-child(3) h3').innerText = 'Tankning';
  document.querySelector('.card:nth-child(4) h3').innerText = 'Förbrukning';

  document.getElementById('total-cost').innerText = `${belopp.toFixed(2).replace('.', ',')} kr`;
  document.getElementById('latest-odo').innerText = `${matarstallning.toLocaleString('sv-SE')} km`;
  document.getElementById('latest-fuel').innerText = item.kategori === 'Drivmedel' && liter > 0 ? `${liter} L` : `-`;

  // Beräkna förbrukning om det är en drivmedelspost
  if (item.kategori === 'Drivmedel' && liter > 0 && matarstallning > 0) {
    // Hämta och sortera alla drivmedelsposter kronologiskt
    const fuelEntries = data
      .map(entry => ({
        ...entry,
        matarstallningNum: parseNum(entry.matarstallning),
        literNum: parseNum(entry.liter)
      }))
      .filter(entry => entry.kategori === 'Drivmedel' && entry.literNum > 0 && entry.matarstallningNum > 0)
      .sort((a, b) => a.matarstallningNum - b.matarstallningNum);

    // Hitta var i ordningen den valda tankningen ligger
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
      // Om det är den allra första tankningen saknas föregående mätarställning
      document.getElementById('fuel-consumption').innerText = `- L/mil`;
    }
  } else {
    document.getElementById('fuel-consumption').innerText = `-`;
  }
}

// Uppdatera även clearSelection för att återställa rubrikerna
function clearSelection() {
  selectedItem = null;
  
  // Återställ kortrubrikerna
  document.querySelector('.card:nth-child(1) h3').innerText = 'Totalkostnad';
  document.querySelector('.card:nth-child(2) h3').innerText = 'Mätarställning';
  document.querySelector('.card:nth-child(3) h3').innerText = 'Senaste tankning';
  document.querySelector('.card:nth-child(4) h3').innerText = 'Förbrukning';

  if (currentDashboardData.length > 0) {
    renderDashboard(currentDashboardData);
  }
}

// Ladda dashboard vid start
loadDashboardData();
