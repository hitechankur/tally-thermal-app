// 📁 File: src/generateEscPosCommands.js

/**
 * Converts a string to a Uint8Array using TextEncoder.
 * @param {string} text The text to encode.
 * @returns {Uint8Array} The encoded text.
 */
function encodeText(text) {
  return new TextEncoder().encode(text);
}

/**
 * Converts an image URL to a monochrome bitmap and generates ESC/POS commands.
 * @param {string} imageUrl The URL of the image to print.
 * @param {number} printerDPI The resolution of the printer in DPI (e.g., 203).
 * @param {number} targetWidthPx The desired width of the image in pixels on the printout (e.g., 384 for 80mm paper).
 * @returns {Promise<Uint8Array>} A promise that resolves with the ESC/POS commands for the image.
 */
async function printImage(imageUrl, printerDPI, targetWidthPx = 384) {
  if (!imageUrl) {
    return new Uint8Array();
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous'; // Required for loading images from different origins
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Calculate aspect ratio to maintain image proportions
      const aspectRatio = img.width / img.height;
      const displayWidth = targetWidthPx;
      const displayHeight = Math.round(targetWidthPx / aspectRatio);

      canvas.width = displayWidth;
      canvas.height = displayHeight;

      ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data; // RGBA pixel data

      const commands = [];
      const ESC = 0x1B;
      const GS = 0x1D;

      // GS v 0 commands for raster bit image
      // GS v 0 m xL xH yL yH d1...dk
      // m = 0 (normal 8-dot single density)
      // xL, xH = width in bytes (xL + xH*256)
      // yL, yH = height in dots (yL + yH*256)
      // d1...dk = bitmap data

      // Convert to monochrome bitmap (1-bit per pixel)
      // Each byte represents 8 pixels.
      const bytesPerRow = Math.ceil(displayWidth / 8);
      const bitmapData = new Uint8Array(bytesPerRow * displayHeight);

      for (let y = 0; y < displayHeight; y++) {
        for (let x = 0; x < displayWidth; x++) {
          const pixelIndex = (y * displayWidth + x) * 4; // RGBA
          const r = data[pixelIndex];
          const g = data[pixelIndex + 1];
          const b = data[pixelIndex + 2];

          // Simple luminance calculation for monochrome conversion
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
          // Thresholding: if luminance is below 128, it's black (1), otherwise white (0)
          // For thermal printers, 1 usually means print (black), 0 means don't print (white)
          if (luminance < 128) {
            const bytePosition = Math.floor(x / 8);
            const bitPosition = 7 - (x % 8); // Bits are ordered from MSB to LSB
            bitmapData[y * bytesPerRow + bytePosition] |= (1 << bitPosition);
          }
        }
      }

      // Add GS v 0 command
      commands.push(GS, 0x76, 0x30); // GS v 0
      commands.push(0x00); // m = 0 (normal 8-dot single density)
      commands.push(bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF); // xL, xH (width in bytes)
      commands.push(displayHeight & 0xFF, (displayHeight >> 8) & 0xFF); // yL, yH (height in dots)
      commands.push(...Array.from(bitmapData)); // Bitmap data

      resolve(new Uint8Array(commands));
    };

    img.onerror = (e) => {
      console.error("Error loading image for ESC/POS:", imageUrl, e);
      resolve(new Uint8Array()); // Resolve with empty commands on error
    };

    img.src = imageUrl;
  });
}


/**
 * Generates ESC/POS commands for printing a Tally sales order.
 * This function assumes a specific structure for `xmlData` and maps
 * `settings` to basic ESC/POS commands.
 *
 * @param {object} xmlData - The parsed Tally XML data.
 * @param {object} settings - User-defined print settings.
 * @returns {Promise<Uint8Array>} The complete sequence of ESC/POS commands.
 */
export default async function generateEscPosCommands(xmlData, settings) {
  if (!xmlData) {
    console.warn("No XML data provided for ESC/POS command generation.");
    return new Uint8Array();
  }

  const commands = [];

  // ESC/POS Commands (common ones)
  const ESC = 0x1B;
  const GS = 0x1D;
  const LF = 0x0A; // Line Feed

  // Initialize printer (clears settings)
  commands.push(ESC, 0x40); // ESC @

  // --- Helper Functions for ESC/POS Formatting ---

  /**
   * Sets text alignment.
   * @param {'left'|'center'|'right'} alignment
   */
  function setAlignment(alignment) {
    let mode = 0x00; // Left
    if (alignment === 'center') mode = 0x01;
    if (alignment === 'right') mode = 0x02;
    commands.push(ESC, 0x61, mode); // ESC a n
  }

  /**
   * Sets bold mode.
   * @param {boolean} enable
   */
  function setBold(enable) {
    commands.push(ESC, 0x45, enable ? 0x01 : 0x00); // ESC E n
  }

  /**
   * Sets double height/width.
   * @param {boolean} enable
   */
  function setDoubleSize(enable) {
    // ESC ! n (n combines font A/B, double height/width)
    // 0x00 = Font A, normal
    // 0x01 = Font B, normal
    // 0x10 = Double height
    // 0x20 = Double width
    // 0x30 = Double height & width
    let mode = 0x00; // Normal Font A
    if (enable) {
      mode = 0x30; // Double height and double width
    }
    commands.push(ESC, 0x21, mode); // ESC ! n
  }

  /**
   * Prints text and adds a line feed.
   * @param {string} text
   */
  function printLine(text) {
    commands.push(...encodeText(text), LF);
  }

  /**
   * Prints a separator line.
   * @param {string} char The character to repeat.
   * @param {number} width The approximate width of the thermal paper (e.g., 32 or 48 characters).
   */
  function printSeparator(char, width = 32) {
    printLine(char.repeat(width));
  }

  // --- Start Generating Commands ---

  // 0. Print Logo (if provided)
  if (settings.logoUrl) {
    setAlignment('center'); // Center logo
    const logoCommands = await printImage(settings.logoUrl, 203, 384); // 203 DPI, target width 384px (common for 80mm printers)
    commands.push(...Array.from(logoCommands));
    printLine(""); // Add a line break after logo
  }

  // 1. Company Header (based on settings.headerAlignment)
  setAlignment(settings.headerAlignment);
  setBold(true);
  setDoubleSize(true);
  printLine(xmlData.companyName || "YOUR COMPANY NAME");
  setDoubleSize(false); // Reset double size after company name

  setBold(false); // Reset bold
  printLine(xmlData.companyAddress || "Your Company Address");
  if (xmlData.companyPhone) {
    printLine(xmlData.companyPhone);
  }
  printLine(""); // Empty line for spacing

  // 2. Invoice Type
  setBold(true);
  printLine(xmlData.invoiceType || "INVOICE");
  setBold(false);
  printLine("");

  // 3. Invoice Details
  setAlignment('left'); // Always left for details
  printLine(`Invoice No: ${xmlData.invoiceNumber || 'N/A'}`);
  printLine(`Date: ${xmlData.invoiceDate || 'N/A'}`);
  printLine("");

  // 4. Customer Details
  setBold(true);
  printLine("CUSTOMER:");
  setBold(false);
  printLine(xmlData.customerName || "Walk-in Customer");
  if (xmlData.customerAddress) {
    // Handle multi-line address
    xmlData.customerAddress.split('\n').forEach(line => printLine(line));
  }
  printLine("");

  // 5. Items Table Header
  printSeparator(settings.lineSeparator || '-', 32);
  setBold(true);
  // Adjust column widths based on typical thermal printer width (e.g., 32 or 48 chars)
  // S.No | Item Name        | Qty | Rate | Amount
  // 4    | 16               | 4   | 6    | 8    (example for 38 char width)
  printLine("S.No Item Name         Qty Rate    Amount"); // Adjust spacing as needed
  setBold(false);
  printSeparator(settings.lineSeparator || '-', 32);

  // 6. Items List
  if (xmlData.items && xmlData.items.length > 0) {
    xmlData.items.forEach(item => {
      // Basic formatting for items - might need more sophisticated column alignment
      // For simplicity, just print each detail on a new line or concatenated
      printLine(`${item.sNo}. ${item.name}`);
      printLine(`   Qty: ${item.quantity}  Rate: ${item.rate}  Amt: ${item.amount}`);
      printLine(""); // Spacing between items
    });
  } else {
    printLine("No items found.");
    printLine("");
  }

  // 7. Totals
  printSeparator(settings.lineSeparator || '-', 32);
  setAlignment('right');
  printLine(`Sub Total: ${xmlData.subTotal || '0.00'}`);
  if (xmlData.taxDetails && xmlData.taxDetails.length > 0) {
    xmlData.taxDetails.forEach(tax => {
      printLine(`${tax.name}: ${tax.amount}`);
    });
  }
  setBold(true);
  setDoubleSize(true);
  printLine(`GRAND TOTAL: ${xmlData.grandTotal || '0.00'}`);
  setDoubleSize(false);
  setBold(false);
  printLine("");

  // 8. Amount in Words
  setAlignment('left');
  printLine(`Amount in Words:`);
  setBold(true);
  printLine(xmlData.amountInWords || "Zero Only");
  setBold(false);
  printLine("");

  // 9. Terms and Conditions
  if (xmlData.termsAndConditions) {
    printSeparator(settings.lineSeparator || '-', 32);
    setAlignment('center');
    printLine("Terms & Conditions:");
    setAlignment('left');
    printLine(xmlData.termsAndConditions);
    printLine("");
  }

  // 10. Authorized Signatory
  setAlignment('right');
  printLine("");
  printLine("");
  printLine(xmlData.authorizedSignatory || "Authorized Signatory");
  printLine("");

  // Add extra line feeds at the end for paper to come out
  commands.push(LF, LF, LF, LF, LF);

  // Full cut (GS V 0)
  commands.push(GS, 0x56, 0x00);

  return new Uint8Array(commands);
}
