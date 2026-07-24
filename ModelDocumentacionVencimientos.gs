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
  checkVencimientosObligatorios(idEntidad, tipoEntidad = 'Chofer') {
    try {
      // Obtener todos los tipos de documentación que son obligatorios para la entidad
      const todosTipos = this.docTiposModel.getData();
      const tiposObligatorios = todosTipos.filter(t => 
          t.EsObligatorio === 'SI' && 
          String(t.AplicaA || '').trim() === tipoEntidad
      );

      if (tiposObligatorios.length === 0) {
        return { isValid: true, message: 'No hay documentación obligatoria configurada.' };
      }

      // Obtener todos los vencimientos para la entidad dada
      const todosVencimientos = this.getData();
      const vencimientosEntidad = todosVencimientos.filter(v => String(v.ID_Chofer || '').trim() === String(idEntidad).trim());
      
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0); // Normalizar a la medianoche para comparar solo fechas

      for (const tipo of tiposObligatorios) {
        const vencimiento = vencimientosEntidad.find(v => v.ID_Documentacion_Tipo === tipo.ID);

        if (!vencimiento || !vencimiento.FechaVencimiento) {
          return { isValid: false, message: `Documentación VENCIDA (Falta cargar: ${tipo.Nombre}).` };
        }

        const fechaVencimiento = new Date(vencimiento.FechaVencimiento);
        if (isNaN(fechaVencimiento.getTime())) {
            return { isValid: false, message: `La fecha para "${tipo.Nombre}" es inválida.` };
        }
        fechaVencimiento.setHours(0,0,0,0);

        const diasTolerancia = parseInt(tipo.DiasTolerancia) || 0;
        const fechaLimite = new Date(fechaVencimiento);
        fechaLimite.setDate(fechaLimite.getDate() + diasTolerancia);

        if (fechaLimite < hoy) {
          return { isValid: false, message: `La documentación "${tipo.Nombre}" está vencida y fuera de tolerancia (Vence: ${fechaVencimiento.toLocaleDateString()}).` };
        }
      }

      return { isValid: true, message: 'Documentación obligatoria vigente.' };
    } catch (error) {
      Logger.log(`Error en checkVencimientosObligatorios: ${error.message}`);
      throw new Error(`No se pudo verificar la documentación de la entidad ${idEntidad}.`);
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
    // Se filtra en memoria para asegurar que funcione incluso si BaseModel.getData(filtro) falla.
    const todosLosTipos = tiposDb.getData();
    const tiposAplicables = todosLosTipos.filter(t => String(t.AplicaA || '').trim() === tipoEntidad);

    // 2. Obtener los vencimientos ya cargados para esta entidad
    // Se filtra en memoria para evitar errores de cache o de BaseModel.getData(filtro).
    // Se compara como string para evitar problemas de tipo de dato (número vs texto).
    const todosLosVencimientos = vencimientosDb.getData();
    const vencimientosCargados = idEntidad ? todosLosVencimientos.filter(v => String(v.ID_Chofer || '').trim() === String(idEntidad).trim()) : [];

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

function apiCheckVencimientosEntidad(usuarioApp, idEntidad, tipoEntidad) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('VIAJES', 'Read'); // Check if user can even see the trips module

    if (!idEntidad) {
        return { success: true, status: 'OK', message: 'No se seleccionó entidad.' };
    }

    const vencimientosModel = new ModelDocumentacionVencimientos(usuarioApp);
    const todosTipos = vencimientosModel.docTiposModel.getData();
    const tiposObligatorios = todosTipos.filter(t => 
        t.EsObligatorio === 'SI' && 
        String(t.AplicaA || '').trim() === tipoEntidad
    );

    if (tiposObligatorios.length === 0) {
      return { success: true, status: 'OK', message: 'No hay documentación obligatoria configurada.' };
    }

    const todosVencimientos = vencimientosModel.getData();
    const vencimientosEntidad = todosVencimientos.filter(v => String(v.ID_Chofer || '').trim() === String(idEntidad).trim());
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let warnings = [];

    for (const tipo of tiposObligatorios) {
      const vencimiento = vencimientosEntidad.find(v => v.ID_Documentacion_Tipo === tipo.ID);

      if (!vencimiento || !vencimiento.FechaVencimiento) {
        return { success: true, status: 'VENCIDO', message: `Documentación VENCIDA (Falta cargar: ${tipo.Nombre}).` };
      }

      const fechaVencimiento = new Date(vencimiento.FechaVencimiento);
      if (isNaN(fechaVencimiento.getTime())) {
          return { success: true, status: 'VENCIDO', message: `La fecha para "${tipo.Nombre}" es inválida.` };
      }
      fechaVencimiento.setHours(0,0,0,0);

      const diasTolerancia = parseInt(tipo.DiasTolerancia) || 0;
      const fechaLimite = new Date(fechaVencimiento);
      fechaLimite.setDate(fechaLimite.getDate() + diasTolerancia);

      if (fechaLimite < hoy) {
        return { success: true, status: 'VENCIDO', message: `La documentación "${tipo.Nombre}" está vencida y fuera de tolerancia (Vence: ${fechaVencimiento.toLocaleDateString()}).` };
      }

      const diasPreaviso = parseInt(tipo.DiasPreaviso) || 30;
      const fechaPreaviso = new Date(fechaVencimiento);
      fechaPreaviso.setDate(fechaPreaviso.getDate() - diasPreaviso);

      if (hoy >= fechaPreaviso) {
          warnings.push(`"${tipo.Nombre}" próximo a vencer (Vence: ${fechaVencimiento.toLocaleDateString()}).`);
      }
    }

    if (warnings.length > 0) {
        return { success: true, status: 'ADVERTENCIA', message: warnings.join('\n') };
    }

    return { success: true, status: 'OK', message: 'Documentación obligatoria vigente.' };

  } catch (e) {
    Logger.log(`Error en apiCheckVencimientosEntidad: ${e.message}`);
    return { success: false, status: 'ERROR', message: `No se pudo verificar la documentación.` };
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
      // Generar un ID único si es un registro nuevo y no viene con uno.
      if (!formObject.ID) {
        formObject.ID = 'DV-' + new Date().getTime() + Math.floor(Math.random() * 100);
      }
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