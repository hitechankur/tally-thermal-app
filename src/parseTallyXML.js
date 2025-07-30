// src/parseTallyXML.js

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

    // Helper to parse item details from different inventory entry lists
    const parseItems = (tag) =>
      getAll(tag, voucher).map((el) => {
        const qty = parseQty(get('ACTUALQTY', el));
        const rate = parseFloat(get('RATE', el)?.split('/')[0] || 0).toFixed(2);
        const amount = Math.abs(parseFloat(get('AMOUNT', el) || 0)).toFixed(2);
        return { name: get('STOCKITEMNAME', el), qty, rate, amount };
      });

    // Collect items from all possible inventory lists
    const items = [
      ...parseItems('ALLINVENTORYENTRIES\\.LIST'),
      ...parseItems('INVENTORYENTRIESIN\\.LIST'),
      ...parseItems('INVENTORYENTRIESOUT\\.LIST'),
    ];

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
    const voucherType = get('VOUCHERTYPENAME').toUpperCase();
    let heading = 'DOCUMENT';
    if (voucherType.includes('SALES ORDER')) heading = 'SALES ORDER';
    else if (voucherType.includes('MATERIAL OUT') || voucherType.includes('DELIVERY')) heading = 'MATERIAL CHALLAN';
    else if (voucherType.includes('SALES')) heading = 'SALES INVOICE'; // Added for general sales

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