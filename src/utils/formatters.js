// src/utils/formatters.js

export function formatINR(value) {
  const number = parseFloat(value);
  // Check if the parsed number is valid. If not, return an empty string.
  // Otherwise, format it as Indian Rupees.
  return isNaN(number) ? '' : `₹${number.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}