import db from '../../../components/db'
import lib from '../../../components/lib'

const { Setting } = db
const { error, success, midd } = lib

const DEFAULT_PERCENTAGES = [15, 5, 3, 2, 1, 0.5, 0.5]
const DEFAULT_RATES = [0.15, 0.05, 0.03, 0.02, 0.01, 0.005, 0.005]

export default async (req, res) => {
  await midd(req, res)

  if (req.method === 'GET') {
    const setting = await Setting.findOne({ key: 'commission_rates' })
    if (setting && setting.percentages && setting.percentages.length === 7) {
      return res.json(success({
        percentages: setting.percentages,
        rates: setting.rates,
        updatedAt: setting.updatedAt
      }))
    }
    return res.json(success({
      percentages: DEFAULT_PERCENTAGES,
      rates: DEFAULT_RATES,
      updatedAt: null
    }))
  }

  if (req.method === 'POST') {
    const { percentages } = req.body

    if (!Array.isArray(percentages) || percentages.length !== 7) {
      return res.json(error('Debe configurar exactamente 7 niveles de comisiones'))
    }

    const cleanPercentages = []
    const cleanRates = []

    for (let i = 0; i < percentages.length; i++) {
      const val = parseFloat(percentages[i])
      if (isNaN(val) || val < 0 || val > 100) {
        return res.json(error(`Porcentaje inválido en nivel ${i + 1}: debe ser entre 0% y 100%`))
      }
      cleanPercentages.push(val)
      cleanRates.push(val / 100)
    }

    await Setting.update(
      { key: 'commission_rates' },
      {
        key: 'commission_rates',
        percentages: cleanPercentages,
        rates: cleanRates,
        updatedAt: new Date()
      }
    )

    return res.json(success({
      percentages: cleanPercentages,
      rates: cleanRates
    }))
  }

  return res.json(error('Método no permitido'))
}
