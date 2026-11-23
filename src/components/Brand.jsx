import React from 'react';

export function Brand({ light = false }) {
  return <div className={`brand ${light ? 'brand-light' : ''}`}><span className="brand-mark">BM</span><span className="brand-name">BAUMAR<small>TALLER AUTOMOTRIZ</small></span></div>;
}

export function Notice({ notice, onClose }) {
  if (!notice) return null;
  return <div className={`notice ${notice.type || 'error'}`} role={notice.type === 'error' ? 'alert' : 'status'}><span>{notice.message}</span><button type="button" aria-label="Cerrar aviso" onClick={onClose}>×</button></div>;
}

export function Field({ label, name, error, ...inputProps }) {
  return <label className={`field ${error ? 'has-error' : ''}`}><span>{label}</span><input name={name} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} {...inputProps} />{error && <small id={`${name}-error`}>{error}</small>}</label>;
}
