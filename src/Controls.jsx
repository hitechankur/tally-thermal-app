// src/Controls.jsx

import React from 'react';
import OrderInfoControls from './OrderInfoControls';

export default function Controls({ settings, onSettingsChange }) {
  const handleChange = (e) => {
    const { name, value } = e.target;
    onSettingsChange(prev => ({ ...prev, [name]: value }));
  };

  const handleReset = () => {
    onSettingsChange({
      fontFamily: 'monospace',
      fontSize: 12,
      lineHeight: 1.4,
      headerAlignment: 'center',
      logoUrl: '',
      lineSeparator: '-',
      zoom: 1.0,
      sectionStyles: {
        orderInfo: {
          labelBold: false,
          valueBold: true
        }
      }
    });
  };

  return (
    <div className="p-4 bg-white shadow-lg rounded-lg space-y-4">
      <h3 className="text-xl font-bold border-b pb-2">Cosmetic Controls</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Font Family</label>
          <select name="fontFamily" value={settings.fontFamily} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
            <option value="monospace">Monospace</option>
            <option value="Courier New">Courier New</option>
            <option value="Lucida Console">Lucida Console</option>
            <option value="Arial">Arial</option>
            <option value="Verdana">Verdana</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Font Size (px)</label>
          <input type="number" name="fontSize" value={settings.fontSize} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Line Height</label>
          <input type="number" step="0.1" name="lineHeight" value={settings.lineHeight} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Header Alignment</label>
          <select name="headerAlignment" value={settings.headerAlignment} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Logo Image URL</label>
        <input type="text" name="logoUrl" placeholder="https://.../logo.png" value={settings.logoUrl} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Line Separator Character</label>
        <input type="text" maxLength="1" name="lineSeparator" value={settings.lineSeparator} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
      </div>

      {/* Order Info Formatting Block */}
      <OrderInfoControls
        sectionStyles={settings.sectionStyles}
        onChange={(updated) =>
          onSettingsChange(prev => ({
            ...prev,
            sectionStyles: {
              ...prev.sectionStyles,
              ...updated
            }
          }))
        }
      />

      <div className="pt-2">
        <button onClick={handleReset} className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
