import db from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session, Transaction, Tree, Banner, Setting, Activation, Product, Membership } = db
const { error, success, acum, midd } = lib

// rangos con pin (las imágenes se suben desde Admin > Banner > Pines)
const RANK_NAMES = {
  emprendedor:    'Emprendedor',
  empresario:     'Empresario',
  master:         'Máster',
  top_empresario: 'Top Empresario',
}


// meses de vigencia de una activación. Se toma la mayor de las señales disponibles:
// la duración guardada en la compra, la del producto actual y el nombre ("Anual" / "Mensual"),
// porque un producto editado en el admin puede cambiar de id o de duración después de la compra
async function activationDuration(activation) {
  let months = 0
  for (const p of (activation.products || [])) {
    if (!(Number(p.total) > 0)) continue
    const productDoc = (await Product.findOne({ id: p.id })) || (await Product.findOne({ name: p.name }))
    const name = String(p.name || '').toUpperCase()
    const signals = [
      Number(p.duration) || 0,
      Number(productDoc && productDoc.duration) || 0,
      name.includes('ANUAL') ? 12 : 0,
    ]
    months = Math.max(months, ...signals)
  }
  return months || 1
}

// ids del equipo comercial (descendientes en la red) hasta `maxDepth` niveles
function teamIds(tree, rootId, maxDepth) {
  const byId = new Map(tree.map(n => [String(n.id), n]))
  const seen = new Set([String(rootId)])
  const ids = []
  let level = [String(rootId)]

  for (let depth = 1; depth <= maxDepth && level.length; depth++) {
    const next = []
    for (const id of level) {
      const node = byId.get(id)
      for (const child of (node && node.childs) || []) {
        const key = String(child)
        if (seen.has(key)) continue
        seen.add(key)
        ids.push(child)
        next.push(key)
      }
    }
    level = next
  }
  return ids
}

// variantes string / number de una lista de ids (los ids se guardan de ambas formas)
function idVariants(list) {
  const out = []
  for (const id of list) {
    out.push(id, String(id))
    if (!isNaN(Number(id))) out.push(Number(id))
  }
  return out
}

// mes y año ("YYYY-MM") en hora de Perú, sumando meses
function addMonthsLima(date, months) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', year: 'numeric', month: 'numeric' })
    .formatToParts(new Date(date))
  const y = Number(parts.find(p => p.type === 'year').value)
  const m = Number(parts.find(p => p.type === 'month').value)
  const total = y * 12 + (m - 1) + months
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

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

  // saldos: misma función que usa el flujo de retiros, para que siempre coincidan
  const { available, unavailable } = await lib.getBalances(Transaction, user.id)

  // total ganado: todos los ingresos (disponibles y no disponibles),
  // sin contar las transferencias recibidas de otros socios
  const totalEarned = [...transactions, ...virtualTransactions]
    .filter(t => t.type === 'in' && t.name !== 'wallet transfer')
    .reduce((a, t) => a + (Number(t.value) || 0), 0)


  /* Split virtual balance types */
  const virtualLote = virtualTransactions.filter(t => t.activation_type === 'LOTE')
  const virtualMembresia = virtualTransactions.filter(t => t.activation_type === 'MEMBRESÍA' || t.activation_type === 'MEMBRESIA')

  const insVirtualLote = acum(virtualLote, { type: 'in' }, 'value')
  const outsVirtualLote = acum(virtualLote, { type: 'out' }, 'value')
  const insVirtualMembresia = acum(virtualMembresia, { type: 'in' }, 'value')
  const outsVirtualMembresia = acum(virtualMembresia, { type: 'out' }, 'value')


  const banner = await Banner.findOne({})

  // rango alcanzado y su pin
  // TODO: la lógica de calificación está pendiente; mientras tanto todos los socios quedan "Sin rango"
  const rankKey = null
  const pinSetting = rankKey ? await Setting.findOne({ key: 'rank_pins' }) : null
  const rankName = RANK_NAMES[rankKey] || 'Sin rango'
  const rankPin = (pinSetting && pinSetting.pins && pinSetting.pins[rankKey]) || null
  // activación: modalidad (mensual / anual) y vencimiento de la última activación aprobada
  let activationMode = null
  let activationExpires = null

  if (user.activated || user._activated) {
    const userIds = [user.id, String(user.id)]
    if (!isNaN(Number(user.id))) userIds.push(Number(user.id))

    const approved = (await Activation.find({ userId: { $in: userIds }, status: 'approved' }))
      .filter(a => a.date && !isNaN(new Date(a.date)))
      .sort((a, b) => new Date(b.date) - new Date(a.date))

    // 1) una activación anual aprobada que siga vigente (aunque después haya comprado otra mensual)
    const nowMonth = addMonthsLima(new Date(), 0)
    for (const act of approved) {
      const months = await activationDuration(act)
      if (months < 12) continue
      const expires = addMonthsLima(act.date, months)
      if (expires >= nowMonth) {
        activationMode = 'anual'
        activationExpires = expires
        break
      }
    }

    // 2) si no, los cierres de vigencia que le quedan: es lo que decide cuándo se desactiva
    //    (sirve también para socios activos sin una activación registrada)
    const left = Number(user.closures_left) || 0
    if (!activationMode && left >= 3) {
      activationMode = 'anual'
      activationExpires = addMonthsLima(new Date(), left)
    }

    // 3) si no, es mensual: vence según su última activación o, si no hay, según los cierres que le quedan
    if (!activationMode && (approved.length || left > 0)) {
      activationMode = 'mensual'
      const byDate = approved.length ? addMonthsLima(approved[0].date, await activationDuration(approved[0])) : null
      const byClosures = left > 0 ? addMonthsLima(new Date(), left) : null
      // nunca un mes ya pasado: si la fecha de la última activación quedó atrás, valen los cierres
      activationExpires = (byDate && byDate >= nowMonth) ? byDate : (byClosures || byDate)
    }
  }

  // ventas personales: membresías vendidas por el socio y aprobadas, de todo su historial.
  // se cuenta directo de la colección, así una venta rechazada o eliminada deja de sumar
  const approvedSalesBy = async (ids) => {
    if (!ids.length) return 0
    const sellers = idVariants(ids)
    return (await Membership.find({
      status: 'approved',
      $or: [{ sellerId: { $in: sellers } }, { userId: { $in: sellers } }],
    })).length
  }
  const personalSales = await approvedSalesBy([user.id])

  // ventas grupales: lo mismo para su equipo comercial, solo niveles 1 al 7 (sin incluir sus propias ventas)
  const tree = await Tree.find({})
  const team = teamIds(tree, user.id, 7)
  const groupSales = await approvedSalesBy(team)

  // mi red comercial: personas de su organización en los niveles 1 al 7
  const network = team.length

  // socios directos: personas registradas por el socio (su patrocinador es él) más las que están
  // directamente debajo de él en la red (p. ej. ubicadas desde Admin > Red, que no cambia el patrocinador).
  // Se cuentan una sola vez y sin importar sus ventas
  const sponsored = await User.find({ parentId: { $in: idVariants([user.id]) } })
  const directIds = new Set([
    ...sponsored.map(u => String(u.id)),
    ...teamIds(tree, user.id, 1).map(String),
  ])
  directIds.delete(String(user.id))
  const directs = directIds.size

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
    // If NO closed sales (but potentially current sales), show 3 placeholder periods
    const currentLots = salesByPeriod['current'] || 0
    currentCycle.accumulatedLots = currentLots
    currentCycle.periods = [
      { label: '1er Período', month: 'Actual', lots: currentLots, status: 'pending', prize: 'Cena', date: 'Ahora' },
      { label: '2do Período', month: 'Próximo', lots: 0, status: 'locked', prize: 'Viaje', date: '-' },
      { label: '3er Período', month: 'Próximo', lots: 0, status: 'locked', prize: 'Yate/Bono', date: '-' }
    ]

    // Update prize statuses for initial/current sales
    currentCycle.prizes.forEach(p => {
      if (currentCycle.accumulatedLots >= p.lots) {
        p.status = 'completed'
      }
    })
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
    totalEarned,
    outs,
    balance: available.total,
    _balance: unavailable.total,
    _balance_lote: (insVirtualLote - outsVirtualLote),
    _balance_membresia: (insVirtualMembresia - outsVirtualMembresia),
    rank: user.rank,
    rankKey,
    activationMode,
    stats: { personalSales, groupSales, directs, network },
    activationExpires,
    rankName,
    rankPin,
    points: user.points,
    bonoConstructor: currentCycle
  }))
}
