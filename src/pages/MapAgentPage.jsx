import React, { useEffect, useMemo, useState } from 'react';
import { bauMar } from '../facades/BauMarFacade.js';
import { WorkshopMapAgent, googleMapsDirectionsUrl, googleMapsSearchUrl, workshopAddressText } from '../agents/WorkshopMapAgent.js';

const agent = new WorkshopMapAgent();

/** Ayuda a ubicar talleres usando el catálogo y domicilios ya guardados; Google Maps abre la búsqueda o la ruta final. */
export function MapAgentPage() {
  const [workshops, setWorkshops] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const response = useMemo(() => agent.respond(query, workshops), [query, workshops]);
  const selected = response.matches.find((workshop) => workshop.workshopId === selectedId)
    || (response.matches.length === 1 ? response.matches[0] : null);

  useEffect(() => {
    let mounted = true;
    bauMar.workshops()
      .then((data) => { if (mounted) setWorkshops(data.workshops || []); })
      .catch((reason) => { if (mounted) setError(reason.message || 'No se pudieron cargar las ubicaciones de talleres.'); })
      .finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, []);

  function updateQuery(event) {
    setQuery(event.target.value);
    setSelectedId('');
  }

  return <>
    <div className="page-heading">
      <div><span className="overline">ASISTENTE DE UBICACIONES</span><h1>Agente de mapas</h1><p>Encuentra talleres BauMar por nombre, calle, colonia, código postal, municipio o estado.</p></div>
    </div>

    <section className="map-agent-panel" aria-labelledby="map-agent-prompt-label">
      <label id="map-agent-prompt-label" htmlFor="map-agent-query">¿Qué ubicación buscas?</label>
      <input id="map-agent-query" type="search" value={query} onChange={updateQuery} maxLength={180} placeholder="Ej. taller en Coyoacán o Av. Reforma" autoComplete="off" />
      <small>Busca entre las sedes activas de BauMar. También puedes escribir otra ubicación para buscarla en Maps.</small>
    </section>

    {busy && <div className="loading-panel">Cargando sedes registradas…</div>}
    {error && <div className="inline-error" role="alert">{error}</div>}
    {!busy && !error && <>
      <p className="map-agent-response" role="status" aria-live="polite">{response.message}</p>
      {response.mapUrl && <div className="map-agent-fallback"><div><b>Buscar fuera de BauMar</b><p>La consulta no coincide con una sede registrada. Google Maps buscará el texto tal como lo escribiste.</p></div><a className="button primary" href={response.mapUrl} target="_blank" rel="noopener noreferrer">Buscar en Google Maps ↗</a></div>}

      {!!response.matches.length && <div className="map-agent-layout">
        <section className="map-agent-results" aria-label="Talleres coincidentes">
          {response.matches.map((workshop) => {
            const isSelected = (selected?.workshopId || selectedId) === workshop.workshopId;
            return <button type="button" key={workshop.workshopId} className={`map-agent-result ${isSelected ? 'selected' : ''}`} onClick={() => setSelectedId(workshop.workshopId)} aria-pressed={isSelected}>
              <span className="map-agent-pin" aria-hidden="true">⌖</span>
              <span><b>{workshop.workshopName}</b><small>{workshop.address?.municipality}, {workshop.address?.state}</small></span>
              <span className="map-agent-arrow" aria-hidden="true">›</span>
            </button>;
          })}
        </section>

        {selected ? <article className="map-agent-detail">
          <span className="overline">SEDE SELECCIONADA</span>
          <h2>{selected.workshopName}</h2>
          <p className="map-agent-address">{workshopAddressText(selected)}</p>
          <div className="map-agent-actions">
            <a className="button primary" href={googleMapsSearchUrl(workshopAddressText(selected))} target="_blank" rel="noopener noreferrer">Ver ubicación ↗</a>
            <a className="button secondary" href={googleMapsDirectionsUrl(workshopAddressText(selected))} target="_blank" rel="noopener noreferrer">Cómo llegar ↗</a>
          </div>
          <small className="map-agent-note">La ruta se abre en Google Maps y usa tu ubicación como origen cuando esté disponible.</small>
        </article> : <div className="map-agent-detail map-agent-placeholder"><span aria-hidden="true">⌖</span><p>Selecciona una sede para consultar su ubicación y solicitar una ruta.</p></div>}
      </div>}

      {!response.matches.length && !response.mapUrl && !busy && <div className="empty-panel"><span className="empty-icon">⌖</span><h3>No hay talleres disponibles</h3><p>Cuando se registre una sede activa aparecerá aquí para poder localizarla.</p></div>}
    </>}
  </>;
}
