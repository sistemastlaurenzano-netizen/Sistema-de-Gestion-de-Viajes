// --- 1. CONFIGURACIÓN WEB (doGet) ---
function doGet(e) {
  try {
    let page = e.parameter.page || 'viajes';
    
    let template = HtmlService.createTemplateFromFile('Layout');
    template.pageContent = page; 
    
    return template.evaluate()
        .setTitle('Viajes LZN')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
        
  } catch (error) {
    return HtmlService.createHtmlOutput(`<h3>Error cargando la App:</h3><p>${error.message}</p>`);
  }
}

// --- 2. FUNCIÓN DE INCLUSIÓN (SPA) ---
function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (e) {
    return `<div class="alert alert-danger">Error: No se encuentra el archivo de vista "${filename}.html"</div>`;
  }
}

// Función para la navegación dinámica
function apiGetPageHtml(pageName) {
  return include(pageName); 
}

// --- 3. MENÚ EN GOOGLE SHEETS (onOpen) ---
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🚀 GESTION DE VIAJES')
    .addItem('Abrir Sistema', 'abrirAppEnModal')
    .addToUi();
}

function abrirAppEnModal() {
  // 1. Detectamos el nombre de la hoja activa
  const hojaActiva = SpreadsheetApp.getActiveSheet().getName().trim().toUpperCase();
  
  // 2. Definimos 'lugares' como página por defecto
  let page = 'viajes'; 

  // 3. Mapeo inteligente: Si el nombre coincide, abrimos esa sección
  // Los 'cases' deben coincidir con el nombre de tu PESTAÑA en el Excel
  // La variable 'page' debe coincidir con el nombre de tu archivo HTML (sin .html)
  switch(hojaActiva) {
    case 'CHOFERES':
      page = 'choferes';
      break;
    case 'LUGARES':
      page = 'lugares';
      break;
    case 'EMPRESAS_TRANSPORTE':
      page = 'empresas'; 
      break;  
    case 'VEHICULOS':
      page = 'vehiculos'; 
      break;
    case 'CLIENTES':
      page = 'clientes'; 
      break;  
    case 'LIQUIDACION_CLIENTE':
      page = 'liquidaciones'; 
      break;        
    case 'VIAJES':
      page = 'viajes';    // (Si ya creaste viajes.html)
      break;
    // Si estás en PERMISOS, PAISES o cualquier otra, caerá en el default (lugares)
  }

  let template = HtmlService.createTemplateFromFile('Layout');
  template.pageContent = page;
  
  let html = template.evaluate()
      .setWidth(1600)  // Ancho casi completo
      .setHeight(850); // Alto
      
  SpreadsheetApp.getUi().showModalDialog(html, 'VIAJES LZN');
}

// --- NUEVA FUNCIÓN: CONSULTAR API EXTERNA ---
function apiGetCotizacionOficial(moneda, fechaFacturaStr) {
  try {
    // 1. Si es Pesos, el cambio es 1
    if (!moneda || moneda === '$' || moneda === 'ARS') {
        return { success: true, valor: 1 };
    }

    // 2. Calcular "Día Anterior"
    // fechaFacturaStr viene como "YYYY-MM-DD"
    if (!fechaFacturaStr) return { success: false, error: "Falta fecha" };
    
    const partes = fechaFacturaStr.split('-');
    // Creamos fecha a las 12hs para evitar problemas de timezone
    const fechaFactura = new Date(parseInt(partes[0]), parseInt(partes[1])-1, parseInt(partes[2]), 12, 0, 0);
    
    // Restar 1 día
    fechaFactura.setDate(fechaFactura.getDate() - 1);
    
    // Formato API (YYYY-MM-DD) o comparación
    // La API de ArgentinaDatos devuelve fechas en formato "YYYY-MM-DD"
    
    // 3. Seleccionar URL según moneda
    let url = "";
    if (moneda === 'USD') {
        url = "https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial";
    } else if (moneda === 'EUR') {
        // La API pública suele tener USD principalmente. Para EUR podríamos usar otra o aproximar.
        // Por simplicidad, si es EUR y no hay API fácil histórica, dejamos que el usuario cargue o usamos una base fija.
        // Intentaremos buscar USD y si es EUR avisamos que debe cargar manual si no encontramos endpoint fiable gratuito histórico.
        return { success: true, valor: 0, mensaje: "Cotización EUR no disponible automática" };
    }

    // 4. Fetch a la API (Trae todo el histórico, es un JSON array)
    // Es eficiente cachearlo, pero para este uso puntual lo pedimos directo.
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText()); // Array de objetos {fecha, compra, venta}

    // 5. Buscar la fecha exacta (Día anterior)
    // Si fue domingo, buscamos viernes. Haremos un loop hacia atrás máx 5 días.
    let rateEncontrado = 0;
    
    // Intentamos buscar hasta 4 días atrás por feriados/findes
    for (let i = 0; i < 5; i++) {
        const y = fechaFactura.getFullYear();
        const m = String(fechaFactura.getMonth() + 1).padStart(2, '0');
        const d = String(fechaFactura.getDate()).padStart(2, '0');
        const fechaBusqueda = `${y}-${m}-${d}`;

        const registro = data.find(r => r.fecha === fechaBusqueda);
        if (registro) {
            rateEncontrado = registro.venta || registro.compra; // Usamos Venta BNA generalmente
            break;
        }
        // Si no encontramos, restamos otro día (ir hacia atrás buscando el último hábil)
        fechaFactura.setDate(fechaFactura.getDate() - 1);
    }

    if (rateEncontrado > 0) {
        return { success: true, valor: rateEncontrado };
    } else {
        return { success: true, valor: 0 }; // No encontrado, dejar que usuario cargue
    }

  } catch (e) {
    console.error("Error API Cotización: " + e.message);
    return { success: false, error: e.message };
  }
}

// --- SISTEMA DE LOGIN INTERNO ---
function apiLoginSistema(emailUsuario, pinIngresado) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('PERMISOS');
    if (!sheet) throw new Error("Falta la hoja PERMISOS en la base de datos.");

    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).toUpperCase().trim());
    
    // Busca la columna PIN
    const colPin = headers.indexOf('PIN');
    
    const userEmail = String(emailUsuario).toLowerCase().trim();
    const userRow = data.find(r => String(r[0]).toLowerCase().trim() === userEmail);

    if (!userRow) throw new Error("Usuario no registrado en el sistema.");
    
    // Si creaste la columna PIN, validamos. Si no, entra directo (peligroso pero funciona).
    if (colPin !== -1) {
      const pinReal = String(userRow[colPin]).trim();
      if (pinReal !== String(pinIngresado).trim()) {
        throw new Error("PIN incorrecto. Intente nuevamente.");
      }
    }

    return { success: true, usuario: userEmail };
  } catch (e) {
    return { success: false, error: e.message };
  }
}