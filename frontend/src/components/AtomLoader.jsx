import React from 'react';

export default function AtomLoader({ message = "QUANT MATRIX IS LOADING..." }) {
  return (
    <div className="atom-loader-container">
      <div className="atom-wrapper">
        <div className="atom-nucleus"></div>
        <div className="atom-orbit atom-orbit-1"></div>
        <div className="atom-orbit atom-orbit-2"></div>
        <div className="atom-orbit atom-orbit-3"></div>
      </div>
      <p className="atom-loading-text">{message}</p>
    </div>
  );
}