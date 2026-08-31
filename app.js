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

function renderDashboard(data) {
  if (!data || data.length === 0) return;

  // Helper för att säkert konvertera tal (hanterar både "36.99" och "36,99")
  const parseNum = (val) => {
    if (!val) return 0;
    const str = String(val).replace(',', '.').replace(/\s/g, '');
    return parseFloat(str) || 0;
  };

  // Totalkostnad
  const totalCost = data.reduce((sum, item) => sum + parseNum(item.belopp), 0);
  document.getElementById('total-cost').innerText = `${totalCost.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;

  // Högsta mätarställning
  const maxOdo = Math.max(...data.map(item => parseNum(item.matarstallning)));
  document.getElementById('latest-odo').innerText = `${maxOdo.toLocaleString('sv-SE')} km`;

  // Bearbeta drivmedelsposter
  const fuelEntries = data
    .map(item => ({
      ...item,
      matarstallningNum: parseNum(item.matarstallning),
      literNum: parseNum(item.liter),
      beloppNum: parseNum(item.belopp)
    }))
    .filter(item => item.kategori === 'Drivmedel' && item.literNum > 0 && item.matarstallningNum > 0)
    // Sortera efter mätarställning i stigande ordning (lägst till högst km)
    .sort((a, b) => a.matarstallningNum - b.matarstallningNum);

  if (fuelEntries.length > 0) {
    // Visa liter från den absolut senaste tankningen (kronologiskt/högst km)
    const latestFuel = fuelEntries[fuelEntries.length - 1];
    document.getElementById('latest-fuel').innerText = `${latestFuel.literNum} L`;

    // Förbrukning: jämför de två sista giltiga tankningarna i mätarordning
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

  // Senaste 5 händelser i listan (visas i den ordning de ligger i bladet, med den nyaste överst)
  const historyList = document.getElementById('history-list');
  historyList.innerHTML = '';
  
  data.slice(-5).reverse().forEach(item => {
    const li = document.createElement('li');
    li.className = 'history-item';
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

// Ladda dashboard vid start
loadDashboardData();
