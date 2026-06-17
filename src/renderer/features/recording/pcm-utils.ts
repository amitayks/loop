export function mergeInt16Arrays(arrays: Int16Array[]): Int16Array {
  let totalLength = 0;
  for (const arr of arrays) totalLength += arr.length;
  const merged = new Int16Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    merged.set(arr, offset);
    offset += arr.length;
  }
  return merged;
}
