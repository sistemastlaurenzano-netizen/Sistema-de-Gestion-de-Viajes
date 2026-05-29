// --- SISTEMA DE LOGS CENTRALIZADO ---
// --- SISTEMA DE LOGS CENTRALIZADO ---

// 1. Agregamos el parámetro 'usuarioApp' al principio
function registrarLog(usuarioApp, accion, tabla, idRegistro, detallesObj) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('LOGS');
    
    if (!sheet) {
      console.error("La hoja LOGS no existe.");
      return;
    }

    const timestamp = new Date();
    
    // 2. Usamos el usuario que viene desde la aplicación, o "Sistema" por defecto
    const usuario = usuarioApp || "Sistema"; 
    
    // Formato JSON para la columna detalles
    // Estructura: { previo: {...}, posterior: {...} }
    const detallesJSON = JSON.stringify(detallesObj);

    // Estructura de columnas: Timestamp | Usuario | Accion | Tabla | ID_Registro | Detalles
    sheet.appendRow([
      timestamp,
      usuario,
      accion,
      tabla,
      idRegistro,
      detallesJSON
    ]);

  } catch (e) {
    console.error("Error guardando Log: " + e.message);
  }
}
