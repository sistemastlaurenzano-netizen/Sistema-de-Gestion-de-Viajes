/**
 * @class ModelDocumentacionTipos
 * @description Modelo para gestionar los tipos de documentación en la hoja DOCUMENTACION_TIPOS.
 * @extends BaseModel
 */
class ModelDocumentacionTipos extends BaseModel {
  /**
   * @constructor
   */
  constructor(usuarioApp) {
    super('DOCUMENTACION_TIPOS', 'ID', usuarioApp);
  }
}

// --- API PÚBLICA PARA ABM ---

function apiGetDocumentacionTipos(usuarioApp) {
  try {
    const p = new PermisosModel(usuarioApp);
    const role = p.checkAccess('DOCUMENTACION_TIPOS', 'Read');
    
    const db = new ModelDocumentacionTipos(usuarioApp);
    const data = db.getData();

    return { success: true, data: data, role: role };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function apiSaveDocumentacionTipo(usuarioApp, formObject) {
  try {
    const p = new PermisosModel(usuarioApp);
    const accessType = formObject.actionType === 'create' ? 'Create' : 'Update';
    p.checkAccess('DOCUMENTACION_TIPOS', accessType);

    const db = new ModelDocumentacionTipos(usuarioApp);
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

function apiDeleteDocumentacionTipo(usuarioApp, id) {
  try {
    const p = new PermisosModel(usuarioApp);
    p.checkAccess('DOCUMENTACION_TIPOS', 'Delete');
    
    const db = new ModelDocumentacionTipos(usuarioApp);
    db.delete(id);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}