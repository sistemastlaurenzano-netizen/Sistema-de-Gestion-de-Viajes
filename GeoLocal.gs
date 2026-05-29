/**
 * Obtiene Provincia, Localidad, Latitud y Longitud de una dirección.
 * @param {string} direccion La dirección a buscar.
 * @return {Array} Fila con Provincia, Localidad, Latitud, Longitud.
 * @customfunction
 */
function GEO_INFO(direccion) {
  if (!direccion) return "Esperando dirección...";
  
  try {
    const geocoder = Maps.newGeocoder();
    // Forzamos el idioma a español para consistencia
    const response = geocoder.setLanguage('es').geocode(direccion);
    
    if (response.status === 'OK') {
      const result = response.results[0];
      
      let localidad = "No hallada";
      let provincia = "No hallada";
      let pais = "No hallada";
      
      // Mapeo de componentes de dirección
      result.address_components.forEach(component => {
        if (component.types.includes("locality")) {
          localidad = component.long_name;
        }
        if (component.types.includes("administrative_area_level_1")) {
          provincia = component.long_name;
        }
        if (component.types.includes("country")) {
          pais = component.long_name;
        }
      });
      
      const lat = result.geometry.location.lat;
      const lng = result.geometry.location.lng;
      
      // Retorna una fila con 4 columnas
      return [[pais, provincia, localidad, lat, lng]];
    } else {
      return [["No encontrado"]];
    }
  } catch (e) {
    return [["Error", e.toString()]];
  }
}

function GEO_INFO_LOCA(direccion) {
  if (!direccion) return "Esperando dirección...";
  
  try {
    const geocoder = Maps.newGeocoder();
    // Forzamos el idioma a español para consistencia
    const response = geocoder.setLanguage('es').geocode(direccion);
    
    if (response.status === 'OK') {
      const result = response.results[0];
      
       let provincia = "No hallada";
      
      // Mapeo de componentes de dirección
      result.address_components.forEach(component => {
         if (component.types.includes("locality")) {
          provincia = component.long_name;
        }
      });
         // Retorna una fila con 4 columnas
      return [[provincia]];
    } else {
      return [["No encontrado"]];
    }
  } catch (e) {
    return [["Error", e.toString()]];
  }
}



function GEO_INFO_PROV(direccion) {
  if (!direccion) return "Esperando dirección...";
  
  try {
    const geocoder = Maps.newGeocoder();
    // Forzamos el idioma a español para consistencia
    const response = geocoder.setLanguage('es').geocode(direccion);
    
    if (response.status === 'OK') {
      const result = response.results[0];
      
       let localidad = "No hallada";
      
      // Mapeo de componentes de dirección
      result.address_components.forEach(component => {
        if (component.types.includes("administrative_area_level_1")) {
          localidad = component.long_name;
        }
      });
         // Retorna una fila con 4 columnas
      return [[localidad]];
    } else {
      return [["No encontrado"]];
    }
  } catch (e) {
    return [["Error", e.toString()]];
  }
}


function GEO_INFO_PAIS(direccion) {
  if (!direccion) return "Esperando dirección...";
  
  try {
    const geocoder = Maps.newGeocoder();
    // Forzamos el idioma a español para consistencia
    const response = geocoder.setLanguage('es').geocode(direccion);
    
    if (response.status === 'OK') {
      const result = response.results[0];
      
       let PAIS = "No hallada";
      
      // Mapeo de componentes de dirección
      result.address_components.forEach(component => {
        if (component.types.includes("country")) {
          PAIS = component.long_name;
        }
      });
         // Retorna una fila con 4 columnas
      return [[PAIS]];
    } else {
      return [["No encontrado"]];
    }
  } catch (e) {
    return [["Error", e.toString()]];
  }
}


function GEO_GPS(direccion) {
  if (!direccion) return "Esperando dirección...";
  
  try {
    const geocoder = Maps.newGeocoder();
    // Forzamos el idioma a español para consistencia
    const response = geocoder.setLanguage('es').geocode(direccion);
    
    if (response.status === 'OK') {
      const result = response.results[0];
      
    
      const lat = result.geometry.location.lat;
      const lng = result.geometry.location.lng;
      
      // Retorna una fila con 4 columnas
      return [[lat, lng]];
    } else {
      return [["No encontrado"]];
    }
  } catch (e) {
    return [["Error", e.toString()]];
  }
}