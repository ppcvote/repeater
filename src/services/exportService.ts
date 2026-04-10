import PptxGenJS from 'pptxgenjs'
import type { Meeting, Photo } from './db'

export async function exportPPTX(meeting: Meeting): Promise<Blob> {
  const pptx = new PptxGenJS()

  pptx.layout = 'LAYOUT_WIDE'
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 })

  // Cover slide
  const cover = pptx.addSlide()
  cover.background = { color: '0D1B3E' }
  cover.addText(meeting.title, {
    x: 0.5, y: 2.0, w: 12, h: 1.5,
    fontSize: 36, fontFace: 'Microsoft JhengHei',
    color: 'F5C842', align: 'center', bold: true,
  })
  cover.addText(new Date(meeting.createdAt).toLocaleDateString('zh-TW'), {
    x: 0.5, y: 3.8, w: 12, h: 0.8,
    fontSize: 18, fontFace: 'Microsoft JhengHei',
    color: '9CA3AF', align: 'center',
  })
  cover.addText('Powered by Repeater', {
    x: 0.5, y: 6.5, w: 12, h: 0.5,
    fontSize: 12, color: '4B5563', align: 'center',
  })

  // Photo slides
  if (meeting.slides) {
    for (const slide of meeting.slides) {
      const s = pptx.addSlide()
      s.background = { color: '0D1B3E' }

      // Find photo blob
      const photo = meeting.photos.find((p: Photo) => p.id === slide.photoId)
      if (photo?.blob) {
        const base64 = await blobToBase64(photo.blob)
        s.addImage({
          data: base64,
          x: 0.3, y: 0.3, w: 8, h: 5.5,
          rounding: true,
        })
      }

      // Caption
      if (slide.aiCaption) {
        s.addText(slide.aiCaption, {
          x: 8.6, y: 0.5, w: 4.3, h: 3,
          fontSize: 14, fontFace: 'Microsoft JhengHei',
          color: 'F9FAFB', valign: 'top',
          wrap: true,
        })
      }

      // Timestamp
      const mins = Math.floor(slide.timestamp / 60)
      const secs = Math.floor(slide.timestamp % 60)
      s.addText(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, {
        x: 8.6, y: 5.5, w: 4.3, h: 0.5,
        fontSize: 12, color: '6B7280', align: 'right',
      })
    }
  }

  // Summary slide
  if (meeting.summaryKeyPoints?.length) {
    const sumSlide = pptx.addSlide()
    sumSlide.background = { color: '0D1B3E' }
    sumSlide.addText('重點摘要', {
      x: 0.5, y: 0.3, w: 12, h: 0.8,
      fontSize: 28, fontFace: 'Microsoft JhengHei',
      color: 'F5C842', bold: true,
    })
    const points = meeting.summaryKeyPoints.map(p => ({
      text: `• ${p}`,
      options: { fontSize: 16, color: 'F9FAFB', fontFace: 'Microsoft JhengHei', breakLine: true as const },
    }))
    sumSlide.addText(points, {
      x: 0.5, y: 1.3, w: 12, h: 5.5,
      valign: 'top',
    })
  }

  const blob = await pptx.write({ outputType: 'blob' }) as Blob
  return blob
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
