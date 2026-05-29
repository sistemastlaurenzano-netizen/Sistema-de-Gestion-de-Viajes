// --- MODELO DE REPORTES (IBCM - CORREGIDO PARA FORMATO DD/MM/YYYY HH:MM) ---

function apiGenerarReporteIBCM(usuarioApp, fDesde, fHasta) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. DETECCIÓN REGIONAL
    const locale = ss.getSpreadsheetLocale(); 
    const esFormatoLatino = (
        locale.includes('_AR') || locale.includes('_ES') || locale.includes('_UY') || 
        locale.includes('_CL') || locale.includes('_CO') || locale.startsWith('es_')
    );
    const SEP = esFormatoLatino ? ';' : ','; 
    const timeZone = ss.getSpreadsheetTimeZone(); 

    // 2. OBTENER DATOS (Inyectando usuarioApp)
    const dbLiq = new BaseModel('LIQUIDACION_CLIENTE', 'ID_LIQUIDACION', usuarioApp);
    const liqs = dbLiq.getData();

    const dbClientes = new BaseModel('CLIENTES', 'Cliente_key', usuarioApp);
    const clientes = dbClientes.getData();

    const dbViajes = new BaseModel('VIAJES', 'Nro_Viaje', usuarioApp);
    const viajes = dbViajes.getData();
    
    const dbLugares = new BaseModel('LUGARES', 'Lugar_Key', usuarioApp); 
    const lugares = dbLugares.getData();

    // 3. MAPEOS
    const mapClientes = {};
    clientes.forEach(c => {
       if (c.Cuenta) mapClientes[String(c.Cuenta).trim()] = c;
       if (c.Cliente_key) mapClientes[String(c.Cliente_key).trim()] = c; 
       if (c['Razón Social']) mapClientes[c['Razón Social'].trim()] = c;
    });

    const mapLugaresProv = {};
    lugares.forEach(l => {
        if(l.Nombre && l.Provincia) mapLugaresProv[String(l.Nombre).toUpperCase().trim()] = l.Provincia;
    });

    const mapViajes = {};
    viajes.forEach(v => { mapViajes[String(v.Nro_Viaje)] = v; });

    // 4. CÓDIGOS DE JURISDICCIÓN (CM05)
    const CODIGOS_JURISDICCION = {
        'CAPITAL FEDERAL': 2, 'CABA': 2, 'CIUDAD AUTÓNOMA DE BUENOS AIRES': 2,
        'BUENOS AIRES': 1, 'BS AS': 1, 'PROVINCIA DE BUENOS AIRES': 1, 'PBA': 1,
        'TUCUMAN': 28, 'TUCUMÁN': 28, 
        'CORDOBA': 3, 'CÓRDOBA': 3,
        'SANTA FE': 4, 
        'MENDOZA': 13, 
        'ENTRE RIOS': 8, 'ENTRE RÍOS': 8,
        'SALTA': 17,
        'MISIONES': 14,
        'DEFAULT': 90 
    };

    // 5. RANGO FECHAS DEL REPORTE
    const pD = fDesde.split('-');
    const dDesde = new Date(pD[0], pD[1]-1, pD[2], 0, 0, 0);
    
    const pH = fHasta.split('-');
    const dHasta = new Date(pH[0], pH[1]-1, pH[2], 23, 59, 59);

    const filasReporte = [];

    // ENCABEZADOS CSV
    filasReporte.push([
        "Origen", "Provincia", "Tipo", "Nro de Comprobante", "Fecha Emision", 
        "Destino", "Gravado", "No Gravado", "Gravado Original", 
        "Percepcion", "Exento", "Razon Social Cliente", "Cliente", "Sub", "CUIT"
    ]);

    // 6. PROCESAR FILAS
    liqs.forEach(liq => {
        const facturaRaw = liq.FACTURA || liq.Factura;
        if (!facturaRaw || String(facturaRaw).trim() === "") return; 

        const rawDate = liq.FACTURA_FechaEmision || liq.FECHA || liq.Fecha;
        const fechaObj = parseFechaSegura(rawDate);

        if (!fechaObj) return; 

        if (fechaObj.getTime() < dDesde.getTime() || fechaObj.getTime() > dHasta.getTime()) {
            return;
        }

        const fechaStr = Utilities.formatDate(fechaObj, timeZone, "yyyy-MM-dd");

        const cliKey = liq.CLIENTE || liq.Cliente;
        let clienteData = mapClientes[String(cliKey).trim()] || {};
        const cuitFinal = clienteData.IF_FISCAL || clienteData.ID_FISCAL || clienteData.CUIT || "";
        
        const tipoDocInput = liq.TIPO_COMPROBANTE || "FC"; 
        let tipoComp = (tipoDocInput === "ND") ? "NDA" : "FCA"; 
        
        let nroComp = facturaRaw;
        const partsFact = String(facturaRaw).split('-'); 
        if (partsFact.length === 3) {
            const letra = partsFact[0];
            tipoComp = (tipoDocInput === "ND") ? `ND${letra}` : `FC${letra}`;
            nroComp = partsFact[1] + "-" + partsFact[2]; 
        }

        let factorCambio = 1;
        const monedaRaw = liq.MONEDA || liq.Moneda || '$';
        const moneda = String(monedaRaw).toUpperCase().trim();
        
        if (moneda !== '$' && moneda !== 'PESOS' && moneda !== 'ARS') {
            const tcRaw = liq.TIPO_CAMBIO || liq.Tipo_Cambio;
            const tc = parseFloat(tcRaw);
            if (!isNaN(tc) && tc > 0) factorCambio = tc;
        }

        const tipoFiscal = liq.TIPO_FISCAL || "Gravado"; 
        let importePercepciones = { caba: 0, bsas: 0, salta: 0 };
        
        try {
            const impJson = JSON.parse(liq.DETALLE_IMPUESTOS || "{}");
            importePercepciones.caba = (parseFloat(impJson.percepcionCaba) || 0) * factorCambio;
            importePercepciones.bsas = (parseFloat(impJson.percepcionBsas) || 0) * factorCambio;
            importePercepciones.salta = (parseFloat(impJson.percepcionSalta) || 0) * factorCambio;
        } catch(e) { }

        let items = [];
        try { items = JSON.parse(liq.DETALLE_JSON || "[]"); } catch(e){}

        const desglose = {};

        const initJur = (cod, nombre) => {
            if (!desglose[cod]) desglose[cod] = { 
                nombreProv: nombre, 
                gravado: 0, noGravado: 0, exento: 0, percepcion: 0 
            };
        };

        items.forEach(item => {
            const viaje = mapViajes[String(item.idViaje)];
            const importeOriginal = parseFloat(item.importe) || 0;
            const importePesos = importeOriginal * factorCambio;

            let codigo = CODIGOS_JURISDICCION['DEFAULT'];
            let nombreProv = "NO ESPECIFICADO";

            if (viaje && viaje.Origen) {
                const prov = mapLugaresProv[String(viaje.Origen).toUpperCase().trim()];
                if (prov) {
                    nombreProv = prov;
                    const keyCod = prov.toUpperCase();
                    if (CODIGOS_JURISDICCION[keyCod]) codigo = CODIGOS_JURISDICCION[keyCod];
                }
            }

            initJur(codigo, nombreProv);

            if (tipoFiscal === 'Gravado') desglose[codigo].gravado += importePesos;
            else if (tipoFiscal === 'No Gravado') desglose[codigo].noGravado += importePesos;
            else if (tipoFiscal === 'Exento') desglose[codigo].exento += importePesos;
            else desglose[codigo].gravado += importePesos;
        });

        if (Object.keys(desglose).length === 0 && items.length === 0) {
             const impTotal = (parseFloat(liq.IMPORTE_TOTAL)||0) * factorCambio;
             const codDef = CODIGOS_JURISDICCION['DEFAULT'];
             initJur(codDef, "SIN DETALLE");
             
             if(tipoFiscal === 'Gravado') desglose[codDef].gravado = impTotal;
             else if(tipoFiscal === 'No Gravado') desglose[codDef].noGravado = impTotal;
             else desglose[codDef].exento = impTotal;
        }

        if (importePercepciones.caba > 0.01) {
            const cod = CODIGOS_JURISDICCION['CABA'];
            initJur(cod, 'CAPITAL FEDERAL');
            desglose[cod].percepcion += importePercepciones.caba;
        }
        if (importePercepciones.bsas > 0.01) {
            const cod = CODIGOS_JURISDICCION['BS AS'];
            initJur(cod, 'BUENOS AIRES');
            desglose[cod].percepcion += importePercepciones.bsas;
        }
        if (importePercepciones.salta > 0.01) {
            const cod = CODIGOS_JURISDICCION['SALTA'];
            initJur(cod, 'SALTA');
            desglose[cod].percepcion += importePercepciones.salta;
        }

        for (const codigo in desglose) {
            const dato = desglose[codigo];
            
            const fmt = (n) => {
                let s = n.toFixed(2);
                if (esFormatoLatino) s = s.replace('.', ',');
                return s;
            };

            filasReporte.push([
                codigo,                
                dato.nombreProv,       
                tipoComp,
                nroComp,
                fechaStr, 
                "", 
                fmt(dato.gravado), 
                fmt(dato.noGravado),      
                fmt(dato.gravado), 
                fmt(dato.percepcion),    
                fmt(dato.exento),      
                clienteData['Razón Social'] || cliKey,
                clienteData.Cuenta || "",
                clienteData.Subcuenta || "",
                cuitFinal
            ]);
        }
    });

    const csvContent = "\ufeff" + filasReporte.map(row => row.join(SEP)).join("\n");
    
    // Registrar la acción en Logs
    try {
        const logger = new LogsModel(usuarioApp);
        logger.registrar('Read', 'REPORTE_IBCM', 'N/A', `Reporte IBCM Generado (${fDesde} al ${fHasta})`);
    } catch (logErr) { console.error("Error al loguear reporte:", logErr); }

    return { success: true, csv: csvContent, filename: `IBCM_Fiscal_${fDesde}_${fHasta}.csv` };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

// --- HELPER ROBUSTO PARA PARSEAR FECHAS LATINAS ---
function parseFechaSegura(raw) {
    if (!raw) return null;

    if (Object.prototype.toString.call(raw) === '[object Date]') {
        if (!isNaN(raw.getTime()) && raw.getFullYear() > 2000) {
            return new Date(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12, 0, 0);
        }
        return null;
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