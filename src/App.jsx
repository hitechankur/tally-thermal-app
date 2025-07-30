// 📁 File: src/App.jsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Controls from './Controls';
import PrintPreview from './PrintPreview';
import parseTallyXML from './parseTallyXML'; // Now expects a string

export default function App() {
  const [xmlData, setXmlData] = useState(null);
  const [status, setStatus] = useState('Ready. Please select a Tally XML file.');
  const [copyCount, setCopyCount] = useState(1);
  const [settings, setSettings] = useState({
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

  const printRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load settings and copyCount from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('tallyPrintSettings');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSettings(parsed);
      if (parsed.copyCount) setCopyCount(parsed.copyCount);
    }
  }, []);

  // Save copyCount to localStorage
  useEffect(() => {
    const saved = localStorage.getItem('tallyPrintSettings');
    const parsed = saved ? JSON.parse(saved) : {};
    parsed.copyCount = copyCount;
    localStorage.setItem('tallyPrintSettings', JSON.stringify(parsed));
  }, [copyCount]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('tallyPrintSettings', JSON.stringify({ ...settings, copyCount }));
  }, [settings]);

  // WebUSB Print Handler (memoized)
  const handleWebUSBPrint = useCallback(async () => {
    if (!printRef.current) return alert("Nothing to print");
    if (!('usb' in navigator)) return alert("WebUSB not supported");

    // Get the innerText from the PrintPreview component
    const text = printRef.current.innerText;
    const encoder = new TextEncoder(); // Encodes string to UTF-8 bytes
    const feed = new Uint8Array([0x0A, 0x0A, 0x0A]); // Line feeds
    const cut = new Uint8Array([0x1D, 0x56, 0x41, 0x00]); // Full cut command for ESC/POS

    try {
      console.log("[🖨] Requesting USB device...");
      // Request permission to access a USB device. Filters can be added for specific printers.
      const device = await navigator.usb.requestDevice({ filters: [] });
      await device.open(); // Open the device
      await device.selectConfiguration(1); // Select configuration (usually 1)
      await device.claimInterface(0); // Claim the first interface (usually 0)

      // Find the OUT endpoint for sending data
      const endpoint = device.configuration.interfaces[0].alternate.endpoints.find(e => e.direction === 'out');
      if (!endpoint) throw new Error("No OUT endpoint found on the device.");

      for (let i = 0; i < copyCount; i++) {
        console.log(`[🖨] Printing copy ${i + 1} of ${copyCount}`);
        // Send the encoded text to the printer
        await device.transferOut(endpoint.endpointNumber, encoder.encode(text));
        // Send line feeds for spacing
        await device.transferOut(endpoint.endpointNumber, feed);
        // Send the cut command
        await device.transferOut(endpoint.endpointNumber, cut);
      }

      await device.close(); // Close the device connection
      alert(`✅ Printed ${copyCount} copies successfully.`);
    } catch (err) {
      console.error("[❌ WebUSB Error] ", err);
      // Use alert for user feedback, as per your existing code
      alert("Printing failed: " + err.message);
    }
  }, [copyCount]); // Dependency array for useCallback

  // Ctrl+P or Cmd+P shortcut for printing
  useEffect(() => {
    const handleKeydown = (e) => {
      const isMac = navigator.platform.includes('Mac');
      const isPrintShortcut = (isMac && e.metaKey) || (!isMac && e.ctrlKey);
      if (isPrintShortcut && e.key.toLowerCase() === 'p') {
        e.preventDefault(); // Prevent browser's default print dialog
        handleWebUSBPrint();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [handleWebUSBPrint]); // Dependency array for useEffect

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      console.log("App: File selected:", file.name, "Size:", file.size, "Type:", file.type);
      setStatus(`Reading ${file.name}...`);
      const reader = new FileReader();

      reader.onload = (e) => {
        console.log("App: FileReader onload triggered.");
        const content = e.target.result; // <--- CHANGE HERE: Read as text string
        if (!content || content.length === 0) {
            console.error("App: FileReader read an empty or invalid string.");
            setXmlData(null);
            setStatus(`Error: File ${file.name} is empty or unreadable.`);
            return;
        }
        console.log("App: Content length:", content.length, "characters.");

        // Pass the text string directly to parseTallyXML
        const data = parseTallyXML(content); // <--- CHANGE HERE: Pass string
        if (data) {
          console.log("App: parseTallyXML returned data successfully.");
          setXmlData(data);
          setStatus(`Successfully parsed ${file.name}. Ready to print.`);
        } else {
          console.error("App: parseTallyXML returned null. Parsing failed.");
          setXmlData(null);
          setStatus(`Error: Failed to parse ${file.name}. Please check the XML format or encoding.`);
        }
      };
      reader.onerror = (e) => {
        console.error("App: FileReader error:", e);
        setXmlData(null);
        setStatus(`Error reading file: ${e.target.error.name} - ${e.target.error.message}`);
      };
      reader.readAsText(file); // <--- CHANGE HERE: Read as text
    } else {
        console.log("App: No file selected.");
    }
  };

  return (
    <div className="bg-gray-100 min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-800">Tally Thermal Print App</h1>
          <p className="text-gray-600">Upload a Sales Order XML and preview thermal print</p>
        </header>

        <div className="mb-6 text-center">
          <input type="file" accept=".xml" onChange={handleFileChange} ref={fileInputRef} className="hidden" />
          <button onClick={() => fileInputRef.current.click()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded">
            Upload XML File
          </button>
          <p className="mt-2 text-gray-700">{status}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Controls settings={settings} onSettingsChange={setSettings} />

          <div>
            <PrintPreview data={xmlData} settings={settings} printRef={printRef} />

            <div className="mt-6 p-4 bg-white shadow rounded">
              <label className="block font-medium text-sm text-gray-700 mb-1">Number of Copies (1–9)</label>
              <input
                type="number"
                min="1"
                max="9"
                value={copyCount}
                onChange={(e) =>
                  setCopyCount(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))
                }
                className="w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
              />

              <button
                onClick={handleWebUSBPrint}
                className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
              >
                Print with WebUSB
              </button>
              <p className="text-sm text-gray-500 text-center mt-2">Shortcut: Ctrl + P / Cmd + P</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}