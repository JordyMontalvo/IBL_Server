import { EventEmitterAsyncResource } from "mongodb/lib/apm"
import db from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session, Transaction, Tree, Banner } = db
const { error, success, acum, midd } = lib


export default async (req, res) => {
  await midd(req, res)

  let { session } = req.query

  // valid session
  session = await Session.findOne({ value: session })
  if (!session) return res.json(error('invalid session'))

  // get USER
  const user = await User.findOne({ id: session.id })

  // get transactions
  const transactions = await Transaction.find({ user_id: user.id, virtual: { $in: [null, false] } })
  const virtualTransactions = await Transaction.find({ user_id: user.id, virtual: true })

  const ins = acum(transactions, { type: 'in' }, 'value')
  const outs = acum(transactions, { type: 'out' }, 'value')
  const insVirtual = acum(virtualTransactions, { type: 'in' }, 'value')
  const outsVirtual = acum(virtualTransactions, { type: 'out' }, 'value')


  /* Split virtual balance types */
  const virtualLote = virtualTransactions.filter(t => t.activation_type === 'LOTE')
  const virtualMembresia = virtualTransactions.filter(t => t.activation_type === 'MEMBRESÍA' || t.activation_type === 'MEMBRESIA')

  const insVirtualLote = acum(virtualLote, { type: 'in' }, 'value')
  const outsVirtualLote = acum(virtualLote, { type: 'out' }, 'value')
  const insVirtualMembresia = acum(virtualMembresia, { type: 'in' }, 'value')
  const outsVirtualMembresia = acum(virtualMembresia, { type: 'out' }, 'value')


  const banner = await Banner.findOne({})
  const { Closed, Lot } = db

  // -- Bono Constructor Logic --
  // Fetch closures (periods) and lot sales for the user
  const closures = await Closed.find({})
  const lotSales = await Lot.find({ sellerId: user.id, status: 'approved' }) // Assuming 'approved' is the correct status

  // Sort closures by date to determine period chronology
  const periodDates = closures.map(c => new Date(c.date)).sort((a, b) => a - b)

  // Find periods for lot sales
  const salesByPeriod = {} // date string -> count
  lotSales.forEach(sale => {
    const saleDate = new Date(sale.date)
    // Find the first closure date that is AFTER the sale date
    const periodEnd = periodDates.find(d => d > saleDate)
    const periodKey = periodEnd ? periodEnd.toISOString() : 'current'
    salesByPeriod[periodKey] = (salesByPeriod[periodKey] || 0) + 1
  })

  // Group into cycles (3 periods each)
  // A cycle starts from the first period where the user had a sale
  const sortedPeriods = Object.keys(salesByPeriod).filter(k => k !== 'current').sort((a, b) => new Date(a) - new Date(b))

  let currentCycle = {
    accumulatedLots: 0,
    totalLots: 10,
    activePeriods: 0,
    periods: [],
    prizes: [
      { lots: 1, label: 'Cena', status: 'locked' },
      { lots: 4, label: 'Viaje', status: 'locked' },
      { lots: 7, label: 'Yate', status: 'locked' },
      { lots: 10, label: 'Bono Lote', status: 'locked' }
    ]
  }

  if (sortedPeriods.length > 0) {
    const firstPeriodDate = new Date(sortedPeriods[0])
    // Find index of this period in all closures
    const firstIndex = periodDates.findIndex(d => d.getTime() === firstPeriodDate.getTime())

    if (firstIndex !== -1) {
      // Current cycle is the group of 3 periods starting from firstIndex
      const cyclePeriodDates = periodDates.slice(firstIndex, firstIndex + 3)

      currentCycle.activePeriods = cyclePeriodDates.length
      currentCycle.periods = cyclePeriodDates.map((d, i) => {
        const count = salesByPeriod[d.toISOString()] || 0
        currentCycle.accumulatedLots += count

        return {
          label: `${i + 1}er Período`,
          month: d.toLocaleString('es-ES', { month: 'long' }),
          lots: count,
          status: 'completed',
          prize: i === 0 ? 'Cena' : i === 1 ? 'Viaje' : 'Yate/Bono',
          date: d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
        }
      })

      // Fill remaining periods up to 3
      while (currentCycle.periods.length < 3) {
        const i = currentCycle.periods.length
        const isCurrent = i === currentCycle.activePeriods
        const currentLots = isCurrent ? (salesByPeriod['current'] || 0) : 0
        currentCycle.accumulatedLots += currentLots

        currentCycle.periods.push({
          label: `${i + 1}er Período`,
          month: isCurrent ? 'Actual' : 'Próximo',
          lots: currentLots,
          status: isCurrent ? 'pending' : 'locked',
          prize: i === 1 ? 'Viaje' : 'Yate/Bono',
          date: isCurrent ? 'Ahora' : '-'
        })
      }

      // Update prize statuses
      currentCycle.prizes.forEach(p => {
        if (currentCycle.accumulatedLots >= p.lots) {
          p.status = 'completed'
        }
      })
    }
  } else {
    // If NO sales, show 3 placeholder periods
    currentCycle.periods = [
      { label: '1er Período', month: 'Actual', lots: 0, status: 'pending', prize: 'Cena', date: 'Ahora' },
      { label: '2do Período', month: 'Próximo', lots: 0, status: 'locked', prize: 'Viaje', date: '-' },
      { label: '3er Período', month: 'Próximo', lots: 0, status: 'locked', prize: 'Yate/Bono', date: '-' }
    ]
  }

  // response
  return res.json(success({
    name: user.name,
    lastName: user.lastName,
    affiliated: user.affiliated,
    _activated: user._activated,
    activated: user.activated,
    plan: user.plan,
    country: user.country,
    photo: user.photo,
    tree: user.tree,
    email: user.email,
    token: user.token,

    banner,
    ins,
    insVirtual,
    outs,
    balance: (ins - outs),
    _balance: (insVirtual - outsVirtual),
    _balance_lote: (insVirtualLote - outsVirtualLote),
    _balance_membresia: (insVirtualMembresia - outsVirtualMembresia),
    rank: user.rank,
    points: user.points,
    bonoConstructor: currentCycle
  }))
}
