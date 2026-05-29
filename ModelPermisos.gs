class PermisosModel {
  // Ahora el constructor recibe la identidad desde el Frontend
  constructor(usuarioFrontend = null) {
    this.sheetName = 'PERMISOS';
    
    // Si viene del Front, lo usamos. Si no, intentamos con Session por defecto.
    let email = usuarioFrontend || Session.getActiveUser().getEmail();
    this.userEmail = String(email || "").toLowerCase().trim();
  }

  getRole(moduleName) {
    if (!this.userEmail) return 'None'; // Si no hay usuario, bloquea.

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(this.sheetName);
    if (!sheet) return 'None'; 

    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).toUpperCase().trim());
    
    const colIndex = headers.indexOf(String(moduleName).toUpperCase().trim());
    if (colIndex === -1) return 'None'; 

    const userRow = data.find(r => String(r[0]).toLowerCase().trim() === this.userEmail);
    if (!userRow) return 'None'; 

    const role = userRow[colIndex];
    return role ? String(role).trim() : 'None';
  }

  checkAccess(moduleName, requiredLevel) {
    const currentRole = this.getRole(moduleName);
    if (this.hasPermission(currentRole, requiredLevel)) {
      return currentRole; 
    } else {
      throw new Error(`⛔ ACCESO DENEGADO.\nUsuario: ${this.userEmail}\nMódulo: '${moduleName}'.\nRequerido: ${requiredLevel}, Actual: ${currentRole}`);
    }
  }

  hasPermission(currentRole, requiredLevel) {
    const levels = ['None', 'Read', 'Update', 'Create', 'Delete', 'Admin'];
    const cIndex = levels.indexOf(this.normalizeRole(currentRole));
    const rIndex = levels.indexOf(this.normalizeRole(requiredLevel));
    return cIndex >= rIndex;
  }

  normalizeRole(role) {
    if (!role) return 'None';
    const r = String(role).charAt(0).toUpperCase() + String(role).slice(1).toLowerCase();
    if (r === 'Lectura') return 'Read';
    if (r === 'Edicion' || r === 'Editar') return 'Update';
    if (r === 'Crear') return 'Create';
    if (r === 'Eliminar') return 'Delete';
    if (r === 'Administrador') return 'Admin';
    return r;
  }
}