/**
 * Construye la hoja REFERENCIAS con Provincias y Localidades
 * y crea rangos nombrados para cada provincia.
 */
function buildReferenciasConRangos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('REFERENCIAS');
  if (!sheet) sheet = ss.insertSheet('REFERENCIAS');
  sheet.clear();

  // Encabezados
  sheet.getRange(1,1,1,2).setValues([['Provincia','Localidad']]);

  // Obtener provincias
  const provResp = UrlFetchApp.fetch('https://apis.datos.gob.ar/georef/api/provincias?campos=id,nombre');
  const provData = JSON.parse(provResp.getContentText());
  const provincias = provData.provincias;

  let rowIndex = 2;

  provincias.forEach(prov => {
    const provId = prov.id;
    const provNombre = prov.nombre;

    let start = 0;
    let total = 1;
    while (start < total) {
      const url = `https://apis.datos.gob.ar/georef/api/localidades?provincia=${provId}&campos=nombre&max=500&inicio=${start}`;
      const resp = UrlFetchApp.fetch(url);
      const data = JSON.parse(resp.getContentText());
      total = data.total;
      const localidades = data.localidades;

      localidades.forEach(loc => {
        sheet.getRange(rowIndex,1,1,2).setValues([[provNombre, loc.nombre]]);
        rowIndex++;
      });

      start += localidades.length;
    }

    // Crear rango nombrado para esta provincia
    const lastRow = sheet.getLastRow();
    const locsRange = sheet.getRange(2,2,lastRow-1,1);
    // Filtrar solo las filas de esta provincia
    const formulaRange = sheet.getRange(rowIndex,3); // celda auxiliar
    formulaRange.setFormula(`=FILTER(B:B, A:A="${provNombre}")`);
    const locsFiltered = sheet.getRange(rowIndex,3,formulaRange.getDataRegion().getNumRows(),1);

    // Nombre de rango: Localidades_Provincia (sin espacios)
    const rangeName = "Localidades_" + provNombre.replace(/\s+/g,'_');
    ss.setNamedRange(rangeName, locsFiltered);
  });

  // Estilo
  const headerRange = sheet.getRange(1,1,1,2);
  headerRange.setFontWeight('bold').setBackground('#0b5ed7').setFontColor('#ffffff').setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1,2);
}