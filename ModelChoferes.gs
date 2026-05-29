class ChoferesModel extends BaseModel {
  // 1. Recibimos usuarioApp y lo pasamos a la clase padre
  constructor(usuarioApp) {
    super('CHOFERES', 'Legajo', usuarioApp);
  }
}

// --- API PÚBLICA ---

// 1. Agregamos el parámetro 'usuarioApp'
function apiGetChoferes(usuarioApp) {
  try {
    // 2. Permisos
    const p = new PermisosModel(usuarioApp);
    const role = p.checkAccess('CHOFERES', 'Read'); 
    
    // 3. Datos
    const db = new ChoferesModel(usuarioApp); // Inyectamos el usuario
    const data = db.getData();

    // 4. Listas para Dropdowns
    const empresasDb = new BaseModel('EMPRESAS_TRANSPORTE', 'EMPRESA_KEY', usuarioApp);
    const vehiculosDb = new BaseModel('VEHICULOS', 'Interno', usuarioApp);
    const provinciasDb = new BaseModel('PROVINCIAS', 'Provincia', usuarioApp);
    const paisesDb = new BaseModel('PAISES', 'País', usuarioApp);

    const listas = {
      empresas: empresasDb.getData(),
      vehiculos: vehiculosDb.getData(),
      provincias: provinciasDb.getData(),
      paises: paisesDb.getData()
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

// --- NUEVA FUNCIÓN: GEOCODING PARA CHOFERES ---
// Le cambiamos el nombre para que no choque con la de Empresas o Lugares
function apiConsultarGeoChofer(direccion) {
  try {
    if (!direccion) return { error: "Dirección vacía" };

    // Llamamos a las funciones globales de tu archivo GeoLocal.gs
    const prov = GEO_INFO_PROV(direccion);
    const pais = GEO_INFO_PAIS(direccion);
    const loc = GEO_INFO_LOCA(direccion); // Agregado por si lo necesitas

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
function apiSaveChofer(usuarioApp, formObject) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('CHOFERES', 'Update'); // CORREGIDO: de 'Edit' a 'Update'

    const db = new ChoferesModel(usuarioApp); // Inyectamos el usuario
    if (formObject.actionType === 'create') {
      db.create(formObject);
    } else {
      db.update(formObject.Legajo, formObject);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 1. Agregamos el parámetro 'usuarioApp' primero
function apiDeleteChofer(usuarioApp, id) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('CHOFERES', 'Delete'); // CORREGIDO: de 'Admin' a 'Delete'
    
    const db = new ChoferesModel(usuarioApp);

    // --- INTEGRIDAD REFERENCIAL ---
    // Primero obtenemos los datos del chofer para saber su nombre
    const chofer = db.getById(id);
    if (!chofer) throw new Error("Chofer no encontrado.");

    const nombreChofer = String(chofer['Nombre y Apellido'] || chofer.Nombre || "").trim();

    if (nombreChofer) {
       verificarIntegridadReferencial('Chofer', nombreChofer, 'Chofer');
    }
    // ------------------------------
    
    db.delete(id);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}