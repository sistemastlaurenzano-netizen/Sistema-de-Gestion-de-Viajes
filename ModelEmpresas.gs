class EmpresasModel extends BaseModel {
  // 1. Recibimos usuarioApp y lo pasamos a la clase padre
  constructor(usuarioApp) {
    // Nombre exacto de la hoja en el Excel
    super('EMPRESAS_TRANSPORTE', 'EMPRESA_KEY', usuarioApp);
  }

  // ID Autonumérico
  getNextId() {
    const data = this.getData();
    if (!data || data.length === 0) return 1; 

    // Extraemos los IDs y buscamos el mayor
    const ids = data.map(row => parseInt(row.EMPRESA_KEY) || 0);
    const maxId = Math.max(...ids);
    
    return maxId + 1;
  }
}

// --- API PÚBLICA ---

// 1. Agregamos el parámetro 'usuarioApp'
function apiGetEmpresas(usuarioApp) {
  try {
    // ELIMINADO: const email = Session.getActiveUser().getEmail();
    
    // 2. Le pasamos el usuario al PermisosModel
    // Asegúrate de tener una fila EMPRESAS_TRANSPORTE en tu hoja de PERMISOS
    const p = new PermisosModel(usuarioApp);
    const role = p.checkAccess('EMPRESAS_TRANSPORTE', 'Read'); 
    
    // 3. Datos
    const db = new EmpresasModel(usuarioApp); // Inyectamos el usuario
    const data = db.getData();
    const nextId = db.getNextId();

    // 4. Listas para Dropdowns
    const provinciasDb = new BaseModel('PROVINCIAS', 'Provincia', usuarioApp);
    const paisesDb = new BaseModel('PAISES', 'País', usuarioApp);

    const listas = {
      provincias: provinciasDb.getData(),
      paises: paisesDb.getData()
    };

    return { 
      success: true, 
      data: data, 
      nextId: nextId,
      lists: listas, 
      role: role 
    };

  } catch (e) {
    return { success: false, error: e.message, stack: e.stack };
  }
}

// Geocoding para completar dirección (Lectura pura, no requiere log)
function apiConsultarGeoEmpresa(direccion) {
  try {
    if (!direccion) return { error: "Dirección vacía" };

    const loc = GEO_INFO_LOCA(direccion); // Intenta adivinar la localidad
    const prov = GEO_INFO_PROV(direccion);
    const pais = GEO_INFO_PAIS(direccion);

    return { 
      success: true, 
      localidad: loc,
      provincia: prov, 
      pais: pais
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 1. Agregamos el parámetro 'usuarioApp' primero
function apiSaveEmpresa(usuarioApp, formObject) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('EMPRESAS_TRANSPORTE', 'Update'); // CORREGIDO: de 'Edit' a 'Update'

    const db = new EmpresasModel(usuarioApp); // Inyectamos el usuario
    if (formObject.actionType === 'create') {
      db.create(formObject);
    } else {
      db.update(formObject.EMPRESA_KEY, formObject);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 1. Agregamos el parámetro 'usuarioApp' primero
function apiDeleteEmpresa(usuarioApp, id) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('EMPRESAS_TRANSPORTE', 'Delete'); // CORREGIDO: de 'Admin' a 'Delete'
    
    const dbEmpresas = new EmpresasModel(usuarioApp); // Inyectamos el usuario
    
    // --- INTEGRIDAD REFERENCIAL ---
    // Verificamos que la empresa no esté siendo usada por Vehículos o Choferes
    const empresaToDelete = dbEmpresas.getById(id);
    if (!empresaToDelete) throw new Error("Empresa no encontrada para eliminar.");
    
    // Supongamos que la columna en la hoja se llama Razón Social o Nombre
    const nombreEmpresa = String(empresaToDelete['Razón Social'] || empresaToDelete.Nombre || empresaToDelete.EMPRESA_KEY || "").trim().toUpperCase();

    // 1. Check Choferes
    const dbChoferes = new BaseModel('CHOFERES', 'Legajo', usuarioApp);
    const choferAsociado = dbChoferes.getData().find(c => String(c.NOMBRE_EMPRESA || "").trim().toUpperCase() === nombreEmpresa);
    if (choferAsociado) {
        throw new Error(`⛔ NO SE PUEDE ELIMINAR.\nLa empresa está asignada al Chofer "${choferAsociado.Nombre}".`);
    }

    // 2. Check Vehículos
    const dbVehiculos = new BaseModel('VEHICULOS', 'Interno', usuarioApp);
    const vehiculoAsociado = dbVehiculos.getData().find(v => String(v.NOMBRE_EMPRESA || v.Empresa || "").trim().toUpperCase() === nombreEmpresa);
    if (vehiculoAsociado) {
        throw new Error(`⛔ NO SE PUEDE ELIMINAR.\nLa empresa está asignada al Vehículo Interno "${vehiculoAsociado.Interno}".`);
    }
    // -------------------------------

    // Si pasa las validaciones, procedemos a borrar y loguear
    dbEmpresas.delete(id);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}