/**
 * Formats a date string (ISO YYYY-MM-DD or standard JS Date string) 
 * to 'dd-MMM-yyyy' format (e.g., 25-Mar-2025).
 */
export const formatDisplayDate = (dateInput: string | Date | null | undefined): string => {
  if (!dateInput) return '';
  
  let date: Date;
  
  if (typeof dateInput === 'string') {
    // Handle ISO date format YYYY-MM-DD specifically to avoid timezone shifts
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      const [year, month, day] = dateInput.split('-').map(Number);
      date = new Date(year, month - 1, day);
    } else {
      date = new Date(dateInput);
    }
  } else {
    date = dateInput;
  }

  if (isNaN(date.getTime())) return typeof dateInput === 'string' ? dateInput : '';

  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleString('en-GB', { month: 'short' });
  const year = date.getFullYear();
  
  return `${day}-${month}-${year}`;
};

/**
 * Formats a timestamp (like SQLite CURRENT_TIMESTAMP) to 'dd-MMM-yyyy HH:mm'
 */
export const formatDisplayDateTime = (dateInput: string | Date | null | undefined): string => {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return typeof dateInput === 'string' ? dateInput : '';

  const datePart = formatDisplayDate(date);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${datePart} ${hours}:${minutes}`;
};
