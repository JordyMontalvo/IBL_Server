import db  from "../../../components/db"
import lib from "../../../components/lib"

const { User, Session, Membership, Lot, Transaction, Office } = db
const { error, success, midd, rand, acum } = lib

export default async (req, res) => {
  await midd(req, res)

  let { session } = req.query

  // valid session
  session = await Session.findOne({ value: session })
  if (!session) return res.json(error('invalid session'))

  const user = await User.findOne({ id: session.id })
  
  // Calculate balance for payment
  const transactions = await Transaction.find({ user_id: user.id, virtual: { $in: [null, false] } })
  const _transactions = await Transaction.find({ user_id: user.id, virtual: true })

  const ins = acum(transactions, { type: 'in' }, 'value')
  const outs = acum(transactions, { type: 'out' }, 'value')
  const _ins = acum(_transactions, { type: 'in' }, 'value')
  const _outs = acum(_transactions, { type: 'out' }, 'value')

  const balance = ins - outs
  const _balance = _ins - _outs


  if (req.method == 'POST') {
    let { 
      products, 
      office, 
      check, 
      voucher, 
      pay_method, 
      bank, 
      date, 
      voucher_number,
      buyerData 
    } = req.body

    // Find the product being purchased (assuming single product selection enforcement in UI)
    const product = products.find(p => p.total > 0)
    
    if (!product) return res.json(error('No product selected'))

    const productType = product.type.toUpperCase()
    let type = null
    
    if (productType === 'TERRENO' || productType === 'LOTE') {
       type = 'LOTE'
    } else if (productType === 'MEMBRESÍA' || productType === 'MEMBRESIA') {
       type = 'MEMBRESÍA'
    }
    
    if (!type) {
      console.log('Invalid type received:', productType)
      return res.json(error('Invalid product type for this endpoint'))
    }

    const Collection = type === 'LOTE' ? Lot : Membership

    const price = product.price * product.total
    const points = product.points * product.total

    // Handle Balance Payment
    let paymentTransactions = []
    
    if (check) {
      const a = _balance < price ? _balance : price
      const r = (price - _balance) > 0 ? price - _balance : 0
      const b = balance < r ? balance : r
      
      // We don't really support split payments across virtual/real balance for these sales explicitly in the requirements, 
      // but keeping logic consistent with activation.js is safer.
      const id1 = rand()
      const id2 = rand()

      if (a > 0) {
        paymentTransactions.push(id1)
        await Transaction.insert({
          id: id1,
          date: new Date(),
          user_id: user.id,
          type: 'out',
          value: a,
          name: `sale ${type.toLowerCase()}`,
          virtual: true,
        })
      }

      if (b > 0) {
        paymentTransactions.push(id2)
        await Transaction.insert({
          id: id2,
          date: new Date(),
          user_id: user.id,
          type: 'out',
          value: b,
          name: `sale ${type.toLowerCase()}`,
          virtual: false,
        })
      }
    }

    // Insert Sale Record
    await Collection.insert({
      id: rand(),
      date: new Date(),
      sellerId: user.id,
      name: product.name,
      price,
      points,
      voucher,
      status: 'pending',
      buyer: buyerData,
      transactions: paymentTransactions,
      pay_method,
      bank,
      voucher_date: date,
      voucher_number,
      office,
      // Store additional product info if needed
      productId: product.id,
      productImg: product.img
    })

    // Update Office Stock (if applicable? Requirement didn't explicitly say Lotes have stock in Office, but let's assume we might need to decrement if it's inventory. 
    // However, Lotes might be unique. For now, skipping stock decrement in Office unless requested, as stock logic in activation.js checks office.products array index which might not match)

    return res.json(success())
  }
}
