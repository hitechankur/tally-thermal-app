import React from 'react';

function formatINR(value) {
  const number = parseFloat(value);
  return isNaN(number) ? '' : `₹${number.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

export default function PrintPreview({ data, settings, printRef }) {
  if (!data) {
    return (
      <div className="p-8 border-2 border-dashed rounded-lg text-gray-500 bg-gray-50 flex items-center justify-center h-full">
        <p>Upload a Tally XML file to see the preview.</p>
      </div>
    );
  }

  const separator = settings.lineSeparator.repeat(40);

  return (
    <div
      ref={printRef}
      className="p-4 bg-white shadow-lg rounded-lg font-mono text-black"
      style={{
        width: '302px',
        fontFamily: settings.fontFamily,
        fontSize: `${settings.fontSize}px`,
        lineHeight: settings.lineHeight
      }}
    >
      {settings.logoUrl && (
        <div className="flex justify-center mb-2">
          <img src={settings.logoUrl} alt="logo" className="max-w-[150px] max-h-20" onError={e => (e.target.style.display = 'none')} />
        </div>
      )}

      <div className={
        settings.headerAlignment === 'center'
          ? 'text-center'
          : settings.headerAlignment === 'right'
            ? 'text-right'
            : 'text-left'
      }>
        <h2 className="font-bold text-lg" style={{ fontSize: `${settings.fontSize * 1.2}px` }}>
          {data.company.name}
        </h2>
        {data.company.gstin && <p>GSTIN: {data.company.gstin}</p>}
      </div>

      <p>{separator}</p>
      <div className="text-center">
        <h3 className="font-bold">{data.heading}</h3>	
      </div>
      <p>{separator}</p>

      <div className="mb-2">
        <p>
          <span className={settings.sectionStyles.orderInfo.labelBold ? 'font-bold' : ''}>Order No: </span>
          <span className={settings.sectionStyles.orderInfo.valueBold ? 'font-bold' : ''}>{data.order.number}</span>
        </p>
        <p>
          <span className={settings.sectionStyles.orderInfo.labelBold ? 'font-bold' : ''}>Date: </span>
          <span className={settings.sectionStyles.orderInfo.valueBold ? 'font-bold' : ''}>{data.order.date}</span>
        </p>
        <p>
          <span className={settings.sectionStyles.orderInfo.labelBold ? 'font-bold' : ''}>User: </span>
          <span className={settings.sectionStyles.orderInfo.valueBold ? 'font-bold' : ''}>{data.order.user}</span>
        </p>
      </div>

      <p>{separator}</p>
      <div>
        <p className="font-bold">Bill To:</p>
        <p>{data.party.name}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}>{data.party.address}</p>
        <p>GSTIN: {data.party.gstin}</p>
      </div>

      <p>{separator}</p>
      <p className="font-bold">Item Details</p>
      <p>{separator}</p>
      {data.items.map((item, index) => (
        <div key={index}>
          <p className="font-bold">{`${index + 1}. ${item.name}`}</p>
          <div className="flex justify-between">
            <span>{`     ${item.qty} x ${formatINR(item.rate)} =`}</span>
            <span className="text-right">{formatINR(item.amount)}</span>
          </div>
        </div>
      ))}

      <p>{separator}</p>

      {/* Subtotal and Tax Block */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span className="text-right">{formatINR(data.totals.subtotal)}</span>
        </div>

        {/* Conditional tax rendering */}
        {parseFloat(data.totals.igst) > 0 ? (
          <div className="flex justify-between">
            <span>IGST:</span>
            <span className="text-right">{formatINR(data.totals.igst)}</span>
          </div>
        ) : (
          <>
            <div className="flex justify-between">
              <span>CGST:</span>
              <span className="text-right">{formatINR(data.totals.cgst)}</span>
            </div>
            <div className="flex justify-between">
              <span>SGST:</span>
              <span className="text-right">{formatINR(data.totals.sgst)}</span>
            </div>
          </>
        )}
      </div>

      <p>{separator}</p>

      {/* Grand Total */}
      <div className="font-bold flex justify-between">
        <span>TOTAL:</span>
        <span className="text-right">{formatINR(data.totals.total)}</span>
      </div>

      <p>{separator}</p>

      <div className="text-center text-sm mt-2">
  {data.narration && (
    <>

      <p className="font-bold mt-2">Remarks:</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{data.narration}</p>
       <p>{separator}</p>
    </>
  )}

        <p>Thank you for your business!</p>
      </div>
    </div>
  );
}
