/** DOS time and date fields used by zip local and central headers. */

export function dosDateTime(date) {
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

/** Writes the DOS time at timeOffset and the DOS date two bytes later. */
export function writeDosDateTime(buffer, timeOffset, date) {
  const { dosTime, dosDate } = dosDateTime(date);
  buffer.writeUInt16LE(dosTime, timeOffset);
  buffer.writeUInt16LE(dosDate, timeOffset + 2);
}
