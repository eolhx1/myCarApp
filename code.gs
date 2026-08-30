// Struktur på kalkylbladet (Kolumner):
// A: Datum | B: Mätarställning (km) | C: Kategori | D: Belopp (kr) | E: Liter | F: Anteckning

function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  // Ta bort rubrikraden om den finns
  if (data.length > 0) data.shift();
  
  const formattedData = data.map(row => ({
    datum: row[0] ? Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
    matarstallning: row[1] || 0,
    kategori: row[2] || "",
    belopp: row[3] || 0,
    liter: row[4] || 0,
    anteckning: row[5] || ""
  }));

  return ContentService
    .createTextOutput(JSON.stringify({ status: "success", data: formattedData }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const payload = JSON.parse(e.postData.contents);
    
    sheet.appendRow([
      payload.datum || new Date(),
      Number(payload.matarstallning) || 0,
      payload.kategori || "Övrigt",
      Number(payload.belopp) || 0,
      Number(payload.liter) || 0,
      payload.anteckning || ""
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", message: "Data sparad" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
