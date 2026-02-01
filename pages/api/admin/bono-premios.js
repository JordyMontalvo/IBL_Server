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

                if (sortedPeriods.length > 0) {
                    const firstPeriodDate = new Date(sortedPeriods[0])
                    const firstIndex = periodDates.findIndex(d => d.getTime() === firstPeriodDate.getTime())

                    if (firstIndex !== -1) {
                        const cyclePeriodDates = periodDates.slice(firstIndex, firstIndex + 3)
                        let accumulated = 0

                        cyclePeriodDates.forEach((d, idx) => {
                            const periodLots = salesByPeriod[d.toISOString()] || 0
                            accumulated += periodLots

                            // Check milestones reached in this period
                            milestoneRules.forEach(m => {
                                if (accumulated >= m.lots) {
                                    // Check if this prize for this user/cycle/milestone is already in results
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
                                            periodo: `${idx + 1}er Periodo`,
                                            calificado: periodLots > 0 ? d.toISOString().split('T')[0] : '-',
                                            estado: delivery ? 'Entregado' : 'Pendiente'
                                        })
                                    }
                                }
                            })
                        })

                        // Current period check
                        if (cyclePeriodDates.length < 3) {
                            const currentLots = salesByPeriod['current'] || 0
                            accumulated += currentLots

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
                                            periodo: `${cyclePeriodDates.length + 1}er Periodo`,
                                            calificado: '-',
                                            estado: delivery ? 'Entregado' : 'Pendiente'
                                        })
                                    }
                                }
                            })
                        }
                    }
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
