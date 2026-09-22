//
// filename: app.js
// App för att ha koll på bilkostnader
//

const API_URL = "https://script.google.com/macros/s/AKfycbyDKCp8dmzKSPXIbFnFVwBlTL8TxQimY5K7X1tWIHGa1tFktV2F1E0jataaoEb1ELRb/exec";

let currentData = [];
let currentCars = [];
let selectedCar = 'ALL';

let priceChartInstance = null;
let consumptionChartInstance = null;
let editingRowIndex = null; // Håller reda på om vi redigerar en rad

document.addEventListener('DOMContentLoaded', () => {
    const datumInput = document.getElementById('datum');
    if (datumInput) datumInput.valueAsDate = new Date();

    const globalSelect = document.getElementById('global-car-select');
    if (globalSelect) {
        globalSelect.addEventListener('change', handleCarChange);
    }

    const timeSelect = document.getElementById('time-period-select') || document.getElementById('year-select');
    if (timeSelect) {
        timeSelect.addEventListener('change', renderYearSummary);
    }

    ['bilRegnr', 'modal-regnr'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('blur', (e) => {
                e.target.value = formatRegnr(e.target.value);
            });
        }
    });

    const modalCarForm = document.getElementById('modal-car-form');
    if (modalCarForm) {
        modalCarForm.addEventListener('submit', handleCarFormSubmit);
    }
    
    initSwipeNavigation();
    loadData();
});

// Hämta data från Google Sheets (Bilar + Loggbok)
async function loadData() {
    const debugBox = document.getElementById('debug-log');
    function log(msg) {
        if (debugBox) debugBox.innerText += msg + "\n";
    }

    try {
        log("Hämtar data från Google Apps Script...");
        const response = await fetch(API_URL);
        const result = await response.json();

        if (result.status === "success") {
            currentCars = result.cars || [];
            currentData = result.data || [];

            updateCarDropdowns();
            renderDashboard();
            initHistoryFilterUI(); // Bygger bara upp filterkontrollerna
            renderHistory();       // Anropas HÄR och enbart EN gång!
        }
    } catch (error) {
        log("FEL VID HÄMTNING: " + error.message);
    }
}

function switchTab(tabName, event) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.style.display = 'none');

    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const activeTab = document.getElementById(`tab-${tabName}`);
    if (activeTab) activeTab.style.display = 'block';

    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }

    // Körs alltid när man hamnar på historikfliken för att rita om diagrammen
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
    const beloppLabel = document.getElementById('belopp-label');
    const beloppInput = document.getElementById('belopp');

    const matarInput = document.getElementById('matarstallning');
    const matarLabel = document.getElementById('matarstallning-label');

    const isFuel = (kategori === 'Drivmedel');
    const isOdometerRequired = (kategori === 'Drivmedel' || kategori === 'Service');

    if (literGroup) literGroup.style.display = isFuel ? 'block': 'none';
    if (!isFuel && literInput) literInput.value = '';

    if (beloppLabel && beloppInput) {
        if (isFuel) {
            beloppLabel.innerText = "Pris (kr/l)";
            beloppInput.placeholder = "t.ex. 18.50";
        } else {
            beloppLabel.innerText = "Belopp (kr)";
            beloppInput.placeholder = "t.ex. 850.00";
        }
    }

    if (matarInput) matarInput.required = isOdometerRequired;
    if (matarLabel) {
        matarLabel.innerText = isOdometerRequired ? "Mätarställning (km) *": "Mätarställning (km)";
    }
}

function parseNum(val) {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    const cleaned = String(val)
        .replace(/kr/gi, '')
        .replace(/\s+/g, '')
        .replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}


function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toISOString().split('T')[0];
}

// ----------------------------------------------------
// CAR MANAGEMENT / FILTRERING
// ----------------------------------------------------
// Hjälpfunktion för att slå ihop Märke och Modell snyggt i parentesen
function getCarDisplayName(car) {
    const info = [car.marke, car.modell].filter(Boolean).join(' ');
    return info ? `${car.regnr} (${info})` : car.regnr;
}

// Uppdatera dropdown-menyer
function updateCarDropdowns() {
    const globalSelect = document.getElementById('global-car-select');
    const formSelect = document.getElementById('form-car-select');

    if (globalSelect) {
        let optionsHtml = `<option value="ALL">Alla bilar</option>`;
        currentCars.forEach(car => {
            optionsHtml += `<option value="${car.regnr}">${getCarDisplayName(car)}</option>`;
        });
        globalSelect.innerHTML = optionsHtml;
        globalSelect.value = selectedCar;
    }

    if (formSelect) {
        let formOptions = '';
        currentCars.forEach(car => {
            formOptions += `<option value="${car.regnr}">${getCarDisplayName(car)}</option>`;
        });
        formSelect.innerHTML = formOptions;
    }
}


function handleCarChange() {
    const globalSelect = document.getElementById('global-car-select');
    if (globalSelect) {
        selectedCar = globalSelect.value;
        renderDashboard();
        renderHistory();
    }
}

function cleanCarReg(reg) {
    return String(reg || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function getCarFilteredData() {
    if (!selectedCar || selectedCar === 'ALL') {
        return currentData;
    }
    return currentData.filter(item => {
        if (!item.bil) return false;
        return cleanCarReg(item.bil) === cleanCarReg(selectedCar);
    });
}

// ----------------------------------------------------
// DASHBOARD
// ----------------------------------------------------
function renderDashboard() {
    const carEvents = getCarFilteredData();
    const sortedEvents = [...carEvents].sort((a, b) => new Date(b.datum) - new Date(a.datum));
    const latest = sortedEvents[0];

    const latestContainer = document.getElementById('latest-event-details');
    if (latestContainer) {
        if (latest) {
            const isFuel = latest.kategori === 'Drivmedel';
            const rawAmount = parseNum(latest.belopp);
            const liter = parseNum(latest.liter);
            const matar = parseNum(latest.korstracka || latest.matarstallning);

            // Eftersom belopp är kr/L för Drivmedel, räknar vi ut totalkostnaden
            let totalCost = isFuel && liter > 0 ? (rawAmount * liter) : rawAmount;
            let unitPriceText = isFuel ? `<small style="font-size: 0.7em; color: #555;">(${formatKr(rawAmount)} kr/L)</small>` : '';

            latestContainer.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${latest.kategori} ${latest.bil ? `(${latest.bil})`: ''}</strong>
            <span style="font-size: 0.9em; color: #666;">${formatDate(latest.datum)}</span>
            </div>
            <div style="font-size: 1.3em; font-weight: bold; margin: 6px 0; color: #2563eb;">
            ${formatKr(totalCost)} kr ${unitPriceText}
            </div>
            <div style="font-size: 0.9em; color: #444;">
            ${matar > 0 ? `Mätarställning: <strong>${formatKm(matar)} km</strong>`: ''}
            ${liter > 0 ? `<br>Volym: <strong>${liter} L</strong>`: ''}
            ${latest.anteckning ? `<br><em>${latest.anteckning}</em>`: ''}
            </div>
            `;
        } else {
            latestContainer.innerHTML = '<em>Inga händelser registrerade ännu.</em>';
        }
    }

    populateYearSelect(carEvents);
    renderYearSummary();
    checkInspectionStatus();
}

function populateYearSelect(carEvents) {
    const select = document.getElementById('time-period-select') || document.getElementById('year-select');
    if (!select) return;

    const currentVal = select.value;
    const years = [...new Set(carEvents.map(e => {
        const d = new Date(e.datum);
        return isNaN(d.getFullYear()) ? null: d.getFullYear();
    }))].filter(Boolean).sort((a, b) => b - a);

    let html = `<option value="12m">Senaste 12 månaderna</option>`;
    years.forEach(y => {
        html += `<option value="${y}">${y}</option>`;
    });

    select.innerHTML = html;
    if (currentVal) select.value = currentVal;
}

function renderYearSummary() {
    const yearSelect = document.getElementById('time-period-select') || document.getElementById('year-select');
    const summaryContainer = document.getElementById('year-summary-list') || document.getElementById('dashboard-summary');
    if (!yearSelect || !summaryContainer) return;

    const carData = getCarFilteredData();
    const selectedValue = yearSelect.value;
    let filteredEntries = [];
    let periodLabel = "";

    if (selectedValue === '12m') {
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
        twelveMonthsAgo.setHours(0, 0, 0, 0);

        filteredEntries = carData.filter(item => {
            if (!item.datum) return false;
            const dateStr = formatDate(item.datum);
            const [y, m, d] = dateStr.split('-').map(Number);
            const entryDate = new Date(y, m - 1, d);
            return !isNaN(entryDate.getTime()) && entryDate >= twelveMonthsAgo;
        });

        periodLabel = "Totalt senaste 12 mån";
    } else {
        const selectedYear = parseInt(selectedValue, 10);
        filteredEntries = carData.filter(item => {
            if (!item.datum) return false;
            const dateStr = formatDate(item.datum);
            const [y] = dateStr.split('-').map(Number);
            return y === selectedYear;
        });
        periodLabel = `Totalt ${selectedYear}`;
    }

    const totals = {};
    let periodTotal = 0;

    filteredEntries.forEach(item => {
        const cat = item.kategori || 'Övrigt';
        const isFuel = cat === 'Drivmedel';
        const amount = parseNum(item.belopp);
        const liter = parseNum(item.liter);

        // Beräkna totalkostnaden för raden
        const totalAmount = (isFuel && liter > 0) ? (amount * liter) : amount;

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
        </li>`;
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

document.addEventListener('click', (e) => {
    const btn = document.getElementById('history-filter-btn');
    const dropdown = document.getElementById('history-filter-dropdown');
    if (dropdown && btn && !btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

function initHistoryFilterUI() {
    const container = document.getElementById('year-checkboxes-container');
    const carData = getCarFilteredData();
    if (!container || !carData || carData.length === 0) return;

    const years = [...new Set(carData.map(item => new Date(item.datum).getFullYear()))]
        .filter(y => !isNaN(y))
        .sort((a, b) => b - a);

    let html = '';
    years.forEach(year => {
        html += `
        <label style="display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; color: #334155;">
            <input type="checkbox" class="filter-year-cb" value="${year}" onchange="handleFilterChange('year')">
            ${year}
        </label>`;
    });

    container.innerHTML = html;
    updateCheckboxStates(); // Sätter endast text och disabled-status på kryssrutorna
}


function handleFilterChange(changedType) {
    const cb12m = document.getElementById('filter-12m');
    const yearCbs = document.querySelectorAll('.filter-year-cb');

    if (changedType === '12m' && cb12m.checked) {
        yearCbs.forEach(cb => cb.checked = false);
    } else if (changedType === 'year') {
        const anyYearChecked = Array.from(yearCbs).some(cb => cb.checked);
        if (anyYearChecked) {
            cb12m.checked = false;
        } else {
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

    yearCbs.forEach(cb => {
        cb.disabled = cb12m.checked;
        if (cb.parentElement) {
            cb.parentElement.style.opacity = cb12m.checked ? '0.5': '1';
        }
    });

    if (cb12m && cb12m.checked) {
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
    const carData = getCarFilteredData();
    if (!carData || carData.length === 0) return [];

    const cb12m = document.getElementById('filter-12m');
    const yearCbs = document.querySelectorAll('.filter-year-cb');

    if (cb12m && cb12m.checked) {
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
        return carData.filter(item => item.datum && new Date(item.datum) >= twelveMonthsAgo);
    } else {
        const selectedYears = Array.from(yearCbs)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value));

        if (selectedYears.length === 0) return carData;
        return carData.filter(item => item.datum && selectedYears.includes(new Date(item.datum).getFullYear()));
    }
}

function renderHistory() {
    const filteredData = getFilteredData();

    const fuelEntries = filteredData
    .map(entry => {
        const rawBelopp = parseNum(entry.belopp);
        const literNum = parseNum(entry.liter);

        return {
            ...entry,
            pricePerLiter: rawBelopp, // Belopp är redan sparat som literpris i kr/L
            literNum: literNum,
            matarNum: parseNum(entry.matarstallning || entry.korstracka)
        };
    })
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
    renderAccordionList(filteredData, calculatedFuelData);
}

function renderAccordionList(filteredData, calculatedFuelData) {
    const container = document.getElementById('history-accordion-list') || document.getElementById('accordion-list');
    if (!container) return;

    // TÖM CONTAINERN FÖRST!
    container.innerHTML = '';

    const sortedData = [...filteredData].sort((a, b) => new Date(b.datum || 0) - new Date(a.datum || 0));

    if (sortedData.length === 0) {
        container.innerHTML = '<em>Inga händelser hittades för vald tidsperiod.</em>';
        return;
    }

    sortedData.forEach((item, index) => {
        const isFuel = item.kategori === 'Drivmedel';
        const amountInput = parseNum(item.belopp);
        const matar = parseNum(item.korstracka || item.matarstallning);
        const liter = parseNum(item.liter);
        const formattedDate = formatDate(item.datum);
        
        // Räkna ut totalkostnad: om drivmedel, multiplicera kr/L med antal liter
        const totalCost = (isFuel && liter > 0) ? (amountInput * liter) : amountInput;

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
if (carForm && !carForm.dataset.initialized) {
    carForm.dataset.initialized = "true";

    carForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const datum = document.getElementById('datum').value;
        const matarstallning = document.getElementById('matarstallning').value;
        const kategori = document.getElementById('kategori').value;
        const inputBelopp = parseNum(document.getElementById('belopp').value);
        const inputLiter = parseNum(document.getElementById('liter').value);
        const anteckning = document.getElementById('anteckning').value;
        const formCarSelect = document.getElementById('form-car-select');
        const carVal = formCarSelect ? formCarSelect.value : '';

        // Formulärets fält innehåller redan literpriset när kategori är Drivmedel.
        // Spara värdet direkt utan felaktig omräkning!
        let finalBelopp = inputBelopp;

        // KORREKT DUBBLETTSPÄRR (jämför rensade regnr och alla relevanta fält)
        if (!editingRowIndex) {
            const isDuplicate = currentData.some(item =>
                formatDate(item.datum) === formatDate(datum) &&
                parseNum(item.korstracka || item.matarstallning) === parseNum(matarstallning) &&
                item.kategori === kategori &&
                cleanCarReg(item.bil) === cleanCarReg(carVal)
            );

            if (isDuplicate) {
                showToast("Denna händelse finns redan registrerad!", true);
                return;
            }
        }

        const submitBtn = document.getElementById('submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerText = editingRowIndex ? "Uppdaterar..." : "Sparar...";

        const payload = {
            action: editingRowIndex ? "UPDATE" : "CREATE",
            rowIndex: editingRowIndex,
            datum,
            matarstallning,
            korstracka: matarstallning,
            kategori,
            belopp: finalBelopp,
            liter: inputLiter,
            anteckning,
            bil: carVal
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.status === 'success') {
                showToast(editingRowIndex ? "Händelsen har uppdaterats!" : "Händelsen har sparats!");
                resetForm();
                await loadData();
            } else {
                showToast("Kunde inte spara data: " + (result.message || "Ett fel uppstod"), true);
            }
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
    setTimeout(() => toast.classList.remove('show'), 3000);
}


// ----------------------------------------------------
// KONTROLLBESIKTNING
// ----------------------------------------------------
async function saveInspectionBooking() {
    const todayStr = new Date().toISOString().split('T')[0];
    const formCarSelect = document.getElementById('form-car-select');

    const bookingData = {
        datum: todayStr,
        kategori: 'Kontrollbesiktning',
        belopp: 0,
        korstracka: '',
        anteckning: 'Bokat kontrollbesiktning',
        bil: selectedCar !== 'ALL' ? selectedCar: (formCarSelect ? formCarSelect.value: '')
    };

    try {
        const btn = document.getElementById('btn-dismiss-inspection');
        if (btn) {
            btn.disabled = true;
            btn.innerText = 'Sparar...';
        }

        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(bookingData)
        });

        const result = await response.json();

        if (result.status === 'success') {
            await loadData();
        } else {
            alert('Kunde inte spara bokningen: ' + (result.message || 'Okänt fel'));
            if (btn) {
                btn.disabled = false;
                btn.innerText = 'Jag har bokat tid – Dölj påminnelse';
            }
        }
    } catch (error) {
        console.error('Fel vid sparning av bokning:', error);
        alert('Ett fel uppstod vid kommunikation med servern.');
    }
}

function checkInspectionStatus() {
    const inspectionContainer = document.getElementById('inspection-reminder');
    if (!inspectionContainer) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filteredData = getCarFilteredData();
    const inspectionEntries = filteredData
    .filter(item => (item.kategori === 'Kontrollbesiktning' || item.kategori === 'Besiktning') && item.datum)
    .map(item => {
        const [y, m, d] = formatDate(item.datum).split('-').map(Number);
        return {
            ...item, parsedDate: new Date(y, m - 1, d)
        };
    })
    .sort((a, b) => b.parsedDate - a.parsedDate);

    if (inspectionEntries.length === 0) {
        inspectionContainer.style.display = 'none';
        return;
    }

    const latestEntry = inspectionEntries[0];
    const isBookingRegistered = latestEntry.anteckning && latestEntry.anteckning.toLowerCase().includes('bokat');
    const lastPassedInspection = inspectionEntries.find(e => !e.anteckning || !e.anteckning.toLowerCase().includes('bokat'));

    if (!lastPassedInspection) {
        inspectionContainer.style.display = 'none';
        return;
    }

    const lastInspectionDateStr = formatDate(lastPassedInspection.parsedDate);
    const dueDate = new Date(lastPassedInspection.parsedDate);
    dueDate.setMonth(dueDate.getMonth() + 14);

    const diffTime = dueDate - today;
    const daysLeft = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
        inspectionContainer.style.display = 'block';
        inspectionContainer.innerHTML = `
        <div style="background-color: #ef444415; border-left: 4px solid #ef4444; padding: 12px; margin-bottom: 15px; border-radius: 4px; color: #1e293b;">
        <div style="font-weight: bold; margin-bottom: 4px; color: #ef4444;">🚨 VARNING: Kontrollbesiktningen har förfallit!</div>
        <div style="font-size: 0.9em; line-height: 1.4;">
        Sista besiktningsdatum var <strong>${formatDate(dueDate)}</strong> (${Math.abs(daysLeft)} dagar sedan). Boka/genomför kontrollbesiktning omgående!
        </div>
        </div>`;
        return;
    }

    if (isBookingRegistered) {
        inspectionContainer.style.display = 'none';
        return;
    }

    const NOTICE_WINDOW_DAYS = 90;

    if (daysLeft <= NOTICE_WINDOW_DAYS) {
        inspectionContainer.style.display = 'block';

        let statusColor = '#eab308';
        let statusTitle = "🚗 Dags att boka kontrollbesiktning!";

        if (daysLeft <= 14) {
            statusColor = '#f97316';
            statusTitle = "⚠️ Brådskande: Boka kontrollbesiktning!";
        }

        inspectionContainer.innerHTML = `
        <div style="background-color: ${statusColor}15; border-left: 4px solid ${statusColor}; padding: 12px; margin-bottom: 15px; border-radius: 4px; color: #1e293b;">
        <div style="font-weight: bold; margin-bottom: 4px; color: ${statusColor};">${statusTitle}</div>
        <div style="font-size: 0.9em; line-height: 1.4; margin-bottom: 10px;">
        Senaste kontrollbesiktning var <strong>${lastInspectionDateStr}</strong>.<br>
        Sista dag för kontrollbesiktning: <strong>${formatDate(dueDate)}</strong> (${daysLeft} dagar kvar).
        </div>
        <button id="btn-dismiss-inspection" onclick="saveInspectionBooking()" style="background-color: ${statusColor}; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; font-size: 0.85em; font-weight: bold; cursor: pointer;">
        Jag har bokat tid – Dölj påminnelse
        </button>
        </div>`;
    } else {
        inspectionContainer.style.display = 'none';
    }
}


// ----------------------------------------------------
// HJÄLPFUNKTIONER
// ----------------------------------------------------
function formatKr(val) {
    const num = parseNum(val);
    return num.toLocaleString('sv-SE', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });
}

function formatKm(val) {
    const num = parseNum(val);
    return num > 0 ? num.toLocaleString('sv-SE'): '';
}


function formatRegnr(regnr) {
  if (!regnr) return "";
  const clean = String(regnr).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length === 6) {
    return `${clean.slice(0, 3)} ${clean.slice(3)}`;
  }
  return clean;
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
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: false } }
        }
    });

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
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: false } }
        }
    });
}


// ----------------------------------------------------
// REDIGERING OCH ÅTERSTÄLLNING AV FORMULÄR
// ----------------------------------------------------
function editItem(item) {
    editingRowIndex = item.rowIndex || null;

    document.getElementById('datum').value = formatDate(item.datum);
    document.getElementById('matarstallning').value = item.korstracka || item.matarstallning || '';
    document.getElementById('kategori').value = item.kategori || 'Drivmedel';
    document.getElementById('belopp').value = item.belopp || '';
    document.getElementById('liter').value = item.liter || '';
    document.getElementById('anteckning').value = item.anteckning || '';

    const formCarSelect = document.getElementById('form-car-select');
    if (formCarSelect && item.bil) formCarSelect.value = item.bil;

    toggleFuelInput();

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.innerText = "Uppdatera händelse";

    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) cancelBtn.style.display = "block";

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

    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) cancelBtn.style.display = "none";
}

// ====================================================
// MODAL & BILHANTERING
// ====================================================

function openCarModal() {
    const modal = document.getElementById('car-modal');
    if (modal) {
        modal.style.display = 'flex';
        renderModalCarsList();
    }
}

function closeCarModal() {
    const modal = document.getElementById('car-modal');
    if (modal) {
        modal.style.display = 'none';
        resetCarModalForm();
    }
}

function renderModalCarsList() {
    const listContainer = document.getElementById('modal-cars-list');
    if (!listContainer) return;

    if (currentCars.length === 0) {
        listContainer.innerHTML = '<em>Inga bilar registrerade ännu.</em>';
        return;
    }

    let html = '';
    currentCars.forEach(car => {
        const displayName = getCarDisplayName(car);
        html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee; background: white; margin-bottom: 6px; border-radius: 4px;">
            <div>
                <strong>${displayName}</strong>
                <div style="font-size: 0.8em; color: #64748b;">
                    ${car.arsmodell ? `Årsmodell: ${car.arsmodell}` : ''}
                    ${car.intervalMil ? `| Service: ${car.intervalMil} mil` : ''}
                    ${car.intervalManader ? `| ${car.intervalManader} mån` : ''}
                </div>
            </div>
            <div style="display: flex; gap: 6px;">
                <button type="button" onclick="editCarInModal('${car.regnr}')" style="background: none; border: none; cursor: pointer; font-size: 1.1rem;">✏️</button>
                <button type="button" onclick="deleteCarFromModal('${car.regnr}')" style="background: none; border: none; cursor: pointer; font-size: 1.1rem;">🗑️</button>
            </div>
        </div>`;
    });

    listContainer.innerHTML = html;
}


async function handleCarFormSubmit(event) {
    event.preventDefault();

    const originalRegnr = document.getElementById('car-edit-original-regnr').value;
    const rawRegnr = document.getElementById('modal-regnr').value.trim();
    const regnr = formatRegnr(rawRegnr);
    
    const marke = document.getElementById('modal-marke').value.trim();
    const modell = document.getElementById('modal-modell').value.trim();
    const arsmodell = document.getElementById('modal-arsmodell').value.trim();
    const intervalMil = document.getElementById('modal-interval-mil').value.trim();
    const intervalManader = document.getElementById('modal-interval-manader').value.trim();

    const action = originalRegnr ? "UPDATE_CAR" : "ADD_CAR";

    const payload = {
        action,
        originalRegnr: formatRegnr(originalRegnr),
        regnr,
        marke,
        modell,
        arsmodell,
        intervalMil,
        intervalManader
    };

    const submitBtn = document.getElementById('modal-car-submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerText = "Sparar...";

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.status === 'success') {
            showToast(originalRegnr ? "Bilen har uppdaterats!" : "Bilen har lagts till!");
            resetCarModalForm();
            await loadData();
            renderModalCarsList();
        } else {
            showToast("Fel vid sparning av bil.", true);
        }
    } catch (error) {
        console.error("Fel vid sparning av bil:", error);
        showToast("Ett fel uppstod.", true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Spara bil";
    }
}


function editCarInModal(regnr) {
    const car = currentCars.find(c => c.regnr === regnr);
    if (!car) return;

    document.getElementById('car-edit-original-regnr').value = car.regnr;
    document.getElementById('modal-regnr').value = car.regnr;
    document.getElementById('modal-marke').value = car.marke || car.modell || ''; // Bakåtkompatibilitet
    document.getElementById('modal-modell').value = car.modell || '';
    document.getElementById('modal-arsmodell').value = car.arsmodell || '';
    document.getElementById('modal-interval-mil').value = car.intervalMil || '';
    document.getElementById('modal-interval-manader').value = car.intervalManader || '';

    document.getElementById('car-form-title').innerText = "Redigera bil";
    document.getElementById('modal-car-cancel-btn').style.display = "block";
}

function resetCarModalForm() {
    document.getElementById('car-edit-original-regnr').value = '';
    document.getElementById('modal-car-form').reset();
    document.getElementById('car-form-title').innerText = "Lägg till ny bil";
    document.getElementById('modal-car-cancel-btn').style.display = "none";
}

async function deleteCarFromModal(regnr) {
    if (!confirm(`Är du säker på att du vill ta bort bilen "${regnr}"?`)) return;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "DELETE_CAR", regnr })
        });

        const result = await response.json();

        if (result.status === 'success') {
            showToast("Bilen har tagits bort!");
            await loadData();
            renderModalCarsList();
        } else {
            showToast("Kunde inte ta bort bilen.", true);
        }
    } catch (error) {
        console.error("Fel vid borttagning av bil:", error);
        showToast("Ett fel uppstod.", true);
    }
}


// ====================================================
// SVAJP
// ====================================================
const TABS_ORDER = ['dashboard', 'input', 'history']; 

let touchStartX = 0;
let touchStartY = 0;

function initSwipeNavigation() {
    const mainContainer = document.querySelector('main') || document.body;

    mainContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    mainContainer.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;

        handleSwipeGesture(touchStartX, touchStartY, touchEndX, touchEndY);
    }, { passive: true });
}

function handleSwipeGesture(startX, startY, endX, endY) {
    const diffX = endX - startX;
    const diffY = endY - startY;
    const SWIPE_THRESHOLD = 60;

    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > SWIPE_THRESHOLD) {
        const activeTab = document.querySelector('.tab-content[style*="display: block"]') || document.getElementById('tab-dashboard');
        const activeTabId = activeTab ? activeTab.id.replace('tab-', '') : 'dashboard';

        let currentIndex = TABS_ORDER.indexOf(activeTabId);
        if (currentIndex === -1) currentIndex = 0;

        if (diffX < 0) {
            if (currentIndex < TABS_ORDER.length - 1) {
                switchTabWithButtonUpdate(TABS_ORDER[currentIndex + 1]);
            }
        } else {
            if (currentIndex > 0) {
                switchTabWithButtonUpdate(TABS_ORDER[currentIndex - 1]);
            }
        }
    }
}

function switchTabWithButtonUpdate(tabName) {
    switchTab(tabName);

    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${tabName}'`)) {
            btn.classList.add('active');
        }
    });
}
