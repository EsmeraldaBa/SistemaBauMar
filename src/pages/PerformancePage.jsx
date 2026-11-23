import React, { useCallback, useEffect, useState } from 'react';
import { bauMar } from '../facades/BauMarFacade.js';

function PageHeading({ title, description, action }) {
  return <div className="page-heading"><div><span className="overline">OBSERVABILIDAD TÉCNICA</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function MetricTable({ title, columns, rows, empty }) {
  return <section className="table-card performance-table"><div className="table-title"><h2>{title}</h2><span>{rows.length} muestras agrupadas</span></div><div className="table-scroll"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column.label}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${title}-${index}`}>{columns.map((column) => <td key={column.label}>{column.render(row)}</td>)}</tr>)}{rows.length === 0 && <tr><td className="empty-cell" colSpan={columns.length}>{empty}</td></tr>}</tbody></table></div></section>;
}

/** Presenta métricas técnicas agregadas disponibles para una sesión de administrador. */
export function PerformancePage({ isAdmin }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await bauMar.performanceMetrics(); setReport(data.report); setError(''); }
    catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (!isAdmin) return <div className="empty-panel"><span className="empty-icon">⌑</span><h3>Acceso administrativo</h3><p>El analista de rendimiento solo está disponible para administradores.</p></div>;

  const process = report?.process;
  const cards = [
    ['Solicitudes HTTP', report?.http.totalRequests ?? 0, 'Desde el último inicio de la API'],
    ['Consultas SQL', report?.database.totalQueries ?? 0, 'Valores y parámetros no se almacenan'],
    ['Memoria residente', `${process?.rssMb ?? '—'} MB`, 'Uso actual del proceso Node.js'],
    ['Tiempo activo', `${process?.uptimeSeconds ?? '—'} s`, 'Desde el último inicio de la API'],
  ];

  return <>
    <PageHeading title="Analista de rendimiento" description="Observa latencias HTTP y SQL, tiempos de vistas, errores repetidos y uso de memoria del sistema BauMar. No analiza información de clientes, talleres o vehículos." action={<button className="button secondary" onClick={load} disabled={loading}>{loading ? 'Actualizando…' : '↻ Actualizar'}</button>} />
    {error && <div className="inline-error"><span>{error}</span><button className="button secondary" onClick={load}>Reintentar</button></div>}
    {report && <>
      <div className="performance-cards">{cards.map(([label, value, detail]) => <article className="performance-card" key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</div>
      <section className="performance-recommendations"><div className="panel-header"><div><span className="overline">LECTURA DEL AGENTE</span><h2>Recomendaciones</h2></div><small>Actualizado {new Date(report.capturedAt).toLocaleTimeString('es-MX')}</small></div><ul>{report.recommendations.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <MetricTable title="Endpoints lentos" rows={report.http.endpoints} empty="Aún no hay solicitudes suficientes para medir." columns={[
        { label: 'ENDPOINT', render: (row) => row.route }, { label: 'SOLICITUDES', render: (row) => row.count }, { label: 'PROMEDIO', render: (row) => `${row.averageMs} ms` }, { label: 'P95', render: (row) => `${row.p95Ms} ms` }, { label: 'ERRORES 5XX', render: (row) => row.serverErrors },
      ]} />
      <MetricTable title="Consultas SQL más lentas" rows={report.database.queryShapes} empty="Las consultas se mostrarán cuando la API llegue a MySQL." columns={[
        { label: 'OPERACIÓN', render: (row) => row.operation }, { label: 'HUELLA', render: (row) => row.fingerprint }, { label: 'MUESTRAS', render: (row) => row.count }, { label: 'PROMEDIO', render: (row) => `${row.averageMs} ms` }, { label: 'P95', render: (row) => `${row.p95Ms} ms` }, { label: 'FALLOS', render: (row) => row.failures },
      ]} />
      <MetricTable title="Tiempos de vistas React" rows={report.pages.views} empty="Los tiempos se capturan cuando un administrador visita las pantallas." columns={[
        { label: 'VISTA', render: (row) => row.view }, { label: 'MUESTRAS', render: (row) => row.count }, { label: 'PROMEDIO', render: (row) => `${row.averageMs} ms` }, { label: 'P95', render: (row) => `${row.p95Ms} ms` },
      ]} />
      <p className="performance-note">{report.note}</p>
    </>}
  </>;
}
