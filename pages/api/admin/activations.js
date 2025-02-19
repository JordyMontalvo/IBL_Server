import db from "../../../components/db"
import lib from "../../../components/lib"

const { Activation, User, Tree, Token, Office, Transaction } = db
const { error, success, midd, ids, map, model, rand } = lib

// valid filters
// const q = { all: {}, pending: { status: 'pending'} }

// models
const A = ['id', 'date', 'products', 'price', 'points', 'voucher', 'status', 'amounts', 'office', 'delivered', 'closed', 'pay_method', 'bank', 'voucher_date', 'voucher_number']
const U = ['name', 'lastName', 'dni', 'phone']


/*
function find(id, i) { // i: branch
  const node = tree.find(e => e.id == id)

  if(node.childs[i] == null) return id

  return find(node.childs[i], i)
} */

let users = null
let tree = null

const pay = [0.15, 0.05, 0.03, 0.02, 0.01, 0.005, 0.005]

async function pay_bonus(id, i, activation_id, amount, type, _id) {

  const user = users.find(e => e.id == id)
  const node = tree.find(e => e.id == id)

  let virtual = false

  if(type = 'MEMBRESIA' && !user._activated) virtual = true
  if(type = 'LOTE' && !user.activated) virtual = true

  let p = pay[i]

  console.log({ p, amount })

  await Transaction.insert({
    id: rand(),
    date: new Date(),
    user_id: user.id,
    type: 'in',
    value: p * amount,
    activation_id,
    virtual,
    activation_type: type,
    _user_id: _id,
  })

  if (i == 6 || !node.parent) return

  pay_bonus(node.parent, i + 1, activation_id, amount, type, _id)
}


export default async (req, res) => {
  await midd(req, res)

  if (req.method == 'GET') {

    const { filter } = req.query

    const q = { all: {}, pending: { status: 'pending' } }

    // validate filter
    if (!(filter in q)) return res.json(error('invalid filter'))

    const { account } = req.query
    console.log({ account })

    // get activations
    let qq = q[filter]
    console.log({ qq })

    if (account != 'admin') qq.office = account
    console.log({ qq })

    let activations = await Activation.find(qq)

    // get users for activations
    let users = await User.find({ id: { $in: ids(activations) } })
    users = map(users)

    // enrich activations
    activations = activations.map(a => {

      let u = users.get(a.userId)

      a = model(a, A)
      u = model(u, U)

      return { ...a, ...u }
    })

    // response
    return res.json(success({ activations }))
  }

  if (req.method == 'POST') {

    const { action, id } = req.body

    // get activation
    const activation = await Activation.findOne({ id })

    // validate activation
    if (!activation) return res.json(error('activation not exist'))

    // validate status
    if (action == 'approve' || action == 'reject') {

      if (activation.status == 'approved') return res.json(error('already approved'))
      if (activation.status == 'rejected') return res.json(error('already rejected'))

    }

    if (action == 'approve') {
      console.log('1')
      // approve activation
      await Activation.update({ id }, { status: 'approved' })


      // update USER
      const user = await User.findOne({ id: activation.userId })

      // const points_total  = user.points.total  + activation.points
      // const points_period = user.points.period + activation.points

      const points_total = user.points + activation.points
      console.log({ points_total })

      // const Actiproduct = activation.products.some(
      //   (products) => products.name === "ACTIVACIÓN LOTES" || products.name === "ACTIVACIÓN MEMBRESIAS"
      // );

      const ActiproductMemb = activation.products.some(
        (products) => (products.name === "ACTIVACIÓN MEMBRESIAS" && products.total > 0)
      );

      const ActiproductLote = activation.products.some(
        (products) => (products.name === "ACTIVACIÓN LOTES" && products.total > 0)
      );
      
      // Actualizar `_activated` y `activated` basados únicamente en la compra aprobada de productos específicos
      // const _activated = user._activated ? true : Actiproduct;
      const _activated = (ActiproductMemb || ActiproductLote) ? true : user._activated;
      console.log({ _activated });
      
      // const activated = user.activated ? true : Actiproduct;
      const activated = ActiproductLote ? true : user.activated;
      console.log({ activated });
      

      await User.update({ id: user.id }, {
        activated,
        _activated,
        points: points_total,
      })

      if (activated) {

        // migrar transaccinoes virtuales
        const transactions = await Transaction.find({ user_id: user.id, virtual: true })

        for (let transaction of transactions) {
          console.log({ transaction })
          await Transaction.update({ id: transaction.id }, { virtual: false })
        }
      }


      // UPDATE STOCK
      console.log('UPDATE STOCK ...')
      const office_id = activation.office
      const products = activation.products

      // console.log({ office_id, products })


      const office = await Office.findOne({ id: office_id })

      // console.log(office)


      products.forEach((p, i) => {
        if (office.products[i]) office.products[i].total -= products[i].total
      })


      await Office.update({ id: office_id }, {
        products: office.products,
      })

      // console.log(office)


      // Profit office
      // let office_profit_total = office.profit ? office.profit : 0

      // if(points_total) {
      //   console.log(':)')
      //   office_profit_total += 5 * (activation.total - activation._total)
      //   office_profit_total += 2.5 * (activation._total)
      // }


      // await Office.update({ id: office_id }, {
      //   products: office.products,
      //   profit: office_profit_total,
      // })


      // PAY BONUS
      console.log('PAY BONUS ...')

      tree = await Tree.find({})
      users = await User.find({})

      console.log({ points: activation.points})

      const productMemb = activation.products.some(
        (products) => (products.type === "MEMBRESIA" && products.total > 0)
      );

      const productLote = activation.products.some(
        (products) => (products.type === "TERRENO" && products.total > 0)
      );

      if(productMemb) {
        pay_bonus(user.parentId, 0, activation.id, activation.points, 'MEMBRESIA', user.id)
      }

      if(productLote) {
        pay_bonus(user.parentId, 0, activation.id, activation.points, 'LOTE', user.id)
      }

      // if (user.parentId) {

      //   const amount = products.filter((p) => p.type == 'Promoción')
      //     .reduce((a, p) => (a + p.total * 10), 0)
      //   console.log('amunt: ', amount)

      //   if (amount) {

      //     const parent = await User.findOne({ id: user.parentId })
      //     const id = rand()
      //     const virtual = parent.activated ? false : true
      //     console.log('parent: ', parent)

      //     await Transaction.insert({
      //       id,
      //       date: new Date(),
      //       user_id: parent.id,
      //       type: 'in',
      //       value: amount,
      //       name: 'activation bonnus promo',
      //       activation_id: activation.d,
      //       virtual,
      //       _user_id: user.id,
      //     })

      //     activation.transactions.push(id)

      //     await Activation.update({ id: activation.id }, {
      //       transactions: activation.transactions,
      //     })

      //   }
      // }

      // response
      return res.json(success())
    }


    if (action == 'reject') {

      // reject activation
      await Activation.update({ id }, { status: 'rejected' })

      // revert transactions
      if (activation.transactions) {

        for (let transactionId of activation.transactions) {
          await Transaction.delete({ id: transactionId })
        }
      }

      // response
      return res.json(success())
    }



    if (action == 'check') {
      console.log('check')
      await Activation.update({ id }, { delivered: true })
    }

    if (action == 'uncheck') {
      console.log('uncheck')
      await Activation.update({ id }, { delivered: false })

    }

    if (action == 'revert') {
      console.log('revert')

      const user = await User.findOne({ id: activation.userId })

      await Activation.delete({ id })

      user.points = user.points - activation.points

      await User.update({ id: user.id }, { points: user.points })

      const _activated = user._activated ? true : (user.points >= 40)
      const activated = user.activated ? true : (user.points >= 120)

      await User.update({ id: user.id }, {
        activated,
        _activated,
      })

      const transactions = activation.transactions; console.log(transactions)

      for (let id of transactions) {
        await Transaction.delete({ id })
      }

      // UPDATE STOCK
      console.log('UPDATE STOCK ...')
      const office_id = activation.office
      const products = activation.products

      const office = await Office.findOne({ id: office_id })

      products.forEach((p, i) => {
        if (office.products[i]) office.products[i].total += products[i].total
      })

      await Office.update({ id: office_id }, {
        products: office.products,
      })
    }

    if (action == 'change') {
      console.log('change')

      const { points } = req.body; console.log({ points })

      await Activation.update({ id }, { points })
    }

    return res.json(success())
  }
}
