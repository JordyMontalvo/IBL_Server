import db from '../../../components/db'
import lib from '../../../components/lib'

const { Setting } = db
const { error, success, midd } = lib

// pines (insignias) de cada rango
const RANKS = ['emprendedor', 'empresario', 'master', 'top_empresario']

export default async (req, res) => {
  await midd(req, res)

  const setting = await Setting.findOne({ key: 'rank_pins' })
  const pins = (setting && setting.pins) || {}

  if (req.method === 'GET') {
    return res.json(success({ pins }))
  }

  if (req.method === 'POST') {
    const { rank, img } = req.body

    if (!RANKS.includes(rank)) return res.json(error('Rango no válido'))
    if (!img || typeof img !== 'string') return res.json(error('Falta la imagen'))

    pins[rank] = img

    await Setting.update(
      { key: 'rank_pins' },
      { key: 'rank_pins', pins, updatedAt: new Date() }
    )

    return res.json(success({ pins }))
  }

  return res.json(error('Método no permitido'))
}
