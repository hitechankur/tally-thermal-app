// 📁 File: src/generateEscPosCommands.js

/**
 * Converts a string to a Uint8Array using TextEncoder.
 * Handles common currency symbol replacement for thermal printers.
 * @param {string} text The text to encode.
 * @returns {Uint8Array} The encoded text.
 */
function encodeText(text) {
  // Replace Rupee symbol with "Rs." for thermal printer compatibility
  const processedText = text.replace(/₹/g, 'Rs. ');
  return new TextEncoder().encode(processedText);
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
  printLine(xmlData.company.name || "YOUR COMPANY NAME"); // Use xmlData.company.name
  setDoubleSize(false); // Reset double size after company name

  setBold(false); // Reset bold
  // Assuming company address is not directly in xmlData.company, adding placeholder
  printLine(xmlData.company.address || "Your Company Address"); // Add address if available in data
  printLine(xmlData.company.phone || ""); // Add phone if available
  printLine(""); // Empty line for spacing

  // 2. Invoice Type (Heading from parseTallyXML)
  setBold(true);
  printLine(xmlData.heading || "DOCUMENT");
  setBold(false);
  printLine("");

  // 3. Order Details
  setAlignment('left'); // Always left for details
  printLine(`Voucher No: ${xmlData.order.number || 'N/A'}`);
  printLine(`Date: ${xmlData.order.date || 'N/A'}`);
  printLine(`Entered By: ${xmlData.order.user || 'N/A'}`);
  printLine("");

  // 4. Party Details
  if (xmlData.party.name) {
    setBold(true);
    printLine("PARTY DETAILS:");
    setBold(false);
    printLine(xmlData.party.name);
    if (xmlData.party.address) {
      xmlData.party.address.split('\n').forEach(line => printLine(line));
    }
    if (xmlData.party.gstin) {
      printLine(`GSTIN: ${xmlData.party.gstin}`);
    }
    printLine("");
  }


  // 5. Items Table Header
  // Assuming a total print width of 42 characters for better layout on 80mm printers
  const TOTAL_PRINT_WIDTH = 42;
  const SNO_WIDTH = 3;
  const ITEM_NAME_COL_WIDTH = 20; // Adjusted width for item name
  const QTY_RATE_PART_WIDTH = 10; // Combined width for Qty and Rate
  const AMOUNT_COL_WIDTH = 8; // For Amount

  // Header Line: S.No Item Name         Qty Rate    Amount
  // S.No (3) | Item Name (20) | Qty/Rate (10) | Amount (8) = 3 + 20 + 10 + 8 + 3 spaces = 44 (adjusting TOTAL_PRINT_WIDTH)
  // Let's re-evaluate TOTAL_PRINT_WIDTH based on the new column widths
  const HEADER_LINE_SPACING = 3; // Spaces between S.No, Item Name, Qty/Rate, Amount
  const CALCULATED_TOTAL_PRINT_WIDTH = SNO_WIDTH + ITEM_NAME_COL_WIDTH + QTY_RATE_PART_WIDTH + AMOUNT_COL_WIDTH + HEADER_LINE_SPACING;

  printSeparator(settings.lineSeparator || '-', CALCULATED_TOTAL_PRINT_WIDTH);
  setAlignment('left');
  setBold(true);
  printLine(
    `${'S.No'.padEnd(SNO_WIDTH)} ` +
    `${'Item Name'.padEnd(ITEM_NAME_COL_WIDTH)} ` +
    `${'Qty/Rate'.padEnd(QTY_RATE_PART_WIDTH)} ` +
    `${'Amount'.padStart(AMOUNT_COL_WIDTH)}`
  );
  setBold(false);
  printSeparator(settings.lineSeparator || '-', CALCULATED_TOTAL_PRINT_WIDTH);

  // 6. Items List
  if (xmlData.items && xmlData.items.length > 0) {
    xmlData.items.forEach(item => {
      const sNo = String(item.sNo).padEnd(SNO_WIDTH);
      let itemName = item.name;
      const qty = String(item.qty);
      const rate = String(item.rate);
      const amount = String(item.amount);

      // First line: S.No and Item Name
      let currentItemNameLine = itemName.substring(0, ITEM_NAME_COL_WIDTH);
      printLine(`${sNo} ${currentItemNameLine}`);

      // If item name is longer, print remaining parts on subsequent lines, indented
      if (itemName.length > ITEM_NAME_COL_WIDTH) {
        let remainingItemName = itemName.substring(ITEM_NAME_COL_WIDTH);
        const indentForWrappedName = ' '.repeat(SNO_WIDTH + 1); // Indent to align with item name
        while (remainingItemName.length > 0) {
          let line = remainingItemName.substring(0, ITEM_NAME_COL_WIDTH);
          printLine(`${indentForWrappedName}${line}`);
          remainingItemName = remainingItemName.substring(ITEM_NAME_COL_WIDTH);
        }
      }

      // Second line: Indented Qty, Rate, Amount
      // Indentation to match the start of the item name column
      const itemDetailIndent = ' '.repeat(SNO_WIDTH + 1); // Indent to align with item name start

      // Construct Qty and Rate part
      const qtyRatePart = `${qty} x ${rate}`;
      // Calculate remaining space after indentation for qtyRatePart and amount
      const availableSpaceAfterIndent = CALCULATED_TOTAL_PRINT_WIDTH - itemDetailIndent.length;

      // Calculate space for qtyRatePart, ensuring it doesn't overflow
      let qtyRateDisplay = qtyRatePart.padEnd(QTY_RATE_PART_WIDTH);
      if (qtyRateDisplay.length > QTY_RATE_PART_WIDTH) {
        qtyRateDisplay = qtyRateDisplay.substring(0, QTY_RATE_PART_WIDTH);
      }

      // Calculate the padding for amount to align it to the right
      // Total characters on this line = QTY_RATE_PART_WIDTH + 1 (space) + AMOUNT_COL_WIDTH
      // Remaining space from availableSpaceAfterIndent
      const amountPadding = availableSpaceAfterIndent - QTY_RATE_PART_WIDTH - 1 - amount.length; // -1 for space between qtyRate and amount

      const amountPadded = ' '.repeat(Math.max(0, amountPadding)) + amount;

      printLine(`${itemDetailIndent}${qtyRateDisplay} ${amountPadded}`);
      printLine(""); // Spacing after each item block
    });
  } else {
    printLine("No items found.");
  }
  printLine(""); // Spacing after items

  // 7. Totals
  printSeparator(settings.lineSeparator || '-', CALCULATED_TOTAL_PRINT_WIDTH); // Use consistent width
  setAlignment('right');
  printLine(`Sub Total: ${xmlData.totals.subtotal || '0.00'}`);
  if (parseFloat(xmlData.totals.cgst) > 0) printLine(`CGST: ${xmlData.totals.cgst}`);
  if (parseFloat(xmlData.totals.sgst) > 0) printLine(`SGST: ${xmlData.totals.sgst}`);
  if (parseFloat(xmlData.totals.igst) > 0) printLine(`IGST: ${xmlData.totals.igst}`);

  setBold(true);
  setDoubleSize(true);
  printLine(`GRAND TOTAL: Rs. ${xmlData.totals.total || '0.00'}`); // Changed to "Rs."
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

  // NEW: 9. Narration
  if (xmlData.narration) {
    printSeparator(settings.lineSeparator || '-', CALCULATED_TOTAL_PRINT_WIDTH); // Use consistent width
    setAlignment('left');
    setBold(true);
    printLine("Narration:");
    setBold(false);
    // Split narration into lines if it's too long for a single line
    const MAX_NARRATION_LINE_LENGTH = CALCULATED_TOTAL_PRINT_WIDTH; // Or adjust as needed
    let currentNarration = xmlData.narration;
    while (currentNarration.length > 0) {
      let line = currentNarration.substring(0, MAX_NARRATION_LINE_LENGTH);
      printLine(line);
      currentNarration = currentNarration.substring(MAX_NARRATION_LINE_LENGTH);
    }
    printLine("");
  }


  // 10. Terms and Conditions (Placeholder from previous version)
  // If you have terms in your XML, you'd extract them in parseTallyXML
  // and then print them here.
  // For now, using a generic placeholder as it's not in your XML.
  printSeparator(settings.lineSeparator || '-', CALCULATED_TOTAL_PRINT_WIDTH); // Use consistent width
  setAlignment('center');
  printLine("Terms & Conditions:");
  setAlignment('left');
  printLine("Goods once sold cannot be returned or exchanged."); // Generic placeholder
  printLine("");


  // 11. Authorized Signatory
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
