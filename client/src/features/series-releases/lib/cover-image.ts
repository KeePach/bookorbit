/** Widest a stored cover is drawn; a poster this wide is already sharp on any phone. */
export const COVER_MAX_WIDTH = 480
export const COVER_JPEG_QUALITY = 0.82

/** The size a picture shrinks to so it is no wider than `maxWidth`, never larger than it is. */
export function fitWithin(width: number, height: number, maxWidth: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const scale = Math.min(1, maxWidth / width)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** An image file as a small inline jpeg, which is how an upcoming volume's cover is stored. */
export async function fileToCoverDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not-an-image')
  const bitmap = await createImageBitmap(file)
  try {
    const size = fitWithin(bitmap.width, bitmap.height, COVER_MAX_WIDTH)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no-canvas')
    // A transparent png would turn black as a jpeg.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size.width, size.height)
    context.drawImage(bitmap, 0, 0, size.width, size.height)
    return canvas.toDataURL('image/jpeg', COVER_JPEG_QUALITY)
  } finally {
    bitmap.close()
  }
}
