// 📁 File: src/parseTallyXML.js

export default function parseTallyXML(xmlString) {
  try {
    // This line is crucial for handling the invalid &#4; character from Tally
    const cleaned = xmlString.replace(/&#4;/g, '');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(cleaned, 'application/xml');
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      const errorText = parseError.textContent || 'Unknown XML parsing error.';
      console.error('DOMParser Error:', errorText);
      throw new Error('Invalid XML format: ' + errorText);
    }

    const voucher = xmlDoc.querySelector('VOUCHER');
    if (!voucher) throw new Error('<VOUCHER> element not found in XML.');

    // Helper functions to get text content from elements
    const get = (tag, node = voucher) => node.querySelector(tag)?.textContent?.trim() || '';
    const getAll = (tag, node = voucher) => Array.from(node.querySelectorAll(tag));

    // Company name is usually in SVCURRENTCOMPANY under REQUESTDESC
    const companyElement = xmlDoc.querySelector('REQUESTDESC > STATICVARIABLES > SVCURRENTCOMPANY');
    const companyName = companyElement?.textContent?.trim() || '';

    // Address handling (using BASICBUYERADDRESS.LIST as in your original code)
    const address = getAll('BASICBUYERADDRESS\\.LIST > BASICBUYERADDRESS', voucher)
      .map(a => a.textContent.trim())
      .join('\n');

    // Helper to parse quantity (e.g., "10 NOS" -> "10")
    const parseQty = (qtyStr) => {
      const [qty] = qtyStr.trim().split(' ');
      return isNaN(parseFloat(qty)) ? '0' : qty;
    };

    // Helper to parse item details from a specific inventory entry list
    // This now expects a NodeList (or array) of elements, not a single element
    const parseItemsFromList = (listElements) => {
      if (!listElements || listElements.length === 0) return [];
      return Array.from(listElements).map((el) => { // Ensure it's iterable
        const qty = parseQty(get('ACTUALQTY', el));
        const rate = parseFloat(get('RATE', el)?.split('/')[0] || 0).toFixed(2);
        const amount = Math.abs(parseFloat(get('AMOUNT', el) || 0)).toFixed(2); // Use Math.abs for amount
        return { name: get('STOCKITEMNAME', el), qty, rate, amount };
      });
    };

    let items = [];
    const voucherTypeName = get('VOUCHERTYPENAME').toUpperCase();
    const objView = get('OBJVIEW').toUpperCase();

    // --- Conditional Item Parsing Logic ---
    if (voucherTypeName.includes('STOCK JOURNAL') || objView.includes('CONSUMPTION VOUCHER VIEW')) {
      // For Stock Journal, prioritize INVENTORYENTRIESOUT.LIST
      // These usually represent the items being "transferred out" or "produced".
      const inventoryEntriesOut = getAll('INVENTORYENTRIESOUT\\.LIST', voucher); // Use getAll
      items = parseItemsFromList(inventoryEntriesOut);
    } else if (voucherTypeName.includes('SALES ORDER') || voucherTypeName.includes('SALES')) {
      // For Sales Orders/Sales, prioritize ALLINVENTORYENTRIES.LIST
      // If empty, fall back to INVENTORYENTRIESOUT.LIST
      const allInventoryEntries = getAll('ALLINVENTORYENTRIES\\.LIST', voucher); // Use getAll
      items = parseItemsFromList(allInventoryEntries);
      if (items.length === 0) {
        const inventoryEntriesOut = getAll('INVENTORYENTRIESOUT\\.LIST', voucher); // Use getAll
        items = parseItemsFromList(inventoryEntriesOut);
      }
    } else if (voucherTypeName.includes('MATERIAL OUT') || voucherTypeName.includes('DELIVERY')) {
      // For Material Out/Delivery, prioritize INVENTORYENTRIESOUT.LIST
      // If empty, fall back to ALLINVENTORYENTRIES.LIST
      const inventoryEntriesOut = getAll('INVENTORYENTRIESOUT\\.LIST', voucher); // Use getAll
      items = parseItemsFromList(inventoryEntriesOut);
      if (items.length === 0) {
        const allInventoryEntries = getAll('ALLINVENTORYENTRIES\\.LIST', voucher); // Use getAll
        items = parseItemsFromList(allInventoryEntries);
      }
    } else {
      // Fallback for other or unknown voucher types: combine all
      const allInventoryEntries = getAll('ALLINVENTORYENTRIES\\.LIST', voucher); // Use getAll
      const inventoryEntriesIn = getAll('INVENTORYENTRIESIN\\.LIST', voucher); // Use getAll
      const inventoryEntriesOut = getAll('INVENTORYENTRIESOUT\\.LIST', voucher); // Use getAll

      items = [
        ...parseItemsFromList(allInventoryEntries),
        ...parseItemsFromList(inventoryEntriesIn),
        ...parseItemsFromList(inventoryEntriesOut),
      ];
    }

    // Assign sNo after the final items list is determined
    items.forEach((item, index) => {
      item.sNo = index + 1;
    });

    const subtotal = items.reduce((sum, i) => sum + parseFloat(i.amount), 0);

    // Extract Ledger Entries for GST and Total
    const ledgerEntries = getAll('LEDGERENTRIES\\.LIST', voucher);
    const findAmount = (ledgerName) => {
      const entry = ledgerEntries.find((n) => get('LEDGERNAME', n) === ledgerName);
      return parseFloat(entry?.querySelector('AMOUNT')?.textContent || 0);
    };

    const igst = findAmount('IGST');
    const cgst = findAmount('CGST');
    const sgst = findAmount('SGST') || findAmount('SGST/UTGST'); // Handle both SGST and SGST/UTGST

    // Find the party ledger entry for the total amount
    const partyAmountEntry = ledgerEntries.find((n) => get('ISPARTYLEDGER', n) === 'Yes');
    const total = partyAmountEntry
      ? Math.abs(parseFloat(get('AMOUNT', partyAmountEntry) || 0)).toFixed(2)
      : subtotal.toFixed(2); // Fallback to subtotal if party ledger not found

    // Determine heading based on voucher type
    let heading = 'DOCUMENT';
    if (voucherTypeName.includes('SALES ORDER')) heading = 'SALES ORDER';
    else if (voucherTypeName.includes('MATERIAL OUT') || voucherTypeName.includes('DELIVERY')) heading = 'MATERIAL CHALLAN';
    else if (voucherTypeName.includes('SALES')) heading = 'SALES INVOICE'; // Added for general sales
    else if (voucherTypeName.includes('STOCK JOURNAL')) heading = 'STOCK JOURNAL'; // Specific for Stock Journal

    // Narration (if present)
    const narration = get('NARRATION') || '';

    return {
      heading,
      company: { name: companyName, gstin: get('CMPGSTIN') },
      order: {
        number: get('VOUCHERNUMBER'),
        date: formatDate(get('DATE')), // Use the local formatDate helper
        user: get('ENTEREDBY'),
      },
      party: {
        name: get('PARTYNAME'),
        address,
        gstin: get('PARTYGSTIN'),
      },
      items,
      totals: {
        subtotal: subtotal.toFixed(2),
        igst: igst.toFixed(2),
        cgst: cgst.toFixed(2),
        sgst: sgst.toFixed(2),
        total,
      },
      narration,
    };
  } catch (err) {
    console.error('XML Parse Error (DOMParser):', err);
    return null;
  }
}

// Local helper function for date formatting
function formatDate(d) {
  return d ? `${d.slice(6, 8)}-${d.slice(4, 6)}-${d.slice(0, 4)}` : '';
}

/**
 * Converts a number to Indian Rupee words (simplified).
 * This is a basic implementation and may not cover all edge cases.
 * @param {number} num The number to convert.
 * @returns {string} The number in words.
 */
function convertNumberToWords(num) {
  const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const c = ['hundred', 'thousand', 'lakh', 'crore'];

  function inWords(n) {
    let s = '';
    if (n < 20) {
      s = a[n];
    } else {
      s = b[Math.floor(n / 10)] + ' ' + a[n % 10];
    }
    return s;
  }

  let n = num.toFixed(2).toString().split('.');
  let rupee = parseFloat(n[0]);
  let paisa = parseFloat(n[1]);

  let str = '';
  let parts = [];

  if (rupee === 0) {
    str += 'Zero ';
  } else {
    if (rupee >= 10000000) { // Crores
      parts.push(inWords(Math.floor(rupee / 10000000)) + 'crore ');
      rupee %= 10000000;
    }
    if (rupee >= 100000) { // Lakhs
      parts.push(inWords(Math.floor(rupee / 100000)) + 'lakh ');
      rupee %= 100000;
    }
    if (rupee >= 1000) { // Thousands
      parts.push(inWords(Math.floor(rupee / 1000)) + 'thousand ');
      rupee %= 1000;
    }
    if (rupee >= 100) { // Hundreds
      parts.push(inWords(Math.floor(rupee / 100)) + 'hundred ');
      rupee %= 100;
    }
    if (rupee > 0) {
      parts.push(inWords(rupee));
    }
    str += parts.join('').trim();
  }

  str += ' Rupees';

  if (paisa > 0) {
    str += ' and ' + inWords(paisa) + ' Paisa';
  }

  return str.trim() + ' Only';
}
