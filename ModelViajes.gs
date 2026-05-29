// --- CONFIGURACIÓN ---
const ID_CARPETA_REMITOS = "1jY-m99ttWROc3yocq2kUHLJHVvZOWTB8"; 

class ViajesModel extends BaseModel {
  // 1. Agregamos usuarioApp al constructor
  constructor(usuarioApp) {
    super('VIAJES', 'Nro_Viaje', usuarioApp); // 2. Se lo pasamos al padre
  }

  getNextId() {
    const data = this.getData();
    if (!data || data.length === 0) return "00000001";
    const ids = data.map(row => parseInt(row.Nro_Viaje) || 0);
    const maxId = Math.max(...ids);
    return String(maxId + 1).padStart(8, '0');
  }

  update(id, dataObject) {
    const allData = this.getData();
    const index = allData.findIndex(r => parseInt(r.Nro_Viaje) === parseInt(id));
    if (index !== -1) {
      const realIdInDb = allData[index].Nro_Viaje;
      super.update(realIdInDb, dataObject);
    } else {
      super.update(id, dataObject);
    }
  }
}

// --- GESTIÓN DE CARPETAS DRIVE (Legacy) ---
function getFolderRemitos() {
  const FOLDER_NAME = "REMITOS_VIAJES";
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty("REMITOS_FOLDER_ID");
  let folder;

  if (folderId) {
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) { folder = null; }
  }

  if (!folder) {
    if (ID_CARPETA_REMITOS && ID_CARPETA_REMITOS !== "TU_ID_DE_CARPETA_AQUI") {
        try { return DriveApp.getFolderById(ID_CARPETA_REMITOS); } catch(e){}
    }
    const folders = DriveApp.getFoldersByName(FOLDER_NAME);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(FOLDER_NAME);
    }
    props.setProperty("REMITOS_FOLDER_ID", folder.getId());
  }
  return folder;
}

// =========================================================
// FUNCIONES API
// =========================================================

function apiGetViajes(usuarioApp, fDesde, fHasta) {
  try {
    const p = new PermisosModel(usuarioApp);
    const role = p.checkAccess('VIAJES', 'Read'); 
    
    const db = new ViajesModel(usuarioApp); // Inyectado
    let data = db.getData();
    const nextId = db.getNextId();

    // --- FILTRADO DE DATOS ---
    if (fDesde && fHasta) {
       data = data.filter(row => {
          if (row.Estado === 'Cancelado') return false;

          let val = row.Inicio_Viaje || row['Inicio Viaje']; 
          if (!val || String(val).trim() === '') return true; 

          let fechaIso = ""; 
          if (val instanceof Date) {
              try {
                  fechaIso = Utilities.formatDate(val, "GMT-3", "yyyy-MM-dd");
              } catch(e) { return false; }
          } else {
              let strVal = String(val).trim();
              if (strVal.includes(' ')) strVal = strVal.split(' ')[0]; 
              if (strVal.includes('/')) {
                 const partes = strVal.split('/');
                 if (partes.length === 3) {
                    const yFull = (partes[2].length === 2) ? "20" + partes[2] : partes[2];
                    fechaIso = `${yFull}-${partes[1].padStart(2,'0')}-${partes[0].padStart(2,'0')}`;
                 }
              } else if (strVal.includes('-')) {
                 fechaIso = strVal.substring(0, 10);
              }
          }

          if (fechaIso && fechaIso.length === 10) {
              return fechaIso >= fDesde && fechaIso <= fHasta;
          }
          return false;
       });
    }

    data.sort((a, b) => (parseInt(a.Nro_Viaje)||0) - (parseInt(b.Nro_Viaje)||0));
    data = data.map(row => {
      if (row.Nro_Viaje) row.Nro_Viaje = String(row.Nro_Viaje).padStart(8, '0');
      row.CONTROLADO = (row.CONTROLADO === true || String(row.CONTROLADO).toLowerCase() === 'true');
      return row;
    });

    // Inyectamos usuario en las listas auxiliares también
    const clientesDb = new BaseModel('CLIENTES', 'Cliente_key', usuarioApp);
    const choferesDb = new BaseModel('CHOFERES', 'Legajo', usuarioApp);
    const vehiculosDb = new BaseModel('VEHICULOS', 'Interno', usuarioApp);
    const lugaresDb = new BaseModel('LUGARES', 'Lugar_Key', usuarioApp);
    const productosDb = new BaseModel('PRODUCTOS', 'NOMBRE', usuarioApp);

    const listas = {
      clientes: clientesDb.getData(),
      choferes: choferesDb.getData(),
      vehiculos: vehiculosDb.getData(),
      lugares: lugaresDb.getData(),
      productos: productosDb.getData()
    };

    return { success: true, data: data, nextId: nextId, lists: listas, role: role };
  } catch (e) {
    return { success: false, error: "Error Backend: " + e.message };
  }
}

function apiSaveViaje(usuarioApp, form) {
  const lock = LockService.getScriptLock(); 
  try {
    lock.waitLock(10000);

    const p = new PermisosModel(usuarioApp);
    const accessType = (form.actionType === 'create') ? 'Create' : 'Update';
    p.checkAccess('VIAJES', accessType); 

    const db = new ViajesModel(usuarioApp); // Inyectado

    // 2. Limpieza de datos
    for (const key in form) {
        if (typeof form[key] === 'string') {
            const val = form[key].trim();
            if (val === '') {
                form[key] = null;
            } else {
                if (['$ VIAJE', '$PEAJE', '$KMRECORRIDO', '$PALLETS', '$TN', '$ValorTotal', '$Liquidado', '$PendienteLiquidar', 'TN', 'PALLETS', 'COSTO CONDUCTOR', 'DISTANCIA', 'ODOMETRO INICIO', 'ODOMETRO FIN'].includes(key)) {
                    form[key] = parseFloat(val) || 0;
                }
            }
        }
    }

    // 3. Auto-Completado Geotab
    if (form.Interno && form.Inicio_Viaje && form.Salida_Destino) {
        let odoIni = parseFloat(form['ODOMETRO INICIO']) || 0;
        let odoFin = parseFloat(form['ODOMETRO FIN']) || 0;

        if (odoIni <= 0 || odoFin <= 0) {
            const geoResult = apiGetInfoGeotab(form.Interno, form.Inicio_Viaje, form.Salida_Destino);
            if (geoResult.success) {
                if (odoIni <= 0 && geoResult.odoInicio > 0) form['ODOMETRO INICIO'] = geoResult.odoInicio;
                if (odoFin <= 0 && geoResult.odoFin > 0) form['ODOMETRO FIN'] = geoResult.odoFin;

                const finalIni = parseFloat(form['ODOMETRO INICIO']) || 0;
                const finalFin = parseFloat(form['ODOMETRO FIN']) || 0;
                
                if (finalFin > finalIni) form.DISTANCIA = finalFin - finalIni;
                else form.DISTANCIA = 0;
            }
        }
    }

    // 4. Lógica de Estado Actual y Flags
    let currentState = null;
    let idViaje = form.Nro_Viaje;

    if (form.actionType === 'update' || (idViaje && form.actionType !== 'create')) {
        const allRows = db.getData();
        const idTarget = parseInt(idViaje);
        currentState = allRows.find(r => parseInt(r.Nro_Viaje) === idTarget);
    }

    // Nuevo estado de Controlado que viene del formulario
    const isNowControlled = (form.CONTROLADO === 'true' || form.CONTROLADO === true || form.CONTROLADO === 'on');
    form.CONTROLADO = isNowControlled;

    // Estado anterior
    let wasControlled = false;
    if (currentState) {
        wasControlled = (currentState.CONTROLADO === true || String(currentState.CONTROLADO).toLowerCase() === 'true');
    }

    // =========================================================================
    // 5. VALIDACIÓN DE SEGURIDAD ESPECÍFICA (Permiso_Control_Viajes)
    // =========================================================================
    if (isNowControlled !== wasControlled) {
         const userEmail = usuarioApp || "";
         const dbPermisos = new BaseModel('PERMISOS', 'Email', usuarioApp); // Inyectado
         const allPermisos = dbPermisos.getData();
         const usuario = allPermisos.find(u => String(u.Email || u.Usuario || u[0]).toLowerCase() === String(userEmail).toLowerCase());
         
         if (!usuario) {
             throw new Error("Usuario no identificado en la tabla PERMISOS.");
         }

         const nivelPermiso = String(usuario.Permiso_Control_Viajes || "").toUpperCase();

         if (nivelPermiso !== 'ADMIN' && nivelPermiso !== 'UPDATE') {
              throw new Error("⛔ Acceso Denegado: No tienes permiso para Modificar el estado de CONTROL.");
         }
    }
    // =========================================================================

    // 6. Validaciones de Negocio si está Controlado
    if (currentState && wasControlled) {
         if (isNowControlled) {
             // Sigue controlado
         } else {
             // Intenta descontrolar
             const estLiq = currentState.Estado_Liquidacion || "Sin Liquidar";
             if (estLiq !== "Sin Liquidar") {
                 throw new Error(`⛔ NO SE PUEDE DESBLOQUEAR.\nEl viaje tiene estado de liquidación: '${estLiq}'.`);
             }
         }
    }

    if (isNowControlled) {
        if (!form.Salida_Destino) throw new Error("Para CONTROLAR, el viaje debe estar Finalizado.");
        if (!form.Tipo_Servicio) throw new Error("Falta TIPO DE SERVICIO.");
        if (!form.Origen) throw new Error("Falta ORIGEN.");
        if (!form.Destino) throw new Error("Falta DESTINO.");
        if (!form.Chofer) throw new Error("Falta CHOFER.");
        
        const tipoServicio = String(form.Tipo_Servicio);

        if (tipoServicio.includes("Con Cargo")) {
            if (!form.Cliente) throw new Error("Falta CLIENTE (Con Cargo).");
            const total = parseFloat(form['$ValorTotal']) || 0;
            if (total <= 0) throw new Error("El $ TOTAL debe ser mayor a cero (Con Cargo).");
        }

        if (tipoServicio.includes("Con Carga")) {
            if (!form.REMITO) throw new Error("Falta NRO DE REMITO (Con Carga).");
            const pallets = parseFloat(form.PALLETS) || 0;
            const tn = parseFloat(form.TN) || 0;
            if (pallets <= 0 && tn <= 0) throw new Error("Especifique PALLETS o TN (Con Carga).");
            
            // Validación de Foto
            const isUploadingFile = (form._fileData && form._mimeType);
            let hasFilesOnDrive = false;
            if (!isUploadingFile && idViaje) {
                try {
                    const idPad = String(idViaje).padStart(8, '0');
                    const folder = getFolderRemitos(); 
                    const iter = folder.searchFiles(`title contains 'RTO${idPad}' and trashed = false`);
                    hasFilesOnDrive = iter.hasNext();
                } catch(e) { console.warn("Error verificando fotos:", e); }
            }
            if (!isUploadingFile && !hasFilesOnDrive) {
                 throw new Error("Debe adjuntar FOTO DEL REMITO para Controlar.");
            }
        }
        form.Estado = "Controlado";
    }

    // 7. Validación Duplicados
    if (form.Cliente && form.REMITO) {
       const clienteInput = String(form.Cliente).trim().toUpperCase();
       const remitoInput = String(form.REMITO).trim().toUpperCase();
       if (clienteInput !== "" && remitoInput !== "") {
           const formId = parseInt(form.Nro_Viaje) || 0; 
           const dataHistorica = db.getData();
           const duplicado = dataHistorica.find(row => {
               const rowCliente = row.Cliente ? String(row.Cliente).trim().toUpperCase() : "";
               const rowRemito = row.REMITO ? String(row.REMITO).trim().toUpperCase() : "";
               const rowId = parseInt(row.Nro_Viaje) || 0;
               return (rowCliente === clienteInput) && (rowRemito === remitoInput) && (rowId !== formId); 
           });
           if (duplicado) throw new Error(`El Remito "${form.REMITO}" ya existe en Viaje #${duplicado.Nro_Viaje}.`);
       }
    }

    // 8. Guardado
    if (form.actionType === 'create') {
       if (!form.Nro_Viaje) form.Nro_Viaje = db.getNextId();
       idViaje = form.Nro_Viaje; 
       db.create(form);
    } else {
       db.update(form.Nro_Viaje, form);
       idViaje = form.Nro_Viaje;
    }

    // 9. Procesar Archivo
    if (form._fileData && form._mimeType && idViaje) {
       guardarFotoViaje(idViaje, form._fileData, form._mimeType);
    }
    
    return { success: true, idViaje: idViaje }; 

  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function apiToggleViajeControlado(usuarioApp, nroViaje) {
  try {
    const userEmail = usuarioApp || "";

    // 1. VERIFICAR PERMISOS ESPECÍFICOS
    const dbPermisos = new BaseModel('PERMISOS', 'Email', usuarioApp); // Inyectado
    const allPermisos = dbPermisos.getData();
    const usuario = allPermisos.find(u => String(u.Email || u.Usuario || u[0]).toLowerCase() === String(userEmail).toLowerCase());

    if (!usuario) throw new Error("Usuario no registrado en la hoja PERMISOS.");
    const nivelPermiso = String(usuario.Permiso_Control_Viajes || "").toUpperCase();

    if (nivelPermiso !== 'ADMIN' && nivelPermiso !== 'UPDATE') {
      throw new Error("⛔ Acceso Denegado: No tienes permiso para Controlar/Descontrolar viajes.");
    }

    // 2. OBTENER VIAJE
    const dbViajes = new ViajesModel(usuarioApp); // Inyectado
    const allViajes = dbViajes.getData();
    const viaje = allViajes.find(r => parseInt(r.Nro_Viaje) === parseInt(nroViaje));

    if (!viaje) throw new Error("Viaje no encontrado.");

    // 3. DETERMINAR NUEVO ESTADO
    const isControlled = (viaje.CONTROLADO === true || String(viaje.CONTROLADO).toLowerCase() === 'true');
    const nuevoEstado = !isControlled; 

    // 4. VALIDAR DESBLOQUEO
    if (isControlled && !nuevoEstado) {
        const estLiq = viaje.Estado_Liquidacion || "Sin Liquidar";
        if (estLiq !== "Sin Liquidar") {
            throw new Error(`⛔ NO SE PUEDE DESBLOQUEAR.\nEl viaje tiene estado de liquidación: '${estLiq}'.`);
        }
    }

    // 5. GUARDAR CAMBIOS
    viaje.CONTROLADO = nuevoEstado;
    if (nuevoEstado) viaje.Estado = "Controlado";

    dbViajes.update(nroViaje, viaje);

    return { success: true, nuevoEstado: nuevoEstado ? 'SI' : 'NO' };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

function guardarFotoViaje(idViaje, base64Data, mimeType) {
    try {
        let folder;
        if (ID_CARPETA_REMITOS && ID_CARPETA_REMITOS !== "TU_ID_DE_CARPETA_AQUI") {
            folder = DriveApp.getFolderById(ID_CARPETA_REMITOS);
        } else {
            folder = getFolderRemitos(); 
        }
        
        const idPad = String(idViaje).padStart(8, '0');
        const prefix = `RTO${idPad}-`;
        const iterator = folder.searchFiles(`title contains '${prefix}' and trashed = false`);
        
        let maxSeq = 0;
        while (iterator.hasNext()) {
            const file = iterator.next();
            const name = file.getName(); 
            const nameNoExt = name.lastIndexOf('.') > -1 ? name.substring(0, name.lastIndexOf('.')) : name;
            const parts = nameNoExt.split('-');
            if (parts.length > 1) {
                const seqStr = parts[parts.length - 1]; 
                const seq = parseInt(seqStr);
                if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
            }
        }
        
        const nextSeq = maxSeq + 1;
        let ext = "";
        if (mimeType.includes("pdf")) ext = ".pdf";
        else if (mimeType.includes("jpeg") || mimeType.includes("jpg")) ext = ".jpg";
        else if (mimeType.includes("png")) ext = ".png";
        
        const fileName = `${prefix}${nextSeq}${ext}`; 
        const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
        folder.createFile(blob);
        
        console.log(`Foto guardada: ${fileName}`);

    } catch (e) {
        console.error("Error guardando foto: " + e.message);
        throw new Error("No se pudo guardar la imagen: " + e.message);
    }
}

function apiDeleteViaje(usuarioApp, id) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('VIAJES', 'Delete');
    
    const db = new ViajesModel(usuarioApp); // Inyectado
    const allData = db.getData();
    const index = allData.findIndex(r => parseInt(r.Nro_Viaje) === parseInt(id));
    
    if (index !== -1) {
        const viaje = allData[index];
        const isControlled = (viaje.CONTROLADO === true || String(viaje.CONTROLADO).toLowerCase() === 'true');
        if (isControlled) return { success: false, error: "⛔ NO SE PUEDE ELIMINAR.\nEl viaje está CONTROLADO y bloqueado." };
        db.delete(viaje.Nro_Viaje);
    } else {
       db.delete(id);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function apiGetRemitos(idViaje) {
    try {
        const files = [];
        let folder;
        if (ID_CARPETA_REMITOS && ID_CARPETA_REMITOS !== "TU_ID_DE_CARPETA_AQUI") {
             folder = DriveApp.getFolderById(ID_CARPETA_REMITOS);
        } else {
             folder = getFolderRemitos();
        }
        const idPad = String(idViaje).padStart(8, '0');
        const iter = folder.searchFiles(`title contains '${idPad}' and trashed = false`);
        while (iter.hasNext()) {
            const f = iter.next();
            files.push({ name: f.getName(), url: f.getUrl(), date: f.getDateCreated().toLocaleDateString() });
        }
        return { success: true, files: files };
    } catch(e) { return { success: false, error: e.message };
    }
}

function apiGetTarifasParaValorizar(clienteKey) {
  try {
    const db = new TarifasModel(); // Instancia limpia para lectura pura
    const tarifas = db.getByCliente(clienteKey);
    return { success: true, tarifas: tarifas };
  } catch (e) {
    return { success: false, error: "Error al obtener tarifas: " + e.message };
  }
}

function apiGetInfoGeotab(interno, fIni, fFin) {
    try {
        if (!interno) return { success: false, error: "Falta seleccionar Tractor (Interno)." };

        const vehiculosDb = new BaseModel('VEHICULOS', 'Interno'); // Lectura pura
        const tractor = vehiculosDb.getById(interno);
        if (!tractor) return { success: false, error: "Tractor no encontrado en base de datos." };
        
        const deviceId = tractor.Geotab_ID || interno; 

        let odoInicio = 0;
        let odoFin = 0;
        let errorMsg = "";

        if (fIni) {
            const resIni = GEOTAB_GET_ODOMETRO(deviceId, fIni);
            if (typeof resIni === 'number') odoInicio = resIni;
            else errorMsg += `Inicio: ${resIni}. `;
        }

        if (fFin) {
            const resFin = GEOTAB_GET_ODOMETRO(deviceId, fFin);
            if (typeof resFin === 'number') odoFin = resFin;
            else errorMsg += `Fin: ${resFin}. `;
        }

        if (odoInicio === 0 && odoFin === 0 && errorMsg !== "") {
             return { success: false, error: "Geotab: " + errorMsg };
        }

        return { 
            success: true, 
            ubicacion: "Datos obtenidos de Geotab", 
            odoInicio: Math.round(odoInicio), 
            odoFin: Math.round(odoFin),
            debug: errorMsg 
        };
    } catch (e) {
        return { success: false, error: "Error Sistema: " + e.message };
    }
}

function verificarIntegridadReferencial(nombreCampoViajes, valorBusqueda, nombreEntidad) {
  // Función de lectura pura usada al borrar entidades maestras
  const dbViajes = new BaseModel('VIAJES', 'Nro_Viaje'); 
  const datosViajes = dbViajes.getData();
  
  const valorClean = String(valorBusqueda).trim().toUpperCase();

  const existe = datosViajes.some(viaje => {
    const valorEnViaje = String(viaje[nombreCampoViajes] || "").trim().toUpperCase();
    return valorEnViaje === valorClean;
  });

  if (existe) {
    throw new Error(`⛔ NO SE PUEDE ELIMINAR.\nEl ${nombreEntidad} "${valorBusqueda}" tiene viajes históricos asociados.\nPara mantener la integridad de los datos, no se permite su eliminación.`);
  }
}