class ClientesModel extends BaseModel {
  // Recibimos el usuarioApp y lo pasamos en el super()
  constructor(usuarioApp) {
    super('CLIENTES', 'Cliente_key', usuarioApp);
  }
}

// --- CLASE TARIFAS BLINDADA (BATCH WRITE) ---
class TarifasModel extends BaseModel {
  constructor(usuarioApp) {
    super('TARIFAS', 'ID_TARIFA', usuarioApp);
    this.sheetName = 'TARIFAS';
  }

  // AHORA ACEPTA "moneda" COMO TERCER PARÁMETRO
  reemplazarTarifasPorLote(clienteKey, nuevasTarifas, moneda) {
    const lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch (e) { throw new Error("Servidor ocupado. Intente de nuevo."); }

    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName(this.sheetName);
        if (!sheet) throw new Error(`Falta la hoja "${this.sheetName}".`);
        
        // 1. CHEQUEO DE PROTECCIÓN
        const protection = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
        if (protection && !protection.canEdit()) {
            throw new Error(`La hoja "${this.sheetName}" está protegida. Desbloquéala para guardar.`);
        }

        // 2. LEER DATOS Y MAPEAR COLUMNAS
        const lastCol = sheet.getLastColumn();
        if (lastCol < 1) throw new Error("La hoja TARIFAS está vacía (sin títulos).");
        
        const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        const mapHead = {};
        headers.forEach((h, i) => { if(h) mapHead[String(h).trim().toUpperCase()] = i; });

        // Validar columnas críticas
        if (mapHead['CLIENTE_KEY'] === undefined) throw new Error("Falta columna CLIENTE_KEY en TARIFAS.");
        if (mapHead['VALOR'] === undefined) throw new Error("Falta columna VALOR en TARIFAS.");
        if (mapHead['MONEDA'] === undefined) throw new Error("Falta columna MONEDA en TARIFAS.");

        const lastRow = sheet.getLastRow();
        let allValues = [];
        if (lastRow > 1) {
            allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
        }

        // 3. FILTRAR Y PREPARAR DATOS
        const strKey = String(clienteKey);
        const colKey = mapHead['CLIENTE_KEY'];
        const colId = mapHead['ID_TARIFA'];
        const colTipo = mapHead['TIPO'];
        const colValor = mapHead['VALOR'];
        const colMoneda = mapHead['MONEDA'];

        // Conservamos las de OTROS clientes
        const dataConservar = allValues.filter(row => String(row[colKey]) !== strKey);
        
        // Preparamos las NUEVAS
        const nuevasFilas = nuevasTarifas.map(t => {
            const rowArray = new Array(lastCol).fill("");
            
            if (colId !== undefined) rowArray[colId] = "T" + Math.floor(Math.random() * 10000000);
            rowArray[colKey] = clienteKey;
            
            if (colTipo !== undefined) rowArray[colTipo] = t.tipo;
            
            rowArray[colValor] = parseFloat(t.valor) || 0;
            
            // GUARDAMOS LA MONEDA (Que viene del Cliente)
            rowArray[colMoneda] = moneda || '$'; 

            return rowArray;
        });

        const dataFinal = [...dataConservar, ...nuevasFilas];

        // 4. ESCRITURA
        if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
        
        if (dataFinal.length > 0) {
            // Ajuste automático de filas si faltan
            const maxRows = sheet.getMaxRows();
            const filasNecesarias = dataFinal.length + 1;
            if (maxRows < filasNecesarias) {
                sheet.insertRowsAfter(maxRows, filasNecesarias - maxRows);
            }
            
            sheet.getRange(2, 1, dataFinal.length, dataFinal[0].length).setValues(dataFinal);
        }

        SpreadsheetApp.flush();

    } catch (e) {
        throw e;
    } finally {
        lock.releaseLock();
    }
  }

  getByCliente(clienteKey) {
    const data = this.getData();
    return data.filter(row => String(row.CLIENTE_KEY) === String(clienteKey));
  }
}


// --- API FUNCTIONS ---

// 1. Agregado usuarioApp
function apiGetClientes(usuarioApp) {
  try {
    const p = new PermisosModel(usuarioApp);
    const role = p.checkAccess('CLIENTES', 'Read'); 
    
    const db = new ClientesModel(usuarioApp); // Inyectado
    const data = db.getData();

    const provinciasDb = new BaseModel('PROVINCIAS', 'Provincia', usuarioApp);
    const paisesDb = new BaseModel('PAISES', 'País', usuarioApp);
    const dataProvincias = provinciasDb.getData();

    return { 
        success: true, 
        data: data, 
        lists: {
            provincias: dataProvincias,
            localidades: dataProvincias,
            paises: paisesDb.getData()
        }, 
        role: role 
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Las funciones de lectura pura no necesitan loguear quién las consultó
function apiGetTarifasCliente(clienteKey) {
    try {
        const db = new TarifasModel(); 
        const tarifas = db.getByCliente(clienteKey);
        return { success: true, tarifas: tarifas };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// Lectura pura
function apiBuscarDatosCuenta(nroCuenta) {
  try {
    if (!nroCuenta) return { found: false };
    const db = new ClientesModel();
    const data = db.getData();
    const clienteExistente = data.find(c => String(c.Cuenta) === String(nroCuenta));
    if (clienteExistente) return { found: true, data: clienteExistente };
    return { found: false };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Lectura pura
function apiConsultarGeoCliente(direccion) {
  try {
    if (!direccion) return { error: "Dirección vacía" };
    const locRaw = GEO_INFO_LOCA(direccion);
    const provRaw = GEO_INFO_PROV(direccion);
    const paisRaw = GEO_INFO_PAIS(direccion);

    // Las funciones GEO_INFO devuelven un array 2D, ej: [['Buenos Aires']]. Hay que extraer el valor.
    const localidad = (locRaw && locRaw[0] && locRaw[0][0]) ? locRaw[0][0] : "";
    const provincia = (provRaw && provRaw[0] && provRaw[0][0]) ? provRaw[0][0] : "";
    const pais = (paisRaw && paisRaw[0] && paisRaw[0][0]) ? paisRaw[0][0] : "";

    return { success: true, localidad: localidad, provincia: provincia, pais: pais };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 1. Agregado usuarioApp
function apiSaveCliente(usuarioApp, formObject) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('CLIENTES', 'Update'); 
    
    if (!formObject.Cuenta || !formObject.Subcuenta) {
      throw new Error("Debe ingresar Cuenta y Subcuenta.");
    }
    
    const generatedKey = `${formObject.Cuenta}-${formObject.Subcuenta}`;
    formObject.Cliente_key = generatedKey; 
    
    if (!formObject.MONEDA) formObject.MONEDA = '$';

    const db = new ClientesModel(usuarioApp); // Inyectado
    const tarifasDb = new TarifasModel(usuarioApp); // Inyectado

    // 1. Guardar Cliente
    if (formObject.actionType === 'create') {
      const data = db.getData();
      const existe = data.some(c => String(c.Cliente_key) === String(generatedKey));
      if (existe) throw new Error(`Ya existe un cliente con la clave ${generatedKey}.`);
      db.create(formObject);
    } else {
      db.update(generatedKey, formObject);
    }

    // 2. Guardar Tarifas 
    if (formObject._tarifasJSON) {
        let listaTarifas = [];
        try { listaTarifas = JSON.parse(formObject._tarifasJSON); } catch(e) {}
        
        // PASAMOS LA MONEDA DEL CLIENTE PARA QUE SE GUARDE EN CADA TARIFA
        tarifasDb.reemplazarTarifasPorLote(generatedKey, listaTarifas, formObject.MONEDA);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 1. Agregado usuarioApp
function apiDeleteCliente(usuarioApp, id) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('CLIENTES', 'Delete');

    // 1. Obtener datos del Cliente a eliminar para sacar Cuenta y Subcuenta
    const dbClientes = new ClientesModel(usuarioApp); // Inyectado
    const clienteToDelete = dbClientes.getById(id);

    if (!clienteToDelete) {
        throw new Error("Cliente no encontrado para eliminar.");
    }

    // Extraemos las claves (Cuenta y Subcuenta)
    const targetCuenta = String(clienteToDelete.Cuenta || "").trim();
    const targetSub = String(clienteToDelete.Subcuenta || "").trim();

    // 2. INTEGRIDAD REFERENCIAL (Verificación Doble en VIAJES)
    const dbViajes = new BaseModel('VIAJES', 'Nro_Viaje', usuarioApp); // Inyectado
    const todosViajes = dbViajes.getData();

    const viajeAsociado = todosViajes.find(v => {
        const vCuenta = String(v.Cliente_Key || "").trim();
        const vSub = String(v.Subcuenta_key || "").trim();
        
        return (vCuenta === targetCuenta && vSub === targetSub);
    });

    if (viajeAsociado) {
         throw new Error(`⛔ NO SE PUEDE ELIMINAR.\nEl cliente "${targetCuenta}" (Subcuenta: "${targetSub}") tiene viajes históricos asociados.\nEjemplo: Viaje N° ${viajeAsociado.Nro_Viaje}.\n\nBorrarlo rompería la integridad de los datos.`);
    }

    // 3. Proceder a borrar Tarifas y Cliente si no hay viajes
    const tarifasDb = new TarifasModel(usuarioApp); // Inyectado
    
    tarifasDb.reemplazarTarifasPorLote(id, [], '$'); // Borrar tarifas asociadas
    dbClientes.delete(id); // Borrar cliente

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}