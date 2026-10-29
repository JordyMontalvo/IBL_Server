import db from '../../../components/db'
import lib from '../../../components/lib'

const { Project } = db
const { error, success, midd, rand } = lib

// Vercel limits a function response to 4.5 MB, so larger PDFs could not be shown
const MAX_PDF = 4 * 1024 * 1024
const NO_PDF = { pdf: 0, parts: 0 }
const READY = { pending: { $ne: true } }

// each request carries only one part of the PDF (Vercel limits request bodies to 4.5 MB)
export const config = { api: { bodyParser: { sizeLimit: '3mb' } } }

export default async (req, res) => {
  await midd(req, res)

  if (req.method === 'GET') {
    return res.json(success({ projects: await Project.find(READY, NO_PDF) }))
  }

  if (req.method === 'POST') {
    const { action, id, name, location, fileName, index, data } = req.body

    // 1. create the project, the PDF arrives afterwards in parts
    if (action === 'start') {
      const cleanName = typeof name === 'string' ? name.trim() : ''
      const cleanLocation = typeof location === 'string' ? location.trim() : ''
      if (!cleanName) return res.json(error('Ingresa el nombre del proyecto'))
      if (!cleanLocation) return res.json(error('Ingresa la ubicación del proyecto'))

      const projectId = rand()
      await Project.insert({
        id: projectId,
        name: cleanName,
        location: cleanLocation,
        fileName: fileName || 'mapa.pdf',
        pending: true,
        parts: {},
        date: new Date(),
      })
      return res.json(success({ id: projectId }))
    }

    // 2. receive one part of the base64 PDF
    if (action === 'part') {
      const project = await Project.findOne({ id, pending: true })
      if (!project) return res.json(error('Proyecto no encontrado'))
      if (!Number.isInteger(index) || index < 0 || index > 20) return res.json(error('Parte no válida'))
      if (typeof data !== 'string' || !data) return res.json(error('Parte vacía'))

      await Project.update({ id }, { [`parts.${index}`]: data })
      return res.json(success())
    }

    // 3. join the parts, validate the PDF and publish the project
    if (action === 'finish') {
      const project = await Project.findOne({ id, pending: true })
      if (!project) return res.json(error('Proyecto no encontrado'))

      const parts = project.parts || {}
      const keys = Object.keys(parts).map(Number).sort((a, b) => a - b)
      if (!keys.length || keys.some((k, i) => k !== i)) {
        await Project.delete({ id })
        return res.json(error('La subida del PDF quedó incompleta. Intenta nuevamente.'))
      }

      const pdf = keys.map(k => parts[k]).join('')
      const buffer = Buffer.from(pdf, 'base64')

      if (buffer.slice(0, 5).toString() !== '%PDF-') {
        await Project.delete({ id })
        return res.json(error('El archivo debe ser un PDF válido'))
      }
      if (buffer.length > MAX_PDF) {
        await Project.delete({ id })
        return res.json(error('El PDF no debe superar los 4 MB'))
      }

      await Project.update({ id }, { pdf }, { parts: '', pending: '' })
    }

    else if (action === 'cancel') {
      await Project.delete({ id, pending: true })
    }

    else if (action === 'delete') {
      const project = await Project.findOne({ id })
      if (!project) return res.json(error('Proyecto no encontrado'))
      await Project.delete({ id })
    }

    else return res.json(error('Acción no válida'))

    return res.json(success({ projects: await Project.find(READY, NO_PDF) }))
  }

  return res.json(error('Método no permitido'))
}
