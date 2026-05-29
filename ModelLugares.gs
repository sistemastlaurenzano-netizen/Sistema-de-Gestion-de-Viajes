class LugaresModel extends BaseModel {
  // Recibimos el usuarioApp y lo pasamos al constructor padre (BaseModel)
  constructor(usuarioApp) {
    super('LUGARES', 'Lugar_Key', usuarioApp);
  }

  // --- NUEVO MÉTODO: Calcula el siguiente ID ---
  getNextId() {
    const data = this.getData();
    if (!data || data.length === 0) return 1; // Si está vacía, empezamos en 1

    // Extraemos solo los IDs, los convertimos a número y buscamos el máximo
    const ids = data.map(row => parseInt(row.Lugar_Key) || 0);
    const maxId = Math.max(...ids);
    
    return maxId + 1;
  }
}

// --- API PÚBLICA ---

// 1. Agregamos el parámetro 'usuarioApp'
function apiGetLugares(usuarioApp) {
  try {
    // 2. Le pasamos el usuario al PermisosModel
    const p = new PermisosModel(usuarioApp);
    const role = p.checkAccess('LUGARES', 'Read'); 
    
    const db = new LugaresModel(usuarioApp); // Inyectamos el usuario
    const data = db.getData();
    
    // CALCULAMOS EL PRÓXIMO ID PARA ENVIARLO AL FRONT
    const nextId = db.getNextId(); 

    // Listas auxiliares (Inyectamos el usuario a las bases de lectura también, aunque no guarden logs, por consistencia)
    const provinciasDb = new BaseModel('PROVINCIAS', 'Provincia', usuarioApp);
    const paisesDb = new BaseModel('PAISES', 'País', usuarioApp);
    const LocalidadesDb = new BaseModel('PROVINCIAS', 'Localidad', usuarioApp);

    const listas = {
      provincias: provinciasDb.getData(),
      paises: paisesDb.getData()
    };

    return { 
      success: true, 
      data: data, 
      nextId: nextId, // <--- Enviamos el ID sugerido
      lists: listas, 
      role: role 
    };

  } catch (e) {
    return { success: false, error: e.message, stack: e.stack };
  }
}

// 1. Agregamos el parámetro 'usuarioApp' primero
function apiSaveLugar(usuarioApp, formObject) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('LUGARES', 'Update'); // CORREGIDO: Cambiado de 'Edit' a 'Update' para coincidir con tu clase

    const db = new LugaresModel(usuarioApp); // Inyectamos el usuario
    if (formObject.actionType === 'create') {
      db.create(formObject);
    } else {
      db.update(formObject.Lugar_Key, formObject);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 1. Agregamos el parámetro 'usuarioApp' primero
function apiDeleteLugar(usuarioApp, id) {
  try {
    // Validar Permisos
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('LUGARES', 'Delete');

    // Obtener el Nombre del Lugar
    const dbLugares = new BaseModel('LUGARES', 'Lugar_Key', usuarioApp); // Inyectamos el usuario
    const lugar = dbLugares.getById(id);

    if (!lugar) throw new Error("Lugar no encontrado.");

    const nombreLugar = String(lugar.Nombre || "").trim().toUpperCase(); 

    // INTEGRIDAD REFERENCIAL (Verificar Origen Y Destino)
    const dbViajes = new BaseModel('VIAJES', 'Nro_Viaje', usuarioApp); // Inyectamos el usuario
    const todosViajes = dbViajes.getData();

    const viajeAsociado = todosViajes.find(v => {
        const origen = String(v.Origen || "").trim().toUpperCase();
        const destino = String(v.Destino || "").trim().toUpperCase();
        
        // Coincide con Origen O coincide con Destino
        return (origen === nombreLugar || destino === nombreLugar);
    });

    if (viajeAsociado) {
        throw new Error(`⛔ NO SE PUEDE ELIMINAR.\nEl lugar "${lugar.Nombre}" se utiliza en el Viaje N° ${viajeAsociado.Nro_Viaje} (como Origen o Destino).\nDebe eliminar o modificar ese viaje primero.`);
    }

    // Eliminar si pasó la validación
    dbLugares.delete(id);
    
    return { success: true };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

// --- FUNCIÓN ACTUALIZADA PARA GEOCODING + GPS ---
// (No requiere control de permisos ya que es solo una consulta externa)
function apiConsultarGeo(direccion) {
  try {
    if (!direccion) return { error: "Dirección vacía" };

    // 1. Obtenemos datos de ubicación política
    const loc = GEO_INFO_LOCA(direccion);
    const prov = GEO_INFO_PROV(direccion);
    const pais = GEO_INFO_PAIS(direccion);
    
    // 2. Obtenemos coordenadas (Latitud, Longitud)
    const gpsRaw = GEO_GPS(direccion); 
    
    let lat = "";
    let lng = "";

    // 3. Procesamos el string de GPS para separarlo
    if (gpsRaw && String(gpsRaw).includes(',')) {
      const partes = String(gpsRaw).split(',');
      if (partes.length === 2) {
        lat = partes[0].trim();
        lng = partes[1].trim();
      }
    }

    return { 
      success: true, 
      localidad: loc, 
      provincia: prov, 
      pais: pais,
      lat: lat, 
      lng: lng  
    };

  } catch (e) {
    return { success: false, error: e.message };
  }
}