import db from '../../../components/db'
import lib from '../../../components/lib'

const { Membership, Lot, User, Transaction, Tree } = db
const { error, success, midd, map, model, rand } = lib

const U = ['name', 'lastName', 'dni', 'phone']

export default async (req, res) => {
  await midd(req, res)

  if (req.method == 'GET') {
    const { filter, type } = req.query

    const q = { all: {}, pending: { status: 'pending' }, approved: { status: 'approved' }, rejected: { status: 'rejected' } }

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

        await Collection.update({ id }, { status: 'approved' })

        // Pay Commission
        const sellerId = sale.sellerId || sale.userId
        if (sellerId) {
          const users = await User.find({})
          const tree  = await Tree.find({})
          const pay   = [0.15, 0.05, 0.03, 0.02, 0.01, 0.005, 0.005]

          const pay_bonus = async (userId, level, saleId, points, type, originUserId) => {
             if (level >= pay.length) return
             
             const user = users.find(u => u.id == userId)
             if (!user) return

             const node = tree.find(t => t.id == userId)
             
             let virtual = false
             if (type === 'MEMBRESÍA' && !user._activated) virtual = true
             if (type === 'LOTE' && !user.activated) virtual = true
             
             const rate = pay[level]
             const amount = points * rate
             
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
                await pay_bonus(node.parent, level + 1, saleId, points, type, originUserId)
             }
          }

          // Start bonus payment from seller
          await pay_bonus(sellerId, 0, sale.id, sale.points, type, sellerId)
        }
     }
     if (action === 'reject') {
        await Collection.update({ id }, { status: 'rejected' })
     }
     
     return res.json(success())
  }
}
