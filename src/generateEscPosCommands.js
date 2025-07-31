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

  // --- Define consistent print width ---
  const TOTAL_RECEIPT_WIDTH = 42; // Adjust this based on your printer's max characters per line

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
  if (xmlData.company.name) {
    const companyName = xmlData.company.name;
    // For double-sized text, characters are typically 2x wider.
    // A very conservative estimate for double-size line length to prevent splitting mid-word.
    // Experiment with this value (e.g., 10, 12, 14) based on your printer.
    const DOUBLE_SIZE_CHARS_PER_LINE = 14; // This is a safe bet for most 80mm printers

    let remainingCompanyName = companyName;
    while (remainingCompanyName.length > 0) {
      let line = remainingCompanyName.substring(0, DOUBLE_SIZE_CHARS_PER_LINE);
      // Find last space to avoid cutting words
      const lastSpaceIndex = line.lastIndexOf(' ');
      if (lastSpaceIndex > -1 && lastSpaceIndex > 0 && line.length === DOUBLE_SIZE_CHARS_PER_LINE) {
        line = line.substring(0, lastSpaceIndex);
        remainingCompanyName = remainingCompanyName.substring(lastSpaceIndex + 1);
      } else {
        remainingCompanyName = remainingCompanyName.substring(DOUBLE_SIZE_CHARS_PER_LINE);
      }
      printLine(line.trim()); // Trim to remove leading/trailing spaces from wrapping
    }
  }
  setDoubleSize(false);
  setBold(false);

  if (xmlData.company.address) {
    xmlData.company.address.split('\n').forEach(line => printLine(line));
  }
  if (xmlData.company.phone) {
    printLine(xmlData.company.phone);
  }
  if (xmlData.company.gstin) {
    printLine(`GSTIN: ${xmlData.company.gstin}`);
  }
  printLine("");

  // 2. Invoice Type (Heading from parseTallyXML)
  printSeparator(settings.lineSeparator || '-', TOTAL_RECEIPT_WIDTH); // Separator BEFORE heading
  setAlignment('center');
  setBold(true);
  if (xmlData.heading) {
    printLine(xmlData.heading);
  }
  setBold(false);
  printSeparator(settings.lineSeparator || '-', TOTAL_RECEIPT_WIDTH); // Separator AFTER heading
  printLine("");

  // 3. Order Details
  setAlignment('left');

  // Voucher No
  setBold(settings.sectionStyles.orderInfo.labelBold);
  commands.push(...encodeText(`Voucher No: `));
  setBold(settings.sectionStyles.orderInfo.valueBold);
  printLine(`${xmlData.order.number || ''}`);

  // Date
  setBold(settings.sectionStyles.orderInfo.labelBold);
  commands.push(...encodeText(`Date: `));
  setBold(settings.sectionStyles.orderInfo.valueBold);
  printLine(`${xmlData.order.date || ''}`);

  // Entered By
  setBold(settings.sectionStyles.orderInfo.labelBold);
  commands.push(...encodeText(`Entered By: `));
  setBold(settings.sectionStyles.orderInfo.valueBold);
  printLine(`${xmlData.order.user || ''}`);
  setBold(false);
  printSeparator(settings.lineSeparator || '-', TOTAL_RECEIPT_WIDTH); // Separator AFTER Entered By
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
  const SNO_COL_WIDTH = 3;
  const ITEM_NAME_COL_WIDTH = TOTAL_RECEIPT_WIDTH - SNO_COL_WIDTH - 1; // Item name takes remaining width on first line
  const QTY_RATE_AMOUNT_LINE_INDENT = SNO_COL_WIDTH + 1; // Indent for Qty/Rate/Amount line

  // Print Header
  printSeparator(settings.lineSeparator || '-', TOTAL_RECEIPT_WIDTH);
  setAlignment('left');
  setBold(true);
  printLine(
    `${'S.No'.padEnd(SNO_COL_WIDTH)} ` +
    `${'Item Name'.padEnd(ITEM_NAME_COL_WIDTH)}`
  );
  // Calculate remaining space for Qty/Rate/Amount header on a new line
  const QTY_HEADER_WIDTH = 5;
  const RATE_HEADER_WIDTH = 8;
  const AMOUNT_HEADER_WIDTH = 8; // "Amount"
  const QTY_RATE_AMOUNT_HEADER_SPACING = TOTAL_RECEIPT_WIDTH - QTY_RATE_AMOUNT_LINE_INDENT - QTY_HEADER_WIDTH - RATE_HEADER_WIDTH - AMOUNT_HEADER_WIDTH;

  printLine(
    `${' '.repeat(QTY_RATE_AMOUNT_LINE_INDENT)}` + // Indent for second header line
    `${'Qty'.padEnd(QTY_HEADER_WIDTH)} ${'Rate'.padEnd(RATE_HEADER_WIDTH)} ${'Amount'.padStart(AMOUNT_HEADER_WIDTH)}`
  );
  setBold(false);
  printSeparator(settings.lineSeparator || '-', TOTAL_RECEIPT_WIDTH);

  // 6. Items List
  if (xmlData.items && xmlData.items.length > 0) {
    xmlData.items.forEach(item => {
      const sNo = String(item.sNo).padEnd(SNO_COL_WIDTH);
      let itemName = item.name;
      const qty = parseFloat(item.qty).toFixed(2);
      const rate = parseFloat(item.rate).toFixed(2);
      const amount = parseFloat(item.amount).toFixed(2);

      // First line: S.No and Item Name (bold)
      setBold(true); // Item name bold
      let currentItemNameLine = itemName.substring(0, ITEM_NAME_COL_WIDTH);
      printLine(`${sNo} ${currentItemNameLine}`);
      setBold(false); // Reset bold

      // If item name is longer, print remaining parts on subsequent lines, indented
      if (itemName.length > ITEM_NAME_COL_WIDTH) {
        let remainingItemName = itemName.substring(ITEM_NAME_COL_WIDTH);
        const indentForWrappedName = ' '.repeat(SNO_COL_WIDTH + 1); // Indent to align with item name
        while (remainingItemName.length > 0) {
          let line = remainingItemName.substring(0, TOTAL_RECEIPT_WIDTH - indentForWrappedName.length);
          printLine(`${indentForWrappedName}${line}`);
          remainingItemName = remainingItemName.substring(TOTAL_RECEIPT_WIDTH - indentForWrappedName.length);
        }
      }

      // Second line: Qty, Rate, Amount on one line, right-aligned
      // Format: "Qty: --- @ Rs. rate = Rs. Amount"
      const qtyRateAmountText = `Qty: ${qty} @ Rs. ${rate} = Rs. ${amount}`;

      // Calculate padding to right-align the entire line
      const paddingForRightAlign = Math.max(0, TOTAL_RECEIPT_WIDTH - qtyRateAmountText.length);
      printLine(' '.repeat(paddingForRightAlign) + qtyRateAmountText);
      printLine(""); // Spacing after each item block
    });
  } else {
    printLine("No items found.");
  }
  printLine(""); // Spacing after items

  // 7. Totals
  printSeparator(settings.lineSeparator || '-', TOTAL_RECEIPT_WIDTH);
  setAlignment('right');
  printLine(`Sub Total: ${xmlData.totals.subtotal || '0.00'}`);
  if (parseFloat(xmlData.totals.cgst) > 0) printLine(`CGST: ${xmlData.totals.cgst}`);
  if (parseFloat(xmlData.totals.sgst) > 0) printLine(`SGST: ${xmlData.totals.sgst}`);
  if (parseFloat(xmlData.totals.igst) > 0) printLine(`IGST: ${xmlData.totals.igst}`);

  setBold(true);
  printLine(`TOTAL: Rs. ${xmlData.totals.total || '0.00'}`);
  setBold(false);
  printLine("");

  // 8. Amount in Words
  if (xmlData.amountInWords) {
    setAlignment('left');
    printLine(`Amount in Words:`);
    setBold(true);
    printLine(xmlData.amountInWords);
    setBold(false);
    printLine("");
  }

  // 9. Narration (Remarks)
  if (xmlData.narration) {
    printSeparator(settings.lineSeparator || '-', TOTAL_RECEIPT_WIDTH);
    setAlignment('center'); // Centrally aligned
    setBold(true);
    printLine("Remarks:"); // Changed heading to "Remarks"
    setBold(false);
    setAlignment('left'); // Reset to left for narration content
    // Split narration into lines if it's too long for a single line
    let currentNarration = xmlData.narration;
    while (currentNarration.length > 0) {
      let line = currentNarration.substring(0, TOTAL_RECEIPT_WIDTH);
      printLine(line);
      currentNarration = currentNarration.substring(TOTAL_RECEIPT_WIDTH);
    }
    printSeparator(settings.lineSeparator || '-', TOTAL_RECEIPT_WIDTH); // Separator AFTER Remarks content
    printLine("");
  }

  // 10. Terms and Conditions
  if (xmlData.termsAndConditions) {
    printSeparator(settings.lineSeparator || '-', TOTAL_RECEIPT_WIDTH);
    setAlignment('center');
    printLine("Terms & Conditions:");
    setAlignment('left');
    let currentTerms = xmlData.termsAndConditions;
    while (currentTerms.length > 0) {
      let line = currentTerms.substring(0, TOTAL_RECEIPT_WIDTH);
      printLine(line);
      currentTerms = currentTerms.substring(TOTAL_RECEIPT_WIDTH);
    }
    printLine("");
  }


  // 11. Authorized Signatory
  if (xmlData.authorizedSignatory) {
    setAlignment('right');
    printLine("");
    printLine("");
    printLine(xmlData.authorizedSignatory);
    printLine("");
  }

  // 12. Thank you message
  setAlignment('center');
  printLine("Thank you for your business!");
  printLine("");

  // Add extra line feeds at the end for paper to come out
  commands.push(LF, LF, LF, LF, LF);

  // Full cut (GS V 0)
  commands.push(GS, 0x56, 0x00);

  return new Uint8Array(commands);
}
