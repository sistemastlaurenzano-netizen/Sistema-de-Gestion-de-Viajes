class VehiculosModel extends BaseModel {
  // 1. Recibimos usuarioApp y lo pasamos a la clase padre
  constructor(usuarioApp) {
    // Clave primaria: Interno (Alfanumérico)
    super('VEHICULOS', 'Interno', usuarioApp);
  }
}

// --- API PÚBLICA ---

// 1. Agregamos el parámetro 'usuarioApp'
function apiGetVehiculos(usuarioApp) {
  try {
    // 2. Permisos
    const p = new PermisosModel(usuarioApp);
    const role = p.checkAccess('VEHICULOS', 'Read'); 
    
    // 3. Datos
    const db = new VehiculosModel(usuarioApp); // Inyectamos el usuario
    const data = db.getData();
    // (Ya no calculamos nextId)

    // 4. Listas Auxiliares (Empresas)
    const empresasDb = new BaseModel('EMPRESAS_TRANSPORTE', 'EMPRESA_KEY', usuarioApp);
    
    const listas = {
      empresas: empresasDb.getData()
    };

    return { 
      success: true, 
      data: data, 
      lists: listas, 
      role: role 
    };

  } catch (e) {
    return { success: false, error: e.message, stack: e.stack };
  }
}

// 1. Agregamos el parámetro 'usuarioApp' primero
function apiSaveVehiculo(usuarioApp, formObject) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('VEHICULOS', 'Update'); // CORREGIDO: de 'Edit' a 'Update'

    const db = new VehiculosModel(usuarioApp); // Inyectamos el usuario
    
    if (formObject.actionType === 'create') {
      // Validar si ya existe el Interno para evitar duplicados
      const existing = db.getById(formObject.Interno);
      if (existing) {
         throw new Error(`⛔ ERROR: El Vehículo con Interno "${formObject.Interno}" ya existe.`);
      }
      db.create(formObject);
    } else {
      db.update(formObject.Interno, formObject);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 1. Agregamos el parámetro 'usuarioApp' primero
function apiDeleteVehiculo(usuarioApp, id) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('VEHICULOS', 'Delete'); // CORREGIDO: de 'Admin' a 'Delete'
    
    const dbVehiculos = new VehiculosModel(usuarioApp);

    // --- INTEGRIDAD REFERENCIAL ---
    // 1. Verificamos si este Interno está en la tabla VIAJES (Función global)
    verificarIntegridadReferencial('Interno', id, 'Vehículo');
    
    // 2. Verificamos si está asignado a un Chofer (Buscamos por la Patente)
    const vehiculo = dbVehiculos.getById(id);
    if (vehiculo && vehiculo.Patente) {
        const patente = String(vehiculo.Patente).trim().toUpperCase();
        const dbChoferes = new BaseModel('CHOFERES', 'Legajo', usuarioApp);
        
        const choferAsociado = dbChoferes.getData().find(c => 
            String(c.PATENTE_TRACTOR || "").trim().toUpperCase() === patente ||
            String(c.PATENTE_REMOLQUE || "").trim().toUpperCase() === patente
        );
        
        if (choferAsociado) {
            throw new Error(`⛔ NO SE PUEDE ELIMINAR.\nEl vehículo está asignado al Chofer "${choferAsociado.Nombre || choferAsociado['Nombre y Apellido']}".`);
        }
    }
    // ------------------------------
    
    dbVehiculos.delete(id);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}