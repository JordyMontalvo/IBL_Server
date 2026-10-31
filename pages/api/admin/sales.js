import db from '../../../components/db'
import lib from '../../../components/lib'

const { Membership, Lot, User, Transaction, Tree, Setting } = db
const { error, success, midd, map, model, rand } = lib

const U = ['name', 'lastName', 'dni', 'phone']

export default async (req, res) => {
  await midd(req, res)

  if (req.method == 'GET') {
    const { filter, type } = req.query

    const q = { all: {}, pending: { status: 'pending' }, approved: { status: 'approved' }, rejected: { status: 'rejected' }, annulled: { status: 'annulled' } }

    if (!(filter in q)) return res.json(error('invalid filter'))

    let query = q[filter]
    let sales = []

    if (type === 'MEMBRESÍA') {
       sales = await Membership.find(query)
       sales = sales.map(s => ({ ...s, sourceType: 'MEMBRESÍA' }))
    } else if (type === 'LOTE') {
       sales = await Lot.find(query)
       sales = sales.map(s => ({ ...s, sourceType: 'LOTE' }))
    } else {
       const m = await Membership.find(query)
       const l = await Lot.find(query)
       sales = [...m.map(s => ({ ...s, sourceType: 'MEMBRESÍA' })), ...l.map(s => ({ ...s, sourceType: 'LOTE' }))]
    }

    // Populate Seller if sellerId exists
    const userIds = sales.map(s => s.sellerId || s.userId).filter(id => id)
    if (userIds.length > 0) {
      let users = await User.find({ id: { $in: userIds } })
      users = map(users)
  
      sales = sales.map(s => {
        let u = users.get(s.sellerId || s.userId)
        if (u) u = model(u, U)
        return { ...s, seller: u || s.seller } 
      })
    }

    // Sort by date desc
    sales.sort((a, b) => new Date(b.date) - new Date(a.date))

    return res.json(success({ sales }))
  }

  if (req.method == 'POST') {
     const { action, id, type } = req.body
     
     const Collection = (type === 'MEMBRESÍA') ? Membership : Lot

     if (action === 'approve') {
        const sale = await Collection.findOne({ id })
        if (!sale) return res.json(error('sale not found'))
        if (sale.status === 'approved') return res.json(error('already approved'))
        if (sale.status === 'annulled') return res.json(error('sale annulled'))

        await Collection.update({ id }, { status: 'approved' })

        // Pay Commission
        const sellerId = sale.sellerId || sale.userId
        const alreadyPaid = (await Transaction.find({ sale_id: sale.id })).length > 0
        if (sellerId && !alreadyPaid) {
          const users = await User.find({})
          const tree  = await Tree.find({})
          
          let paySettings = await Setting.findOne({ key: 'commission_rates' })
          const pay = (paySettings && paySettings.rates) ? paySettings.rates : [0.15, 0.05, 0.03, 0.02, 0.01, 0.005, 0.005]

          const pay_bonus = async (userId, level, saleId, price, type, originUserId) => {
             if (level >= pay.length) return
             
             const user = users.find(u => u.id == userId)
             if (!user) return

             const node = tree.find(t => t.id == userId)
             
             const isActive = Boolean(user._activated || user.activated)
             const virtual = !isActive
             
             const rate = parseFloat(pay[level])
             const amount = parseFloat((price * rate).toFixed(2))
             
             if (amount > 0) {
                await Transaction.insert({
                  id: rand(),
                  date: new Date(),
                  user_id: user.id,
                  type: 'in',
                  value: amount,
                  name: `comision venta ${type.toLowerCase()}`,
                  sale_id: saleId,
                  virtual,
                  activation_type: type,
                  _user_id: originUserId
                })
             }
             
             if (node && node.parent) {
                await pay_bonus(node.parent, level + 1, saleId, price, type, originUserId)
             }
          }

          // Start bonus payment from seller
          await pay_bonus(sellerId, 0, sale.id, sale.price, type, sellerId)
        }
     }
     if (action === 'reject') {
        const sale = await Collection.findOne({ id })
        if (!sale) return res.json(error('sale not found'))
        if (sale.status === 'approved') return res.json(error('Venta aprobada: usa Anular para revertir las comisiones'))
        await Collection.update({ id }, { status: 'rejected' })
     }

     if (action === 'annul') {
        const { reason } = req.body
        const sale = await Collection.findOne({ id })
        if (!sale) return res.json(error('sale not found'))
        if (sale.status === 'annulled') return res.json(error('La venta ya fue anulada'))
        if (sale.status !== 'approved') return res.json(error('Solo se pueden anular ventas aprobadas'))
        if (sale.transactions && sale.transactions.length) {
          return res.json(error('La venta se pagó con saldo: anúlala manualmente'))
        }

        const commissions = (await Transaction.find({ sale_id: sale.id })).filter(t => t.type === 'in')
        const reversed = (await Transaction.find({ sale_id: sale.id })).filter(t => t.type === 'out')
        if (reversed.length) return res.json(error('La venta ya tiene reversos registrados'))

        // el receptor no debe quedar con saldo negativo (por tipo: real / virtual)
        const need = {}
        for (const t of commissions) {
          const k = `${t.user_id}|${t.virtual ? 'v' : 'r'}`
          need[k] = (need[k] || 0) + t.value
        }
        for (const k of Object.keys(need)) {
          const [uid, kind] = k.split('|')
          const txs = await Transaction.find({ user_id: uid })
          const balance = txs
            .filter(t => (kind === 'v') === Boolean(t.virtual))
            .reduce((a, t) => a + (t.type === 'in' ? t.value : -t.value), 0)
          if (balance - need[k] < 0) {
            return res.json(error(`No se puede anular: el usuario ${uid} ya no tiene saldo ${kind === 'v' ? 'virtual' : 'real'} suficiente para el reverso`))
          }
        }

        for (const t of commissions) {
          await Transaction.insert({
            id: rand(),
            date: new Date(),
            user_id: t.user_id,
            type: 'out',
            value: t.value,
            name: `reverso ${t.name}`,
            sale_id: sale.id,
            virtual: Boolean(t.virtual),
            activation_type: t.activation_type,
            _user_id: t._user_id,
            reverses: t.id
          })
        }

        await Collection.update({ id }, { status: 'annulled', annulled_at: new Date(), annulled_reason: reason || '' })
     }
     
     return res.json(success())
  }
}
