/** Mide el tiempo de carga inicial y las transiciones de las vistas BauMar sin leer datos de negocio. */
export class BrowserPerformanceAnalystAgent {
  /** Inicia el cronómetro de una transición entre vistas. */
  startViewTransition() { return globalThis.performance?.now?.() ?? Date.now(); }

  /** Devuelve la duración de una transición React ya confirmada en el DOM. */
  finishViewTransition(startedAt) {
    const now = globalThis.performance?.now?.() ?? Date.now();
    return Number(Math.max(0, now - startedAt).toFixed(2));
  }

  /** Estima carga inicial con Navigation Timing y evita conservar URL, recursos o datos del usuario. */
  initialPageDuration() {
    const navigation = globalThis.performance?.getEntriesByType?.('navigation')?.[0];
    if (!navigation) return 0;
    const end = navigation.loadEventEnd || navigation.domContentLoadedEventEnd || navigation.responseEnd;
    return Number(Math.max(0, end - navigation.startTime).toFixed(2));
  }
}

export const browserPerformanceAnalystAgent = new BrowserPerformanceAnalystAgent();
