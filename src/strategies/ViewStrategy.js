import React from 'react';

/** Strategy para seleccionar una vista reemplazable por sección sin llenar el contenedor principal de condiciones. */
export class ViewStrategy {
  constructor(Component) { this.Component = Component; }
  render(props) { return React.createElement(this.Component, props); }
}

/** Contexto Strategy: resuelve la estrategia para la sección activa o presenta una vista segura por defecto. */
export class ViewContext {
  constructor(strategies) { this.strategies = strategies; }
  setStrategies(strategies) { this.strategies = strategies; }
  render(section, props) { return (this.strategies[section] || this.strategies.dashboard).render(props); }
}
