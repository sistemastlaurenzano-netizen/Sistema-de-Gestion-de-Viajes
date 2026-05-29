/**
 * setup.gs
 * Crea/asegura hojas y validaciones para el proyecto.
 * Incluye la hoja EMPRESAS_TRANSPORTE con validación de Tipo_Empresa.
 */

const REQUIRED_SHEETS = {
  'LUGARES': [
    'Lugar_key','Nombre','Direccion','Provincia','Localidad','Latitud_GPS','Longitud_GPS','id_Geotab'
  ],
  'VEHICULOS': [
    'Equipo_key','Patente','Interno','Marca','Modelo','Tipo_Unidad','Anio','Motor','Chasis','Odometro','Fecha_Alta','Fecha_Baja'
  ],
  'CLIENTES': [
    'Cliente_Key','Nombre','CUIT','Direccion'
  ],
  'VIAJES': [
    'ID','Nro_Viaje','Fecha','Cliente_Key','Origen_Key','Destino_Key','Estado'
  ],
  'CHOFERES': [
  'ID_Chofer','Nombre','DNI','Telefono','Celular','Mail','Estado_Civil','Legajo','Domicilio','Fecha_Ingreso','CATEGORIA','ID_EMPRESA','NOMBRE_EMPRESA','ID_TRACTOR','PATENTE_TRACTOR','ID_REMOLQUE','PATENTE_REMOLQUE','ContactoFamiliar','TelefonoContacto','RelacionContacto','Fecha_baja','ID_Geotab'
],

  'REFERENCIAS': [
    'Provincia','Localidad'
  ],
  'EMPRESAS_TRANSPORTE': [
    'EMPRESA_KEY','RAZON_SOCIAL','CUIT','TIPO_EMPRESA','TELEFONO','CORREO','DOMICILIO','PROVINCIA','LOCALIDAD'
  ]
};

/**
 * setupSheets
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(REQUIRED_SHEETS).forEach(name => {
    ensureSheet(ss, name, REQUIRED_SHEETS[name]);
  });
}

/**
 * ensureSheet
 */
function ensureSheet(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  // Si los encabezados no coinciden, reescribir la primera fila (no borramos datos salvo cuando es necesario)
  const current = sheet.getRange(1,1,1,headers.length).getValues()[0].map(h => String(h||'').trim());
  const needRewrite = headers.some((h,i) => current[i] !== h);
  if (needRewrite) {
    sheet.clear();
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }

  // Validaciones específicas
  if (sheetName === 'VEHICULOS') applyVehiculosValidation(sheet, headers);
  if (sheetName === 'REFERENCIAS') sheet.getRange(1,1,1,2).setValues([['Provincia','Localidad']]);
  if (sheetName === 'EMPRESAS_TRANSPORTE') applyEmpresasValidation(sheet, headers);
  if (sheetName === 'CHOFERES') applyChoferesValidation(sheet, headers);  
}

/**
 * applyVehiculosValidation
 */
function applyVehiculosValidation(sheet, headers) {
  const normalize = s => String(s||'').trim();
  const idx = (name) => headers.findIndex(h => normalize(h).toLowerCase() === normalize(name).toLowerCase()) + 1;

  const colTipo = idx('Tipo_Unidad');
  if (colTipo > 0) {
    const tipos = ['tractor','remolque','bitren','utilitario'];
    const ruleTipo = SpreadsheetApp.newDataValidation().requireValueInList(tipos, true).setAllowInvalid(false).build();
    sheet.getRange(2, colTipo, sheet.getMaxRows()-1, 1).setDataValidation(ruleTipo);
  }

  const colOdo = idx('Odometro');
  if (colOdo > 0) {
    const ruleOdo = SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(true).build();
    sheet.getRange(2, colOdo, sheet.getMaxRows()-1, 1).setDataValidation(ruleOdo);
  }

  const colFecha = idx('Fecha_Alta');
  if (colFecha > 0) {
    const ruleFecha = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build();
    sheet.getRange(2, colFecha, sheet.getMaxRows()-1, 1).setDataValidation(ruleFecha);
  }
}

/**
 * applyEmpresasValidation
 * - valida TIPO_EMPRESA con lista fija
 */
function applyEmpresasValidation(sheet, headers) {
  const normalize = s => String(s||'').trim();
  const idx = (name) => headers.findIndex(h => normalize(h).toLowerCase() === normalize(name).toLowerCase()) + 1;

  const colTipo = idx('TIPO_EMPRESA');
  if (colTipo > 0) {
    const tipos = ['PROPIA','FLETERO','TRACTORISTA'];
    const ruleTipo = SpreadsheetApp.newDataValidation().requireValueInList(tipos, true).setAllowInvalid(false).build();
    sheet.getRange(2, colTipo, sheet.getMaxRows()-1, 1).setDataValidation(ruleTipo);
  }
}

function applyChoferesValidation(sheet, headers) {
  const normalize = s => String(s||'').trim().toUpperCase();
  const idx = (name) => headers.findIndex(h => normalize(h) === normalize(name)) + 1;

  // Validar fechas
  ['Fecha_Ingreso','Fecha_baja'].forEach(colName => {
    const col = idx(colName);
    if (col > 0) {
      const ruleFecha = SpreadsheetApp.newDataValidation()
        .requireDate()
        .setAllowInvalid(true)
        .build();
      sheet.getRange(2, col, sheet.getMaxRows()-1, 1).setDataValidation(ruleFecha);
    }
  });

  // Validar Estado_Civil con lista fija
  const colEC = idx('Estado_Civil');
  if (colEC > 0) {
    const estados = ['Soltero','Casado','Divorciado','Viudo'];
    const ruleEC = SpreadsheetApp.newDataValidation()
      .requireValueInList(estados, true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, colEC, sheet.getMaxRows()-1, 1).setDataValidation(ruleEC);
  }
}


/**
 * insertarEmpresaPrueba
 */
function insertarEmpresaPrueba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('EMPRESAS_TRANSPORTE');
  if (!sheet) {
    ensureSheet(ss, 'EMPRESAS_TRANSPORTE', REQUIRED_SHEETS['EMPRESAS_TRANSPORTE']);
    sheet = ss.getSheetByName('EMPRESAS_TRANSPORTE');
  }
  sheet.appendRow(['E001','Transporte Gonzalo SRL','20-12345678-9','FLETERO','011-12345678','info@tg.com','Av. Ejemplo 123','Buenos Aires','Lanus']);
  return 'empresa prueba insertada';
}