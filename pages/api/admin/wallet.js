import db from "../../../components/db"
import lib from "../../../components/lib"

const { Transaction, User } = db
const { midd, success } = lib


export default async (req, res) => {
  await midd(req, res)

  const users = await User.find({})


  // get collects
  let transactions = await Transaction.find({ name: 'wallet transfer', type: 'out' })

  transactions = transactions.map(a => {

    const  u = users.find(e => e.id == a.user_id)
    const _u = users.find(e => e.id == a._user_id)

    const name  = u ? (u.name + ' ' + u.lastName) : 'Usuario desconocido'
    const _name = _u ? (_u.name + ' ' + _u.lastName) : 'Usuario desconocido'

    return { ...a, name, _name }
  })


  // response
  return res.json(success({
    transactions
  }))
}
