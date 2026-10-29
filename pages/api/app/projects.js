import db  from '../../../components/db'
import lib from '../../../components/lib'

const { Session, Project } = db
const { error, success, midd } = lib

export default async (req, res) => {
  await midd(req, res)

  const { session, id } = req.query

  // valid session
  const _session = await Session.findOne({ value: session })
  if (!_session) return res.json(error('invalid session'))

  if (req.method !== 'GET') return res.json(error('Método no permitido'))

  // PDF of a single project
  if (id) {
    const project = await Project.findOne({ id })
    if (!project || !project.pdf) return res.json(error('Proyecto no encontrado'))

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(project.fileName || 'mapa.pdf')}"`)
    return res.end(Buffer.from(project.pdf, 'base64'))
  }

  // list (without the PDF content)
  const projects = await Project.find({ pending: { $ne: true } }, { pdf: 0, parts: 0, fileName: 0 })
  return res.json(success({ projects }))
}
