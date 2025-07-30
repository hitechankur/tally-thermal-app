export default function parseTallyXML(xmlString) {
  try {
    const cleaned = xmlString.replace(/&#4;/g, '');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(cleaned, 'application/xml');
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) throw new Error('Invalid XML.');

    const voucher = xmlDoc.querySelector('VOUCHER');
    if (!voucher) throw new Error('<VOUCHER> not found.');

    const get = (tag, node = voucher) => node.querySelector(tag)?.textContent?.trim() || '';
    const getAll = (tag, node = voucher) => Array.from(node.querySelectorAll(tag));

    const company = xmlDoc.querySelector('SVCURRENTCOMPANY')?.textContent?.trim() || '';
    const address = getAll('BASICBUYERADDRESS\\.LIST > BASICBUYERADDRESS', voucher)
      .map(a => a.textContent.trim())
      .join('\n');

    const parseQty = (qtyStr) => {
      const [qty] = qtyStr.trim().split(' ');
      return isNaN(parseFloat(qty)) ? '0' : qty;
    };

    const parseItems = (tag) =>
      getAll(tag, voucher).map((el) => {
        const qty = parseQty(get('ACTUALQTY', el));
        const rate = parseFloat(get('RATE', el)?.split('/')[0] || 0).toFixed(2);
        const amount = Math.abs(parseFloat(get('AMOUNT', el) || 0)).toFixed(2);
        return { name: get('STOCKITEMNAME', el), qty, rate, amount };
      });

    const items = [
      ...parseItems('ALLINVENTORYENTRIES\\.LIST'),
      ...parseItems('INVENTORYENTRIESIN\\.LIST'),
      ...parseItems('INVENTORYENTRIESOUT\\.LIST'),
    ];

    const subtotal = items.reduce((sum, i) => sum + parseFloat(i.amount), 0);

    const ledgerEntries = getAll('LEDGERENTRIES\\.LIST', voucher);
    const findAmount = (ledgerName) => {
      const entry = ledgerEntries.find((n) => get('LEDGERNAME', n) === ledgerName);
      return parseFloat(entry?.querySelector('AMOUNT')?.textContent || 0);
    };

    const igst = findAmount('IGST');
    const cgst = findAmount('CGST');
    const sgst = findAmount('SGST') || findAmount('SGST/UTGST');

    const partyAmount = ledgerEntries.find((n) => get('ISPARTYLEDGER', n) === 'Yes');
    const total = partyAmount
      ? Math.abs(parseFloat(get('AMOUNT', partyAmount) || 0)).toFixed(2)
      : subtotal.toFixed(2);

    const voucherType = get('VOUCHERTYPENAME').toUpperCase();
    let heading = 'DOCUMENT';
    if (voucherType.includes('SALES ORDER')) heading = 'SALES ORDER';
    else if (voucherType.includes('MATERIAL OUT') || voucherType.includes('DELIVERY')) heading = 'MATERIAL CHALLAN';

    return {
      heading,
      company: { name: company, gstin: get('CMPGSTIN') },
      order: {
        number: get('VOUCHERNUMBER'),
        date: formatDate(get('DATE')),
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
      narration: get('NARRATION') || '',
    };
  } catch (err) {
    console.error('XML Parse Error:', err);
    return null;
  }
}

function formatDate(d) {
  return d ? `${d.slice(6, 8)}-${d.slice(4, 6)}-${d.slice(0, 4)}` : '';
}
