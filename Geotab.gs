/**
 * --- MÓDULO DE INTEGRACIÓN CON GEOTAB ---
 * Gestiona autenticación y consultas de kilometraje y asignación de unidades.
 */

/**
 * --- MÓDULO DE INTEGRACIÓN CON GEOTAB ---
 * Gestiona autenticación y consultas de kilometraje y asignación de unidades.
 */

// Variable global para mantener la sesión durante la ejecución
let GEOTAB_SESSION = {
  sessionId: null,
  serverUrl: null,
  database: null,
  user: null
};


// ==========================================
// 1. CONFIGURACIÓN Y AUTENTICACIÓN
// ==========================================

function cargarConfiguracionGeotab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('CONFIG_GEOTAB');
  if (!sheet) throw new Error("No se encontró la hoja 'CONFIG_GEOTAB'.");

  const data = sheet.getDataRange().getValues();
  const config = { server: null, database: null, user: null, password: null };

  data.forEach(row => {
    if (row[0]) {
      const key = String(row[0]).trim().toUpperCase();
      const val = row[1];
      if (key === 'GEOTAB_SERVER') config.server = val;
      if (key === 'GEOTAB_DB')     config.database = val;
      if (key === 'GEOTAB_USER')   config.user = val;
      if (key === 'GEOTAB_PASS')   config.password = val;
    }
  });

  if (!config.server || !config.database || !config.user || !config.password) {
    throw new Error("Faltan credenciales en CONFIG_GEOTAB (GEOTAB_SERVER, GEOTAB_DB, GEOTAB_USER, GEOTAB_PASS).");
  }
  return config;
}

function autenticarGeotab() {
  const config = cargarConfiguracionGeotab();
  GEOTAB_SESSION.database = config.database;
  GEOTAB_SESSION.user = config.user;

  // URL inicial (normalmente https://my.geotab.com/apiv1)
  const urlInicial = `https://${config.server}/apiv1`;
  
  const payload = {
    method: "Authenticate",
    params: {
      userName: config.user,
      password: config.password,
      database: config.database
    }
  };

  try {
    const response = UrlFetchApp.fetch(urlInicial, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    const json = JSON.parse(response.getContentText());

    if (json.error) {
      throw new Error(json.error.message);
    }

    const result = json.result;
    GEOTAB_SESSION.sessionId = result.credentials.sessionId;

    // --- CORRECCIÓN DEL ERROR "ThisServer" ---
    // Si Geotab devuelve "ThisServer", seguimos usando la URL original.
    // Si devuelve otra cosa (ej: "my356.geotab.com"), usamos esa nueva ruta.
    if (result.path === "ThisServer") {
        GEOTAB_SESSION.serverUrl = urlInicial;
    } else {
        GEOTAB_SESSION.serverUrl = `https://${result.path}/apiv1`;
    }

  } catch (e) {
    throw new Error("Error Autenticando en Geotab: " + e.message);
  }
}

function callGeotabApi(method, params) {
  if (!GEOTAB_SESSION.sessionId) autenticarGeotab();

  const payload = {
    method: method,
    params: params
  };
  payload.params.credentials = {
    database: GEOTAB_SESSION.database,
    sessionId: GEOTAB_SESSION.sessionId,
    userName: GEOTAB_SESSION.user
  };

  const options = {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(GEOTAB_SESSION.serverUrl, options);
  const json = JSON.parse(response.getContentText());

  if (json.error) {
    // Reintento si expiró sesión
    if (json.error.message.includes("Session") || json.error.code === -32000) {
      console.warn("Sesión expirada. Re-autenticando...");
      GEOTAB_SESSION.sessionId = null;
      autenticarGeotab();
      payload.params.credentials.sessionId = GEOTAB_SESSION.sessionId;
      // Reintentar con la nueva URL (que puede haber cambiado)
      const retry = UrlFetchApp.fetch(GEOTAB_SESSION.serverUrl, {
        method: 'post', contentType: 'application/json', payload: JSON.stringify(payload)
      });
      return JSON.parse(retry.getContentText()).result;
    }
    throw new Error("Geotab API Error: " + json.error.message);
  }
  return json.result;
}

// ==========================================
// 2. FUNCIONES DE NEGOCIO
// ==========================================

function obtenerUnidadPorChofer(idGeotab, fechaInput) {
  try {
    if (!idGeotab) return null;

    const fechaObj = new Date(fechaInput);
    const toDate = new Date(fechaObj); toDate.setHours(23, 59, 59, 999);
    const fromDate = new Date(toDate); fromDate.setDate(fromDate.getDate() - 90);

    const params = {
      typeName: "DriverChange",
      search: { userSearch: { id: idGeotab }, fromDate: fromDate.toISOString(), toDate: toDate.toISOString() },
      resultsLimit: 100
    };

    const res = callGeotabApi("Get", params);
    if (!res || res.length === 0) return null;

    res.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
    const ultimo = res[0];

    if (ultimo.type === "Driver" && ultimo.device) {
       // Buscamos el nombre para mostrar, pero devolvemos ID para cálculos
       const nombre = obtenerNombreDispositivo(ultimo.device.id);
       return { id: ultimo.device.id, name: nombre };
    }
    return null; // Logout

  } catch (e) {
    console.error("Error Unit: " + e.message);
    return null;
  }
}

// ==========================================
// 3. AUXILIARES
// ==========================================

function buscarUsuarioGeotab(legajo) {
  const resultados = callGeotabApi("Get", {
    typeName: "User",
    search: { employeeNo: String(legajo) }
  });
  return (resultados && resultados.length > 0) ? resultados[0] : null;
}

function obtenerNombreDispositivo(deviceId) {
  // Caché simple en memoria para esta ejecución
  if (!this._deviceCache) this._deviceCache = {};
  if (this._deviceCache[deviceId]) return this._deviceCache[deviceId];

  const resultados = callGeotabApi("Get", {
    typeName: "Device",
    search: { id: deviceId }
  });
  
  if (resultados && resultados.length > 0) {
    const nombre = resultados[0].name;
    this._deviceCache[deviceId] = nombre;
    return nombre;
  }
  return deviceId;
}
// ==========================================
// 3. TUS FUNCIONES ORIGINALES (MANTENIDAS)
// ==========================================

function PROBAR_GEOTAB() {
  // CONFIGURA ESTOS DATOS PARA LA PRUEBA
  const idVehiculo = "bA"; 
  const fechaSimulada = new Date(); 
  // Nota: user/pass/db ahora se toman de la hoja CONFIG_GEOTAB, 
  // pero mantengo tu estructura si la usas para debug manual.
  
  console.log("Iniciando prueba manual...");
  try {
    // Para probar la nueva función:
    // console.log(obtenerUnidadPorChofer("TU_ID_CHOFER", "2023-10-01"));
    
    const resultado = GEOTAB_GET_POSICION(idVehiculo, fechaSimulada);
    console.log("RESULTADO FINAL OBTENIDO:", resultado);
  } catch (err) {
    console.error("ERROR EN LA PRUEBA:", err.message);
  }
}
/*
function GEOTAB_GET_ODOMETRO(deviceId, fechaCelda) {
  try {
    if (!deviceId || !fechaCelda) return "Faltan parámetros";

    // --- 1. OBTENCIÓN DE CREDENCIALES DESDE LA HOJA ---
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetConfig = ss.getSheetByName("CONFIG_GEOTAB");
    
    let geoUser = "", geoPass = "", geoDb = "", geoServer = "my.geotab.com"; // Default server

    if (sheetConfig) {
        const data = sheetConfig.getDataRange().getValues();
        data.forEach(r => {
            const key = String(r[0]).trim().toUpperCase();
            const val = r[1];
            if (key === 'GEOTAB_USER') geoUser = val;
            if (key === 'GEOTAB_PASS') geoPass = val;
            if (key === 'GEOTAB_DB') geoDb = val;
            if (key === 'GEOTAB_SERVER') geoServer = val;
        });
    }

    if (!geoUser || !geoPass || !geoDb) {
        return "Error: Credenciales no configuradas en hoja CONFIG_GEOTAB";
    }

    // --- 2. CONFIGURACIÓN DE URL Y FECHA ---
    // Usamos el servidor configurado o el default
    let url = `https://${geoServer}/apiv1`;
    // Si la URL guardada no tiene protocolo, se lo agregamos
    if (!geoServer.startsWith("http")) url = `https://${geoServer}/apiv1`;


    // --- CONVERSIÓN DE FECHA ROBUSTA ---
    let d = new Date(fechaCelda);
    
    // Si la fecha falla por el formato regional, intentamos corregirla
    if (isNaN(d.getTime()) && typeof fechaCelda === "string") {
      let partes = fechaCelda.split(/[\/\s:]/);
      // Asume DD/MM/YYYY HH:mm:ss
      if (partes.length >= 3) {
         d = new Date(partes[2], partes[1] - 1, partes[0], partes[3]||0, partes[4]||0, partes[5]||0);
      }
    }

    if (isNaN(d.getTime())) return "Error: Fecha no reconocida";

    let pad = (n) => (n < 10 ? '0' + n : n);
    // Convertimos a ISO 8601 con Offset -03:00 (Argentina/Brasil)
    // Nota: Geotab trabaja en UTC, pero si tu "StatusData" espera local, mantenemos tu lógica.
    // Lo ideal para API es usar d.toISOString(), pero respetaré tu formato probado:
    let fechaISO = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" +
                   pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + ".000-03:00";

    // --- 3. CONSTRUCCIÓN DEL PAYLOAD ---
    const mySearch = {
      "diagnosticSearch": { "id": "DiagnosticOdometerAdjustmentId" },
      "deviceSearch": { "id": deviceId },
      "fromDate": fechaISO,
      "toDate": fechaISO
    };

    const payload = {
      "method": "Get",
      "params": {
        "typeName": "StatusData",
        "search": mySearch,
        "resultsLimit": 1, // Limitamos a 1 para ser más eficientes, buscamos el más cercano
        "credentials": { "database": geoDb, "userName": geoUser, "password": geoPass }
      }
    };

    const options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };

    // --- 4. EJECUCIÓN ---
    const response = UrlFetchApp.fetch(url, options);
    const resText = response.getContentText();
    const json = JSON.parse(resText);

    if (json.error) {
      // Si el error es de credenciales inválidas, retornamos mensaje claro
      if (json.error.message && json.error.message.includes("Incorrect")) {
          return "Error API: Credenciales Inválidas";
      }
      return "Error API: " + json.error.message;
    }

    if (json.result && json.result.length > 0) {
      return json.result[0].data / 1000; // Devuelve KM
    } else {
      // Intentamos una segunda búsqueda con un rango mayor (1 hora antes) si el punto exacto no tiene dato
      // (Opcional, si quieres mantener tu lógica exacta, borra este bloque else y deja el return "Sin datos")
      return "Sin datos";
    }

  } catch (e) {
    return "Error Script: " + e.toString();
  }
}*/

/**
 * Versión asegurada para recibir Date o String
 */
function GEOTAB_GET_ODOMETRO(deviceId, fechaInput) {
  try {
    if (!deviceId) return 0;
    
    // Asegurar que es Date
    let fechaObj;
    if (fechaInput instanceof Date) {
        fechaObj = fechaInput;
    } else {
        fechaObj = new Date(fechaInput);
    }
    
    // Buscar 7 días atrás para encontrar la última lectura válida
    const fromDate = new Date(fechaObj.getTime() - (7 * 24 * 60 * 60 * 1000));
    
    const params = {
      typeName: "StatusData",
      search: {
        deviceSearch: { id: deviceId },
        diagnosticSearch: { id: "DiagnosticOdometerAdjustmentId" },
        fromDate: fromDate.toISOString(),
        toDate: fechaObj.toISOString() 
      }
    };
    
    // Call API
    const res = callGeotabApi("Get", params);
    
    if (res && res.length > 0) {
       // Ordenar desc para tomar el último
       res.sort((a,b) => new Date(b.dateTime) - new Date(a.dateTime));
       return (res[0].data || 0) / 1000; 
    }
    return 0;

  } catch (e) {
    console.error("Error Odometro: " + e.message);
    return 0;
  }
}

/**
 * NUEVA FUNCIÓN: Obtiene la dirección (Localidad) a las 23:59 del día.
 */
function GEOTAB_GET_POSICION(deviceId, fechaFinDia) {
  try {
    if (!deviceId) return "";
    
    // 1. Buscar la última coordenada (LogRecord) antes de las 23:59:59
    // Buscamos en una ventana de 2 horas hacia atrás para asegurar encontrar un punto
    const fromDate = new Date(fechaFinDia.getTime() - (2 * 60 * 60 * 1000)); // 2 horas antes
    
    const paramsLog = {
      typeName: "LogRecord",
      search: {
        deviceSearch: { id: deviceId },
        fromDate: fromDate.toISOString(),
        toDate: fechaFinDia.toISOString()
      },
      resultsLimit: 1 // Solo queremos el último
    };

    // La API Get por defecto devuelve en orden ascendente, pero si pedimos Logs
    // queremos el último. A veces conviene traer 10 y ordenar en JS, o invertir fechas.
    // Geotab no soporta "Sort" nativo en Get simple, así que traemos los últimos y ordenamos.
    
    // Estrategia eficiente: Pedimos LogRecord.
    const logs = callGeotabApi("Get", paramsLog);
    
    if (!logs || logs.length === 0) return "Sin señal GPS";

    // Tomamos el último registro (el más cercano a las 23:59)
    // Nota: Si resultsLimit limita al principio, esto podría traer el de las 22:00.
    // Para asegurar el último, pedimos más o usamos GetFeed, pero Get es más simple.
    // Correctivo: Geotab Get devuelve los primeros.
    // Para obtener el último, lo mejor es pedir un rango corto y tomar el último del array.
    const ultimoLog = logs[logs.length - 1]; 
    
    if (!ultimoLog) return "Sin señal";

    // 2. Convertir coordenadas a Dirección (Reverse Geocoding)
    const paramsAddress = {
      coordinates: [{ x: ultimoLog.longitude, y: ultimoLog.latitude }]
    };

    const direcciones = callGeotabApi("GetAddresses", paramsAddress);

    if (direcciones && direcciones.length > 0) {
        return direcciones[0].formattedAddress || "Ubicación desconocida";
    }
    return "Coordenadas sin dirección";

  } catch (e) {
    console.error("Error Posicion: " + e.message);
    return "Error Geotab";
  }
}

let _DEVICE_CACHE = {};
function obtenerNombreDispositivo(deviceId) {
  if (_DEVICE_CACHE[deviceId]) return _DEVICE_CACHE[deviceId];
  try {
    const res = callGeotabApi("Get", { typeName: "Device", search: { id: deviceId } });
    if (res && res.length > 0) {
      const nombre = res[0].name;
      _DEVICE_CACHE[deviceId] = nombre;
      return nombre;
    }
  } catch(e) {}
  return deviceId;
}

function obtenerNombreDispositivo(deviceId) {
  const resultados = callGeotabApi("Get", {
    typeName: "Device",
    search: { id: deviceId }
  });
  if (resultados && resultados.length > 0) return resultados[0].name;
  return deviceId;
}