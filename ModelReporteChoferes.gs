// --- MODELO: REPORTE LIQUIDACIÓN CHOFERES (FINAL: PERMANENCIA 24H) ---

// 1. Inyectamos usuarioApp como primer parámetro
function apiGetReporteChoferesData(usuarioApp, fDesde, fHasta) {
  try {
    const dDesde = new Date(fDesde + 'T00:00:00');
    const dHasta = new Date(fHasta + 'T23:59:59');
    
    if (dDesde > dHasta) throw new Error("La fecha Desde debe ser menor a Hasta");

    // 1. CARGA DE DATOS (Pasando usuarioApp a los modelos para trazabilidad interna, sin chequear permisos bloqueantes)
    const dbChoferes = new BaseModel('CHOFERES', 'Legajo', usuarioApp); 
    const choferes = dbChoferes.getData();
    
    const dbViajes = new BaseModel('VIAJES', 'Nro_Viaje', usuarioApp);
    const todosLosViajes = dbViajes.getData();
    
    const dbEmpresas = new BaseModel('EMPRESAS_TRANSPORTE', 'Nombre', usuarioApp); 
    const empresas = dbEmpresas.getData();

    // 2. FILTRAR CHOFERES
    const empresasPropias = {};
    empresas.forEach(e => {
        const nombre = String(e.Nombre || "").trim().toUpperCase();
        const tipo = obtenerValorFlexible(e, "TIPO_EMPRESA", "TIPO");
        if (String(tipo).toUpperCase() === 'PROPIA') empresasPropias[nombre] = true;
    });

    const choferesAptos = choferes.filter(c => {
        const estado = String(c.Estado || "").toUpperCase();
        if (estado === 'BAJA') return false; 
        const empChofer = String(c.Empresa || "").trim().toUpperCase();
        return (empresasPropias[empChofer] === true); 
    });

    if (choferesAptos.length === 0) throw new Error("No hay choferes activos en empresas PROPIAS.");

    // ==========================================================
    // 3. INDEXADO Y MAPEO
    // ==========================================================
    const choferesIndex = choferesAptos.map(c => {
        const nombreCompleto = c.Nombre || c.Chofer || "";
        return { legajo: c.Legajo, tokens: tokenizarNombre(nombreCompleto), nombreOriginal: nombreCompleto };
    });

    const mapControl = {};
    const mapRama = {};
    const mapPermanencia = {};

    todosLosViajes.forEach(v => {
        const valChofer = obtenerValorFlexible(v, "Chofer", "Conductor", "Nombre Chofer");
        const tokensViaje = tokenizarNombre(valChofer);
        if (tokensViaje.length === 0) return;

        let mejorMatch = null;
        let maxCoincidencias = 0;
        choferesIndex.forEach(cIndex => {
            const coincidencias = contarCoincidencias(tokensViaje, cIndex.tokens);
            if (coincidencias > maxCoincidencias) { maxCoincidencias = coincidencias; mejorMatch = cIndex; }
        });

        if (mejorMatch && maxCoincidencias >= (tokensViaje.length === 1 ? 1 : 2)) {
            // Permanencia
            const arrOrg = parsearFechaHora(obtenerValorFlexible(v, "Llegada_Origen", "Llegada Origen"));
            const salOrg = parsearFechaHora(obtenerValorFlexible(v, "Salida_Origen", "Salida Origen"));
            calcularHitosPermanencia(arrOrg, salOrg, mejorMatch.legajo, mapPermanencia);
            const arrDes = parsearFechaHora(obtenerValorFlexible(v, "Llegada_Destino", "Llegada Destino"));
            const salDes = parsearFechaHora(obtenerValorFlexible(v, "Salida_Destino", "Salida Destino"));
            calcularHitosPermanencia(arrDes, salDes, mejorMatch.legajo, mapPermanencia);

            // Control y Rama
            const tipo = String(obtenerValorFlexible(v, "Tipo_Servicio", "Tipo") || "").toUpperCase();
            if (tipo.includes('CON CARGA')) {
                const rawInicio = obtenerValorFlexible(v, "Inicio_Viaje", "Fecha_Inicio", "Inicio");
                const rawFin = obtenerValorFlexible(v, "Salida_Destino", "Fecha_Salida_Destino", "Fin");
                let dateInicio = parsearObjetoFecha(rawInicio);
                const dateFin = parsearObjetoFecha(rawFin);
                
                if (dateFin) {
                    if (!dateInicio) dateInicio = new Date(dateFin);
                    const fechaFinStr = Utilities.formatDate(dateFin, Session.getScriptTimeZone(), "yyyy-MM-dd");
                    const keyControl = `${mejorMatch.legajo}|${fechaFinStr}`;
                    if (!mapControl[keyControl]) mapControl[keyControl] = 0;
                    mapControl[keyControl]++;

                    if (dateInicio <= dateFin) {
                        const clienteKey = obtenerValorFlexible(v, "Cliente_Key", "Cliente") || 0;
                        let cursorDate = new Date(dateInicio);
                        while (cursorDate <= dateFin) {
                            const cursorStr = Utilities.formatDate(cursorDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
                            mapRama[`${mejorMatch.legajo}|${cursorStr}`] = clienteKey;
                            cursorDate.setDate(cursorDate.getDate() + 1);
                        }
                    }
                }
            }
        }
    });

    // ==========================================================
    // 4. GENERACIÓN GRILLA
    // ==========================================================
    const datosGrilla = [];
    let loopDate = new Date(dDesde);
    const optsDia = { weekday: 'long' };

    while (loopDate <= dHasta) {
        const fechaStr = Utilities.formatDate(loopDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
        const fechaInicioDia = new Date(loopDate); fechaInicioDia.setHours(0, 0, 0, 0);
        const fechaFinDia = new Date(loopDate); fechaFinDia.setHours(23, 59, 59, 999);
        const diaCapitalizado = loopDate.toLocaleDateString('es-AR', optsDia).replace(/^\w/, c => c.toUpperCase());
        const esFeriadoVal = verificarFeriado(loopDate) ? "SI" : "NO";

        choferesAptos.forEach(chofer => {
            const idGeotab = chofer.ID_Geotab; 
            const legajo = chofer.Legajo;
            let nombreUnidad = "-";
            let kmRecorridos = 0;
            let lugarFinDia = ""; 

            // 1. GEOTAB (KM, Unidad y Lugar)
            if (idGeotab) {
                 const unidadInfo = obtenerUnidadPorChofer(idGeotab, fechaStr);
                 if (unidadInfo && unidadInfo.id) {
                     nombreUnidad = unidadInfo.name; 
                     const deviceId = unidadInfo.id;
                     
                     // Calcular KM
                     const odoFin = GEOTAB_GET_ODOMETRO(deviceId, fechaFinDia);
                     const odoIni = GEOTAB_GET_ODOMETRO(deviceId, fechaInicioDia);
                     if (odoFin > 0) kmRecorridos = (odoIni > 0) ? Math.max(0, odoFin - odoIni) : 0;
                     
                     // Obtener LUGAR y LIMPIARLO
                     const rawLugar = GEOTAB_GET_POSICION(deviceId, fechaFinDia);
                     lugarFinDia = limpiarDireccion(rawLugar);
                 }
            }

            // 2. CÁLCULOS
            let valorControl = 0, valorPermanencia = 0, valorRama = "";
            if (legajo) {
                const searchKey = `${legajo}|${fechaStr}`;
                valorControl = mapControl[searchKey] || 0;
                valorPermanencia = mapPermanencia[searchKey] || 0;
                if (kmRecorridos > 0) {
                     if (mapRama.hasOwnProperty(searchKey)) valorRama = (String(mapRama[searchKey]) === "43") ? 1 : 0;
                }
            }

            datosGrilla.push({
                legajo: legajo || "",
                chofer: chofer.Nombre || chofer.Chofer || "Sin Nombre",
                fecha: fechaStr,
                dia: diaCapitalizado,
                feriado: esFeriadoVal,
                unidad: nombreUnidad,
                lugar: lugarFinDia, 
                km: kmRecorridos,
                control: valorControl, 
                permanencia: valorPermanencia,
                rama: valorRama 
            });
        });
        loopDate.setDate(loopDate.getDate() + 1);
    }

    datosGrilla.sort((a, b) => (a.chofer < b.chofer ? -1 : 1) || a.fecha.localeCompare(b.fecha));
    
    // LOG de la acción
    try {
        const logger = new LogsModel(usuarioApp);
        logger.registrar('Read', 'REPORTE_CHOFERES', 'N/A', `Generó liquidación choferes: ${fDesde} a ${fHasta}`);
    } catch(e) {}

    return { success: true, data: datosGrilla };

  } catch (e) {
    console.error("Error Fatal:", e);
    return { success: false, error: e.message };
  }
}

// ==================================================
// LÓGICA ESPECÍFICA PERMANENCIA
// ==================================================
function calcularHitosPermanencia(inicio, fin, legajo, mapa) {
    if (!inicio || !fin) return;
    if (fin <= inicio) return;

    const diffMs = fin.getTime() - inicio.getTime();
    const horasTotales = diffMs / (1000 * 60 * 60);

    if (horasTotales < 24) return;

    const ciclos = Math.floor(horasTotales / 24);

    for (let i = 1; i <= ciclos; i++) {
        const fechaHito = new Date(inicio.getTime() + (i * 24 * 60 * 60 * 1000));
        const fechaHitoStr = Utilities.formatDate(fechaHito, Session.getScriptTimeZone(), "yyyy-MM-dd");
        
        const key = `${legajo}|${fechaHitoStr}`;
        if (!mapa[key]) mapa[key] = 0;
        mapa[key]++;
    }
}

// ==================================================
// FUNCIONES AUXILIARES
// ==================================================
function limpiarDireccion(texto) {
    if (!texto || texto.length < 5 || texto.includes("Sin señal")) return texto;
    
    const zonasIgnorar = [
        "ARGENTINA"
    ];

    let partes = texto.split(',').map(p => p.trim());
    
    for (let i = 0; i < 2; i++) {
        if (partes.length > 1) { 
            const ultimoSegmento = partes[partes.length - 1].toUpperCase();
            if (zonasIgnorar.includes(ultimoSegmento)) {
                partes.pop(); 
            }
        }
    }
    
    return partes.join(", ");
}

function parsearFechaHora(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return new Date(raw); 
    
    const str = String(raw).trim();
    
    try {
        if (str.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
            const [fechaPart, horaPart] = str.split(' ');
            const [dia, mes, anio] = fechaPart.split('/');
            let hora=0, min=0, seg=0;
            if (horaPart) {
                const h = horaPart.split(':');
                hora = parseInt(h[0] || 0);
                min = parseInt(h[1] || 0);
                seg = parseInt(h[2] || 0);
            }
            return new Date(anio, mes - 1, dia, hora, min, seg);
        }
        
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d;
    } catch(e) {}
    
    return null;
}

function obtenerValorFlexible(fila, ...nombresPosibles) {
    if (!fila) return null;
    const keys = Object.keys(fila);
    const normalizar = (k) => String(k).toUpperCase().replace(/[^A-Z0-9]/g, "");
    for (const nombre of nombresPosibles) {
        const target = normalizar(nombre);
        const keyEncontrada = keys.find(k => normalizar(k) === target);
        if (keyEncontrada) return fila[keyEncontrada];
    }
    return null;
}

function tokenizarNombre(texto) {
    if (!texto) return [];
    return String(texto).toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
        .replace(/[^A-Z0-9 ]/g, " ").trim()
        .split(/\s+/).filter(w => w.length > 2); 
}

function contarCoincidencias(tokensA, tokensB) {
    let count = 0;
    const setB = new Set(tokensB);
    tokensA.forEach(t => { if (setB.has(t)) count++; });
    return count;
}

function parsearObjetoFecha(raw) {
    if (!raw) return null;
    let d = null;
    if (raw instanceof Date) {
        d = new Date(raw);
    } else {
        const str = String(raw).trim();
        if (str.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
            const partes = str.split(' ')[0].split('/'); 
            d = new Date(partes[2], partes[1] - 1, partes[0]);
        } else if (str.match(/^\d{4}-\d{2}-\d{2}/)) {
            const partes = str.split(' ')[0].split('-');
            d = new Date(partes[0], partes[1] - 1, partes[2]);
        } else {
            const tryD = new Date(str);
            if (!isNaN(tryD.getTime())) d = tryD;
        }
    }
    if (d) { d.setHours(0,0,0,0); return d; }
    return null;
}

// ==================================================
// CONTROL DE FERIADOS (Caché en memoria por ejecución)
// ==================================================
const CACHE_FERIADOS = {};

function verificarFeriado(fecha) {
    if (!fecha || !(fecha instanceof Date)) return false;

    // 1. Regla Fija: Los Domingos son no laborables / feriados
    if (fecha.getDay() === 0) return true;

    // 2. Regla Gremial: 15 de Diciembre (Día del Gremio Camioneros)
    // getMonth() empieza en 0 (Enero = 0, Diciembre = 11)
    if (fecha.getMonth() === 11 && fecha.getDate() === 15) return true;

    const anio = fecha.getFullYear();
    const fechaStr = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyy-MM-dd");

    // 3. Consultar API ArgentinaDatos (Solo si el año no está en caché)
    if (!CACHE_FERIADOS[anio]) {
        try {
            const url = `https://api.argentinadatos.com/v1/feriados/${anio}`;
            const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
            
            if (response.getResponseCode() === 200) {
                const feriadosApi = JSON.parse(response.getContentText());
                const fechasSet = new Set();
                
                // Extraer solo las fechas (vienen en formato "YYYY-MM-DD")
                feriadosApi.forEach(f => {
                    if (f.fecha) fechasSet.add(f.fecha);
                });
                
                CACHE_FERIADOS[anio] = fechasSet;
            } else {
                // Si la API falla (ej. año futuro no disponible), guardamos vacío para no reintentar
                CACHE_FERIADOS[anio] = new Set();
            }
        } catch (e) {
            console.error(`Error al consultar API de feriados para ${anio}:`, e);
            CACHE_FERIADOS[anio] = new Set();
        }
    }

    // 4. Búsqueda instantánea en el caché
    return CACHE_FERIADOS[anio].has(fechaStr);
}