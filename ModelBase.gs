class BaseModel {
  // 1. Agregamos usuarioApp al constructor (con valor por defecto "Sistema")
  constructor(sheetName, keyField, usuarioApp = "Sistema") {
    this.ss = SpreadsheetApp.getActiveSpreadsheet();
    this.sheet = this.ss.getSheetByName(sheetName);
    this.sheetName = sheetName; 
    this.usuarioApp = usuarioApp; // 2. Guardamos la identidad
    
    if (!this.sheet) {
      throw new Error(`La hoja "${sheetName}" no existe en el Excel.`);
    }
    this.keyField = keyField; 
  }

  getHeaders() {
    const rawHeaders = this.sheet.getRange(1, 1, 1, this.sheet.getLastColumn()).getValues()[0];
    return rawHeaders.map(h => String(h).trim());
  }

  getData() {
    const lastRow = this.sheet.getLastRow();
    if (lastRow < 2) return []; 

    const data = this.sheet.getRange(2, 1, lastRow - 1, this.sheet.getLastColumn()).getValues();
    const headers = this.getHeaders();
    
    return data.map(row => {
      let obj = {};
      headers.forEach((header, index) => {
        let value = row[index];
        if (value instanceof Date) {
          try {
            const timeZone = Session.getScriptTimeZone();
            if (value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0) {
              value = Utilities.formatDate(value, timeZone, "dd/MM/yyyy HH:mm:ss");
            } else {
              value = Utilities.formatDate(value, timeZone, "dd/MM/yyyy");
            }
          } catch (e) { value = ""; }
        }
        obj[header] = value;
      });
      return obj;
    });
  }

  getById(idValue) {
    const data = this.getData();
    return data.find(item => String(item[this.keyField]) === String(idValue));
  }

  create(dataObj) {
    const headers = this.getHeaders();
    const row = headers.map(header => dataObj[header] || "");
    this.sheet.appendRow(row);

    const idReg = dataObj[this.keyField] || "N/A";
    
    // 3. Enviamos this.usuarioApp al Logger
    registrarLog(this.usuarioApp, "INSERT", this.sheetName, idReg, {
      previo: null,
      posterior: dataObj
    });

    return { success: true };
  }

  update(idValue, dataObj) {
    const estadoPrevio = this.getById(idValue);
    const data = this.sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const keyIndex = headers.indexOf(this.keyField);
    
    if (keyIndex === -1) throw new Error(`Columna clave "${this.keyField}" no encontrada.`);

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][keyIndex]) === String(idValue)) {
        headers.forEach((header, colIndex) => {
          if (dataObj[header] !== undefined) {
            this.sheet.getRange(i + 1, colIndex + 1).setValue(dataObj[header]);
          }
        });

        // 3. Enviamos this.usuarioApp al Logger
        registrarLog(this.usuarioApp, "UPDATE", this.sheetName, idValue, {
          previo: estadoPrevio,
          posterior: dataObj 
        });

        return { success: true };
      }
    }
    throw new Error("ID no encontrado para actualizar.");
  }

  delete(idValue) {
    const estadoPrevio = this.getById(idValue);
    const data = this.sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const keyIndex = headers.indexOf(this.keyField);

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][keyIndex]) === String(idValue)) {
        this.sheet.deleteRow(i + 1);

        // 3. Enviamos this.usuarioApp al Logger
        registrarLog(this.usuarioApp, "DELETE", this.sheetName, idValue, {
          previo: estadoPrevio,
          posterior: null
        });

        return { success: true };
      }
    }
    throw new Error("ID no encontrado para eliminar.");
  }
}