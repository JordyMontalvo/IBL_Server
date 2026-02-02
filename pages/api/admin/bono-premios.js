import db from "../../../components/db"
import lib from "../../../components/lib"

const { User, Lot, Closed, BonoPrize } = db
const { error, success, midd } = lib

export default async (req, res) => {
    await midd(req, res)

    if (req.method === 'GET') {
        try {
            // 1. Fetch all closures and sort them
            const closures = await Closed.find({})
            const periodDates = closures.map(c => new Date(c.date)).sort((a, b) => a - b)

            // 2. Fetch all users and approved lot sales
            const users = await User.find({})
            const lotSales = await Lot.find({ status: 'approved' })
            const deliveredPrizes = await BonoPrize.find({})

            // Group lot sales by sellerId
            const salesByUser = {}
            lotSales.forEach(sale => {
                if (!salesByUser[sale.sellerId]) salesByUser[sale.sellerId] = []
                salesByUser[sale.sellerId].push(sale)
            })

            const milestoneRules = [
                { label: 'Cena', lots: 1 },
                { label: 'Viaje', lots: 4 },
                { label: 'Yate', lots: 7 },
                { label: 'Bono Lote', lots: 10 }
            ]

            let results = []

            users.forEach(user => {
                const userSales = salesByUser[user.id] || []
                const salesByPeriod = {}

                userSales.forEach(sale => {
                    const saleDate = new Date(sale.date)
                    const periodEnd = periodDates.find(d => d > saleDate)
                    const periodKey = periodEnd ? periodEnd.toISOString() : 'current'
                    salesByPeriod[periodKey] = (salesByPeriod[periodKey] || 0) + 1
                })

                const sortedPeriods = Object.keys(salesByPeriod).filter(k => k !== 'current').sort((a, b) => new Date(a) - new Date(b))

                // Determine starting period if any sales exist
                let cycleStartIdx = -1
                if (sortedPeriods.length > 0) {
                    const firstPeriodDate = new Date(sortedPeriods[0])
                    cycleStartIdx = periodDates.findIndex(d => d.getTime() === firstPeriodDate.getTime())
                } else if (salesByPeriod['current'] > 0) {
                    // Only current sales exist
                    cycleStartIdx = periodDates.length // Points to "after" all existing closures
                }

                if (cycleStartIdx !== -1) {
                    // We have at least one sale (closed or current)
                    // In this system, "Ciclo 1" starts at the first sale's period.
                    // We consider 3 periods starting from that period (which might be in the past or the current one).

                    // However, the current logic seems to assume the closure date IS the end of the period.
                    // If a user has a sale before the first closure, their first period is the first closure.

                    const cyclePeriods = []
                    // If cycleStartIdx is periodDates.length, it means the first sale is in the current (unclosed) period.
                    if (cycleStartIdx < periodDates.length) {
                        // User has sales in closed periods. Take up to 3 periods starting from the first one.
                        const start = Math.max(0, cycleStartIdx)
                        for (let i = 0; i < 3; i++) {
                            if (start + i < periodDates.length) {
                                cyclePeriods.push({ date: periodDates[start + i], label: `${i + 1}er Periodo`, key: periodDates[start + i].toISOString() })
                            } else if (cyclePeriods.length < 3) {
                                cyclePeriods.push({ date: null, label: `${i + 1}er Periodo`, key: 'current' })
                                break; // Only one 'current' period possible
                            }
                        }
                    } else {
                        // First sale is in current period
                        cyclePeriods.push({ date: null, label: '1er Periodo', key: 'current' })
                    }

                    let accumulated = 0
                    cyclePeriods.forEach((p) => {
                        const periodLots = salesByPeriod[p.key] || 0
                        accumulated += periodLots

                        milestoneRules.forEach(m => {
                            if (accumulated >= m.lots) {
                                const prizeKey = `${user.id}_Ciclo 1_${m.label}`
                                const exists = results.find(r => r.key === prizeKey)

                                if (!exists) {
                                    const delivery = deliveredPrizes.find(dp => dp.userId === user.id && dp.prize === m.label && dp.ciclo === 'Ciclo 1')

                                    results.push({
                                        key: prizeKey,
                                        userId: user.id,
                                        userName: `${user.name} ${user.lastName}`,
                                        userAvatar: user.avatar || '',
                                        prize: m.label,
                                        ciclo: 'Ciclo 1',
                                        periodo: p.label,
                                        calificado: p.date ? p.date.toISOString().split('T')[0] : '-',
                                        estado: delivery ? 'Entregado' : 'Pendiente'
                                    })
                                }
                            }
                        })
                    })
                }
            })

            return res.json(success({
                premios: results,
                closures: closures.map(c => ({ id: c.id, date: c.date }))
            }))
        } catch (err) {
            console.error(err)
            return res.json(error(err.message))
        }
    }

    if (req.method === 'POST') {
        const { userId, prize, ciclo, action } = req.body

        if (action === 'entregar') {
            await BonoPrize.insert({
                userId,
                prize,
                ciclo,
                date: new Date()
            })
            return res.json(success('Premio marcado como entregado'))
        }
    }
}
