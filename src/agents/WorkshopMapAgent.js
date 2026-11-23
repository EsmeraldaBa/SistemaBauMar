/** Construye una consulta de búsqueda de Google Maps con los campos ya guardados en BauMar. */
export function workshopAddressText(workshop) {
  const address = workshop?.address || {};
  return [
    workshop?.workshopName,
    address.street,
    address.streetNumber,
    address.neighborhood,
    address.postalCode,
    address.municipality,
    address.state,
    'México',
  ].filter(Boolean).join(', ');
}

/** Genera una Maps URL universal; no requiere API key porque delega la cartografía al navegador de Google Maps. */
export function googleMapsSearchUrl(query) {
  const params = new URLSearchParams({ api: '1', query: String(query || '').trim() });
  return `https://www.google.com/maps/search/?${params}`;
}

/** Genera la ruta al taller y deja que Maps elija el origen actual del usuario. */
export function googleMapsDirectionsUrl(destination) {
  const params = new URLSearchParams({ api: '1', destination: String(destination || '').trim() });
  return `https://www.google.com/maps/dir/?${params}`;
}

const stopWords = new Set(['a', 'al', 'busca', 'buscar', 'de', 'del', 'donde', 'el', 'en', 'esta', 'hay', 'la', 'las', 'los', 'mapa', 'mecanico', 'mi', 'por', 'que', 'taller', 'talleres', 'ubicacion', 'un', 'una']);

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX');
}

/** Agente determinista que interpreta una consulta simple y la contrasta con los talleres activos disponibles. */
export class WorkshopMapAgent {
  /**
   * Busca coincidencias en nombres y domicilios; sin coincidencia, entrega una búsqueda externa del lugar solicitado.
   * @param {string} query Texto escrito por el usuario.
   * @param {Array<object>} workshops Talleres devueltos por la API de BauMar.
   * @returns {{matches: Array<object>, mapUrl: string|null, message: string}}
   */
  respond(query, workshops = []) {
    const activeWorkshops = workshops.filter((workshop) => workshop.status === 'active');
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) {
      return {
        matches: activeWorkshops,
        mapUrl: null,
        message: activeWorkshops.length ? 'Selecciona una sede o escribe qué ubicación buscas.' : 'No hay talleres activos registrados.',
      };
    }

    const tokens = normalizeText(cleanQuery).split(/[^a-z0-9]+/).filter((token) => token.length > 1 && !stopWords.has(token));
    const matches = activeWorkshops
      .map((workshop) => {
        const searchable = normalizeText(`${workshop.workshopName || ''} ${workshopAddressText(workshop)}`);
        const score = tokens.reduce((total, token) => total + Number(searchable.includes(token)), 0);
        return { workshop, score };
      })
      .filter(({ score }) => score > 0)
      .sort((first, second) => second.score - first.score || String(first.workshop.workshopName).localeCompare(String(second.workshop.workshopName), 'es-MX'))
      .map(({ workshop }) => workshop);

    if (matches.length) {
      return { matches, mapUrl: null, message: `Encontré ${matches.length} taller${matches.length === 1 ? '' : 'es'} BauMar que coincide${matches.length === 1 ? '' : 'n'} con tu búsqueda.` };
    }

    return {
      matches: [],
      mapUrl: googleMapsSearchUrl(cleanQuery),
      message: 'No encontré una sede BauMar con esos datos. Puedes buscar la ubicación en Google Maps.',
    };
  }
}
