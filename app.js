//
// filename: app.js
//
// App för att ha koll på bilkostnader
//

const API_URL = "https://script.google.com/macros/s/AKfycbyDKCp8dmzKSPXIbFnFVwBlTL8TxQimY5K7X1tWIHGa1tFktV2F1E0jataaoEb1ELRb/exec";

let currentData = [];
let priceChartInstance = null;
let consumptionChartInstance = null;
let editingRowIndex = null; // Håller reda på om vi redigerar en rad

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
        },
            50);
    }
}

function toggleFuelInput() {
    const kategori = document.getElementById('kategori').value;
    const literGroup = document.getElementById('liter-group');
    const literInput = document.getElementById('liter');
    const beloppLabel = document.getElementById('belopp-label');
    const beloppInput = document.getElementById('belopp');

    // Mätarställning-element
    const matarInput = document.getElementById('matarstallning');
    const matarLabel = document.getElementById('matarstallning-label');

    const isFuel = (kategori === 'Drivmedel');
    const isOdometerRequired = (kategori === 'Drivmedel' || kategori === 'Service');

    // Hantera synlighet för Liter-fältet
    if (literGroup) literGroup.style.display = isFuel ? 'block': 'none';
    if (!isFuel && literInput) literInput.value = '';

    // Ändra etikett för belopp dynamiskt
    if (beloppLabel && beloppInput) {
        if (isFuel) {
            beloppLabel.innerText = "Pris (kr/l)";
            beloppInput.placeholder = "t.ex. 16.99";
        } else {
            beloppLabel.innerText = "Belopp (kr)";
            beloppInput.placeholder = "t.ex. 850.00";
        }
    }

    // Ställ in om mätarställning är obligatorisk
    if (matarInput) {
        matarInput.required = isOdometerRequired;
    }
    if (matarLabel) {
        matarLabel.innerText = isOdometerRequired ? "Mätarställning (km) *": "Mätarställning (km)";
    }
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
            initHistoryFilterUI(); // Skapar årskryssrutorna för historikfiltret
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
        const totalCost = isFuel ? (unitPrice * liter): unitPrice;

        const matar = parseNum(latest.matarstallning);

        // Byt ut totalkostnad och enhetspris mot formatKr:
        latestContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>${latest.kategori}</strong>
        <span style="font-size: 0.9em; color: #666;">${formatDate(latest.datum)}</span>
        </div>
        <div style="font-size: 1.3em; font-weight: bold; margin: 6px 0; color: #2563eb;">
        ${formatKr(totalCost)} kr ${isFuel ? `<small style="font-size: 0.7em; font-weight: normal; color: #555;">(${formatKr(unitPrice)} kr/L)</small>`: ''}
        </div>
        <div style="font-size: 0.9em; color: #444;">
        ${matar > 0 ? `Mätarställning: <strong>${formatKm(matar)} km</strong>`: ''}
        ${liter > 0 ? `<br>Volym: <strong>${liter} L</strong>`: ''}
        ${latest.anteckning ? `<br><em>${latest.anteckning}</em>`: ''}
        </div>
        `;
    }

    // Kontrollera besiktning
    checkInspectionStatus();


    // 2. Fyll i tidsperiodsväljaren (12 månader + specifika år)
    const yearSelect = document.getElementById('year-select');
    if (yearSelect) {
        const years = [...new Set(currentData.map(item => new Date(item.datum).getFullYear()))]
        .filter(y => !isNaN(y))
        .sort((a, b) => b - a);

        let optionsHtml = `<option value="12m">Senaste 12 månaderna</option>`;
        optionsHtml += years.map(y => `<option value="${y}">${y}</option>`).join('');

        yearSelect.innerHTML = optionsHtml;

        // Sätt event listener för när användaren byter val
        yearSelect.onchange = renderYearSummary;

        renderYearSummary();
    }
}

function renderYearSummary() {
    const yearSelect = document.getElementById('year-select');
    const summaryContainer = document.getElementById('year-summary-list');
    if (!yearSelect || !summaryContainer) return;

    const selectedValue = yearSelect.value;
    let filteredEntries = [];
    let periodLabel = "";

    if (selectedValue === '12m') {
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

        filteredEntries = currentData.filter(item => item.datum && new Date(item.datum) >= twelveMonthsAgo);
        periodLabel = "Totalt senaste 12 mån";
    } else {
        const selectedYear = parseInt(selectedValue);
        filteredEntries = currentData.filter(item => item.datum && new Date(item.datum).getFullYear() === selectedYear);
        periodLabel = `Totalt ${selectedYear}`;
    }

    const totals = {};
    let periodTotal = 0;

    filteredEntries.forEach(item => {
        const cat = item.kategori || 'Övrigt';
        const isFuel = cat === 'Drivmedel';
        const amount = parseNum(item.belopp);
        const liter = parseNum(item.liter);

        const totalAmount = isFuel ? (amount * liter): amount;

        totals[cat] = (totals[cat] || 0) + totalAmount;
        periodTotal += totalAmount;
    });

    if (Object.keys(totals).length === 0) {
        summaryContainer.innerHTML = '<em>Inga händelser registrerade för vald tidsperiod.</em>';
        return;
    }

    let html = `<ul style="list-style: none; padding: 0; margin: 0;">`;
    for (const [cat, sum] of Object.entries(totals)) {
        html += `
        <li style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
        <span>${cat}</span>
        <strong>${formatKr(sum)} kr</strong>
        </li>
        `;
    }
    html += `
    <li style="display: flex; justify-content: space-between; padding: 10px 0 0 0; font-weight: bold; font-size: 1.05em; border-top: 2px solid #ccc; margin-top: 5px;">
    <span>${periodLabel}</span>
    <span>${formatKr(periodTotal)} kr</span>
    </li>
    </ul>`;

    summaryContainer.innerHTML = html;
}


// ----------------------------------------------------
// HISTORIK, FILTER & DIAGRAM
// ----------------------------------------------------

function toggleFilterDropdown() {
    const dropdown = document.getElementById('history-filter-dropdown');
    if (dropdown) {
        dropdown.style.display = (dropdown.style.display === 'none' || dropdown.style.display === '') ? 'block': 'none';
    }
}

// Stäng dropdownen om användaren klickar utanför
document.addEventListener('click', (e) => {
    const btn = document.getElementById('history-filter-btn');
    const dropdown = document.getElementById('history-filter-dropdown');
    if (dropdown && btn && !btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

function initHistoryFilterUI() {
    const container = document.getElementById('year-checkboxes-container');
    if (!container || !currentData || currentData.length === 0) return;

    const years = [...new Set(currentData.map(item => new Date(item.datum).getFullYear()))]
    .filter(y => !isNaN(y))
    .sort((a, b) => b - a);

    let html = '';
    years.forEach(year => {
        html += `
        <label style="display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; color: #334155;">
        <input type="checkbox" class="filter-year-cb" value="${year}" onchange="handleFilterChange('year')">
        ${year}
        </label>
        `;
    });

    container.innerHTML = html;
    updateCheckboxStates();
}

function handleFilterChange(changedType) {
    const cb12m = document.getElementById('filter-12m');
    const yearCbs = document.querySelectorAll('.filter-year-cb');

    if (changedType === '12m' && cb12m.checked) {
        // Om användaren bockar i 12M, bocka ur alla år
        yearCbs.forEach(cb => cb.checked = false);
    } else if (changedType === 'year') {
        // Om användaren bockar i något år, avbocka 12M
        const anyYearChecked = Array.from(yearCbs).some(cb => cb.checked);
        if (anyYearChecked) {
            cb12m.checked = false;
        } else {
            // Om inga år är i bockade, gå tillbaka till 12M
            cb12m.checked = true;
        }
    }

    updateCheckboxStates();
    renderHistory();
}

function updateCheckboxStates() {
    const cb12m = document.getElementById('filter-12m');
    const yearCbs = document.querySelectorAll('.filter-year-cb');
    const btnText = document.getElementById('history-filter-text');

    // Lås/Inaktivera årskryssrutorna om 12M är aktivt
    yearCbs.forEach(cb => {
        cb.disabled = cb12m.checked;
        if (cb.parentElement) {
            cb.parentElement.style.opacity = cb12m.checked ? '0.5': '1';
        }
    });

    // Uppdatera knapptexten i UI
    if (cb12m.checked) {
        if (btnText) btnText.innerText = "Senaste 12 månaderna";
    } else {
        const selectedYears = Array.from(yearCbs)
        .filter(cb => cb.checked)
        .map(cb => cb.value);
        if (btnText) {
            btnText.innerText = selectedYears.length > 0 ? `År: ${selectedYears.join(', ')}`: "Välj tidsperiod";
        }
    }
}

function getFilteredData() {
    if (!currentData || currentData.length === 0) return [];

    const cb12m = document.getElementById('filter-12m');
    const yearCbs = document.querySelectorAll('.filter-year-cb');

    if (cb12m && cb12m.checked) {
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
        return currentData.filter(item => item.datum && new Date(item.datum) >= twelveMonthsAgo);
    } else {
        const selectedYears = Array.from(yearCbs)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value));

        if (selectedYears.length === 0) return currentData; // Fallback
        return currentData.filter(item => item.datum && selectedYears.includes(new Date(item.datum).getFullYear()));
    }
}

// Huvudfunktion för att rendera om historiken och diagrammen utifrån filtret
function renderHistory() {
    if (!currentData || currentData.length === 0) return;

    const filteredData = getFilteredData();

    // Beräkna drivmedelsförbrukning baserat på urvalet
    const fuelEntries = filteredData
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
    renderAccordionList(filteredData,
        calculatedFuelData);
}

function renderAccordionList(filteredData, calculatedFuelData) {
    const container = document.getElementById('history-accordion-list');
    if (!container) return;

    const sortedData = [...filteredData].sort((a, b) => new Date(b.datum || 0) - new Date(a.datum || 0));

    container.innerHTML = '';

    if (sortedData.length === 0) {
        container.innerHTML = '<em>Inga händelser hittades för vald tidsperiod.</em>';
        return;
    }

    sortedData.forEach((item, index) => {
        const isFuel = item.kategori === 'Drivmedel';
        const amountInput = parseNum(item.belopp);
        const matar = parseNum(item.matarstallning);
        const liter = parseNum(item.liter);
        const formattedDate = formatDate(item.datum);
        const totalCost = isFuel ? (amountInput * liter): amountInput;

        let consumptionText = '-';
        if (isFuel) {
            const fuelMatch = calculatedFuelData.find(f => f.datum === formattedDate);
            if (fuelMatch && fuelMatch.consumption) {
                consumptionText = `${fuelMatch.consumption.replace('.', ',')} L/mil`;
            }
        }

        const card = document.createElement('div');
        card.className = 'history-card';
        card.onclick = () => toggleAccordion(index);

        card.innerHTML = `
        <div class="history-card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <div>
        <strong style="font-size: 1rem; color: var(--text-color);">${item.kategori}</strong>
        <span style="font-size: 0.85em; color: #64748b; margin-left: 6px;">(${formattedDate})</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
        <strong style="font-size: 1.05rem; color: var(--primary-color);">${formatKr(totalCost)} kr</strong>
        <button type="button" class="edit-btn" title="Redigera" style="background: none; border: none; cursor: pointer; font-size: 1.1rem; padding: 2px 4px;">✏️</button>
        </div>
        </div>

        <div id="accordion-content-${index}" class="history-card-details" style="display: none;">
        ${matar > 0 ? `<div><strong>Mätarställning:</strong> ${formatKm(matar)} km</div>`: ''}
        ${liter > 0 ? `<div><strong>Antal liter:</strong> ${liter} L</div>`: ''}
        ${isFuel ? `<div><strong>Drivmedelspris:</strong> ${formatKr(amountInput)} kr/L</div>`: ''}
        ${isFuel ? `<div><strong>Förbrukning:</strong> ${consumptionText}</div>`: ''}
        ${item.anteckning ? `<div style="margin-top: 4px; color: #64748b;"><strong>Anteckning:</strong> <em>${item.anteckning}</em></div>`: ''}
        </div>
        `;

        const editBtn = card.querySelector('.edit-btn');
        editBtn.onclick = (e) => {
            e.stopPropagation();
            editItem(item);
        };

        container.appendChild(card);
    });
}


// ----------------------------------------------------
// FORMULÄRHANTERING OCH TOAST
// ----------------------------------------------------
const carForm = document.getElementById('car-form');
if (carForm) {
    carForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const datum = document.getElementById('datum').value;
        const matarstallning = document.getElementById('matarstallning').value;
        const kategori = document.getElementById('kategori').value;
        const belopp = document.getElementById('belopp').value;
        const liter = document.getElementById('liter').value;
        const anteckning = document.getElementById('anteckning').value;

        // Om det inte är en redigering, kontrollera dubbletter
        if (!editingRowIndex) {
            const isDuplicate = currentData.some(item =>
                formatDate(item.datum) === datum &&
                String(item.matarstallning) === String(matarstallning) &&
                item.kategori === kategori &&
                String(item.belopp) === String(belopp)
            );

            if (isDuplicate) {
                showToast("Denna händelse finns redan registrerad!", true);
                return;
            }
        }

        const submitBtn = document.getElementById('submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerText = editingRowIndex ? "Uppdaterar...": "Sparar...";

        const payload = {
            action: editingRowIndex ? "UPDATE": "CREATE",
            rowIndex: editingRowIndex,
            datum,
            matarstallning,
            kategori,
            belopp,
            liter,
            anteckning
        };

        try {
            await fetch(API_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            showToast(editingRowIndex ? "Händelsen har uppdaterats!": "Händelsen har sparats!");

            resetForm();
            loadData();
        } catch (error) {
            console.error("Fel vid sparning:", error);
            showToast("Kunde inte spara data.", true);
        } finally {
            submitBtn.disabled = false;
        }
    });
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.innerText = message;
    if (isError) {
        toast.classList.add('error');
    } else {
        toast.classList.remove('error');
    }

    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}


// ----------------------------------------------------
// BESIKTNING
// ----------------------------------------------------
function dismissInspectionReminder() {
    // Spara dagens datum i localStorage så att påminnelsen hålls döljd idag
    const todayStr = new Date().toISOString().split('T')[0];
    localStorage.setItem('inspection_dismissed_date', todayStr);

    const inspectionContainer = document.getElementById('inspection-reminder');
    if (inspectionContainer) {
        inspectionContainer.style.display = 'none';
    }
}

function checkInspectionStatus() {
    const inspectionContainer = document.getElementById('inspection-reminder');
    if (!inspectionContainer) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Filter på alla besiktningar med giltigt datum
    const inspectionEntries = currentData
        .filter(item => item.kategori === 'Besiktning' && item.datum)
        .map(item => {
            const [y, m, d] = formatDate(item.datum).split('-').map(Number);
            return { ...item, parsedDate: new Date(y, m - 1, d) };
        })
        .sort((a, b) => b.parsedDate - a.parsedDate);

    if (inspectionEntries.length === 0) {
        inspectionContainer.style.display = 'none';
        return;
    }

    // 1. Kolla om det finns en framtida bokad besiktning i datan
    const hasFutureBooking = inspectionEntries.some(e => e.parsedDate > today);

    // 2. Hitta den senaste GENOMFÖRDA besiktningen (datum <= idag)
    const lastPassedInspection = inspectionEntries.find(e => e.parsedDate <= today);

    if (!lastPassedInspection) {
        inspectionContainer.style.display = 'none';
        return;
    }

    // Beräkna sista datum (14 månader efter senaste genomförda besiktning)
    const dueDate = new Date(lastPassedInspection.parsedDate);
    dueDate.setMonth(dueDate.getMonth() + 14);

    const diffTime = dueDate - today;
    const daysLeft = Math.round(diffTime / (1000 * 60 * 60 * 24));

    // 3. Om datumet har passerats -> VISA RÖD VARNING (Går ej att dölja med knapp)
    if (daysLeft <= 0) {
        inspectionContainer.style.display = 'block';
        inspectionContainer.innerHTML = `
            <div style="background-color: #ef444415; border-left: 4px solid #ef4444; padding: 12px; margin-bottom: 15px; border-radius: 4px; color: #1e293b;">
                <div style="font-weight: bold; margin-bottom: 4px; color: #ef4444;">🚨 VARNING: Besiktningen har förfallit!</div>
                <div style="font-size: 0.9em; line-height: 1.4;">
                    Sista besiktningsdatum var <strong>${formatDate(dueDate)}</strong> (${Math.abs(daysLeft)} dagar sedan). Boka/genomför besiktning omgående!
                </div>
            </div>
        `;
        return;
    }

    // 4. Om tiden ÄR BOKAD som en framtida händelse i datan -> Släck påminnelsen
    if (hasFutureBooking) {
        inspectionContainer.style.display = 'none';
        return;
    }

    // 5. Kontrollera om användaren klickat på knappen idag
    const dismissedDate = localStorage.getItem('inspection_dismissed_date');
    if (dismissedDate === todayStr) {
        inspectionContainer.style.display = 'none';
        return;
    }

    // 6. Normal påminnelse om det är 90 dagar eller mindre kvar
    const NOTICE_WINDOW_DAYS = 90;

    if (daysLeft <= NOTICE_WINDOW_DAYS) {
        inspectionContainer.style.display = 'block';

        let statusColor = '#eab308'; // Gul/Orange
        let statusTitle = "🚗 Dags att boka besiktning!";

        if (daysLeft <= 14) {
            statusColor = '#f97316'; // Mörkorange (Brådskande)
            statusTitle = "⚠️ Brådskande: Boka besiktning!";
        }

        inspectionContainer.innerHTML = `
            <div style="background-color: ${statusColor}15; border-left: 4px solid ${statusColor}; padding: 12px; margin-bottom: 15px; border-radius: 4px; color: #1e293b;">
                <div style="font-weight: bold; margin-bottom: 4px; color: ${statusColor};">${statusTitle}</div>
                <div style="font-size: 0.9em; line-height: 1.4; margin-bottom: 10px;">
                    Senaste besiktning var <strong>${formatDate(lastPassedInspection.parsedDate)}</strong>.<br>
                    Sista dag för besiktning: <strong>${formatDate(dueDate)}</strong> (${daysLeft} dagar kvar).
                </div>
                <button onclick="dismissInspectionReminder()" style="background-color: ${statusColor}; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; font-size: 0.85em; font-weight: bold; cursor: pointer;">
                    ✓ Kontrollbesiktning är bokad
                </button>
            </div>
        `;
    } else {
        inspectionContainer.style.display = 'none';
    }
}




// ----------------------------------------------------
// HJÄLPFUNKTIONER
// ----------------------------------------------------
// Formaterar kronor med tusentalsavgränsare och 2 decimaler (t.ex. 1 250,50 kr)
function formatKr(val) {
    const num = parseNum(val);
    return num.toLocaleString('sv-SE', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });
}

// Formaterar mätarställning med tusentalsavgränsare utan decimaler (t.ex. 112 363 km)
function formatKm(val) {
    const num = parseNum(val);
    return num > 0 ? num.toLocaleString('sv-SE'): '';
}

// ----------------------------------------------------
// DIAGRAM OCH ACCORDION LOGIK
// ----------------------------------------------------

function toggleAccordion(index) {
    const content = document.getElementById(`accordion-content-${index}`);
    if (content) {
        const isVisible = content.style.display === 'block';
        content.style.display = isVisible ? 'none': 'block';
    }
}

function renderCharts(fuelData) {
    const priceCtx = document.getElementById('priceChart');
    const consCtx = document.getElementById('consumptionChart');

    if (!priceCtx || !consCtx) return;

    const labels = fuelData.map(d => d.datum);
    const priceValues = fuelData.map(d => parseFloat(d.pricePerLiter));
    const consValues = fuelData.map(d => d.consumption ? parseFloat(d.consumption): null);

    // 1. Diagram: Drivmedelspris (kr/L)
    if (priceChartInstance) priceChartInstance.destroy();
    priceChartInstance = new Chart(priceCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'kr/L',
                data: priceValues,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false
                }
            }
        }
    });

    // 2. Diagram: Förbrukning (L/mil)
    if (consumptionChartInstance) consumptionChartInstance.destroy();
    consumptionChartInstance = new Chart(consCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'L/mil',
                data: consValues,
                borderColor: '#16a34a',
                backgroundColor: 'rgba(22, 163, 74, 0.1)',
                borderWidth: 2,
                spanGaps: true,
                fill: true,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false
                }
            }
        }
    });
}

// ----------------------------------------------------
// REDIGERING OCH ÅTERSTÄLLNING AV FORMULÄR
// ----------------------------------------------------

function editItem(item) {
    editingRowIndex = item.rowIndex || null;

    document.getElementById('datum').value = formatDate(item.datum);
    document.getElementById('matarstallning').value = item.matarstallning || '';
    document.getElementById('kategori').value = item.kategori || 'Drivmedel';
    document.getElementById('belopp').value = item.belopp || '';
    document.getElementById('liter').value = item.liter || '';
    document.getElementById('anteckning').value = item.anteckning || '';

    toggleFuelInput();

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.innerText = "Uppdatera händelse";

    // Växla till "Mata in"-fliken
    switchTab('input');
}

function resetForm() {
    editingRowIndex = null;
    const carForm = document.getElementById('car-form');
    if (carForm) carForm.reset();

    const datumInput = document.getElementById('datum');
    if (datumInput) datumInput.valueAsDate = new Date();

    toggleFuelInput();

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.innerText = "Spara händelse";
}