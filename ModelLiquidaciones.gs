// --- MODELO DE LIQUIDACIONES ---
class LiquidacionesModel extends BaseModel {
  // 1. Recibimos usuarioApp
  constructor(usuarioApp) {
    super('LIQUIDACION_CLIENTE', 'ID_LIQUIDACION', usuarioApp);
  }
}

// 0. OBTENER ROL
function apiGetLiquidacionesRole(usuarioApp) {
  try {
    const p = new PermisosModel(usuarioApp);
    const canRead = p.checkAccess('LIQUIDACION_CLIENTE', 'Read');
    if (!canRead) return { success: true, role: 'None' };
    
    if (p.checkAccess('LIQUIDACION_CLIENTE', 'Delete')) return { success: true, role: 'Admin' };
    if (p.checkAccess('LIQUIDACION_CLIENTE', 'Create')) return { success: true, role: 'Create' };
    return { success: true, role: 'Read' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 1. OBTENER VIAJES PENDIENTES
function apiGetViajesPendientes(usuarioApp, fDesde, fHasta, nroCuenta) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('LIQUIDACION_CLIENTE', 'Read');

    const dbViajes = new BaseModel('VIAJES', 'Nro_Viaje', usuarioApp);
    const todosViajes = dbViajes.getData();
    const cuentaBuscada = String(nroCuenta).trim();

    const candidatos = todosViajes.filter(v => {
        if (v.Estado === 'Cancelado') return false;
        
        const isControlado = (v.CONTROLADO === true || String(v.CONTROLADO).toUpperCase() === 'TRUE');
        if (!isControlado) return false;
        
        const vKey = String(v.Cliente_Key || v.CLIENTE_KEY || "").trim();
        if (vKey !== cuentaBuscada) return false;

        let valPendiente = v['$PendienteLiquidar'];
        if (typeof valPendiente === 'string') {
             valPendiente = valPendiente.replace('$','').replace(/\s/g,'').replace(',',''); 
        }
        const pendiente = parseFloat(valPendiente) || 0;
        if (pendiente < 0.01) return false; 

        let fechaIso = "";
        if (v.Inicio_Viaje) {
            let d = v.Inicio_Viaje;
            if (typeof d === 'string' && d.includes('/')) {
                const parts = d.split(' ')[0].split('/');
                if (parts.length === 3) d = new Date(parts[2], parts[1]-1, parts[0]);
            } else { d = new Date(d); }
            if (!isNaN(d.getTime())) fechaIso = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
        }
        if (!fechaIso) return false;
        return (fechaIso >= fDesde && fechaIso <= fHasta);
    });

    const resultado = candidatos.map(v => ({
        Nro_Viaje: v.Nro_Viaje,
        Inicio_Viaje: Utilities.formatDate(new Date(v.Inicio_Viaje), Session.getScriptTimeZone(), "dd/MM/yyyy"),
        Origen: v.Origen,
        Destino: v.Destino,
        MONEDA: v.MONEDA || '$',
        '$ValorTotal': parseFloat(v['$ValorTotal']).toLocaleString('es-AR', {minimumFractionDigits: 2}),
        '$PendienteLiquidar': parseFloat(v['$PendienteLiquidar']),
        Cliente_Key: v.Cliente_Key || v.CLIENTE_KEY || "",
        Subcuenta_key: v.Subcuenta_key || v.Subcuenta || "",
        Chofer: v.Chofer || "",
        DT: v.DT || "",
        REMITO: v.REMITO || ""
    }));

    return { success: true, viajes: resultado };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 2. OBTENER HISTORIAL (CORREGIDO LECTURA FECHAS)
function apiGetLiquidacionesHistory(usuarioApp, clienteNombre, fDesde, fHasta) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('LIQUIDACION_CLIENTE', 'Read');

    const db = new LiquidacionesModel(usuarioApp);
    const data = db.getData(); 
    
    let dDesde = null, dHasta = null;
    if (fDesde) dDesde = new Date(fDesde + 'T00:00:00');
    if (fHasta) dHasta = new Date(fHasta + 'T23:59:59');

    const filtrados = data.filter(row => {
        if (clienteNombre && clienteNombre !== "") {
            const rowCli = String(row.CLIENTE || "").trim().toUpperCase();
            const searchCli = String(clienteNombre).trim().toUpperCase();
            if (!rowCli.includes(searchCli)) return false;
        }
        
        const rawFecha = row.FACTURA_FechaEmision || row.FECHA;
        const fechaObj = parseFechaLatina(rawFecha);
        
        if (!fechaObj) return false;
        
        if (dDesde && dHasta) {
            if (fechaObj < dDesde || fechaObj > dHasta) return false;
        }
        return true;
    });

    filtrados.sort((a,b) => (parseInt(b.ID_LIQUIDACION)||0) - (parseInt(a.ID_LIQUIDACION)||0));
    
    const result = filtrados.map(r => ({
        ID_LIQUIDACION: r.ID_LIQUIDACION,
        FECHA: r.FACTURA_FechaEmision || r.FECHA, 
        CLIENTE: r.CLIENTE,
        CANT_VIAJES: r.CANT_VIAJES,
        IMPORTE_TOTAL: r.IMPORTE_TOTAL,
        MONEDA: r.MONEDA,
        FACTURA: r.FACTURA
    }));

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 3. GENERAR LIQUIDACIÓN
function apiGenerarLiquidacion(usuarioApp, datos) {
  const lock = LockService.getScriptLock();
  try {
      const p = new PermisosModel(usuarioApp);
      p.checkAccess('LIQUIDACION_CLIENTE', 'Create');

      if (!lock.tryLock(15000)) throw new Error("Sistema ocupado.");

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheetViajes = ss.getSheetByName('VIAJES');
      const sheetLiq = ss.getSheetByName('LIQUIDACION_CLIENTE');
      
      const items = JSON.parse(datos.itemsJSON); 
      if (!items || items.length === 0) throw new Error("Sin viajes.");

      const primeraMoneda = items[0].moneda;
      if (items.some(i => i.moneda !== primeraMoneda)) throw new Error("Error monedas mezcladas.");

      const dataViajes = sheetViajes.getDataRange().getValues();
      const headers = dataViajes[0];
      const mapHead = {};
      headers.forEach((h, i) => mapHead[String(h).toUpperCase().trim()] = i);

      const idxId = mapHead['NRO_VIAJE'];
      const idxLiq = mapHead['$LIQUIDADO'];
      const idxPend = mapHead['$PENDIENTELIQUIDAR'];
      const idxTotal = mapHead['$VALORTOTAL'];
      const idxEstLiq = mapHead['ESTADO_LIQUIDACION'];
      const idxControlado = mapHead['CONTROLADO'];

      let totalLiquidacion = 0;
      const viajesMap = {};
      for(let i=1; i<dataViajes.length; i++) viajesMap[String(dataViajes[i][idxId])] = i + 1; 

      items.forEach(item => {
          const rowNum = viajesMap[String(item.idViaje)];
          if (!rowNum) throw new Error(`Viaje ${item.idViaje} no encontrado.`);

          const filaDatos = dataViajes[rowNum - 1];
          const isControlado = (filaDatos[idxControlado] === true || String(filaDatos[idxControlado]).toUpperCase() === 'TRUE');
          if (!isControlado) throw new Error(`Viaje ${item.idViaje} NO está CONTROLADO.`);

          const totalViaje = parseFloat(filaDatos[idxTotal]) || 0;
          const yaLiquidado = parseFloat(filaDatos[idxLiq]) || 0;
          const aLiquidar = parseFloat(item.importe);

          if (aLiquidar > (totalViaje - yaLiquidado + 0.50)) throw new Error(`Exceso en viaje ${item.idViaje}.`);

          const nuevoLiquidado = yaLiquidado + aLiquidar;
          const nuevoPendiente = totalViaje - nuevoLiquidado;
          let nuevoEstado = (nuevoPendiente <= 0.5) ? "Liquidado" : "Liquidado Parcial";

          sheetViajes.getRange(rowNum, idxLiq + 1).setValue(nuevoLiquidado);
          sheetViajes.getRange(rowNum, idxPend + 1).setValue(nuevoPendiente);
          sheetViajes.getRange(rowNum, idxEstLiq + 1).setValue(nuevoEstado);

          totalLiquidacion += aLiquidar;
      });

      let nuevoId = 1; 
      const lastRowLiq = sheetLiq.getLastRow();
      if (lastRowLiq > 1) { 
          const ids = sheetLiq.getRange(2, 1, lastRowLiq - 1, 1).getValues();
          let max = 0;
          ids.forEach(r => { const val = parseInt(r[0]); if (!isNaN(val) && val > max) max = val; });
          nuevoId = max + 1;
      }

      const fechaHoyStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");

      // Usamos el usuario de la SPA en vez del correo de Google
      sheetLiq.appendRow([
          nuevoId, 
          fechaHoyStr, 
          datos.cliente, 
          primeraMoneda, 
          totalLiquidacion, 
          "", 
          items.length, 
          datos.itemsJSON, 
          usuarioApp, // <-- CORRECCIÓN DE IDENTIDAD AQUÍ
          "", "", "", "", "", "" 
      ]);
      
      SpreadsheetApp.flush();
      
      // LOG MANUAL (ya que usamos appendRow y no el BaseModel.create)
      try {
          const logger = new LogsModel(usuarioApp);
          logger.registrar('Create', 'LIQUIDACION_CLIENTE', nuevoId, "Generación de Liquidación");
      } catch (logErr) { console.error("Error al loguear creación:", logErr); }

      return { success: true, newId: nuevoId };

  } catch (e) {
      return { success: false, error: e.message };
  } finally {
      lock.releaseLock();
  }
}

// 4. COTIZACIÓN
function apiGetCotizacionOficial(usuarioApp, moneda, fechaFacturaStr) {
  try {
    if (!moneda || moneda === '$' || moneda === 'ARS') return { success: true, valor: 1 };
    return { success: true, valor: 0 }; 
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 5. DATOS FISCALES
function apiGetDatosFiscalesLiq(usuarioApp, idLiq) {
  try {
    const dbLiq = new LiquidacionesModel(usuarioApp);
    const liq = dbLiq.getData().find(r => String(r.ID_LIQUIDACION) === String(idLiq));
    if (!liq) throw new Error("Liquidación no encontrada");

    const dbClientes = new BaseModel('CLIENTES', 'Cliente_key', usuarioApp);
    const clientes = dbClientes.getData();
    
    const clienteData = clientes.find(c => 
        String(c['Razón Social']).trim().toUpperCase() === String(liq.CLIENTE).trim().toUpperCase() ||
        String(c.Cuenta).trim() === String(liq.CLIENTE).trim()
    );

    const parsePorc = (val) => {
        if (!val) return 0;
        let s = String(val).replace('%', '').replace(',', '.').trim();
        return parseFloat(s) || 0;
    };

    const percs = { caba: 0, bsas: 0, salta: 0 };
    if (clienteData) {
        percs.caba = parsePorc(clienteData.IB_CABA || clienteData['Percepción IIBB CABA']);
        percs.bsas = parsePorc(clienteData.IB_BSAS || clienteData['Percepción IIBB BSAS']);
        percs.salta = parsePorc(clienteData.IB_SALTA || clienteData['Percepción IIBB SALTA']);
    }

    return { 
        success: true, 
        importeNeto: parseFloat(liq.IMPORTE_TOTAL) || 0,
        moneda: liq.MONEDA,
        percepciones: percs
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 6. ASIGNAR FACTURA
function apiAsignarFactura(usuarioApp, idLiq, nroFactura, fechaFacturaString, tipoCambioInput, datosFiscales, tipoDoc) {
  try {
     const p = new PermisosModel(usuarioApp);
     p.checkAccess('LIQUIDACION_CLIENTE', 'Update');

     const db = new LiquidacionesModel(usuarioApp);
     const data = db.getData();
     const index = data.findIndex(r => String(r.ID_LIQUIDACION) === String(idLiq));
     
     if (index === -1) throw new Error("Liquidación no encontrada.");
     
     const regex = /^[ABE]-\d{5}-\d{8}$/; 
     if (!regex.test(nroFactura)) throw new Error("Formato inválido. Use Letra-PV(5)-Numero(8).");

     const item = data[index];
     
     item.FACTURA = nroFactura;
     item.TIPO_COMPROBANTE = tipoDoc || "FC"; 
     item.TIPO_CAMBIO = parseFloat(tipoCambioInput) || 1;

     if (fechaFacturaString) {
         const partes = fechaFacturaString.split('-'); 
         const d = new Date(parseInt(partes[0]), parseInt(partes[1])-1, parseInt(partes[2]), 12, 0, 0);
         const fechaUniforme = Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
         item.FACTURA_FechaEmision = fechaUniforme;
     }

     if (datosFiscales) {
         item.TIPO_FISCAL = datosFiscales.tipo;
         item.ALICUOTA_IVA = datosFiscales.ivaPct || 0;
         item.DETALLE_IMPUESTOS = JSON.stringify(datosFiscales.detalle || {}); 
     }

     db.update(idLiq, item);
     return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 7. DETALLE
// 7. DETALLE
function apiGetDetalleLiquidacion(usuarioApp, idLiq) {
  try {
    const dbLiq = new LiquidacionesModel(usuarioApp);
    const liqData = dbLiq.getData().find(r => String(r.ID_LIQUIDACION) === String(idLiq));
    if (!liqData) throw new Error("Liquidación no encontrada");

    const rawDate = liqData.FACTURA_FechaEmision || liqData.FECHA;
    let fechaStr = rawDate;
    if (Object.prototype.toString.call(rawDate) === '[object Date]') {
         fechaStr = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
    }

    let items = [];
    try { items = JSON.parse(liqData.DETALLE_JSON); } catch(e) { items = []; }

    const dbViajes = new BaseModel('VIAJES', 'Nro_Viaje', usuarioApp);
    const todosViajes = dbViajes.getData();
    const mapaViajes = {};
    todosViajes.forEach(v => { mapaViajes[String(v.Nro_Viaje)] = v; });

    const detalleCompleto = items.map(item => {
        const viaje = mapaViajes[String(item.idViaje)];
        
        let fViaje = "-";
        if (viaje && viaje.Inicio_Viaje) {
             fViaje = Utilities.formatDate(new Date(viaje.Inicio_Viaje), Session.getScriptTimeZone(), "dd/MM/yyyy");
        }

        const pallets = viaje ? (parseFloat(viaje.Pallets || viaje.PALLETS) || 0) : 0;
        const kilos = viaje ? (parseFloat(viaje.TN || viaje.Tn || viaje.Kilos) || 0) : 0; 
        const km = viaje ? (parseFloat(viaje.DISTANCIA || viaje.KM || viaje.Km) || 0) : 0;
        const remito = viaje ? (viaje.REMITO || "-") : "-";
        
        // --- AQUÍ EXTRAEMOS CHOFER, CUENTA Y SUBCUENTA ---
        const chofer = viaje ? (viaje.Chofer || viaje.CHOFER || "-") : "-";
        
        const cKey = viaje ? (viaje.Cliente_Key || viaje.CLIENTE_KEY || viaje.Cliente_key || "") : "";
        const sub = viaje ? (viaje.Subcuenta_key || viaje.Subcuenta || viaje.SUBCUENTA || "") : "";
        
        // Unimos Cuenta y Subcuenta (Ej: 1050 / 1)
        let clienteFull = "-";
        if (cKey !== "" || sub !== "") {
            clienteFull = `${cKey || "?"} - ${sub || "?"}`;
        }

        return {
            nroViaje: item.idViaje,
            fecha: fViaje,
            origen: viaje ? viaje.Origen : "-",
            destino: viaje ? viaje.Destino : "-",
            remito: remito,
            importeAsignado: parseFloat(item.importe),
            moneda: item.moneda || liqData.MONEDA,
            pallets: pallets,
            tn: kilos, 
            km: km,
            chofer: chofer,
            cliente_key: clienteFull // Enviamos el dato ya combinado
        };
    });

    return {
        success: true,
        cabecera: {
            id: liqData.ID_LIQUIDACION,
            fecha: fechaStr,
            cliente: liqData.CLIENTE,
            factura: liqData.FACTURA || "",
            tipoComp: liqData.TIPO_COMPROBANTE || "FC",
            total: parseFloat(liqData.IMPORTE_TOTAL),
            moneda: liqData.MONEDA,
            tipoCambio: liqData.TIPO_CAMBIO || 1,
            detalleImpuestos: liqData.DETALLE_IMPUESTOS ? JSON.parse(liqData.DETALLE_IMPUESTOS) : null
        },
        items: detalleCompleto
    };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 8. PROXIMO COMPROBANTE
function apiGetProximoComprobante(usuarioApp, tipoDoc, letra, pv) {
  try {
    const db = new LiquidacionesModel(usuarioApp);
    const data = db.getData();
    
    const sTipo = String(tipoDoc || "FC").trim().toUpperCase(); 
    const sLetra = String(letra || "A").trim().toUpperCase();
    const sPV = String(pv || "0").trim().padStart(5, '0');
    
    let maxNum = 0;
    let ultimaFechaObj = null;

    data.forEach(row => {
        const rowTipo = String(row.TIPO_COMPROBANTE || "FC").trim().toUpperCase();
        if (rowTipo !== sTipo) return;

        const fact = String(row.FACTURA || "").trim();
        const partes = fact.split('-');
        
        if (partes.length === 3) {
            const rLetra = partes[0].toUpperCase();
            const rPV = partes[1];
            const rNum = parseInt(partes[2]);

            if (rLetra === sLetra && rPV === sPV) {
                if (!isNaN(rNum) && rNum > maxNum) {
                    maxNum = rNum;
                }
                
                const rawF = row.FACTURA_FechaEmision || row.FECHA;
                const fObj = parseFechaLatina(rawF);
                
                if (fObj) {
                    if (!ultimaFechaObj || fObj > ultimaFechaObj) {
                        ultimaFechaObj = fObj;
                    }
                }
            }
        }
    });

    let fechaStr = "";
    if (ultimaFechaObj) {
        fechaStr = Utilities.formatDate(ultimaFechaObj, Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else {
        fechaStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    }

    return { 
        success: true, 
        proximoNumero: maxNum + 1, 
        ultimaFecha: fechaStr 
    };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

function apiGetClientes(usuarioApp) {
    try {
        const db = new BaseModel('CLIENTES', 'Cliente_key', usuarioApp);
        return { success: true, data: db.getData() };
    } catch(e) {
        return { success: false, error: e.message };
    }
}

// --- HELPER CRÍTICO: PARSEO FECHAS LATINAS ---
function parseFechaLatina(raw) {
    if (!raw) return null;

    if (Object.prototype.toString.call(raw) === '[object Date]') {
        return (!isNaN(raw.getTime()) && raw.getFullYear() > 2000) ? raw : null;
    }

    if (typeof raw === 'string') {
        let str = raw.trim();
        if (str === "") return null;
        if (str.includes('T')) str = str.split('T')[0];
        if (str.includes(' ')) str = str.split(' ')[0];

        let dateObj = null;

        if (str.includes('/')) {
            const p = str.split('/');
            if (p.length === 3) {
                const dia = parseInt(p[0]);
                const mes = parseInt(p[1]) - 1; 
                const anio = parseInt(p[2]);
                if (!isNaN(dia) && !isNaN(mes) && !isNaN(anio)) {
                     dateObj = new Date(anio, mes, dia, 12, 0, 0);
                }
            }
        } 
        else if (str.includes('-')) {
            const p = str.split('-');
            if (p.length === 3) {
                 const anio = parseInt(p[0]);
                 const mes = parseInt(p[1]) - 1;
                 const dia = parseInt(p[2]);
                 if (!isNaN(dia) && !isNaN(mes) && !isNaN(anio)) {
                     dateObj = new Date(anio, mes, dia, 12, 0, 0);
                 }
            }
        }
        
        if (dateObj && !isNaN(dateObj.getTime()) && dateObj.getFullYear() > 2000) {
            return dateObj;
        }
    }
    return null;
}