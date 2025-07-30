// src/OrderInfoControls.jsx

import React from 'react';

export default function OrderInfoControls({ sectionStyles, onChange }) {
  const update = (field, value) => {
    // This 'onChange' is the prop coming from Controls.jsx.
    // Controls.jsx expects an object like { orderInfo: { ... } }
    onChange({
      orderInfo: {
        ...sectionStyles.orderInfo, // Start with the current orderInfo state
        [field]: value // Override the specific field that was changed
      }
    });
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200"> {/* Added some styling for better visual separation */}
      <h4 className="text-md font-semibold border-b pb-1">Order Info Styling</h4>

      <label className="flex items-center gap-2 mt-2">
        <input
          type="checkbox"
          checked={sectionStyles.orderInfo.labelBold}
          onChange={e => update('labelBold', e.target.checked)}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        Bold Labels (e.g. Order No, Date)
      </label>

      <label className="flex items-center gap-2 mt-2">
        <input
          type="checkbox"
          checked={sectionStyles.orderInfo.valueBold}
          onChange={e => update('valueBold', e.target.checked)}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        Bold Values (e.g. SO542, 09-Jul-2025)
      </label>
    </div>
  );
}