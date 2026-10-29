import db from '../../../components/db'
import lib from '../../../components/lib'

const { Project } = db
const { error, success, midd, rand } = lib

const MAX_PDF = 8 * 1024 * 1024
const NO_PDF = { pdf: 0 }

export const config = { api: { bodyParser: { sizeLimit: '12mb' } } }

export default async (req, res) => {
  await midd(req, res)

  if (req.method === 'GET') {
    return res.json(success({ projects: await Project.find({}, NO_PDF) }))
  }

  if (req.method === 'POST') {
    const { action, id, name, location, pdf, fileName } = req.body

    if (action === 'add') {
      const cleanName = typeof name === 'string' ? name.trim() : ''
      const cleanLocation = typeof location === 'string' ? location.trim() : ''
      if (!cleanName) return res.json(error('Ingresa el nombre del proyecto'))
      if (!cleanLocation) return res.json(error('Ingresa la ubicación del proyecto'))
      if (typeof pdf !== 'string' || !pdf) return res.json(error('Sube el PDF del mapa'))

      const buffer = Buffer.from(pdf, 'base64')
      if (buffer.slice(0, 5).toString() !== '%PDF-') return res.json(error('El archivo debe ser un PDF válido'))
      if (buffer.length > MAX_PDF) return res.json(error('El PDF no debe superar los 8 MB'))

      await Project.insert({
        id: rand(),
        name: cleanName,
        location: cleanLocation,
        fileName: fileName || 'mapa.pdf',
        pdf,
        date: new Date(),
      })
    }

    else if (action === 'delete') {
      const project = await Project.findOne({ id })
      if (!project) return res.json(error('Proyecto no encontrado'))
      await Project.delete({ id })
    }

    else return res.json(error('Acción no válida'))

    return res.json(success({ projects: await Project.find({}, NO_PDF) }))
  }

  return res.json(error('Método no permitido'))
}
