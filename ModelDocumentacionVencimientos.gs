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