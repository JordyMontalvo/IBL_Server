import db from "./db"

const { User, Tree, Closed, Membership, Setting } = db

// rangos en orden. La meta se cumple dentro de un período de dos ciclos (un ciclo = entre dos cierres)
export const RANKS = [
  { key: 'emprendedor',    name: 'Emprendedor',    type: 'personal', goal: 5,   prize: 'Cena de lujo' },
  { key: 'empresario',     name: 'Empresario',     type: 'personal', goal: 10,  prize: 'S/ 500' },
  { key: 'master',         name: 'Máster',         type: 'group',    goal: 100, prize: 'S/ 3,000 y cena para 30 personas',
    note: 'Pendiente de definir: 3 líneas productivas, hasta 7 niveles.' },
  { key: 'top_empresario', name: 'Top Empresario', type: 'group',    goal: 500, prize: 'Viaje y automóvil',
    note: 'Pendiente de definir: 4 líneas productivas, hasta 7 niveles.' },
]

const CYCLES_PER_PERIOD = 2
const MAX_LEVELS = 7

// ids del equipo (descendientes en la red) hasta `maxDepth` niveles
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

function idVariants(list) {
  const out = []
  for (const id of list) {
    out.push(id, String(id))
    if (!isNaN(Number(id))) out.push(Number(id))
  }
  return out
}

// fechas de venta aprobadas (membresías) de un grupo de vendedores, ordenadas
async function saleDates(ids) {
  if (!ids.length) return []
  const sellers = idVariants(ids)
  return (await Membership.find({
    status: 'approved',
    $or: [{ sellerId: { $in: sellers } }, { userId: { $in: sellers } }],
  }))
    .map(s => new Date(s.date))
    .filter(d => !isNaN(d))
    .sort((a, b) => a - b)
}

// ciclos: el primero empieza en la fecha de inicio configurada (Setting `ranks.start`) o, si no hay,
// en el primer cierre registrado; cada cierre posterior abre un ciclo nuevo. El último ciclo está en curso
async function buildCycles() {
  const setting = await Setting.findOne({ key: 'ranks' })
  const closures = (await Closed.find({}))
    .map(c => new Date(c.date))
    .filter(d => !isNaN(d))
    .sort((a, b) => a - b)

  const start = (setting && setting.start && new Date(setting.start)) || closures[0] || new Date()
  const bounds = [start, ...closures.filter(d => d > start)]

  return bounds.map((from, i) => ({ start: from, end: bounds[i + 1] || null }))
}

const inRange = (d, from, to) => d >= from && (!to || d < to)

export async function computeRanks(user) {
  const tree = await Tree.find({})
  const personalDates = await saleDates([user.id])
  const groupDates = await saleDates(teamIds(tree, user.id, MAX_LEVELS))
  const cycles = await buildCycles()

  // agrupar ciclos en períodos de dos
  const periods = []
  for (let i = 0; i < cycles.length; i += CYCLES_PER_PERIOD) {
    const list = cycles.slice(i, i + CYCLES_PER_PERIOD).map((c, j) => ({
      number: j + 1,
      start: c.start,
      end: c.end,
      status: c.end ? 'closed' : 'current',
      personal: personalDates.filter(d => inRange(d, c.start, c.end)).length,
      group: groupDates.filter(d => inRange(d, c.start, c.end)).length,
    }))
    const last = list[list.length - 1]
    periods.push({
      number: periods.length + 1,
      start: list[0].start,
      // un período de un solo ciclo cerrado todavía espera su segundo ciclo
      end: list.length === CYCLES_PER_PERIOD ? last.end : null,
      cycles: list,
      personal: list.reduce((a, c) => a + c.personal, 0),
      group: list.reduce((a, c) => a + c.group, 0),
    })
  }

  // logros: se registran una sola vez y no se borran, aunque después cambien las ventas
  const achievements = Array.isArray(user.rank_achievements) ? [...user.rank_achievements] : []
  let changed = false

  for (const period of periods) {
    const pDates = personalDates.filter(d => inRange(d, period.start, period.end))
    const gDates = groupDates.filter(d => inRange(d, period.start, period.end))
    period.achieved = []

    for (const rank of RANKS) {
      const dates = rank.type === 'personal' ? pDates : gDates
      if (dates.length < rank.goal) continue
      period.achieved.push(rank.name)
      if (achievements.some(a => a.key === rank.key)) continue
      achievements.push({ key: rank.key, name: rank.name, prize: rank.prize, date: dates[rank.goal - 1], period: period.number })
      changed = true
    }
  }

  if (changed) await User.update({ id: user.id }, { rank_achievements: achievements })

  const current = periods[periods.length - 1]
  const currentCycle = current.cycles.length

  // se completan los ciclos que faltan del período actual para mostrarlos
  while (current.cycles.length < CYCLES_PER_PERIOD) {
    current.cycles.push({ number: current.cycles.length + 1, start: null, end: null, status: 'next', personal: 0, group: 0 })
  }

  const achievedKeys = new Set(achievements.map(a => a.key))
  const top = [...RANKS].reverse().find(r => achievedKeys.has(r.key)) || null
  const next = RANKS.find(r => !achievedKeys.has(r.key)) || null

  const ranks = RANKS.map(r => {
    const progress = r.type === 'personal' ? current.personal : current.group
    const done = achievements.find(a => a.key === r.key)
    return {
      ...r,
      progress,
      missing: Math.max(r.goal - progress, 0),
      percent: Math.min(Math.round(progress / r.goal * 100), 100),
      status: done ? 'achieved' : (next && next.key === r.key ? 'next' : 'pending'),
      achieved_at: done ? done.date : null,
      achieved_period: done ? done.period : null,
    }
  })

  return {
    activated: !!user.activated,
    rankKey: top ? top.key : null,
    rankName: top ? top.name : 'Sin rango',
    next: next ? next.key : null,
    period: { ...current, cycle: currentCycle, of: CYCLES_PER_PERIOD },
    ranks,
    history: { personal: personalDates.length, group: groupDates.length },
    periods: periods.slice(0, -1).reverse(),
    achievements,
  }
}
