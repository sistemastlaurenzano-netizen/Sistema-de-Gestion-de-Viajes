/**
 * @class ModelDocumentacionVencimientos
 * @description Modelo para gestionar los vencimientos de documentación de choferes y unidades.
 * @extends BaseModel
 */
class ModelDocumentacionVencimientos extends BaseModel {
  /**
   * @constructor
   */
  constructor(usuarioApp) {
    super('DOCUMENTACION_VENCIMIENTOS', 'ID', usuarioApp);
    this.docTiposModel = new ModelDocumentacionTipos(usuarioApp);
  }

  /**
   * @method checkVencimientosObligatorios
   * @description Verifica si un chofer tiene toda su documentación obligatoria vigente.
   * @param {string} idChofer El ID del chofer a verificar (ej. 'CH-001').
   * @returns {{isValid: boolean, message: string}} Objeto con el resultado de la validación.
   */
  checkVencimientosObligatorios(idChofer) {
    try {
      // Obtener todos los tipos de documentación que son obligatorios para choferes
      const tiposObligatorios = this.docTiposModel.getData({
        EsObligatorio: 'SI',
        AplicaA: 'Chofer'
      });

      if (tiposObligatorios.length === 0) {
        return { isValid: true, message: 'No hay documentación obligatoria configurada.' };
      }

      // Obtener todos los vencimientos para el chofer dado
      const vencimientosChofer = this.getData({ ID_Chofer: idChofer });
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0); // Normalizar a la medianoche para comparar solo fechas

      for (const tipo of tiposObligatorios) {
        const vencimiento = vencimientosChofer.find(v => v.ID_Documentacion_Tipo === tipo.ID);

        if (!vencimiento) {
          return { isValid: false, message: `Falta la documentación obligatoria: ${tipo.Nombre}.` };
        }

        const fechaVencimiento = new Date(vencimiento.FechaVencimiento);
        if (fechaVencimiento < hoy) {
          return { isValid: false, message: `La documentación "${tipo.Nombre}" está vencida (Fecha: ${fechaVencimiento.toLocaleDateString()}).` };
        }
      }

      return { isValid: true, message: 'Documentación obligatoria vigente.' };
    } catch (error) {
      Logger.log(`Error en checkVencimientosObligatorios: ${error.message}`);
      throw new Error(`No se pudo verificar la documentación del chofer ${idChofer}.`);
    }
  }
}

/**
 * @function apiGetVencimientosEntidad
 * @description Obtiene todos los tipos de documentos aplicables a una entidad (Chofer/Unidad) y sus fechas de vencimiento.
 * @param {string} usuarioApp El email del usuario.
 * @param {string} tipoEntidad 'Chofer' o 'Unidad'.
 * @param {string} idEntidad El Legajo del chofer o el Interno de la unidad.
 * @returns {{success: boolean, data: Array, role: string, error: string}}
 */
function apiGetVencimientosEntidad(usuarioApp, tipoEntidad, idEntidad) {
  try {
    const p = new PermisosModel(usuarioApp);
    const role = p.checkAccess('DOCUMENTACION_VENCIMIENTOS', 'Read');

    const vencimientosDb = new ModelDocumentacionVencimientos(usuarioApp);
    const tiposDb = new ModelDocumentacionTipos(usuarioApp);

    // 1. Obtener los tipos de documentos que aplican a esta entidad
    const tiposAplicables = tiposDb.getData({ AplicaA: tipoEntidad });

    // 2. Obtener los vencimientos ya cargados para esta entidad
    const vencimientosCargados = idEntidad ? vencimientosDb.getData({ ID_Chofer: idEntidad }) : [];

    // 3. Unir la información
    const resultado = tiposAplicables.map(tipo => {
      const vencimientoExistente = vencimientosCargados.find(v => v.ID_Documentacion_Tipo === tipo.ID);
      return {
        ID_Documentacion_Tipo: tipo.ID,
        Nombre: tipo.Nombre,
        EsObligatorio: tipo.EsObligatorio,
        DiasTolerancia: tipo.DiasTolerancia || 0,
        DiasPreaviso: tipo.DiasPreaviso || 30,
        ID_Vencimiento: vencimientoExistente ? vencimientoExistente.ID : null,
        FechaVencimiento: vencimientoExistente ? vencimientoExistente.FechaVencimiento : null
      };
    });

    return { success: true, data: resultado, role: role };
  } catch (e) {
    Logger.log(`ERROR en apiGetVencimientosEntidad: ${e.message} ${e.stack}`);
    return { success: false, error: `Error al obtener vencimientos: ${e.message}` };
  }
}

// --- API PÚBLICA PARA ABM ---

function apiGetVencimientos(usuarioApp, filtro) {
  try {
    const p = new PermisosModel(usuarioApp);
    const role = p.checkAccess('DOCUMENTACION_VENCIMIENTOS', 'Read');
    
    const db = new ModelDocumentacionVencimientos(usuarioApp);
    const data = db.getData(filtro); // Permite filtrar por ID_Chofer, etc.

    return { success: true, data: data, role: role };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function apiSaveVencimiento(usuarioApp, formObject) {
  try {
    const p = new PermisosModel(usuarioApp);
    const accessType = formObject.actionType === 'create' ? 'Create' : 'Update';
    p.checkAccess('DOCUMENTACION_VENCIMIENTOS', accessType);

    const db = new ModelDocumentacionVencimientos(usuarioApp);
    if (formObject.actionType === 'create') {
      db.create(formObject);
    } else {
      db.update(formObject.ID, formObject);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function apiDeleteVencimiento(usuarioApp, id) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('DOCUMENTACION_VENCIMIENTOS', 'Delete');
    
    const db = new ModelDocumentacionVencimientos(usuarioApp);
    db.delete(id);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}