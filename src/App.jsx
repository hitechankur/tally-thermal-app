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
  const [isDragging, setIsDragging] = useState(false); // State for drag-and-drop visual feedback
  const [showCosmeticControls, setShowCosmeticControls] = useState(false); // New state for toggle

  const printRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load settings and copyCount from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('tallyPrintSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings(parsed);
        // Ensure copyCount is loaded correctly, with a fallback
        setCopyCount(parsed.copyCount ? Math.max(1, Math.min(9, parseInt(parsed.copyCount) || 1)) : 1);
      } catch (e) {
        console.error("Failed to parse settings from localStorage:", e);
        // Reset to default if parsing fails
        localStorage.removeItem('tallyPrintSettings');
      }
    }
  }, []);

  // Save settings (including copyCount) to localStorage whenever settings or copyCount changes
  useEffect(() => {
    localStorage.setItem('tallyPrintSettings', JSON.stringify({ ...settings, copyCount }));
  }, [settings, copyCount]);


  // WebUSB Print Handler (memoized)
  const handleWebUSBPrint = useCallback(async () => {
    if (!xmlData) { // Check if xmlData is loaded
      alert("Nothing to print. Please load an XML file first.");
      return;
    }
    if (!('usb' in navigator)) {
      alert("WebUSB not supported in this browser.");
      return;
    }

    // Get the innerText from the PrintPreview component
    const text = printRef.current.innerText;
    const encoder = new TextEncoder(); // Encodes string to UTF-8 bytes
    const feed = new Uint8Array([0x0A, 0x0A, 0x0A]); // Line feeds
    const cut = new Uint8Array([0x1D, 0x56, 0x41, 0x00]); // Full cut command for ESC/POS

    let device; // Declare device outside try-catch to ensure it's accessible in finally

    try {
      setStatus("[🖨] Requesting USB device...");
      console.log("[🖨] Requesting USB device...");

      // Request permission to access a USB device.
      // Filters are important to help the user select the correct device.
      // Replace with your printer's actual Vendor ID and Product ID.
      // You can find these in your OS device manager or by using tools like `lsusb` on Linux.
      const filters = []; // This should be empty for this test
      device = await navigator.usb.requestDevice({ filters: filters });

      await device.open(); // Open the device
      await device.selectConfiguration(1); // Select configuration (usually 1)
      await device.claimInterface(0); // Claim the first interface (usually 0)

      // Find the OUT endpoint for sending data
      const endpoint = device.configuration.interfaces[0].alternate.endpoints.find(e => e.direction === 'out');
      if (!endpoint) throw new Error("No OUT endpoint found on the device.");

      for (let i = 0; i < copyCount; i++) {
        setStatus(`[🖨] Printing copy ${i + 1} of ${copyCount}...`);
        console.log(`[🖨] Printing copy ${i + 1} of ${copyCount}`);
        // Send the encoded text to the printer
        await device.transferOut(endpoint.endpointNumber, encoder.encode(text));
        // Send line feeds for spacing
        await device.transferOut(endpoint.endpointNumber, feed);
        // Send the cut command
        await device.transferOut(endpoint.endpointNumber, cut);
      }

      setStatus(`✅ Printed ${copyCount} copies successfully.`);
      alert(`✅ Printed ${copyCount} copies successfully.`); // Use alert for user feedback
    } catch (err) {
      console.error("[❌ WebUSB Error] ", err);
      let errorMessage = "Printing failed: " + err.message;

      if (err.name === 'NotFoundError') {
        errorMessage = "Printing failed: No printer selected or found. Please ensure it's connected and select it from the prompt.";
      } else if (err.name === 'SecurityError' && err.message.includes('Access denied')) {
        errorMessage = "Printing failed: Access denied to USB device. Please ensure no other application is using it and grant browser permission.";
      } else if (err.message.includes('No OUT endpoint found')) {
          errorMessage = "Printing failed: Printer not configured correctly or not supported. No OUT endpoint found.";
      }

      setStatus(errorMessage);
      alert(errorMessage); // Use alert for user feedback
    } finally {
      if (device && device.opened) {
        try {
          // Release interface before closing device
          await device.releaseInterface(0);
          await device.close(); // Close the device connection
          console.log("[🖨] USB device closed.");
        } catch (closeErr) {
          console.error("Error closing USB device:", closeErr);
        }
      }
    }
  }, [copyCount, xmlData]); // Added xmlData to dependencies

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

  // --- File Input Handler ---
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      console.log("App: File selected:", file.name, "Size:", file.size, "Type:", file.type);
      setStatus(`Reading ${file.name}...`);
      const reader = new FileReader();

      reader.onload = (e) => {
        console.log("App: FileReader onload triggered.");
        const content = e.target.result; // Read as text string
        if (!content || content.length === 0) {
            console.error("App: FileReader read an empty or invalid string.");
            setXmlData(null);
            setStatus(`Error: File ${file.name} is empty or unreadable.`);
            return;
        }
        console.log("App: Content length:", content.length, "characters.");

        // Pass the text string directly to parseTallyXML
        const data = parseTallyXML(content); // Pass string
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
      reader.readAsText(file); // Read as text
    } else {
        console.log("App: No file selected.");
    }
  };

  // --- Drag and Drop Logic ---
  const handleDragOver = useCallback((e) => {
    e.preventDefault(); // Prevent default to allow drop
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0]; // Assuming only one XML file is dropped
      // Basic validation for XML file type
      if (file.type === 'application/xml' || file.name.toLowerCase().endsWith('.xml')) {
        setStatus(`Reading dropped file: ${file.name}...`);
        const reader = new FileReader();
        reader.onload = (event) => {
          const rawXmlString = event.target.result;
          if (!rawXmlString || rawXmlString.length === 0) {
            setStatus(`Error: Dropped file ${file.name} is empty or unreadable.`);
            setXmlData(null);
            return;
          }
          const parsedData = parseTallyXML(rawXmlString);
          if (parsedData) {
            setXmlData(parsedData);
            setStatus(`Successfully parsed dropped file: ${file.name}. Ready to print.`);
          } else {
            setStatus(`Error: Failed to parse dropped XML file: ${file.name}. Please check the XML format or encoding.`);
            setXmlData(null);
          }
        };
        reader.onerror = () => {
          setStatus(`Error reading dropped file: ${file.name}`);
        };
        reader.readAsText(file); // Read the file as a plain text string
      } else {
        setStatus('Please drop a valid XML file (.xml).');
      }
    }
  }, []);


  return (
    <div className="bg-gray-100 min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-800">Tally Thermal Print App</h1>
          <p className="text-gray-600">Upload a Sales Order XML and preview thermal print</p>
        </header>

        {/* Container 1: Drag and Drop + File Upload */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              mb-6 p-8 border-2 border-dashed rounded-lg text-center
              transition-all duration-300 ease-in-out
              ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}
            `}
          >
            <p className="text-gray-600 text-lg font-semibold">
              Drag & Drop your XML file here
            </p>
            <p className="text-sm text-gray-500 mt-2">
              (or use the button below)
            </p>
          </div>

          <div className="text-center">
            <input type="file" accept=".xml" onChange={handleFileChange} ref={fileInputRef} className="hidden" />
            <button onClick={() => fileInputRef.current.click()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded">
              Upload XML File
            </button>
            <p className="mt-2 text-gray-700">{status}</p>
          </div>
        </div>

        {/* Grid for Controls (Left) and Preview (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Container 3: Print Controls & Cosmetic Controls */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            {/* Print Controls */}
            <h2 className="text-xl font-bold text-gray-800 mb-4">Print Controls</h2>
            <div className="mb-6">
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

            {/* Cosmetic Controls (Toggleable) */}
            <h2 className="text-xl font-bold text-gray-800 mb-4 cursor-pointer flex items-center justify-between"
                onClick={() => setShowCosmeticControls(!showCosmeticControls)}>
              Cosmetic Controls
              <span className="text-gray-500 text-sm">
                {showCosmeticControls ? 'Hide ▲' : 'Show ▼'}
              </span>
            </h2>
            {showCosmeticControls && (
              <Controls settings={settings} onSettingsChange={setSettings} />
            )}
          </div>

          {/* Container 2: Print Preview */}
          <div>
            <PrintPreview data={xmlData} settings={settings} printRef={printRef} />
          </div>
        </div>
      </div>
    </div>
  );
}