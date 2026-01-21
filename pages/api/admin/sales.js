import db from '../../../components/db'
import lib from '../../../components/lib'

const { Membership, Lot, User } = db
const { error, success, midd, map, model } = lib

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
        await Collection.update({ id }, { status: 'approved' })
     }
     if (action === 'reject') {
        await Collection.update({ id }, { status: 'rejected' })
     }
     
     return res.json(success())
  }
}
