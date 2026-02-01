import db from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session, Lot, Closed } = db
const { error, success, midd } = lib

export default async (req, res) => {
    await midd(req, res)

    if (req.method === 'GET') {
        let { id } = req.query

        // 1. Fetch all closures and sort them
        const closures = await Closed.find({})
        const periodDates = closures.map(c => new Date(c.date)).sort((a, b) => a - b)

        if (id) {
            // --- Single User Details ---
            const user = await User.findOne({ id })
            if (!user) return res.json(error('user not found'))

            const userSales = await Lot.find({ sellerId: id, status: 'approved' })

            const salesByPeriod = {}
            userSales.forEach(sale => {
                const saleDate = new Date(sale.date)
                const periodEnd = periodDates.find(d => d > saleDate)
                const periodKey = periodEnd ? periodEnd.toISOString() : 'current'
                salesByPeriod[periodKey] = (salesByPeriod[periodKey] || 0) + 1
            })

            const sortedPeriods = Object.keys(salesByPeriod).filter(k => k !== 'current').sort((a, b) => new Date(a) - new Date(b))

            let detail = {
                userName: `${user.name} ${user.lastName}`,
                dni: user.dni,
                accumulatedLots: 0,
                milestones: [
                    { label: '1 Lote', lots: 1, prize: 'Cena', status: 'locked', note: '' },
                    { label: '4 Lotes', lots: 4, prize: 'Viaje', status: 'locked', note: '(2 periodos)' },
                    { label: '7 Lotes', lots: 7, prize: 'Yate', status: 'locked', note: '(3 periodos)' },
                    { label: '10 Lotes', lots: 10, prize: 'Bono Lote', status: 'locked', note: '' }
                ]
            }

            if (sortedPeriods.length > 0) {
                const firstPeriodDate = new Date(sortedPeriods[0])
                const firstIndex = periodDates.findIndex(d => d.getTime() === firstPeriodDate.getTime())

                if (firstIndex !== -1) {
                    const cyclePeriodDates = periodDates.slice(firstIndex, firstIndex + 3)
                    cyclePeriodDates.forEach(d => {
                        detail.accumulatedLots += salesByPeriod[d.toISOString()] || 0
                    })
                }
            }
            // Always include current period sales
            detail.accumulatedLots += salesByPeriod['current'] || 0

            detail.milestones.forEach(m => {
                if (detail.accumulatedLots >= m.lots) m.status = 'completed'
            })

            return res.json(success({ detail }))
        }

        // 2. Fetch all users and approved lot sales
        const users = await User.find({})
        const lotSales = await Lot.find({ status: 'approved' })

        // Group lot sales by sellerId for efficiency
        const salesByUser = {}
        lotSales.forEach(sale => {
            if (!salesByUser[sale.sellerId]) salesByUser[sale.sellerId] = []
            salesByUser[sale.sellerId].push(sale)
        })

        const results = users.map(user => {
            const userSales = salesByUser[user.id] || []

            const salesByPeriod = {} // date string -> count
            userSales.forEach(sale => {
                const saleDate = new Date(sale.date)
                const periodEnd = periodDates.find(d => d > saleDate)
                const periodKey = periodEnd ? periodEnd.toISOString() : 'current'
                salesByPeriod[periodKey] = (salesByPeriod[periodKey] || 0) + 1
            })

            const sortedPeriods = Object.keys(salesByPeriod).filter(k => k !== 'current').sort((a, b) => new Date(a) - new Date(b))

            let bonoData = {
                userName: `${user.name} ${user.lastName}`,
                dni: user.dni,
                ciclo: 'Ciclo 0',
                periodoEnCiclo: 'Sin iniciar',
                lotesAcumulados: 0,
                id: user.id
            }

            if (sortedPeriods.length > 0) {
                const firstPeriodDate = new Date(sortedPeriods[0])
                const firstIndex = periodDates.findIndex(d => d.getTime() === firstPeriodDate.getTime())

                if (firstIndex !== -1) {
                    const cyclePeriodDates = periodDates.slice(firstIndex, firstIndex + 3)
                    const activePeriodsCount = cyclePeriodDates.length

                    let accumulated = 0
                    cyclePeriodDates.forEach(d => {
                        accumulated += salesByPeriod[d.toISOString()] || 0
                    })

                    const currentLots = salesByPeriod['current'] || 0
                    accumulated += currentLots

                    let currentPeriodLabel = '-'
                    if (activePeriodsCount < 3) {
                        currentPeriodLabel = `${activePeriodsCount + 1}er Periodo`
                    } else {
                        currentPeriodLabel = 'Finalizado'
                    }

                    bonoData.ciclo = 'Ciclo 1'
                    bonoData.periodoEnCiclo = currentPeriodLabel
                    bonoData.lotesAcumulados = accumulated
                }
            } else {
                // Handle case with only current sales
                const currentLots = salesByPeriod['current'] || 0
                if (currentLots > 0) {
                    bonoData.ciclo = 'Ciclo 1'
                    bonoData.periodoEnCiclo = '1er Periodo'
                    bonoData.lotesAcumulados = currentLots
                }
            }

            return bonoData
        })

        return res.json(success({
            users: results,
            closures: closures.map(c => ({ id: c.id, date: c.date }))
        }))
    }
}
