// src/OrderInfoControls.jsx

import React from 'react';

export default function OrderInfoControls({ sectionStyles, onChange }) {
  const update = (field, value) => {
    onChange(prev => ({
      ...prev,
      orderInfo: {
        ...prev.orderInfo,
        [field]: value
      }
    }));
  };

  return (
    <div className="space-y-2">
      <h4 className="text-md font-semibold border-b pb-1">Order Info Styling</h4>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={sectionStyles.orderInfo.labelBold}
          onChange={e => update('labelBold', e.target.checked)}
        />
        Bold Labels (e.g. Order No, Date)
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={sectionStyles.orderInfo.valueBold}
          onChange={e => update('valueBold', e.target.checked)}
        />
        Bold Values (e.g. SO542, 09-Jul-2025)
      </label>
    </div>
  );
}
