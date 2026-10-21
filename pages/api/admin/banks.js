import db from '../../../components/db'
import lib from '../../../components/lib'

const { Setting } = db
const { error, success, midd, rand } = lib

const getBanks = async () => {
  const setting = await Setting.findOne({ key: 'banks' })
  return setting && Array.isArray(setting.banks) ? setting.banks : []
}

const saveBanks = (banks) => Setting.update(
  { key: 'banks' },
  { key: 'banks', banks, updatedAt: new Date() }
)

export default async (req, res) => {
  await midd(req, res)

  if (req.method === 'GET') {
    return res.json(success({ banks: await getBanks() }))
  }

  if (req.method === 'POST') {
    const { action, id, name } = req.body
    const banks = await getBanks()
    const clean = typeof name === 'string' ? name.trim() : ''

    const duplicated = (n) => banks.some(b => b.id !== id && b.name.toLowerCase() === n.toLowerCase())

    if (action === 'add') {
      if (!clean) return res.json(error('Ingresa el nombre del banco'))
      if (duplicated(clean)) return res.json(error('Ese banco ya está registrado'))
      banks.push({ id: rand(), name: clean, active: true, date: new Date() })
    }

    else if (action === 'edit' || action === 'toggle') {
      const bank = banks.find(b => b.id === id)
      if (!bank) return res.json(error('Banco no encontrado'))

      if (action === 'edit') {
        if (!clean) return res.json(error('Ingresa el nombre del banco'))
        if (duplicated(clean)) return res.json(error('Ese banco ya está registrado'))
        bank.name = clean
      } else {
        bank.active = !bank.active
      }
    }

    else return res.json(error('Acción no válida'))

    await saveBanks(banks)
    return res.json(success({ banks }))
  }

  return res.json(error('Método no permitido'))
}
